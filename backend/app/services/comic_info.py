import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class ComicInfoModel(BaseModel):
    Title: Optional[str] = ""
    Series: Optional[str] = ""
    Number: Optional[str] = ""
    Count: Optional[int] = None
    Volume: Optional[int] = None
    AlternateSeries: Optional[str] = ""
    AlternateNumber: Optional[str] = ""
    Summary: Optional[str] = ""
    Notes: Optional[str] = ""
    Year: Optional[int] = None
    Month: Optional[int] = None
    Day: Optional[int] = None
    Writer: Optional[str] = ""
    Penciller: Optional[str] = ""
    Inker: Optional[str] = ""
    Colorist: Optional[str] = ""
    Letterer: Optional[str] = ""
    CoverArtist: Optional[str] = ""
    Editor: Optional[str] = ""
    Publisher: Optional[str] = ""
    Imprint: Optional[str] = ""
    Genre: Optional[str] = ""
    Web: Optional[str] = ""
    PageCount: Optional[int] = 0
    LanguageISO: Optional[str] = "es"
    Format: Optional[str] = ""
    BlackAndWhite: Optional[str] = "No" # Yes, No, Unknown
    Manga: Optional[str] = "No" # No (Comic LTR), YesAndRightToLeft (Manga RTL), Yes (Manga LTR)
    ReadingDirection: Optional[str] = "ltr" # ltr (comic), rtl (manga), vertical (webtoon)
    AgeRating: Optional[str] = "Unknown"
    CommunityRating: Optional[float] = None
    ScanInformation: Optional[str] = ""
    StoryArc: Optional[str] = ""
    SeriesGroup: Optional[str] = ""
    Characters: Optional[str] = ""
    Teams: Optional[str] = ""
    Locations: Optional[str] = ""
    Webtoon: Optional[str] = "No" # Yes, No
    Tags: Optional[str] = ""

STRING_FIELDS = [
    "Title", "Series", "Number", "AlternateSeries", "AlternateNumber",
    "Summary", "Notes", "Writer", "Penciller", "Inker", "Colorist",
    "Letterer", "CoverArtist", "Editor", "Publisher", "Imprint",
    "Genre", "Web", "LanguageISO", "Format", "BlackAndWhite",
    "Manga", "AgeRating", "ScanInformation", "StoryArc", "SeriesGroup",
    "Characters", "Teams", "Locations", "Webtoon", "Tags"
]

INT_FIELDS = ["Count", "Volume", "Year", "Month", "Day", "PageCount"]
FLOAT_FIELDS = ["CommunityRating"]

def parse_comic_info_xml(xml_content: str) -> ComicInfoModel:
    """Parse ComicInfo.xml into a typed model."""
    try:
        root = ET.fromstring(xml_content)
    except Exception as e:
        return ComicInfoModel()

    data: Dict[str, Any] = {}
    for elem in root:
        tag = elem.tag
        val = elem.text.strip() if elem.text else ""
        if tag in STRING_FIELDS:
            data[tag] = val
        elif tag in INT_FIELDS:
            try:
                data[tag] = int(val) if val else None
            except ValueError:
                data[tag] = None
        elif tag in FLOAT_FIELDS:
            try:
                data[tag] = float(val) if val else None
            except ValueError:
                data[tag] = None

    # Derive ReadingDirection helper
    notes = data.get("Notes", "") or ""
    genre = data.get("Genre", "") or ""
    webtoon_tag = data.get("Webtoon", "No")
    manga_val = data.get("Manga", "No")

    if webtoon_tag.lower() == "yes" or "webtoon" in notes.lower() or "webtoon" in genre.lower():
        data["ReadingDirection"] = "vertical"
        data["Webtoon"] = "Yes"
    elif manga_val in ["YesAndRightToLeft", "Yes"]:
        data["ReadingDirection"] = "rtl"
    else:
        data["ReadingDirection"] = "ltr"

    return ComicInfoModel(**data)

def generate_comic_info_xml(model: ComicInfoModel) -> str:
    """Generate standardized ComicInfo.xml string for Komga/ComicRack."""
    root = ET.Element("ComicInfo")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xmlns:xsd", "http://www.w3.org/2001/XMLSchema")

    # Map reading direction to Manga / Webtoon fields
    if model.ReadingDirection == "rtl":
        model.Manga = "YesAndRightToLeft"
        model.Webtoon = "No"
    elif model.ReadingDirection == "vertical":
        model.Webtoon = "Yes"
        model.Manga = "No"
        # Add a note/tag for Komga if not present
        if "Webtoon" not in (model.Genre or ""):
            model.Genre = f"{model.Genre}, Webtoon".strip(", ")
    else:
        model.Manga = "No"
        model.Webtoon = "No"

    # Serialize fields in standard order
    all_fields = [
        "Title", "Series", "Number", "Count", "Volume", "AlternateSeries", "AlternateNumber",
        "StoryArc", "SeriesGroup", "Summary", "Notes", "Year", "Month", "Day",
        "Writer", "Penciller", "Inker", "Colorist", "Letterer", "CoverArtist", "Editor",
        "Publisher", "Imprint", "Genre", "Tags", "Web", "PageCount", "LanguageISO", "Format",
        "BlackAndWhite", "Manga", "AgeRating", "CommunityRating", "ScanInformation",
        "Characters", "Teams", "Locations", "Webtoon"
    ]

    dump = model.model_dump()
    for field in all_fields:
        val = dump.get(field)
        if val is not None and str(val).strip() != "":
            elem = ET.SubElement(root, field)
            elem.text = str(val)

    # Indent XML nicely
    ET.indent(root, space="  ", level=0)
    xml_str = ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")
    return xml_str

