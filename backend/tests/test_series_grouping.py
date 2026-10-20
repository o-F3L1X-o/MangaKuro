from app.services.session_manager import clean_series_display_name
from app.services.comic_info import infer_metadata_from_filename

def test_clean_series_display_name():
    assert clean_series_display_name("Ao No Exorcist Tomo 01") == "Ao No Exorcist"
    assert clean_series_display_name("Ao No Exorcist Tomo") == "Ao No Exorcist"
    assert clean_series_display_name("Ao No Exorcist Tomos") == "Ao No Exorcist"
    assert clean_series_display_name("Ao No Exorcist Cap 168") == "Ao No Exorcist"
    assert clean_series_display_name("Ao No Exorcist - 168.cbz") == "Ao No Exorcist"
    assert clean_series_display_name("One Piece.cbz") == "One Piece"
    assert clean_series_display_name("One Piece 1050") == "One Piece"
    assert clean_series_display_name("Berserk - 085") == "Berserk"

    # Bare numbers or chapter/volume tags must not become series names
    assert clean_series_display_name("Cap 168.cbz") == "Sin Serie"
    assert clean_series_display_name("Capitulo 168") == "Sin Serie"
    assert clean_series_display_name("c168") == "Sin Serie"
    assert clean_series_display_name("01.cbz") == "Sin Serie"
    assert clean_series_display_name("Tomo 1.cbz") == "Sin Serie"
    assert clean_series_display_name("Vol 02.cbz") == "Sin Serie"
    assert clean_series_display_name("") == "Sin Serie"
    assert clean_series_display_name(None) == "Sin Serie"

def test_guess_metadata_from_filename():
    meta1 = infer_metadata_from_filename("Ao No Exorcist - Cap 168.cbz")
    assert meta1.Series == "Ao No Exorcist"
    assert meta1.Number == "168"

    meta2 = infer_metadata_from_filename("Cap 168.cbz")
    assert meta2.Series == ""
    assert meta2.Number == "168"

    meta3 = infer_metadata_from_filename("Ao No Exorcist Tomo 01.cbz")
    assert "Ao No Exorcist" in meta3.Series
    assert meta3.Volume == 1
