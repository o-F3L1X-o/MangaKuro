import unittest
import tempfile
import shutil
from pathlib import Path
from PIL import Image

from app.services.session_manager import SessionManager, SessionManifest, PageItem
from app.services.comic_info import ComicInfoModel

class TestUndoAndCuts(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.session_manager = SessionManager(staging_dir=Path(self.temp_dir))
        self.session_id = "test-session-undo"
        
        # Setup session dir structure
        sdir = Path(self.temp_dir) / self.session_id
        (sdir / "images").mkdir(parents=True, exist_ok=True)
        (sdir / "thumbnails").mkdir(parents=True, exist_ok=True)
        
        # Create a sample test strip: 800x4000 px
        img_path = sdir / "images" / "strip_001.jpg"
        img = Image.new("RGB", (800, 4000), color=(100, 150, 200))
        img.save(img_path, "JPEG")
        
        thumb_path = sdir / "thumbnails" / "thumb_strip_001.webp"
        thumb = Image.new("RGB", (200, 1000), color=(100, 150, 200))
        thumb.save(thumb_path, "WEBP")
        
        page = PageItem(
            id="page-1",
            order=1,
            filename="strip_001.jpg",
            thumb_filename="thumb_strip_001.webp",
            original_name="strip_001.jpg",
            width=800,
            height=4000,
            rotation=0,
            is_cover=True
        )
        
        manifest = SessionManifest(
            session_id=self.session_id,
            original_filename="comic_test.cbz",
            created_at=100.0,
            updated_at=100.0,
            pages=[page],
            metadata=ComicInfoModel(Series="Test Series")
        )
        self.session_manager.save_session(manifest)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_custom_slice_with_discard_and_undo(self):
        # 1. Slice into 3 parts: cuts at 1000 and 2500. Discard slice index 2 (the bottom slice)
        updated = self.session_manager.custom_slice_horizontal(
            self.session_id,
            "page-1",
            cut_points=[1000, 2500],
            discard_indices=[2]
        )
        # Slices 0 (0..1000) and 1 (1000..2500) kept, slice 2 discarded
        self.assertEqual(len(updated.pages), 2)
        self.assertEqual(updated.pages[0].height, 1000)
        self.assertEqual(updated.pages[1].height, 1500)
        
        # 2. Undo the cut!
        restored = self.session_manager.undo(self.session_id)
        self.assertEqual(len(restored.pages), 1)
        self.assertEqual(restored.pages[0].id, "page-1")
        self.assertEqual(restored.pages[0].filename, "strip_001.jpg")
        
        # Verify file restored on disk
        img_on_disk = Path(self.temp_dir) / self.session_id / "images" / "strip_001.jpg"
        self.assertTrue(img_on_disk.exists())
        with Image.open(img_on_disk) as im:
            self.assertEqual(im.size, (800, 4000))

    def test_discard_band_and_undo(self):
        # Discard top banner from 0 to 400 px
        updated = self.session_manager.discard_band(
            self.session_id,
            "page-1",
            y_start=0,
            y_end=400
        )
        self.assertEqual(len(updated.pages), 1)
        self.assertEqual(updated.pages[0].height, 3600)
        
        # Undo!
        restored = self.session_manager.undo(self.session_id)
        self.assertEqual(len(restored.pages), 1)
        self.assertEqual(restored.pages[0].id, "page-1")
        self.assertEqual(restored.pages[0].height, 4000)

if __name__ == '__main__':
    unittest.main()
