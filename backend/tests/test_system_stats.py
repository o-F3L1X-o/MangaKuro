import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient
from app.main import app

def test_system_stats_endpoint():
    client = TestClient(app)
    res = client.get("/api/system/stats")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    
    assert "cpu" in data, "Missing cpu in response"
    assert "memory" in data, "Missing memory in response"
    assert "disk" in data, "Missing disk in response"
    assert "orphans" in data, "Missing orphans in response"
    assert "active_sessions" in data, "Missing active_sessions in response"
    
    assert "system_percent" in data["cpu"]
    assert "system_percent" in data["memory"]
    assert "staging_gb" in data["disk"]
    assert "count" in data["orphans"]
    
    print("GET /api/system/stats returned valid metrics:")
    print("  CPU:", data["cpu"])
    print("  Memory:", data["memory"])
    print("  Disk:", data["disk"])
    print("  Orphans:", data["orphans"])
    print("  Active Sessions:", data["active_sessions"])
    print("ALL SYSTEM STATS TESTS PASSED!")

if __name__ == "__main__":
    test_system_stats_endpoint()
