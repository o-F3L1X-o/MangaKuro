import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient
from app.main import app

def test_api():
    print("Testing FastAPI endpoints with TestClient...")
    client = TestClient(app)

    # 1. Test settings endpoint
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "default_compression" in data
    print("  -> /api/settings OK")

    # 2. Test root static files (frontend index.html)
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "MangaJutsu" in res_root.text
    print("  -> / (Frontend SPA served directly) OK")

if __name__ == "__main__":
    test_api()
    print("ALL API ENDPOINTS TEST PASSED!")
