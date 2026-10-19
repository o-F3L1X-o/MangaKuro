import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import zipfile
from PIL import Image
from starlette.testclient import TestClient
from app.main import app
from app.services.session_manager import session_manager

def test_sessions_and_staging():
    client = TestClient(app)

    # 1. Test GET /api/sessions
    res = client.get("/api/sessions")
    assert res.status_code == 200
    sessions = res.json()
    assert isinstance(sessions, list)
    print(f"  -> Initial sessions count: {len(sessions)}")

    # 2. Create a mock comic archive and upload
    temp_cbz = Path("temp_test_staging.cbz")
    try:
        with zipfile.ZipFile(temp_cbz, "w") as zf:
            for i in range(2):
                img = Image.new("RGB", (300, 450), color=(100 * i, 120, 150))
                p_path = Path(f"temp_p_{i}.jpg")
                img.save(p_path)
                zf.write(p_path, arcname=f"page_{i:02d}.jpg")
                if p_path.exists():
                    p_path.unlink()

        # Check before upload
        check_res = client.post("/api/upload/check", json={"filename": "temp_test_staging.cbz"})
        assert check_res.status_code == 200

        # Upload comic
        with open(temp_cbz, "rb") as f:
            upload_res = client.post("/api/upload", files={"file": ("temp_test_staging.cbz", f, "application/zip")})
        assert upload_res.status_code == 200
        data = upload_res.json()
        session_id = data["session_id"]
        assert data["status"] == "processing"

        # Wait for processing to complete
        import time
        for _ in range(30):
            st_res = client.get(f"/api/session/{session_id}/status")
            st_data = st_res.json()
            if st_data.get("status") == "completed":
                break
            time.sleep(0.2)

        # 3. Check again with upload/check - should detect existing session
        check_res2 = client.post("/api/upload/check", json={"filename": "temp_test_staging.cbz"})
        assert check_res2.status_code == 200
        check_data = check_res2.json()
        assert check_data["exists"] is True
        assert check_data["session_id"] == session_id

        # Fetch manifest
        res_single = client.get(f"/api/session/{session_id}")
        assert res_single.status_code == 200
        assert len(res_single.json()["pages"]) == 2

        # 4. List all sessions - should contain our session
        res2 = client.get("/api/sessions")
        assert res2.status_code == 200
        all_s = res2.json()
        found = any(s["session_id"] == session_id for s in all_s)
        assert found, "Created session should be listed in /api/sessions"
        print(f"  -> Session {session_id} found in /api/sessions list ({len(all_s)} total)")

        # 5. Fetch individual session
        res_single = client.get(f"/api/session/{session_id}")
        assert res_single.status_code == 200
        assert res_single.json()["session_id"] == session_id

        # 6. Delete session
        del_res = client.delete(f"/api/session/{session_id}")
        assert del_res.status_code == 200

        # Verify it's no longer listed
        res3 = client.get("/api/sessions")
        all_s_after = res3.json()
        assert not any(s["session_id"] == session_id for s in all_s_after)
        print("  -> Session deletion verified!")

    finally:
        if temp_cbz.exists():
            temp_cbz.unlink()

if __name__ == "__main__":
    print("Running Sessions & Staging Integration Tests...")
    test_sessions_and_staging()
    print("\n==========================================")
    print(" ALL SESSIONS API TESTS PASSED! ")
    print("==========================================")
