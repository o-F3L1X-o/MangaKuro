import re
import uuid
import time
import zipfile
import shutil
import subprocess
import logging
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any, Callable
import pymupdf as fitz
from PIL import Image

from app.services.comic_info import (
    ComicInfoModel, parse_comic_info_xml, guess_metadata_from_filename
)
from app.services.image_processor import create_thumbnail

logger = logging.getLogger("comic_parser")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"}
JUNK_PATTERNS = [
    "__macosx", ".ds_store", "thumbs.db", "desktop.ini",
    "ehthumbs.db", ".dropbox", "$recycle.bin"
]

def natural_sort_key(s: str):
    """Sort strings with numbers naturally: page2.jpg comes before page10.jpg."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", s)]

def is_junk_path(path_str: str) -> bool:
    lower = path_str.lower()
    return any(junk in lower for junk in JUNK_PATTERNS)

def is_image_file(path_str: str) -> bool:
    return Path(path_str).suffix.lower() in IMAGE_EXTENSIONS

class ExtractedComicData:
    def __init__(self):
        self.pages: List[Dict[str, Any]] = []
        self.metadata: ComicInfoModel = ComicInfoModel()
        self.raw_xml: Optional[str] = None

ProgressCallback = Optional[Callable[[int, int, str], None]]

def extract_cbz_or_zip(
    file_path: Path, 
    target_dir: Path,
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """Extracts a CBZ or ZIP archive with progress reporting and error handling."""
    target_dir.mkdir(parents=True, exist_ok=True)
    images_dir = target_dir / "images"
    thumbs_dir = target_dir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    result = ExtractedComicData()
    found_comic_info = False

    try:
        with zipfile.ZipFile(file_path, "r") as z:
            all_entries = z.namelist()
            
            # Look for ComicInfo.xml
            for name in all_entries:
                if Path(name).name.lower() == "comicinfo.xml" and not is_junk_path(name):
                    try:
                        xml_data = z.read(name).decode("utf-8", errors="replace")
                        result.raw_xml = xml_data
                        result.metadata = parse_comic_info_xml(xml_data)
                        found_comic_info = True
                        break
                    except Exception as e:
                        logger.warning(f"Error parsing ComicInfo.xml in zip: {e}")

            # Filter images
            image_entries = [
                e for e in all_entries 
                if is_image_file(e) and not is_junk_path(e) and not e.endswith("/")
            ]
            image_entries.sort(key=lambda x: natural_sort_key(Path(x).as_posix()))
            total_images = len(image_entries)

            if total_images == 0:
                raise ValueError("El archivo comprimido no contiene imágenes válidas.")

            for idx, entry in enumerate(image_entries):
                try:
                    page_id = str(uuid.uuid4())
                    orig_name = Path(entry).name
                    suffix = Path(entry).suffix.lower()
                    saved_name = f"page_{idx+1:04d}_{page_id[:8]}{suffix}"
                    saved_path = images_dir / saved_name

                    with z.open(entry) as source, open(saved_path, "wb") as dest:
                        shutil.copyfileobj(source, dest)

                    thumb_name = f"thumb_{idx+1:04d}_{page_id[:8]}.webp"
                    thumb_path = thumbs_dir / thumb_name
                    w, h = create_thumbnail(saved_path, thumb_path)

                    result.pages.append({
                        "id": page_id,
                        "order": idx + 1,
                        "filename": saved_name,
                        "thumb_filename": thumb_name,
                        "original_name": orig_name,
                        "width": w,
                        "height": h,
                        "rotation": 0,
                        "is_cover": (idx == 0)
                    })

                    if progress_callback:
                        progress_callback(idx + 1, total_images, f"Procesando imagen {idx + 1} de {total_images}...")
                except Exception as page_err:
                    logger.error(f"Error procesando imagen {entry}: {page_err}")
                    continue

    except zipfile.BadZipFile as bz:
        raise ValueError(f"El archivo ZIP o CBZ no es válido o está dañado: {bz}")

    if not found_comic_info:
        result.metadata = guess_metadata_from_filename(file_path.name)
    
    result.metadata.PageCount = len(result.pages)
    return result

def extract_pdf(
    file_path: Path, 
    target_dir: Path, 
    dpi: int = 150,
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """
    Ultra-fast PDF rasterization with PyMuPDF in C.
    Generates full images and thumbnails in parallel with progress updates.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    images_dir = target_dir / "images"
    thumbs_dir = target_dir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    result = ExtractedComicData()
    result.metadata = guess_metadata_from_filename(file_path.name)

    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise ValueError(f"No se pudo abrir el archivo PDF (puede estar protegido o dañado): {str(e)}")

    if doc.is_encrypted:
        doc.close()
        raise ValueError("El archivo PDF está protegido con contraseña.")

    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        raise ValueError("El PDF no contiene páginas legibles.")

    result.metadata.PageCount = total_pages

    # Check embedded ComicInfo.xml attachment first
    try:
        if hasattr(doc, "embfile_names") and "ComicInfo.xml" in doc.embfile_names():
            xml_data = doc.embfile_get("ComicInfo.xml").decode("utf-8", errors="replace")
            result.raw_xml = xml_data
            result.metadata = parse_comic_info_xml(xml_data)
    except Exception as e:
        logger.debug(f"No ComicInfo attachment in PDF: {e}")

    # Fallback to standard PDF metadata
    try:
        pdf_meta = doc.metadata or {}
        if pdf_meta.get("title") and not result.metadata.Title:
            result.metadata.Title = pdf_meta.get("title")
            if not result.metadata.Series:
                result.metadata.Series = pdf_meta.get("title")
        if pdf_meta.get("author") and not result.metadata.Writer:
            result.metadata.Writer = pdf_meta.get("author")
        if pdf_meta.get("subject") and not result.metadata.Summary:
            result.metadata.Summary = pdf_meta.get("subject")
    except Exception:
        pass

    for idx in range(total_pages):
        try:
            page = doc.load_page(idx)
            page_id = str(uuid.uuid4())

            # 1. Full page rendering: alpha=False guarantees clean RGB (prevents color channel errors)
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            saved_name = f"page_{idx+1:04d}_{page_id[:8]}.jpg"
            saved_path = images_dir / saved_name
            # Direct pixmap save in C is 15x faster than PIL WebP method=4!
            pix.pil_save(saved_path, format="JPEG", quality=90, optimize=False)

            # 2. Ultra-fast direct thumbnail rendering in C (dpi=36 is ~250-350px height)
            thumb_pix = page.get_pixmap(dpi=36, alpha=False)
            thumb_name = f"thumb_{idx+1:04d}_{page_id[:8]}.webp"
            thumb_path = thumbs_dir / thumb_name
            thumb_pix.pil_save(thumb_path, format="WEBP", quality=80)

            result.pages.append({
                "id": page_id,
                "order": idx + 1,
                "filename": saved_name,
                "thumb_filename": thumb_name,
                "original_name": f"page_{idx+1:04d}.pdf",
                "width": pix.width,
                "height": pix.height,
                "rotation": 0,
                "is_cover": (idx == 0)
            })

            if progress_callback:
                progress_callback(idx + 1, total_pages, f"Extrayendo página {idx + 1} de {total_pages}...")
        except Exception as page_err:
            logger.error(f"Error procesando página {idx+1} del PDF: {page_err}")
            continue

    doc.close()

    if len(result.pages) == 0:
        raise ValueError("No se pudo extraer ninguna página del PDF.")

    result.metadata.PageCount = len(result.pages)
    return result

