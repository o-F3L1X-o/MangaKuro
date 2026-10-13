import sys
from pathlib import Path
import time
import uuid

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient
from app.main import app
from app.services.session_manager import session_manager, SessionManifest, PageItem, ComicInfoModel

def test_batch_metadata():
    client = TestClient(app)

    # 1. Create two dummy sessions
    sid1 = f"test_meta_1_{uuid.uuid4().hex[:6]}"
    sid2 = f"test_meta_2_{uuid.uuid4().hex[:6]}"

    for sid, vol, num, title, pages in [
        (sid1, 1, "1", "Inicio", 10),
        (sid2, 15, "15", "Batalla Final", 20)
    ]:
        sdir = session_manager.get_session_dir(sid)
        (sdir / "images").mkdir(parents=True, exist_ok=True)
        (sdir / "thumbnails").mkdir(parents=True, exist_ok=True)

        page_items = [
            PageItem(
                id=f"{sid}_p{i}", order=i+1, filename=f"p{i}.jpg", thumb_filename=f"thumb{i}.webp",
                original_name=f"p{i}.jpg", width=800, height=1200, is_cover=(i == 0)
            ) for i in range(pages)
        ]

        m = SessionManifest(
            session_id=sid,
            original_filename=f"Tomo_{vol}.cbz",
            created_at=time.time(),
            updated_at=time.time(),
            item_type="tomo",
            pages=page_items,
            metadata=ComicInfoModel(
                Series="Old Series Name",
                Volume=vol,
                Number=num,
                Title=title,
                PageCount=pages
            )
        )
        session_manager.save_session(m)

    try:
        # Verify initial
        m1 = session_manager.load_session(sid1)
        m2 = session_manager.load_session(sid2)
        assert m1.metadata.Series == "Old Series Name"
        assert m2.metadata.Series == "Old Series Name"
        assert m1.metadata.Volume == 1
        assert m2.metadata.Volume == 15

        # 2. Test single update on sid1
        m1_updated = session_manager.update_metadata(sid1, ComicInfoModel(
            Series="The Beginning After The End",
            Volume=1,
            Number="1",
            Title="El Despertar",
            Writer="TurtleMe",
            Genre="Action, Fantasy",
            ReadingDirection="vertical",
            Webtoon="Yes",
            PageCount=10
        ))
        assert m1_updated.metadata.Series == "The Beginning After The End"
        assert m1_updated.metadata.Writer == "TurtleMe"
        assert m1_updated.metadata.Webtoon == "Yes"

        # Check sid2 was NOT modified (independent storage verified!)
        m2_check = session_manager.load_session(sid2)
        assert m2_check.metadata.Series == "Old Series Name"
        assert m2_check.metadata.Writer == ""
        print("  -> Independent ComicInfo per tomo verified! (Tomo 2 unaffected by Tomo 1 update)")

        # 3. Test batch update via endpoint /api/session/batch-metadata
        batch_res = client.post("/api/session/batch-metadata", json={
            "session_ids": [sid1, sid2],
            "metadata": {
                "Series": "El comienzo después del fin",
                "Writer": "TurtleMe",
                "Penciller": "Fuyuki23",
                "Genre": "Acción, Fantasía, Webtoon",
                "ReadingDirection": "vertical",
                "Webtoon": "Yes",
                "Publisher": "Tapas",
                "Year": 2020
            },
            "apply_common_only": True
        })
        assert batch_res.status_code == 200, batch_res.text
        data = batch_res.json()
        assert data["updated_count"] == 2

        # Check both received common fields but KEPT their individual Volume & Number & PageCount!
        m1_after = session_manager.load_session(sid1)
        m2_after = session_manager.load_session(sid2)

        # Common fields updated on both
        assert m1_after.metadata.Series == "El comienzo después del fin"
        assert m2_after.metadata.Series == "El comienzo después del fin"
        assert m1_after.metadata.Writer == "TurtleMe"
        assert m2_after.metadata.Writer == "TurtleMe"
        assert m1_after.metadata.Publisher == "Tapas"
        assert m2_after.metadata.Publisher == "Tapas"
        assert m1_after.metadata.ReadingDirection == "vertical"
        assert m2_after.metadata.ReadingDirection == "vertical"

        # Individual fields preserved!
        assert m1_after.metadata.Volume == 1
        assert m1_after.metadata.Number == "1"
        assert m1_after.metadata.PageCount == 10

        assert m2_after.metadata.Volume == 15
        assert m2_after.metadata.Number == "15"
        assert m2_after.metadata.PageCount == 20

        print("  -> Batch ComicInfo update across marked tomos verified!")

        # 4. Test selective fields_to_copy (e.g., only Writer and Penciller clone)
        clone_res = client.post("/api/session/batch-metadata", json={
            "session_ids": [sid2],
            "metadata": {
                "Writer": "Kite",
                "Penciller": "Gon",
                "Publisher": "ShouldNotOverWrite"
            },
            "fields_to_copy": ["Writer", "Penciller"]
        })
        assert clone_res.status_code == 200, clone_res.text
        m2_cloned = session_manager.load_session(sid2)
        assert m2_cloned.metadata.Writer == "Kite"
        assert m2_cloned.metadata.Penciller == "Gon"
        assert m2_cloned.metadata.Publisher == "Tapas"  # Unchanged!
        print("  -> Selective fields_to_copy cloning verified!")

    finally:
        session_manager.delete_session(sid1)
        session_manager.delete_session(sid2)

if __name__ == "__main__":
    print("Testing Single and Batch ComicInfo...")
    test_batch_metadata()
    print("ALL COMICINFO TESTS PASSED!")
