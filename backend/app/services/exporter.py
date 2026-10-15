import re
import time
import zipfile
import shutil
import tempfile
import threading
import logging
import datetime
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, Callable, List

import pymupdf

from app.config import AppSettings, load_settings
from app.services.session_manager import SessionManifest, session_manager
from app.services.comic_info import generate_comic_info_xml
from app.services.image_processor import convert_and_compress_image

logger = logging.getLogger("exporter")

# In-memory export jobs tracker: { session_id: { status, percent, current, total, message, error, result } }
export_jobs: Dict[str, Dict[str, Any]] = {}

def sanitize_filename(name: str) -> str:
    """Removes illegal filesystem characters from a filename."""
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    return name.strip()

def build_export_filename(manifest: SessionManifest, export_format: str = "cbz") -> str:
    """Creates a clean, Komga-friendly filename based on metadata or original name."""
    meta = manifest.metadata
    series = meta.Series.strip() if meta.Series else ""
    number = meta.Number.strip() if meta.Number else ""
    title = meta.Title.strip() if meta.Title else ""
    volume = f"v{meta.Volume:02d}" if meta.Volume is not None else ""

    parts = []
    if series:
        parts.append(series)
    if volume:
        parts.append(volume)
    if number:
        parts.append(f"#{number}")
    if title:
        parts.append(title)

    if parts:
        base = " - ".join(parts)
    else:
        base = Path(manifest.original_filename).stem

    clean = sanitize_filename(base)
    ext = export_format.lower().lstrip(".")
    return f"{clean}.{ext}"

