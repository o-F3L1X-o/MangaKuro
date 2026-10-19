import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import zipfile
from PIL import Image, ImageDraw
from app.services.comic_info import (
    ComicInfoModel,
    parse_comic_info_xml,
    generate_comic_info_xml,
    guess_metadata_from_filename
)
from app.services.image_processor import (
    split_double_page,
    rotate_image,
    create_thumbnail
)
from app.services.webtoon_slicer import slice_webtoon_image
from app.services.session_manager import session_manager
from app.services.exporter import export_cbz

def test_comic_info_heuristics():
    print("Testing ComicInfo filename heuristics...")
    m1 = guess_metadata_from_filename("[ScanGroup] Solo Leveling - c125 (v02) - Awakening [Webtoon].cbz")
    assert m1.Series == "Solo Leveling", f"Expected 'Solo Leveling', got '{m1.Series}'"
    assert m1.Number == "125", f"Expected '125', got '{m1.Number}'"
    assert m1.Volume == 2, f"Expected 2, got {m1.Volume}"
    assert m1.ReadingDirection == "vertical", f"Expected 'vertical', got '{m1.ReadingDirection}'"
    assert m1.ScanInformation == "ScanGroup", f"Expected 'ScanGroup', got '{m1.ScanInformation}'"

    m2 = guess_metadata_from_filename("Berserk - 085 - La Noche de la Luna.cbz")
    assert m2.Series == "Berserk", f"Expected 'Berserk', got '{m2.Series}'"
    assert m2.Number == "085", f"Expected '085', got '{m2.Number}'"
    assert m2.Title == "La Noche de la Luna", f"Expected 'La Noche de la Luna', got '{m2.Title}'"

    print("  -> Heuristics tests passed!")

def test_comic_info_xml_roundtrip():
    print("Testing ComicInfo XML generation and parsing...")
    original = ComicInfoModel(
        Series="One Piece",
        Number="1050",
        Volume=104,
        Title="El Guerrero de la Liberación",
        Writer="Eiichiro Oda",
        ReadingDirection="rtl",
        PageCount=18
    )
    xml_str = generate_comic_info_xml(original)
    assert "<Series>One Piece</Series>" in xml_str
    assert "<Manga>YesAndRightToLeft</Manga>" in xml_str

    parsed = parse_comic_info_xml(xml_str)
    assert parsed.Series == "One Piece"
    assert parsed.Number == "1050"
    assert parsed.Volume == 104
    assert parsed.ReadingDirection == "rtl"
    assert parsed.Manga == "YesAndRightToLeft"
    print("  -> ComicInfo XML roundtrip passed!")

def test_image_processing(tmp_path: Path):
    print("Testing Image Processing (double page split, rotation, thumbnail)...")
    # Create test double-page image (1200 x 800)
    img = Image.new("RGB", (1200, 800), color=(200, 200, 200))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 550, 750], fill=(255, 0, 0)) # Left side red
    draw.rectangle([650, 50, 1150, 750], fill=(0, 0, 255)) # Right side blue

    img_path = tmp_path / "test_spread.jpg"
    img.save(img_path)

    # Split spread Manga RTL (Page 1 = Right, Page 2 = Left)
    p1 = tmp_path / "p1.jpg"
    p2 = tmp_path / "p2.jpg"
    dim1, dim2 = split_double_page(img_path, p1, p2, reading_direction="rtl")
    assert dim1 == (600, 800)
    assert dim2 == (600, 800)

    # Rotate
    new_dim = rotate_image(p1, 90)
    assert new_dim == (800, 600)

    # Thumbnail
    thumb_path = tmp_path / "thumb.webp"
    tw, th = create_thumbnail(p1, thumb_path)
    assert thumb_path.exists()
    print("  -> Image processing tests passed!")

def test_webtoon_slicing(tmp_path: Path):
    print("Testing Webtoon intelligent vertical slicing...")
    # Create tall webtoon strip (800 x 6000) with white gutter seams
    img = Image.new("RGB", (800, 6000), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    # Panel 1
    draw.rectangle([50, 200, 750, 1800], fill=(50, 50, 150))
    # Gutter seam around y=2000 (pure white)
    # Panel 2
    draw.rectangle([50, 2200, 750, 3800], fill=(150, 50, 50))
    # Gutter seam around y=4000
    # Panel 3
    draw.rectangle([50, 4200, 750, 5800], fill=(50, 150, 50))

    strip_path = tmp_path / "webtoon_strip.jpg"
    img.save(strip_path)

    slices = slice_webtoon_image(strip_path, tmp_path / "slices", "strip", max_height=2200)
    assert len(slices) >= 3, f"Expected at least 3 slices, got {len(slices)}"
    for s_path, sw, sh in slices:
        assert s_path.exists()
        assert sh <= 2600
    print(f"  -> Webtoon slicing passed! Sliced 6000px strip into {len(slices)} panels.")

def test_full_session_and_export(tmp_path: Path):
    print("Testing Full Session Pipeline (CBZ extraction, reordering, ComicInfo, and export)...")
    # Build a sample CBZ archive
    sample_cbz = tmp_path / "Solo_Leveling_c01.cbz"
    with zipfile.ZipFile(sample_cbz, "w") as zf:
        for i in range(3):
            im = Image.new("RGB", (600, 900), color=(i * 70, 100, 150))
            im_path = tmp_path / f"page_{i+1:02d}.jpg"
            im.save(im_path)
            zf.write(im_path, arcname=f"p_{i+1:02d}.jpg")

    # Create session
    manifest = session_manager.create_session_from_file(sample_cbz, "Solo_Leveling_c01.cbz")
    assert manifest.session_id is not None
    assert len(manifest.pages) == 3
    assert manifest.metadata.Series == "Solo_Leveling"
    assert manifest.metadata.Number == "01"

    # Reorder pages: 3, 1, 2
    pids = [manifest.pages[2].id, manifest.pages[0].id, manifest.pages[1].id]
    reordered = session_manager.reorder_pages(manifest.session_id, pids)
    assert reordered.pages[0].id == pids[0]
    assert reordered.pages[0].order == 1
    assert reordered.pages[0].is_cover == True

    # Update metadata
    manifest.metadata.Title = "El Despertar"
    manifest.metadata.ReadingDirection = "vertical"
    session_manager.update_metadata(manifest.session_id, manifest.metadata)

    # Export to CBZ
    export_dir = tmp_path / "export_output"
    cbz_path, size = export_cbz(
        session_id=manifest.session_id,
        output_dir=export_dir,
        compression_format="webp",
        quality=85
    )
    assert cbz_path.exists()
    assert size > 0

    # Verify exported CBZ contains ComicInfo.xml and 0001.webp, 0002.webp, 0003.webp
    with zipfile.ZipFile(cbz_path, "r") as ezf:
        names = ezf.namelist()
        assert "ComicInfo.xml" in names
        assert "0001.webp" in names
        assert "0002.webp" in names
        assert "0003.webp" in names

        xml_read = ezf.read("ComicInfo.xml").decode("utf-8")
        assert "<Title>El Despertar</Title>" in xml_read
        assert "<Webtoon>Yes</Webtoon>" in xml_read

    print(f"  -> Full session pipeline passed! Exported valid CBZ ({size} bytes).")

if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        tpath = Path(td)
        test_comic_info_heuristics()
        test_comic_info_xml_roundtrip()
        test_image_processing(tpath)
        test_webtoon_slicing(tpath)
        test_full_session_and_export(tpath)
    print("\n==========================================")
    print(" ALL 5 BACKEND INTEGRATION TESTS PASSED! ")
    print("==========================================")
