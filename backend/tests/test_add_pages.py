import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import io
from PIL import Image
from starlette.testclient import TestClient
from app.main import app
from app.services.session_manager import session_manager

def test_add_pages_as_cover():
    client = TestClient(app)

    # 1. Create a dummy session directly with 2 pages
    import uuid
    import time
    from app.services.session_manager import SessionManifest, PageItem, ComicInfoModel

    session_id = f"test_add_cover_{uuid.uuid4().hex[:8]}"
    sdir = session_manager.get_session_dir(session_id)
    images_dir = sdir / "images"
    thumbs_dir = sdir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    # Create 2 initial pages
    for i in range(2):
        im = Image.new("RGB", (200, 300), color=(50 * (i + 1), 50, 50))
        im.save(images_dir / f"init_page_{i}.jpg")
        im.resize((100, 150)).save(thumbs_dir / f"init_thumb_{i}.webp")

    p1 = PageItem(
        id="p1", order=1, filename="init_page_0.jpg", thumb_filename="init_thumb_0.webp",
        original_name="init_page_0.jpg", width=200, height=300, rotation=0, is_cover=True
    )
    p2 = PageItem(
        id="p2", order=2, filename="init_page_1.jpg", thumb_filename="init_thumb_1.webp",
        original_name="init_page_1.jpg", width=200, height=300, rotation=0, is_cover=False
    )

    manifest = SessionManifest(
        session_id=session_id,
        original_filename="test_comic.cbz",
        created_at=time.time(),
        updated_at=time.time(),
        item_type="tomo",
        pages=[p1, p2],
        metadata=ComicInfoModel(Title="Test Comic", PageCount=2)
    )
    session_manager.save_session(manifest)

    try:
        # Verify initial state
        initial_m = session_manager.load_session(session_id)
        assert len(initial_m.pages) == 2
        assert initial_m.pages[0].id == "p1"
        assert initial_m.pages[0].is_cover is True
        assert initial_m.pages[1].id == "p2"
        assert initial_m.pages[1].is_cover is False

        # 2. Add a new cover image via /api/session/{session_id}/add-pages without insert_after
        cover_img = Image.new("RGB", (300, 450), color=(255, 0, 0))
        buf = io.BytesIO()
        cover_img.save(buf, format="JPEG")
        buf.seek(0)

        response = client.post(
            f"/api/session/{session_id}/add-pages",
            files={"files": ("new_cover.jpg", buf, "image/jpeg")}
        )
        assert response.status_code == 200, response.text
        data = response.json()

        assert len(data["pages"]) == 3
        # First page should be the newly added image
        new_first_page = data["pages"][0]
        assert new_first_page["original_name"] == "new_cover.jpg"
        assert new_first_page["order"] == 1
        assert new_first_page["is_cover"] is True

        # Second page should be p1 (the former cover), and is_cover should now be False!
        second_page = data["pages"][1]
        assert second_page["id"] == "p1"
        assert second_page["order"] == 2
        assert second_page["is_cover"] is False

        # Third page should be p2
        third_page = data["pages"][2]
        assert third_page["id"] == "p2"
        assert third_page["order"] == 3
        assert third_page["is_cover"] is False

        print("  -> New cover successfully inserted at position 1 (order 1, is_cover=True)!")

        # 3. Add an image with insert_after='p1' (between p1 and p2)
        mid_img = Image.new("RGB", (300, 450), color=(0, 255, 0))
        buf2 = io.BytesIO()
        mid_img.save(buf2, format="JPEG")
        buf2.seek(0)

        response2 = client.post(
            f"/api/session/{session_id}/add-pages",
            data={"insert_after": "p1"},
            files={"files": ("mid_page.jpg", buf2, "image/jpeg")}
        )
        assert response2.status_code == 200, response2.text
        data2 = response2.json()

        assert len(data2["pages"]) == 4
        # First page is still the cover
        assert data2["pages"][0]["original_name"] == "new_cover.jpg"
        assert data2["pages"][0]["is_cover"] is True
        # Second page is p1
        assert data2["pages"][1]["id"] == "p1"
        # Third page is mid_page
        assert data2["pages"][2]["original_name"] == "mid_page.jpg"
        assert data2["pages"][2]["order"] == 3
        assert data2["pages"][2]["is_cover"] is False
        # Fourth page is p2
        assert data2["pages"][3]["id"] == "p2"
        assert data2["pages"][3]["order"] == 4

        print("  -> insert_after still functions properly!")

    finally:
        # Cleanup
        session_manager.delete_session(session_id)

if __name__ == "__main__":
    print("Testing Add Pages As Cover...")
    test_add_pages_as_cover()
    print("ALL TESTS PASSED SUCCESSFULLY!")