def export_comic(
    session_id: str,
    output_dir: Optional[Path] = None,
    export_format: str = "cbz",
    compression_format: str = "original",
    quality: int = 85,
    custom_filename: Optional[str] = None,
    auto_downscale_oversized: bool = True,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[Path, int]:
    """
    Packages the session pages into the chosen format (.cbz, .zip, .cbr, .pdf, .epub)
    with real-time progress callbacks and error handling.
    """
    manifest = session_manager.load_session(session_id)
    if not manifest:
        raise ValueError("Sesión no encontrada")

    settings = load_settings()
    if not output_dir:
        output_dir = Path(settings.export_directory)
    output_dir.mkdir(parents=True, exist_ok=True)

    format_clean = export_format.lower().lstrip(".")
    if format_clean not in ("cbz", "zip", "cbr", "pdf", "epub"):
        format_clean = "cbz"

    if custom_filename:
        filename = sanitize_filename(custom_filename)
        if not filename.lower().endswith(f".{format_clean}"):
            filename = f"{Path(filename).stem}.{format_clean}"
    else:
        filename = build_export_filename(manifest, export_format=format_clean)

    final_path = output_dir / filename
    session_dir = session_manager.get_session_dir(session_id)
    images_dir = session_dir / "images"

    total_pages = len(manifest.pages)
    if total_pages == 0:
        raise ValueError("No hay páginas para exportar en esta sesión.")

    if format_clean in ("cbz", "zip", "cbr"):
        return _export_archive(
            manifest=manifest,
            images_dir=images_dir,
            final_path=final_path,
            compression_format=compression_format,
            quality=quality,
            auto_downscale_oversized=auto_downscale_oversized,
            progress_callback=progress_callback
        )
    elif format_clean == "pdf":
        return _export_pdf(
            manifest=manifest,
            images_dir=images_dir,
            final_path=final_path,
            compression_format=compression_format,
            quality=quality,
            auto_downscale_oversized=auto_downscale_oversized,
            progress_callback=progress_callback
        )
    elif format_clean == "epub":
        return _export_epub(
            manifest=manifest,
            images_dir=images_dir,
            final_path=final_path,
            compression_format=compression_format,
            quality=quality,
            auto_downscale_oversized=auto_downscale_oversized,
            progress_callback=progress_callback
        )
    else:
        raise ValueError(f"Formato no soportado: {format_clean}")


def _export_archive(
    manifest: SessionManifest,
    images_dir: Path,
    final_path: Path,
    compression_format: str,
    quality: int,
    auto_downscale_oversized: bool = True,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[Path, int]:
    """Generates standard CBZ, CBR or ZIP archive with ComicInfo.xml."""
    session_dir = images_dir.parent
    temp_zip = session_dir / f"export_{manifest.session_id[:8]}.tmp"
    compress_type = zipfile.ZIP_DEFLATED
    total_pages = len(manifest.pages)

    # Generate ComicInfo.xml
    xml_content = generate_comic_info_xml(manifest.metadata)

    try:
        with zipfile.ZipFile(temp_zip, "w", compression=compress_type) as zf:
            # Write ComicInfo.xml at root
            zf.writestr("ComicInfo.xml", xml_content.encode("utf-8"))

            with tempfile.TemporaryDirectory() as temp_convert_dir:
                temp_conv_path = Path(temp_convert_dir)

                for idx, page in enumerate(manifest.pages):
                    src_path = images_dir / page.filename
                    if not src_path.exists():
                        continue

                    orig_suffix = src_path.suffix.lower()

                    try:
                        if compression_format == "webp":
                            ext = ".webp"
                            entry_name = f"{idx+1:04d}{ext}"
                            dest_file = temp_conv_path / entry_name
                            convert_and_compress_image(
                                src_path, 
                                dest_file, 
                                "webp", 
                                quality=quality, 
                                auto_downscale_oversized=auto_downscale_oversized
                            )
                            zf.write(dest_file, arcname=entry_name)
                        elif compression_format in ("jpg", "jpeg"):
                            ext = ".jpg"
                            entry_name = f"{idx+1:04d}{ext}"
                            dest_file = temp_conv_path / entry_name
                            convert_and_compress_image(src_path, dest_file, "jpg", quality=quality)
                            zf.write(dest_file, arcname=entry_name)
                        else:
                            ext = orig_suffix if orig_suffix in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif") else ".jpg"
                            entry_name = f"{idx+1:04d}{ext}"
                            zf.write(src_path, arcname=entry_name)
                    except Exception as page_err:
                        page_num = idx + 1
                        orig_name = page.original_name or page.filename
                        dim_info = f"{page.width}×{page.height} px" if (page.width and page.height) else "dimensión desconocida"
                        err_str = str(page_err)
                        if "16383" in err_str or "exceeds WebP limit" in err_str:
                            raise ValueError(
                                f"Fallo en Página #{page_num} ('{orig_name}', {dim_info}): La imagen supera el límite técnico de WebP (16.383 px). "
                                f"Usa el cortador de Webtoon para dividirla o activa el ajuste automático."
                            ) from page_err
                        else:
                            raise ValueError(
                                f"Fallo en Página #{page_num} ('{orig_name}', {dim_info}): {err_str}"
                            ) from page_err

                    if progress_callback:
                        progress_callback(
                            idx + 1, 
                            total_pages, 
                            f"Empaquetando página {idx + 1} de {total_pages}..."
                        )
                    time.sleep(0.01)

        # Move completed temp_zip to destination
        shutil.move(temp_zip, final_path)
        file_size = final_path.stat().st_size

        settings = load_settings()
        if settings.komga_server_url:
            trigger_komga_scan(settings.komga_server_url, settings.komga_api_key)

        return final_path, file_size

    except Exception as e:
        if temp_zip.exists():
            temp_zip.unlink(missing_ok=True)
        raise e


def _export_pdf(
    manifest: SessionManifest,
    images_dir: Path,
    final_path: Path,
    compression_format: str,
    quality: int,
    auto_downscale_oversized: bool = True,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[Path, int]:
    """Generates a high-quality PDF document using PyMuPDF."""
    total_pages = len(manifest.pages)
    session_dir = images_dir.parent
    temp_pdf = session_dir / f"export_pdf_{manifest.session_id[:8]}.tmp"

    try:
        doc = pymupdf.open()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            for idx, page in enumerate(manifest.pages):
                src_path = images_dir / page.filename
                if not src_path.exists():
                    continue

                try:
                    # Optimize/compress image if requested
                    img_to_insert = src_path
                    if compression_format in ("jpg", "jpeg"):
                        dest_file = temp_path / f"page_{idx+1:04d}.jpg"
                        convert_and_compress_image(src_path, dest_file, "jpg", quality=quality)
                        img_to_insert = dest_file
                    elif compression_format == "webp":
                        # PyMuPDF supports WebP directly
                        dest_file = temp_path / f"page_{idx+1:04d}.webp"
                        convert_and_compress_image(
                            src_path, 
                            dest_file, 
                            "webp", 
                            quality=quality, 
                            auto_downscale_oversized=auto_downscale_oversized
                        )
                        img_to_insert = dest_file

                    # Insert page with image dimensions
                    with pymupdf.open(img_to_insert) as img_doc:
                        rect = img_doc[0].rect

                    pdf_page = doc.new_page(width=rect.width, height=rect.height)
                    pdf_page.insert_image(rect, filename=str(img_to_insert))
                except Exception as page_err:
                    page_num = idx + 1
                    orig_name = page.original_name or page.filename
                    dim_info = f"{page.width}×{page.height} px" if (page.width and page.height) else "dimensión desconocida"
                    err_str = str(page_err)
                    if "16383" in err_str or "exceeds WebP limit" in err_str:
                        raise ValueError(
                            f"Fallo en Página #{page_num} ('{orig_name}', {dim_info}): La imagen supera el límite técnico de WebP (16.383 px). "
                            f"Usa el cortador de Webtoon para dividirla o activa el ajuste automático."
                        ) from page_err
                    else:
                        raise ValueError(
                            f"Fallo en Página #{page_num} ('{orig_name}', {dim_info}): {err_str}"
                        ) from page_err

                if progress_callback:
                    progress_callback(
                        idx + 1,
                        total_pages,
                        f"Añadiendo página PDF {idx + 1} de {total_pages}..."
                    )
                time.sleep(0.01)

            # Metadata
            meta = manifest.metadata
            doc.set_metadata({
                "title": meta.Title or meta.Series or final_path.stem,
                "author": meta.Writer or meta.Penciller or "MangaKuro",
                "subject": meta.Summary or "",
                "creator": "MangaKuro",
                "producer": "MangaKuro PyMuPDF"
            })

            # Embed ComicInfo.xml into PDF for 100% bidirectional lossless metadata
            try:
                xml_content = generate_comic_info_xml(meta)
                doc.embfile_add("ComicInfo.xml", xml_content.encode("utf-8"), filename="ComicInfo.xml", desc="Comic metadata")
            except Exception as emb_err:
                logger.warning(f"No se pudo incrustar ComicInfo.xml en el PDF: {emb_err}")

            # Save deflated PDF
            if temp_pdf.exists():
                temp_pdf.unlink()
            doc.save(str(temp_pdf), deflate=True, garbage=3)
            doc.close()

        shutil.move(temp_pdf, final_path)
        file_size = final_path.stat().st_size
        return final_path, file_size

    except Exception as e:
        if temp_pdf.exists():
            temp_pdf.unlink(missing_ok=True)
        raise e


def _export_epub(
    manifest: SessionManifest,
    images_dir: Path,
    final_path: Path,
    compression_format: str,
    quality: int,
    auto_downscale_oversized: bool = True,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[Path, int]:
    """Generates an EPUB 3 Fixed-Layout manga/comic book compatible with Apple Books, Kobo, Thorium & Send-to-Kindle."""
    total_pages = len(manifest.pages)
    session_dir = images_dir.parent
    temp_epub = session_dir / f"export_epub_{manifest.session_id[:8]}.tmp"

    meta = manifest.metadata
    title = meta.Title or meta.Series or final_path.stem
    author = meta.Writer or meta.Penciller or "MangaKuro"
    progression = "rtl" if meta.ReadingDirection == "rtl" else "ltr"
    book_id = f"urn:uuid:{manifest.session_id}"
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        with zipfile.ZipFile(temp_epub, "w") as zf:
            # 1. mimetype (MUST be first file, uncompressed STORED)
            zf.writestr("mimetype", b"application/epub+zip", compress_type=zipfile.ZIP_STORED)

            # 2. META-INF/container.xml
            container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""
            zf.writestr("META-INF/container.xml", container_xml.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)

            # Convert images and track items
            manifest_items: List[str] = []
            spine_items: List[str] = []

            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)

                for idx, page in enumerate(manifest.pages):
                    src_path = images_dir / page.filename
                    if not src_path.exists():
                        continue

                    try:
                        # Target format for EPUB (jpg is universal across all e-readers)
                        target_ext = ".jpg" if compression_format in ("jpg", "jpeg", "original") else ".webp"
                        mime_img = "image/jpeg" if target_ext == ".jpg" else "image/webp"

                        dest_img_name = f"page_{idx+1:04d}{target_ext}"
                        dest_img_path = temp_path / dest_img_name

                        if target_ext == ".jpg":
                            convert_and_compress_image(src_path, dest_img_path, "jpg", quality=quality)
                        else:
                            convert_and_compress_image(
                                src_path, 
                                dest_img_path, 
                                "webp", 
                                quality=quality, 
                                auto_downscale_oversized=auto_downscale_oversized
                            )
                    except Exception as page_err:
                        page_num = idx + 1
                        orig_name = page.original_name or page.filename
                        dim_info = f"{page.width}×{page.height} px" if (page.width and page.height) else "dimensión desconocida"
                        err_str = str(page_err)
                        if "16383" in err_str or "exceeds WebP limit" in err_str:
                            raise ValueError(
                                f"Fallo en Página #{page_num} ('{orig_name}', {dim_info}): La imagen supera el límite técnico de WebP (16.383 px). "
                                f"Usa el cortador de Webtoon para dividirla o activa el ajuste automático."
                            ) from page_err
                        else:
                            raise ValueError(
                                f"Fallo en Página #{page_num} ('{orig_name}', {dim_info}): {err_str}"
                            ) from page_err

                    # Get image dimensions for SVG viewport
                    try:
                        with pymupdf.open(dest_img_path) as img_doc:
                            w, h = int(img_doc[0].rect.width), int(img_doc[0].rect.height)
                    except Exception:
                        w, h = 1200, 1600

                    # Write image into EPUB
                    zf.write(dest_img_path, arcname=f"OEBPS/images/{dest_img_name}", compress_type=zipfile.ZIP_DEFLATED)

                    # Create XHTML page wrapper
                    xhtml_name = f"page_{idx+1:04d}.xhtml"
                    is_cover = (idx == 0)
                    cover_prop = ' properties="cover-image"' if is_cover else ''

                    page_xhtml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width={w}, height={h}" />
    <title>Página {idx+1}</title>
    <style>
      @page {{ margin: 0; padding: 0; }}
      html, body {{ margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000; overflow: hidden; }}
      svg {{ width: 100%; height: 100%; margin: 0; padding: 0; }}
    </style>
  </head>
  <body>
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         width="100%" height="100%" viewBox="0 0 {w} {h}">
      <image width="{w}" height="{h}" xlink:href="images/{dest_img_name}"/>
    </svg>
  </body>
</html>"""
                    zf.writestr(f"OEBPS/{xhtml_name}", page_xhtml.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)

                    manifest_items.append(f'<item id="img_{idx+1}" href="images/{dest_img_name}" media-type="{mime_img}"{cover_prop}/>')
                    manifest_items.append(f'<item id="page_{idx+1}" href="{xhtml_name}" media-type="application/xhtml+xml"/>')
                    spine_items.append(f'<itemref idref="page_{idx+1}"/>')

                    if progress_callback:
                        progress_callback(
                            idx + 1,
                            total_pages,
                            f"Generando páginas fijas EPUB {idx + 1} de {total_pages}..."
                        )
                    time.sleep(0.01)

            # Nav document (EPUB 3 Table of Contents)
            nav_xhtml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <meta charset="utf-8"/>
    <title>{title}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contenido</h1>
      <ol>
        <li><a href="page_0001.xhtml">Inicio</a></li>
      </ol>
    </nav>
  </body>
</html>"""
            zf.writestr("OEBPS/nav.xhtml", nav_xhtml.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)
            manifest_items.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')

            # Write ComicInfo.xml for 100% bidirectional lossless metadata
            xml_content = generate_comic_info_xml(meta)
            zf.writestr("ComicInfo.xml", xml_content.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)
            zf.writestr("OEBPS/ComicInfo.xml", xml_content.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)
            manifest_items.append('<item id="comicinfo" href="ComicInfo.xml" media-type="application/xml"/>')

            # Content OPF Package
            manifest_block = "\n    ".join(manifest_items)
            spine_block = "\n    ".join(spine_items)

            pub_tag = f"\n    <dc:publisher>{meta.Publisher}</dc:publisher>" if meta.Publisher else ""
            desc_tag = f"\n    <dc:description>{meta.Summary}</dc:description>" if meta.Summary else ""

            content_opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"
         prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">{book_id}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>{author}</dc:creator>{pub_tag}{desc_tag}
    <dc:language>{meta.LanguageISO or "es"}</dc:language>
    <meta property="dcterms:modified">{now_str}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>
  </metadata>
  <manifest>
    {manifest_block}
  </manifest>
  <spine page-progression-direction="{progression}">
    {spine_block}
  </spine>
</package>"""
            zf.writestr("OEBPS/content.opf", content_opf.encode("utf-8"), compress_type=zipfile.ZIP_DEFLATED)

        shutil.move(temp_epub, final_path)
        file_size = final_path.stat().st_size
        return final_path, file_size

    except Exception as e:
        if temp_epub.exists():
            temp_epub.unlink(missing_ok=True)
        raise e


def start_background_export(
    session_id: str,
    output_dir: Optional[Path] = None,
    export_format: str = "cbz",
    compression_format: str = "original",
    quality: int = 85,
    custom_filename: Optional[str] = None,
    auto_downscale_oversized: bool = True,
    overwrite_source: bool = False,
    delete_merged_source_chapters: bool = False
) -> None:
    """Launches export in a background thread and tracks real-time progress."""
    export_jobs[session_id] = {
        "status": "processing",
        "percent": 0,
        "current": 0,
        "total": 0,
        "message": f"Iniciando empaquetado en formato {export_format.upper()}...",
        "error": None,
        "result": None
    }

    def worker():
        try:
            def on_progress(current: int, total: int, msg: str):
                pct = int((current / max(1, total)) * 100)
                export_jobs[session_id] = {
                    "status": "processing",
                    "percent": pct,
                    "current": current,
                    "total": total,
                    "message": msg,
                    "error": None,
                    "result": None
                }

            final_path, file_size = export_comic(
                session_id=session_id,
                output_dir=output_dir,
                export_format=export_format,
                compression_format=compression_format,
                quality=quality,
                custom_filename=custom_filename,
                auto_downscale_oversized=auto_downscale_oversized,
                progress_callback=on_progress
            )

            manifest = session_manager.load_session(session_id)
            overwrote_source_result = False
            deleted_chapters_list: List[str] = []

            # 1. In-place overwrite if requested and original source file is known
            if overwrite_source and manifest and manifest.source_file_path:
                src_path = Path(manifest.source_file_path)
                try:
                    if src_path.resolve() != final_path.resolve() and final_path.exists():
                        shutil.copy2(final_path, src_path)
                    overwrote_source_result = True
                    logger.info(f"Sobrescrito archivo original en el servidor/NAS: {src_path}")
                except Exception as ow_err:
                    logger.error(f"Error al sobrescribir archivo original {src_path}: {ow_err}")

            # 2. Delete compiled individual chapter archives from NAS if requested
            if delete_merged_source_chapters and manifest and manifest.merged_source_files:
                for ch_file in manifest.merged_source_files:
                    try:
                        ch_p = Path(ch_file)
                        if ch_p.exists() and ch_p.is_file():
                            if ch_p.resolve() != final_path.resolve():
                                ch_p.unlink()
                                deleted_chapters_list.append(ch_p.name)
                                logger.info(f"Capítulo original eliminado tras exportar tomo: {ch_p}")
                    except Exception as del_err:
                        logger.warning(f"No se pudo eliminar el capítulo original {ch_file}: {del_err}")

            success_msg = f"¡Cómic exportado con éxito en {export_format.upper()}!"
            if deleted_chapters_list:
                success_msg += f" (Se eliminaron {len(deleted_chapters_list)} capítulos sueltos del NAS)"
            elif overwrote_source_result:
                success_msg += " (Archivo original en el servidor actualizado)"

            export_jobs[session_id] = {
                "status": "ready",
                "percent": 100,
                "current": export_jobs[session_id].get("total", 0),
                "total": export_jobs[session_id].get("total", 0),
                "message": success_msg,
                "error": None,
                "result": {
                    "success": True,
                    "filename": final_path.name,
                    "filepath": str(final_path),
                    "size_bytes": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2),
                    "download_url": f"/api/download/{final_path.name}",
                    "overwrote_source": overwrote_source_result,
                    "deleted_chapters": deleted_chapters_list,
                    "deleted_chapters_count": len(deleted_chapters_list)
                }
            }
        except Exception as e:
            err_msg = str(e)
            logger.error(f"Error exportando sesión {session_id}: {err_msg}")
            export_jobs[session_id] = {
                "status": "error",
                "percent": 0,
                "current": 0,
                "total": 0,
                "message": f"Error: {err_msg}",
                "error": err_msg,
                "result": None
            }

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

def get_export_status(session_id: str) -> Dict[str, Any]:
    """Returns current status of the export job."""
    if session_id in export_jobs:
        return export_jobs[session_id]
    return {
        "status": "idle",
        "percent": 0,
        "current": 0,
        "total": 0,
        "message": "",
        "error": None,
        "result": None
    }

def trigger_komga_scan(server_url: str, api_key: str):
    """Optionally triggers a library rescan on Komga server."""
    try:
        url = server_url.rstrip("/") + "/api/v1/libraries/scan"
        req = urllib.request.Request(url, method="POST")
        if api_key:
            req.add_header("X-Auth-Token", api_key)
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass
