import pytest
from pathlib import Path
import json
import shutil
from app.services.session_manager import SessionManager, clean_series_display_name
from app.services.comic_info import ComicInfoModel

def test_clean_series_display_name():
    assert clean_series_display_name("Ao No Exorcist Tomo 12") == "Ao No Exorcist"
    assert clean_series_display_name("Blue Exorcist Vol. 05") == "Blue Exorcist"
    assert clean_series_display_name("[Scan] Bleach Cap. 150.cbz") == "Bleach"
    assert clean_series_display_name("One Piece #100") == "One Piece"
    assert clean_series_display_name("Solo Leveling") == "Solo Leveling"

def test_rename_series(tmp_path):
    mgr = SessionManager(staging_dir=tmp_path)
    
    # Create two dummy sessions with series "Ao No Exorcist Tomo"
    s1_dir = tmp_path / "sess1"
    s1_dir.mkdir(parents=True)
    m1 = {
        "session_id": "sess1",
        "original_filename": "Ao No Exorcist Tomo 01.cbz",
        "metadata": {
            "Series": "Ao No Exorcist Tomo",
            "Title": "Ao No Exorcist Tomo",
            "Number": "01",
            "Volume": 1
        },
        "pages": [{
            "id": "p1",
            "order": 0,
            "filename": "001.jpg",
            "original_name": "001.jpg",
            "thumb_filename": "001_thumb.webp",
            "width": 1000,
            "height": 1500
        }],
        "created_at": 1000.0,
        "updated_at": 1000.0
    }
    with open(s1_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(m1, f)
        
    s2_dir = tmp_path / "sess2"
    s2_dir.mkdir(parents=True)
    m2 = {
        "session_id": "sess2",
        "original_filename": "Ao No Exorcist Tomo 02.cbz",
        "metadata": {
            "Series": "Ao No Exorcist Tomo",
            "Title": "Tomo 2 Special",
            "Number": "02",
            "Volume": 2
        },
        "pages": [{
            "id": "p2",
            "order": 0,
            "filename": "001.jpg",
            "original_name": "001.jpg",
            "thumb_filename": "001_thumb.webp",
            "width": 1000,
            "height": 1500
        }],
        "created_at": 1000.0,
        "updated_at": 1000.0
    }
    with open(s2_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(m2, f)
        
    res = mgr.rename_series(
        old_name="Ao No Exorcist Tomo",
        new_name="Blue Exorcist",
        update_matching_titles=True
    )
    
    assert res["renamed_count"] == 2
    assert res["new_series"] == "Blue Exorcist"
    
    loaded1 = mgr.load_session("sess1")
    assert loaded1.metadata.Series == "Blue Exorcist"
    assert loaded1.metadata.Title == "Blue Exorcist"  # Title was matching old_name, so updated
    
    loaded2 = mgr.load_session("sess2")
    assert loaded2.metadata.Series == "Blue Exorcist"
    assert loaded2.metadata.Title == "Tomo 2 Special"  # Title was distinct, preserved
