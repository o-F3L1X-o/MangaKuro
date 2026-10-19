import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import tempfile
import pymupdf as fitz
from app.services.comic_parser import extract_pdf

def test_pdf_extraction():
    print("Testing PDF creation and extraction with PyMuPDF...")
    with tempfile.TemporaryDirectory() as td:
        tpath = Path(td)
        # Create a sample PDF with 3 pages
        pdf_path = tpath / "sample_comic.pdf"
        doc = fitz.open()
        for i in range(3):
            page = doc.new_page(width=595, height=842) # A4
            # Draw something
            page.draw_rect(fitz.Rect(50, 50, 500, 750), color=(0.2, 0.4, 0.8), fill=(0.9, 0.9, 0.9))
            page.insert_text(fitz.Point(100, 200), f"Página {i+1} de cómic", fontsize=24)
        doc.save(str(pdf_path))
        doc.close()

        # Test extraction
        extract_dir = tpath / "extracted_pdf"
        extracted = extract_pdf(pdf_path, extract_dir)

        assert len(extracted.pages) == 3
        for p in extracted.pages:
            img_file = extract_dir / "images" / p["filename"]
            thumb_file = extract_dir / "thumbnails" / p["thumb_filename"]
            assert img_file.exists()
            assert thumb_file.exists()
            assert p["width"] > 0
            assert p["height"] > 0
        print(f"  -> PDF extracted {len(extracted.pages)} pages instantly to WebP images!")

if __name__ == "__main__":
    test_pdf_extraction()
    print("PDF TEST PASSED!")
