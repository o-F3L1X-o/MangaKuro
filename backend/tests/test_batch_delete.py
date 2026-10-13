import sys
from pathlib import Path
import time
import uuid

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient
from app.main import app
from app.services.session_manager import session_manager, SessionManifest, PageItem, ComicInfoModel

def test_batch_delete():
    client = TestClient(app)

    # 1. Create dummy sessions
    sid1 = f"test_del_1_{uuid.uuid4().hex[:6]}"
    sid2 = f"test_del_2_{uuid.uuid4().hex[:6]}"
    sid3 = f"test_del_3_{uuid.uuid4().hex[:6]}"

    for sid, vol in [(sid1, 1), (sid2, 2), (sid3, 3)]:
        sdir = session_manager.get_session_dir(sid)
        (sdir / "images").mkdir(parents=True, exist_ok=True)
        (sdir / "thumbnails").mkdir(parents=True, exist_ok=True)

        page_items = [
            PageItem(
                id=f"{sid}_p1", order=1, filename="p1.jpg", thumb_filename="thumb1.webp",
                original_name="p1.jpg", width=800, height=1200, is_cover=True
            )
        ]

        m = SessionManifest(
            session_id=sid,
            original_filename=f"TestSeries_Vol{vol}.cbz",
            created_at=time.time(),
            updated_at=time.time(),
            item_type="tomo",
            pages=page_items,
            metadata=ComicInfoModel(Series="TestSeries", Volume=vol, Number=str(vol))
        )
        session_manager.save_session(m)

    try:
        # Verify they exist
        assert session_manager.load_session(sid1) is not None
        assert session_manager.load_session(sid2) is not None
        assert session_manager.load_session(sid3) is not None

        # 2. Call batch delete endpoint for sid1 and sid2
        res = client.post("/api/sessions/batch-delete", json={"session_ids": [sid1, sid2]})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["deleted_count"] == 2

        # Verify sid1 and sid2 are deleted from disk and cache
        assert session_manager.load_session(sid1) is None
        assert session_manager.load_session(sid2) is None
        assert not session_manager.get_session_dir(sid1).exists()
        assert not session_manager.get_session_dir(sid2).exists()

        # Verify sid3 is still alive
        assert session_manager.load_session(sid3) is not None
        assert session_manager.get_session_dir(sid3).exists()

        # 3. Delete sid3
        res3 = client.post("/api/sessions/batch-delete", json={"session_ids": [sid3]})
        assert res3.status_code == 200
        assert session_manager.load_session(sid3) is None

        print("ALL BATCH DELETE TESTS PASSED!")
    finally:
        session_manager.delete_session(sid1)
        session_manager.delete_session(sid2)
        session_manager.delete_session(sid3)

if __name__ == "__main__":
    test_batch_delete()
