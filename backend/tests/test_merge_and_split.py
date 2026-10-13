import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import time
import zipfile
from PIL import Image
from starlette.testclient import TestClient
from app.main import app

def test_merge_and_split():
    client = TestClient(app)

    # 1. Create two test CBZ chapters
    cbz1 = Path("temp_ch1.cbz")
    cbz2 = Path("temp_ch2.cbz")

    try:
        # Chapter 1: 3 pages
        with zipfile.ZipFile(cbz1, "w") as zf:
            for i in range(3):
                im = Image.new("RGB", (400, 600), color=(50, 100, 150 + i * 20))
                p = Path(f"ch1_p{i}.jpg")
                im.save(p)
                zf.write(p, arcname=f"p_{i+1:02d}.jpg")
                p.unlink()

        # Chapter 2: 2 pages
        with zipfile.ZipFile(cbz2, "w") as zf:
            for i in range(2):
                im = Image.new("RGB", (400, 600), color=(150, 50, 100 + i * 20))
                p = Path(f"ch2_p{i}.jpg")
                im.save(p)
                zf.write(p, arcname=f"p_{i+1:02d}.jpg")
                p.unlink()

        # Upload Chapter 1
        with open(cbz1, "rb") as f:
            u1 = client.post("/api/upload", data={"item_type": "capitulo", "custom_series": "Bleach", "custom_number": "1"}, files={"file": ("Bleach_c01.cbz", f, "application/zip")})
        assert u1.status_code == 200
        sid1 = u1.json()["session_id"]

        # Upload Chapter 2
        with open(cbz2, "rb") as f:
            u2 = client.post("/api/upload", data={"item_type": "capitulo", "custom_series": "Bleach", "custom_number": "2"}, files={"file": ("Bleach_c02.cbz", f, "application/zip")})
        assert u2.status_code == 200
        sid2 = u2.json()["session_id"]

        # Wait for both extractions to finish
        for _ in range(30):
            st1 = client.get(f"/api/session/{sid1}/status").json().get("status")
            st2 = client.get(f"/api/session/{sid2}/status").json().get("status")
            if st1 == "ready" and st2 == "ready":
                break
            time.sleep(0.2)

        s1 = client.get(f"/api/session/{sid1}").json()
        s2 = client.get(f"/api/session/{sid2}").json()
        assert len(s1["pages"]) == 3
        assert len(s2["pages"]) == 2
        assert s1.get("item_type") == "capitulo"
        assert s2.get("item_type") == "capitulo"
        print("  -> Uploaded 2 chapters with item_type='capitulo' OK")

        # 2. Test quick metadata update
        patch_res = client.patch(f"/api/session/{sid1}/quick-meta", json={
            "title": "Muerte y Fresa",
            "series": "Bleach Definitive"
        })
        assert patch_res.status_code == 200
        updated_s1 = patch_res.json()
        assert updated_s1["metadata"]["Title"] == "Muerte y Fresa"
        assert updated_s1["metadata"]["Series"] == "Bleach Definitive"
        print("  -> Quick metadata update OK")

        # 3. Test Merge Chapters into Tomo 1
        merge_res = client.post("/api/session/merge", json={
            "source_session_ids": [sid1, sid2],
            "target_series": "Bleach Definitive",
            "target_volume": 1,
            "target_title": "Tomo 1: El Guerrero Sustituto",
            "delete_sources": False,
            "add_chapter_covers": True
        })
        if merge_res.status_code != 200:
            print("MERGE ERROR:", merge_res.status_code, merge_res.text)
        assert merge_res.status_code == 200
        tomo = merge_res.json()
        tomo_id = tomo["session_id"]
        assert tomo["item_type"] == "tomo"
        assert tomo["metadata"]["Volume"] == 1
        # 3 pages from ch1 + 2 pages from ch2 + 2 separator cards = 7 pages
        assert len(tomo["pages"]) == 7
        # First chapter pages (from sid1) come before sid2 pages
        assert "p_0002" in tomo["pages"][1]["filename"]
        print(f"  -> Merged into Tomo 1 with {len(tomo['pages'])} pages and chapter separators OK")

        # 3b. Test Reverse Order Merge [sid2, sid1]
        merge_rev_res = client.post("/api/session/merge", json={
            "source_session_ids": [sid2, sid1],
            "target_series": "Bleach Definitive Reversed",
            "target_volume": 2,
            "delete_sources": False,
            "add_chapter_covers": False
        })
        assert merge_rev_res.status_code == 200
        tomo_rev = merge_rev_res.json()
        assert len(tomo_rev["pages"]) == 5
        # sid2 had 2 pages, sid1 had 3 pages. First 2 pages in reverse tomo come from sid2!
        assert tomo_rev["pages"][0]["original_name"] == "p_01.jpg"
        print("  -> Reverse merge [sid2, sid1] verified top-down sequencing OK")

        # 4. Test Extract Pages to new Chapter
        # Take page 3 and 4 from Tomo and extract as Chapter 1.5
        page_ids_to_extract = [tomo["pages"][2]["id"], tomo["pages"][3]["id"]]
        extract_res = client.post(f"/api/session/{tomo_id}/extract-chapter", json={
            "page_ids": page_ids_to_extract,
            "chapter_number": "1.5",
            "chapter_title": "Especial Intermedio",
            "remove_from_source": True
        })
        assert extract_res.status_code == 200
        extract_data = extract_res.json()
        new_ch = extract_data["new_session"]
        updated_tomo = extract_data["source_session"]

        assert new_ch["item_type"] == "capitulo"
        assert new_ch["metadata"]["Number"] == "1.5"
        assert len(new_ch["pages"]) == 2
        # Tomo had 7 pages, 2 removed -> 5 remaining
        assert len(updated_tomo["pages"]) == 5
        print(f"  -> Extracted {len(new_ch['pages'])} pages to Chapter 1.5 (Tomo now has {len(updated_tomo['pages'])} pages) OK")

        # 5. Clean up created sessions
        client.delete(f"/api/session/{sid1}")
        client.delete(f"/api/session/{sid2}")
        client.delete(f"/api/session/{tomo_id}")
        client.delete(f"/api/session/{new_ch['session_id']}")
        print("  -> Cleaned test sessions OK")

    finally:
        if cbz1.exists():
            cbz1.unlink()
        if cbz2.exists():
            cbz2.unlink()

if __name__ == "__main__":
    print("Testing Merge, Split, and Quick Metadata...")
    test_merge_and_split()
    print("\n==========================================")
    print(" ALL MERGE & SPLIT BACKEND TESTS PASSED! ")
    print("==========================================")