def guess_metadata_from_filename(filename: str) -> ComicInfoModel:
    """
    Intelligently extracts Series, Chapter/Number, Volume, Title, and ScanGroup
    from standard comic/manga/webtoon release file names.
    Examples:
    - [ScanGroup] Solo Leveling - c125 (v02) - Awakening [Webtoon].cbz
    - Berserk - 085 - La Noche de la Luna.cbz
    - One Piece - c1050 (Digital).cbz
    """
    name = Path(filename).stem
    model = ComicInfoModel()

    # 1. Detect scan group [ScanGroup] or (ScanGroup) at the beginning
    scan_match = re.match(r"^\[([^\]]+)\]\s*", name)
    if scan_match:
        model.ScanInformation = scan_match.group(1).strip()
        name = name[scan_match.end():]

    # 2. Detect webtoon tag
    if re.search(r"\b(webtoon|manhwa|vertical)\b", filename, re.IGNORECASE):
        model.ReadingDirection = "vertical"
        model.Webtoon = "Yes"
        model.Genre = "Webtoon"
    elif re.search(r"\b(manga|manhua)\b", filename, re.IGNORECASE):
        model.ReadingDirection = "rtl"
        model.Manga = "YesAndRightToLeft"
        model.Genre = "Manga"

    # 3. Detect volume: v01, vol. 1, Volume 1, (v01), Tomo 1, Tomo 01
    vol_match = re.search(r"(?:^|[\(\[\s\-_])(?:v|vol|volume|tomo)\.?\s*(\d+)(?:[\)\]\s\-_]|$)", name, re.IGNORECASE)
    if vol_match:
        try:
            model.Volume = int(vol_match.group(1))
            part_before = name[:vol_match.start()].strip(" -_")
            part_after = name[vol_match.end():].strip(" -_")
            if part_before:
                model.Series = part_before
            if part_after:
                part_after = re.sub(r"[\(\[][^\)\]]+[\)\]]", "", part_after).strip(" -_")
                if part_after:
                    model.Title = part_after
            name = (part_before + " " + part_after).strip()
        except ValueError:
            pass

    # 4. Detect chapter / issue number: c001, ch.12, #100, 001, etc.
    # Pattern A: " - c123 - " or " c123 " or " #123 " or " Ch. 123 "
    ch_match = re.search(r"(?:^|[\s\-_])(?:c|ch|cap|capitulo|chapter|#)\.?\s*(\d+(?:\.\d+)?)(?:[\s\-_]|$)", name, re.IGNORECASE)
    if ch_match:
        model.Number = ch_match.group(1)
        part_before = name[:ch_match.start()].strip(" -_")
        part_after = name[ch_match.end():].strip(" -_")
        if part_before and not model.Series:
            model.Series = part_before
        if part_after and not model.Title:
            # Clean common trailing tags like (Digital), [Web], etc.
            part_after = re.sub(r"[\(\[][^\)\]]+[\)\]]", "", part_after).strip(" -_")
            if part_after:
                model.Title = part_after
    elif not model.Volume:
        # Pattern B: Series - 001 - Title
        parts = [p.strip() for p in re.split(r"\s+-\s+", name) if p.strip()]
        if len(parts) >= 3 and re.match(r"^\d+(?:\.\d+)?$", parts[1]):
            model.Series = parts[0]
            model.Number = parts[1]
            model.Title = re.sub(r"[\(\[][^\)\]]+[\)\]]", "", parts[2]).strip()
        elif len(parts) == 2 and re.match(r"^\d+(?:\.\d+)?$", parts[1]):
            model.Series = parts[0]
            model.Number = parts[1]
        elif len(parts) >= 1:
            # Try to find a bare number
            num_match = re.search(r"\b(\d{1,4}(?:\.\d+)?)\b", parts[0])
            if num_match:
                model.Number = num_match.group(1)
                series_guess = parts[0][:num_match.start()].strip(" -_")
                if series_guess:
                    model.Series = series_guess
            else:
                model.Series = parts[0]

    # Clean residual brackets and trailing tomo/vol/cap keywords from Series and Title
    if model.Series:
        model.Series = re.sub(r"[\(\[][^\)\]]+[\)\]]", "", model.Series).strip(" -_")
        model.Series = re.sub(r"\s+(?:tomo|tomos|vol|volume|volumes|cap|capitulo|capitulos|chapter|chapters|ch)\.?\s*$", "", model.Series, flags=re.IGNORECASE).strip()
        # If inferred Series is just a chapter or volume marker (e.g. "Cap 168", "c01", "12"), reset it to empty
        if re.match(r'^(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)?\s*\d+(?:\.\d+)?$', model.Series, flags=re.IGNORECASE):
            model.Series = ""
    if model.Title:
        model.Title = re.sub(r"[\(\[][^\)\]]+[\)\]]", "", model.Title).strip(" -_")

    return model

# Export alias for compatibility
infer_metadata_from_filename = guess_metadata_from_filename