def extract_epub(
    file_path: Path, 
    target_dir: Path,
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """
    Extracts an EPUB archive (manga, comic, fixed-layout, or illustrated e-book).
    Parses Dublin Core metadata from content.opf and preserves spine reading order.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    images_dir = target_dir / "images"
    thumbs_dir = target_dir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    result = ExtractedComicData()
    result.metadata = guess_metadata_from_filename(file_path.name)

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            all_entries = zf.namelist()

            # 1. Look for ComicInfo.xml first if embedded
            for name in all_entries:
                if Path(name).name.lower() == "comicinfo.xml" and not is_junk_path(name):
                    try:
                        xml_data = zf.read(name).decode("utf-8", errors="replace")
                        result.raw_xml = xml_data
                        result.metadata = parse_comic_info_xml(xml_data)
                        break
                    except Exception as e:
                        logger.warning(f"Error parsing ComicInfo.xml in epub: {e}")

            # 2. Parse OPF metadata (Dublin Core)
            opf_path = None
            if "META-INF/container.xml" in all_entries:
                try:
                    cdata = zf.read("META-INF/container.xml").decode("utf-8", errors="replace")
                    m = re.search(r'full-path=["\']([^"\']+\.opf)["\']', cdata, re.IGNORECASE)
                    if m:
                        opf_path = m.group(1)
                except Exception:
                    pass

            if not opf_path:
                for name in all_entries:
                    if name.lower().endswith(".opf") and not is_junk_path(name):
                        opf_path = name
                        break

            spine_image_paths: List[str] = []
            if opf_path and opf_path in all_entries:
                try:
                    opf_content = zf.read(opf_path).decode("utf-8", errors="replace")
                    opf_dir = Path(opf_path).parent

                    title_m = re.search(r'<dc:title[^>]*>([^<]+)</dc:title>', opf_content, re.IGNORECASE)
                    if title_m and not result.metadata.Title:
                        result.metadata.Title = title_m.group(1).strip()
                        if not result.metadata.Series:
                            result.metadata.Series = title_m.group(1).strip()

                    creator_m = re.search(r'<dc:creator[^>]*>([^<]+)</dc:creator>', opf_content, re.IGNORECASE)
                    if creator_m and not result.metadata.Writer:
                        result.metadata.Writer = creator_m.group(1).strip()

                    publisher_m = re.search(r'<dc:publisher[^>]*>([^<]+)</dc:publisher>', opf_content, re.IGNORECASE)
                    if publisher_m and not result.metadata.Publisher:
                        result.metadata.Publisher = publisher_m.group(1).strip()

                    desc_m = re.search(r'<dc:description[^>]*>([^<]+)</dc:description>', opf_content, re.IGNORECASE)
                    if desc_m and not result.metadata.Summary:
                        result.metadata.Summary = desc_m.group(1).strip()

                    lang_m = re.search(r'<dc:language[^>]*>([^<]+)</dc:language>', opf_content, re.IGNORECASE)
                    if lang_m and not result.metadata.LanguageISO:
                        result.metadata.LanguageISO = lang_m.group(1).strip()

                    if 'page-progression-direction="rtl"' in opf_content:
                        result.metadata.ReadingDirection = "rtl"
                    elif 'page-progression-direction="ltr"' in opf_content:
                        result.metadata.ReadingDirection = "ltr"

                    # Parse manifest items: id -> href
                    manifest_map = {}
                    for item_m in re.finditer(r'<item\b([^>]+)/?>', opf_content, re.IGNORECASE):
                        attrs = item_m.group(1)
                        id_m = re.search(r'id=["\']([^"\']+)["\']', attrs)
                        href_m = re.search(r'href=["\']([^"\']+)["\']', attrs)
                        if id_m and href_m:
                            raw_href = href_m.group(1).replace("\\", "/")
                            if str(opf_dir) != ".":
                                resolved_href = (opf_dir / raw_href).as_posix()
                            else:
                                resolved_href = raw_href
                            manifest_map[id_m.group(1)] = resolved_href

                    # Parse spine itemrefs
                    spine_ids = []
                    for s_m in re.finditer(r'<itemref\b([^>]+)/?>', opf_content, re.IGNORECASE):
                        idref_m = re.search(r'idref=["\']([^"\']+)["\']', s_m.group(1))
                        if idref_m:
                            spine_ids.append(idref_m.group(1))

                    for sid in spine_ids:
                        xhtml_rel = manifest_map.get(sid)
                        if xhtml_rel and xhtml_rel in all_entries:
                            try:
                                page_html = zf.read(xhtml_rel).decode("utf-8", errors="replace")
                                img_src_m = re.search(r'(?:src|href)=["\']([^"\']+\.(?:jpe?g|png|webp|avif|gif))["\']', page_html, re.IGNORECASE)
                                if img_src_m:
                                    img_rel = img_src_m.group(1)
                                    xhtml_dir = Path(xhtml_rel).parent
                                    full_img = (xhtml_dir / img_rel).as_posix() if str(xhtml_dir) != "." else img_rel
                                    parts = []
                                    for part in full_img.split("/"):
                                        if part == "..":
                                            if parts: parts.pop()
                                        elif part and part != ".":
                                            parts.append(part)
                                    norm_img = "/".join(parts)
                                    if norm_img in all_entries and norm_img not in spine_image_paths:
                                        spine_image_paths.append(norm_img)
                            except Exception:
                                pass
                except Exception as opf_err:
                    logger.warning(f"Error parsing EPUB OPF: {opf_err}")

            if len(spine_image_paths) > 0:
                image_entries = spine_image_paths
                remaining_images = [
                    e for e in all_entries
                    if is_image_file(e) and not is_junk_path(e) and not e.endswith("/") and e not in spine_image_paths
                ]
                remaining_images.sort(key=lambda x: natural_sort_key(Path(x).name))
                image_entries.extend(remaining_images)
            else:
                image_entries = [
                    e for e in all_entries
                    if is_image_file(e) and not is_junk_path(e) and not e.endswith("/")
                ]
                image_entries.sort(key=lambda x: natural_sort_key(Path(x).name))

            total_images = len(image_entries)
            if total_images == 0:
                raise ValueError("El archivo EPUB no contiene páginas ni imágenes legibles.")

            for idx, entry in enumerate(image_entries):
                page_id = str(uuid.uuid4())
                orig_name = Path(entry).name
                suffix = Path(entry).suffix.lower()
                saved_name = f"page_{idx+1:04d}_{page_id[:8]}{suffix}"
                saved_path = images_dir / saved_name

                with zf.open(entry) as source, open(saved_path, "wb") as dest:
                    shutil.copyfileobj(source, dest)

                thumb_name = f"thumb_{idx+1:04d}_{page_id[:8]}.webp"
                thumb_path = thumbs_dir / thumb_name
                w, h = create_thumbnail(saved_path, thumb_path)

                result.pages.append({
                    "id": page_id,
                    "order": idx + 1,
                    "filename": saved_name,
                    "thumb_filename": thumb_name,
                    "original_name": orig_name,
                    "width": w,
                    "height": h,
                    "rotation": 0,
                    "is_cover": (idx == 0)
                })

                if progress_callback:
                    progress_callback(idx + 1, total_images, f"Extrayendo página EPUB {idx + 1} de {total_images}...")

            result.metadata.PageCount = len(result.pages)
            return result

    except Exception as e:
        raise ValueError(f"Error procesando el archivo EPUB: {str(e)}")

def process_extracted_folder(
    source_folder: Path, 
    target_dir: Path, 
    file_path: Path, 
    progress_callback: ProgressCallback = None,
    progress_title: str = "Procesando"
) -> ExtractedComicData:
    """
    Scans an uncompressed directory, parses ComicInfo.xml if present,
    naturally sorts all images, creates thumbnails, and constructs ExtractedComicData.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    images_dir = target_dir / "images"
    thumbs_dir = target_dir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    result = ExtractedComicData()
    found_comic_info = False

    all_files = [p for p in source_folder.rglob("*") if p.is_file() and not is_junk_path(str(p))]

    # 1. Search for ComicInfo.xml
    for p in all_files:
        if p.name.lower() == "comicinfo.xml":
            try:
                xml_data = p.read_text(encoding="utf-8", errors="replace")
                result.raw_xml = xml_data
                result.metadata = parse_comic_info_xml(xml_data)
                found_comic_info = True
                break
            except Exception as e:
                logger.warning(f"Error parsing ComicInfo.xml: {e}")

    # 2. Filter images and sort naturally
    image_files = [p for p in all_files if is_image_file(str(p))]
    # Sort naturally by posix relative path to preserve folder hierarchy and numeric page order
    image_files.sort(key=lambda p: natural_sort_key(p.relative_to(source_folder).as_posix()))

    total_images = len(image_files)
    if total_images == 0:
        raise ValueError("El archivo comprimido no contiene imágenes válidas.")

    for idx, img_path in enumerate(image_files):
        try:
            page_id = str(uuid.uuid4())
            orig_name = img_path.name
            suffix = img_path.suffix.lower()
            saved_name = f"page_{idx+1:04d}_{page_id[:8]}{suffix}"
            saved_path = images_dir / saved_name

            shutil.copy2(img_path, saved_path)

            thumb_name = f"thumb_{idx+1:04d}_{page_id[:8]}.webp"
            thumb_path = thumbs_dir / thumb_name
            w, h = create_thumbnail(saved_path, thumb_path)

            result.pages.append({
                "id": page_id,
                "order": idx + 1,
                "filename": saved_name,
                "thumb_filename": thumb_name,
                "original_name": orig_name,
                "width": w,
                "height": h,
                "rotation": 0,
                "is_cover": (idx == 0)
            })

            if progress_callback:
                progress_callback(idx + 1, total_images, f"{progress_title} imagen {idx + 1} de {total_images}...")
        except Exception as page_err:
            logger.error(f"Error procesando imagen {img_path}: {page_err}")
            continue

    if len(result.pages) == 0:
        raise ValueError("No se pudo extraer ninguna imagen válida del archivo.")

    if not found_comic_info:
        result.metadata = guess_metadata_from_filename(file_path.name)

    result.metadata.PageCount = len(result.pages)
    return result

def extract_archive_via_7z_cli(
    file_path: Path, 
    target_dir: Path, 
    progress_callback: ProgressCallback = None,
    progress_title: str = "Extrayendo archivo"
) -> ExtractedComicData:
    """Uses system 7z command-line tool to extract any supported archive format."""
    cli_tool = shutil.which("7z") or shutil.which("7za")
    if not cli_tool:
        raise ValueError("Herramienta 7z no disponible en el sistema.")

    raw_extract_dir = target_dir / f"_temp_7z_cli_{uuid.uuid4().hex[:6]}"
    raw_extract_dir.mkdir(parents=True, exist_ok=True)
    try:
        cmd = [cli_tool, "x", "-y", f"-o{raw_extract_dir}", str(file_path)]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode != 0:
            raise ValueError(f"7z CLI falló (código {res.returncode}): {res.stderr or res.stdout}")

        return process_extracted_folder(
            raw_extract_dir,
            target_dir,
            file_path,
            progress_callback=progress_callback,
            progress_title=progress_title
        )
    finally:
        if raw_extract_dir.exists():
            shutil.rmtree(raw_extract_dir, ignore_errors=True)

def extract_cb7_or_7z(
    file_path: Path, 
    target_dir: Path, 
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """Extracts 7Z or CB7 archive using py7zr or 7z system executable."""
    raw_extract_dir = target_dir / f"_temp_7z_{uuid.uuid4().hex[:6]}"
    raw_extract_dir.mkdir(parents=True, exist_ok=True)
    try:
        extracted = False
        err_msg = ""

        # Method 1: Try py7zr
        try:
            import py7zr
            with py7zr.SevenZipFile(file_path, "r") as z:
                z.extractall(path=raw_extract_dir)
            extracted = True
        except Exception as e:
            logger.warning(f"py7zr falló para '{file_path.name}': {e}. Probando 7z CLI...")
            err_msg = str(e)

        # Method 2: System 7z CLI
        if not extracted:
            cli_tool = shutil.which("7z") or shutil.which("7za")
            if cli_tool:
                cmd = [cli_tool, "x", "-y", f"-o{raw_extract_dir}", str(file_path)]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if res.returncode == 0:
                    extracted = True
                else:
                    err_msg = f"7z CLI error: {res.stderr or res.stdout}"

        if not extracted:
            raise ValueError(f"No se pudo extraer el archivo 7Z/CB7: {err_msg}")

        return process_extracted_folder(
            raw_extract_dir,
            target_dir,
            file_path,
            progress_callback=progress_callback,
            progress_title="Extrayendo 7Z"
        )
    finally:
        if raw_extract_dir.exists():
            shutil.rmtree(raw_extract_dir, ignore_errors=True)

def extract_cbr_or_rar(
    file_path: Path, 
    target_dir: Path, 
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """Extracts CBR or RAR archive using 7z CLI or rarfile."""
    raw_extract_dir = target_dir / f"_temp_rar_{uuid.uuid4().hex[:6]}"
    raw_extract_dir.mkdir(parents=True, exist_ok=True)
    try:
        extracted = False
        err_msg = ""

        # Method 1: System 7z CLI is fastest and handles RAR4 and RAR5 seamlessly
        cli_tool = shutil.which("7z") or shutil.which("7za")
        if cli_tool:
            cmd = [cli_tool, "x", "-y", f"-o{raw_extract_dir}", str(file_path)]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if res.returncode == 0:
                extracted = True
            else:
                err_msg = res.stderr or res.stdout

        # Method 2: rarfile
        if not extracted:
            try:
                import rarfile
                if cli_tool:
                    rarfile.UNRAR_TOOL = cli_tool
                with rarfile.RarFile(file_path, "r") as rf:
                    rf.extractall(path=raw_extract_dir)
                extracted = True
            except Exception as e:
                err_msg = str(e)

        if not extracted:
            raise ValueError(f"No se pudo extraer el archivo CBR/RAR: {err_msg}")

        return process_extracted_folder(
            raw_extract_dir,
            target_dir,
            file_path,
            progress_callback=progress_callback,
            progress_title="Extrayendo RAR"
        )
    finally:
        if raw_extract_dir.exists():
            shutil.rmtree(raw_extract_dir, ignore_errors=True)

def extract_cbt_or_tar(
    file_path: Path, 
    target_dir: Path, 
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """Extracts CBT or TAR archive using Python tarfile or 7z."""
    import tarfile
    raw_extract_dir = target_dir / f"_temp_tar_{uuid.uuid4().hex[:6]}"
    raw_extract_dir.mkdir(parents=True, exist_ok=True)
    try:
        extracted = False
        err_msg = ""
        try:
            with tarfile.open(file_path, "r:*") as tf:
                tf.extractall(path=raw_extract_dir)
            extracted = True
        except Exception as e:
            err_msg = str(e)

        if not extracted:
            cli_tool = shutil.which("7z") or shutil.which("7za")
            if cli_tool:
                cmd = [cli_tool, "x", "-y", f"-o{raw_extract_dir}", str(file_path)]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if res.returncode == 0:
                    extracted = True
                else:
                    err_msg = res.stderr or res.stdout

        if not extracted:
            raise ValueError(f"No se pudo extraer el archivo CBT/TAR: {err_msg}")

        return process_extracted_folder(
            raw_extract_dir,
            target_dir,
            file_path,
            progress_callback=progress_callback,
            progress_title="Extrayendo TAR"
        )
    finally:
        if raw_extract_dir.exists():
            shutil.rmtree(raw_extract_dir, ignore_errors=True)

def detect_archive_type(file_path: Path) -> str:
    """
    Detects the true archive format by inspecting binary magic bytes,
    falling back to file extension.
    Returns: '7z', 'rar', 'pdf', 'zip', 'tar', 'epub', or 'unknown'
    """
    suffix = file_path.suffix.lower()
    magic = b""
    try:
        with open(file_path, "rb") as f:
            magic = f.read(512)
    except Exception as e:
        logger.warning(f"No se pudieron leer magic bytes de {file_path}: {e}")

    # 1. Exact magic byte signatures
    if magic.startswith(b"7z\xbc\xaf\x27\x1c"):
        return "7z"
    if magic.startswith(b"Rar!\x1a\x07\x00") or magic.startswith(b"Rar!\x1a\x07\x01\x00") or magic.startswith(b"Rar!"):
        return "rar"
    if magic.startswith(b"%PDF"):
        return "pdf"
    if magic.startswith(b"\x1f\x8b") or magic.startswith(b"BZh") or magic.startswith(b"\xfd7zXZ\x00"):
        return "tar"
    if len(magic) >= 262 and magic[257:262] == b"ustar":
        return "tar"
    if magic.startswith(b"PK\x03\x04") or magic.startswith(b"PK\x05\x06") or magic.startswith(b"PK\x07\x08"):
        if suffix == ".epub" or b"mimetypeapplication/epub+zip" in magic:
            return "epub"
        return "zip"

    # 2. Extension fallbacks
    if suffix in (".7z", ".cb7"):
        return "7z"
    if suffix in (".cbr", ".rar"):
        return "rar"
    if suffix == ".pdf":
        return "pdf"
    if suffix == ".epub":
        return "epub"
    if suffix in (".cbt", ".tar", ".tar.gz", ".tgz"):
        return "tar"
    if suffix in (".cbz", ".zip"):
        return "zip"

    return "unknown"

def extract_archive_auto(
    file_path: Path, 
    target_dir: Path,
    progress_callback: ProgressCallback = None
) -> ExtractedComicData:
    """
    Detects file format via magic bytes and extension, 
    and extracts accordingly with a resilient multi-tier fallback mechanism.
    """
    archive_type = detect_archive_type(file_path)
    logger.info(f"Detectado formato de archivo '{archive_type}' para '{file_path.name}' (extensión: {file_path.suffix})")

    primary_extractors = {
        "7z": extract_cb7_or_7z,
        "rar": extract_cbr_or_rar,
        "zip": extract_cbz_or_zip,
        "pdf": extract_pdf,
        "epub": extract_epub,
        "tar": extract_cbt_or_tar,
    }

    # 1. Attempt primary detected extractor
    extractor = primary_extractors.get(archive_type)
    if extractor:
        try:
            return extractor(file_path, target_dir, progress_callback=progress_callback)
        except Exception as e:
            logger.warning(
                f"Extractor primario {extractor.__name__} falló para '{file_path.name}': {e}. "
                "Iniciando recuperación mediante extractores de respaldo..."
            )
            shutil.rmtree(target_dir / "images", ignore_errors=True)
            shutil.rmtree(target_dir / "thumbnails", ignore_errors=True)

    # 2. Resilient multi-tier fallback sequence
    fallback_sequence = [
        ("7z", extract_cb7_or_7z),
        ("7z_cli", extract_archive_via_7z_cli),
        ("zip", extract_cbz_or_zip),
        ("rar", extract_cbr_or_rar),
        ("tar", extract_cbt_or_tar),
        ("epub", extract_epub),
        ("pdf", extract_pdf)
    ]

    for name, fb_extractor in fallback_sequence:
        if name == archive_type:
            continue
        try:
            logger.info(f"Probando extractor de respaldo {fb_extractor.__name__} para '{file_path.name}'...")
            res = fb_extractor(file_path, target_dir, progress_callback=progress_callback)
            if res and len(res.pages) > 0:
                logger.info(f"¡Recuperación exitosa con {fb_extractor.__name__}! Extraídas {len(res.pages)} páginas.")
                return res
        except Exception as fb_err:
            logger.debug(f"Extractor de respaldo {fb_extractor.__name__} no pudo procesar: {fb_err}")
            shutil.rmtree(target_dir / "images", ignore_errors=True)
            shutil.rmtree(target_dir / "thumbnails", ignore_errors=True)
            continue

    raise ValueError(
        f"El archivo '{file_path.name}' no se pudo descomprimir. "
        "Puede estar corrupto, protegido con contraseña o en un formato no compatible."
    )
