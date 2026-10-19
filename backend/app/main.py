import os
# --- CPU & Thread Optimization ---
# Restrict multi-threading of numerical/graphics C libraries (MuPDF/OpenMP/BLAS)
# so they never peg 100% across all processor cores, leaving headroom for the OS and multitasking
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "2")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "2")

# Set Windows process priority to BELOW_NORMAL so the operating system and other foreground apps (browsers, IDEs)
# ALWAYS receive scheduling priority over background comic rasterization/thumbnailing
try:
    import psutil
    proc = psutil.Process()
    if hasattr(psutil, "BELOW_NORMAL_PRIORITY_CLASS"):
        proc.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
except Exception:
    pass

import asyncio
import shutil
import tempfile
import hashlib
import re
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import (
    AppSettings, load_settings, save_settings,
    DEFAULT_DATA_DIR, DEFAULT_STAGING_DIR, DEFAULT_EXPORT_DIR
)
from app.services.comic_info import ComicInfoModel
from app.services.exporter import export_comic, start_background_export, get_export_status
from app.services.session_manager import session_manager, resolve_clean_staging_path

app = FastAPI(
    title="MangaKuro • ULTIMATE COMIC & MANGA SUITE",
    description="Gestor web ultra-rápido de CBZ, CBR, PDF y EPUB para Manga, Cómics y Webtoons listo para Komga.",
    version="0.9.5-rc1"
)

# Enable CORS for local network and dev mode
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Allow all non-API requests (static frontend files, html, css, js)
    if not request.url.path.startswith("/api"):
        return await call_next(request)

    # Public API endpoints
    public_paths = {"/api/auth/status", "/api/auth/login", "/api/system/stats"}
    if request.url.path in public_paths:
        return await call_next(request)

    settings = load_settings()
    if settings.app_password:
        auth_header = request.headers.get("Authorization", "")
        bearer_token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else ""
        cookie_token = request.cookies.get("mangakuro_token", "").strip()
        query_token = (request.query_params.get("auth_token") or request.query_params.get("token") or "").strip()
        x_pass = request.headers.get("X-App-Password", "").strip()
        expected_token = hashlib.sha256(settings.app_password.encode()).hexdigest()

        is_authenticated = (
            bearer_token == expected_token or
            cookie_token == expected_token or
            query_token == expected_token or
            x_pass == settings.app_password
        )

        if not is_authenticated:
            return JSONResponse(status_code=401, content={"detail": "No autenticado. Por favor inicia sesión."})

    return await call_next(request)

# --- Schemas ---
class ReorderRequest(BaseModel):
    ordered_ids: List[str]

class RotateRequest(BaseModel):
    page_id: str
    degrees: int = 90

class DeleteRequest(BaseModel):
    page_ids: List[str]

class CoverRequest(BaseModel):
    page_id: str

class SplitSpreadRequest(BaseModel):
    page_id: str
    reading_direction: str = "rtl" # rtl (manga) or ltr (comic)

class SliceWebtoonRequest(BaseModel):
    page_id: str
    max_height: int = 2500

class SliceWebtoonBatchRequest(BaseModel):
    max_height: int = 2500
    only_oversized: bool = True

class CustomSplitVerticalRequest(BaseModel):
    page_id: str
    cut_x: int
    reading_direction: str = "rtl"

class CustomSliceHorizontalRequest(BaseModel):
    page_id: str
    cut_points: List[int]
    discard_indices: Optional[List[int]] = None

class DiscardBandRequest(BaseModel):
    page_id: str
    y_start: int
    y_end: int

class CropPageRequest(BaseModel):
    page_id: str
    x: int
    y: int
    width: int
    height: int
    save_as_new: bool = False

class TextAnnotationItem(BaseModel):
    x: int
    y: int
    width: Optional[int] = None
    height: Optional[int] = None
    box_width: Optional[int] = None
    box_height: Optional[int] = None
    text: str
    font_size: int = 28
    style: str = "badge_dark" # badge_dark, badge_light, speech_bubble, sticky_yellow, outline, plain
    align: Optional[str] = "center" # center, left, right
    text_color: Optional[str] = "#FFFFFF"
    bg_color: Optional[str] = None
    bg_opacity: Optional[float] = 0.8
    border: Optional[bool] = True
    border_width: Optional[int] = 2

class PageOcrRequest(BaseModel):
    x: Optional[int] = None
    y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    language: str = "auto" # auto, kor, jpn, spa, eng

class AddTextAnnotationsRequest(BaseModel):
    page_id: str
    annotations: List[TextAnnotationItem]

class ChapterCoverRequest(BaseModel):
    chapter_number: str
    chapter_title: str
    series_name: Optional[str] = ""
    style: str = "minimal_white" # minimal_white, minimal_dark, overlay_bg
    bg_page_id: Optional[str] = None
    insert_before_page_id: Optional[str] = None
    replace_page_id: Optional[str] = None

class CheckExistingRequest(BaseModel):
    filename: str

class ExportRequest(BaseModel):
    compression: str = "webp" # webp, jpg, original
    quality: int = 85
    save_to_library: bool = True
    custom_filename: Optional[str] = None
    custom_export_dir: Optional[str] = None
    export_format: str = "cbz" # cbz, zip, cbr, pdf, epub
    auto_downscale_oversized: bool = True
    overwrite_source: bool = False
    delete_merged_source_chapters: bool = False

class QuickMetaRequest(BaseModel):
    item_type: Optional[str] = None
    series: Optional[str] = None
    title: Optional[str] = None
    number: Optional[str] = None
    volume: Optional[int] = None

class MergeSessionsRequest(BaseModel):
    source_session_ids: List[str]
    target_series: str
    target_volume: Optional[int] = None
    target_title: Optional[str] = None
    delete_sources: bool = False
    add_chapter_covers: bool = False

class AppendChaptersRequest(BaseModel):
    source_session_ids: List[str]
    delete_sources: bool = True
    add_chapter_covers: bool = False

class ExtractChapterRequest(BaseModel):
    page_ids: List[str]
    chapter_number: str
    chapter_title: Optional[str] = None
    remove_from_source: bool = True

class MovePagesRequest(BaseModel):
    target_session_id: str
    page_ids: List[str]
    remove_from_source: bool = True

class BatchMetadataRequest(BaseModel):
    session_ids: List[str]
    metadata: ComicInfoModel
    apply_common_only: bool = True
    fields_to_copy: Optional[List[str]] = None

class BatchDeleteSessionsRequest(BaseModel):
    session_ids: List[str]

class ConfirmVerificationRequest(BaseModel):
    delete_staging: bool = True

class ConfirmBatchVerificationRequest(BaseModel):
    session_ids: Optional[List[str]] = None
    delete_staging: bool = True

class LoginRequest(BaseModel):
    password: str

class ServerImportRequest(BaseModel):
    file_paths: List[str]
    item_type: Optional[str] = "auto"
    custom_series: Optional[str] = None
    custom_number: Optional[str] = None

class ApplyOnlineCoverRequest(BaseModel):
    image_url: str
    mode: str = "insert_first" # "insert_first" or "replace_first"
    custom_name: Optional[str] = "Portada Oficial.jpg"

# --- Authentication Endpoints ---

@app.get("/api/auth/status")
async def get_auth_status(request: Request):
    """Checks if password protection is active and if the client is authenticated."""
    settings = load_settings()
    if not settings.app_password:
        return {"auth_required": False, "authenticated": True}

    auth_header = request.headers.get("Authorization", "")
    bearer_token = auth_header.replace("Bearer ", "").strip() if "Bearer " in auth_header else ""
    cookie_token = request.cookies.get("mangakuro_token", "").strip()
    query_token = (request.query_params.get("auth_token") or request.query_params.get("token") or "").strip()
    x_pass = request.headers.get("X-App-Password", "").strip()
    expected_token = hashlib.sha256(settings.app_password.encode()).hexdigest()

    is_auth = (
        bearer_token == expected_token or
        cookie_token == expected_token or
        query_token == expected_token or
        x_pass == settings.app_password
    )
    return {"auth_required": True, "authenticated": is_auth}

@app.post("/api/auth/login")
async def auth_login(req: LoginRequest, response: Response):
    """Authenticates with password, sets cookie, and returns an auth token."""
    settings = load_settings()
    if not settings.app_password:
        return {"success": True, "token": "open"}
    if req.password == settings.app_password:
        token = hashlib.sha256(settings.app_password.encode()).hexdigest()
        response.set_cookie(
            key="mangakuro_token",
            value=token,
            max_age=86400 * 30, # 30 days
            httponly=False,
            samesite="lax",
            path="/"
        )
        return {"success": True, "token": token}
    raise HTTPException(status_code=401, detail="Contraseña incorrecta")

@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    """Clears the auth session cookie."""
    response.delete_cookie(key="mangakuro_token", path="/")
    return {"success": True}

# --- Server Filesystem Browser & Direct Ingestion ---

ALLOWED_COMIC_EXTENSIONS = (
    ".cbz", ".cbr", ".cb7", ".cbt",
    ".zip", ".rar", ".7z", ".tar",
    ".pdf", ".epub"
)

@app.get("/api/server-fs/browse")
async def browse_server_fs(path: Optional[str] = None):
    """Lists directories and comic files in a server path for direct ingestion."""
    settings = load_settings()
    export_dir = Path(settings.export_directory) if settings.export_directory else DEFAULT_EXPORT_DIR
    data_dir = DEFAULT_DATA_DIR

    quick_roots = []
    if settings.staging_directory:
        stg = resolve_clean_staging_path(settings.staging_directory)
        if stg:
            try:
                if stg.exists():
                    quick_roots.append({"name": "Staging Configurado", "path": str(stg.resolve())})
            except Exception:
                pass

    try:
        if export_dir.exists():
            quick_roots.append({"name": "Biblioteca Komga (Export)", "path": str(export_dir.resolve())})
    except Exception:
        pass

    try:
        if data_dir.exists():
            quick_roots.append({"name": "Almacenamiento MangaKuro", "path": str(data_dir.resolve())})
    except Exception:
        pass

    for candidate, label in [
        (Path("/comics_library"), "Biblioteca /comics_library"),
        (Path("/downloads"), "Descargas /downloads"),
        (Path("/media"), "Medios /media"),
        (Path("/mnt"), "Montajes /mnt")
    ]:
        try:
            if candidate.exists() and not any(r["path"] == str(candidate.resolve()) for r in quick_roots):
                quick_roots.append({"name": label, "path": str(candidate.resolve())})
        except Exception:
            pass

    if os.name == "nt":
        for d in "CDEFGHIJKLMNOPQRSTUVWXYZ":
            try:
                drive_path = Path(f"{d}:\\")
                if drive_path.exists():
                    quick_roots.append({"name": f"Disco {d}:", "path": str(drive_path)})
            except Exception:
                pass
    else:
        if not any(r["path"] == "/" for r in quick_roots):
            quick_roots.append({"name": "Raíz del Sistema (/)", "path": "/"})

    target: Optional[Path] = None
    if not path or not path.strip():
        if settings.staging_directory:
            stg = resolve_clean_staging_path(settings.staging_directory)
            if stg and stg.exists():
                target = stg
        if not target:
            target = export_dir if export_dir.exists() else (Path(quick_roots[0]["path"]) if quick_roots else Path.cwd())
    else:
        cleaned = resolve_clean_staging_path(path)
        target = cleaned if cleaned else Path(path.strip())

    try:
        if not target.exists() or not target.is_dir():
            if target.parent.exists() and target.parent.is_dir():
                target = target.parent
            elif quick_roots:
                target = Path(quick_roots[0]["path"])
            else:
                target = Path.cwd()
    except Exception:
        if quick_roots:
            target = Path(quick_roots[0]["path"])
        else:
            target = Path.cwd()

    try:
        resolved_target = target.resolve()
    except Exception:
        resolved_target = target

    parent_path = None
    try:
        if target.parent != target and str(target.parent) != str(target):
            parent_path = str(target.parent)
    except Exception:
        parent_path = None

    directories = []
    files = []

    try:
        entries = list(target.iterdir())
        for entry in sorted(entries, key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                comic_count = 0
                has_staging = False
                try:
                    comic_count = sum(1 for sub in entry.iterdir() if sub.is_file() and sub.suffix.lower() in ALLOWED_COMIC_EXTENSIONS)
                except Exception:
                    pass
                try:
                    has_staging = (entry.name.lower() == "staging") or ((entry / "staging").is_dir())
                except Exception:
                    pass
                try:
                    entry_path_str = str(entry.resolve())
                except Exception:
                    entry_path_str = str(entry)
                directories.append({
                    "name": entry.name,
                    "path": entry_path_str,
                    "comic_count": comic_count,
                    "has_staging": has_staging
                })
            elif entry.is_file() and entry.suffix.lower() in ALLOWED_COMIC_EXTENSIONS:
                try:
                    size_mb = round(entry.stat().st_size / (1024 * 1024), 2)
                except Exception:
                    size_mb = 0
                try:
                    entry_path_str = str(entry.resolve())
                except Exception:
                    entry_path_str = str(entry)
                files.append({
                    "name": entry.name,
                    "path": entry_path_str,
                    "size_mb": size_mb,
                    "extension": entry.suffix.lower()
                })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permiso denegado para acceder a esta carpeta del servidor")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al explorar directorio: {e}")

    return {
        "current_path": str(resolved_target),
        "parent_path": parent_path,
        "quick_roots": quick_roots,
        "directories": directories,
        "files": files
    }

@app.post("/api/server-fs/import")
async def import_server_files(req: ServerImportRequest):
    """Imports comic files directly from a server path into staging without uploading over HTTP."""
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="No se seleccionó ningún archivo para importar")

    imported_sessions = []
    errors = []

    for fp_str in req.file_paths:
        fp = Path(fp_str)
        if not fp.exists() or not fp.is_file():
            errors.append(f"Archivo no encontrado: {fp.name}")
            continue
        if fp.suffix.lower() not in ALLOWED_COMIC_EXTENSIONS:
            errors.append(f"Formato no compatible: {fp.name}")
            continue

        try:
            session_id = session_manager.start_background_extraction(
                temp_file_path=fp,
                filename=fp.name,
                item_type=req.item_type,
                custom_series=req.custom_series,
                custom_number=req.custom_number,
                source_file_path=str(fp.resolve()),
                is_server_file=True
            )
            imported_sessions.append({
                "session_id": session_id,
                "filename": fp.name,
                "path": str(fp)
            })
        except Exception as e:
            errors.append(f"Error al procesar {fp.name}: {e}")

    return {
        "success": len(imported_sessions) > 0,
        "imported": imported_sessions,
        "errors": errors,
        "count": len(imported_sessions)
    }

# --- Upload & Sessions ---

@app.post("/api/upload/check")
async def check_existing_file(req: CheckExistingRequest):
    """Checks if an identical file was already loaded in staging."""
    found = session_manager.find_existing_session_by_filename(req.filename)
    if found:
        return found
    return {"exists": False}

@app.post("/api/staging/cleanup")
async def cleanup_staging():
    """Cleans up all temporary staging folders to free disk space."""
    count = session_manager.cleanup_all_staging()
    return {"success": True, "cleaned_sessions": count}

@app.post("/api/staging/cleanup-orphaned")
async def cleanup_orphaned_staging():
    """Cleans up empty or corrupted staging sessions (0 pages) to free disk space."""
    res = session_manager.cleanup_orphaned_sessions()
    return {"success": True, **res}

@app.get("/api/system/stats")
async def get_system_stats():
    """Returns real-time CPU, RAM, staging disk usage, and orphan counts."""
    return session_manager.get_system_stats()

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    replace_session_id: Optional[str] = Form(None),
    item_type: Optional[str] = Form(None),
    custom_series: Optional[str] = Form(None),
    custom_number: Optional[str] = Form(None)
):
    """Uploads a comic file (CBZ, CBR, ZIP, RAR, PDF, EPUB) and launches real-time extraction in background."""
    filename = file.filename or "comic.cbz"
    suffix = Path(filename).suffix.lower()

    if replace_session_id:
        session_manager.delete_session(replace_session_id)

    ALLOWED_UPLOAD_EXTENSIONS = (
        ".cbz", ".cbr", ".cb7", ".cbt",
        ".zip", ".rar", ".7z", ".tar",
        ".pdf", ".epub"
    )
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail="Formato no compatible. Por favor sube archivos .cbz, .cbr, .cb7, .cbt, .zip, .rar, .7z, .tar, .pdf o .epub"
        )

    # Write upload to temporary file first
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        session_id = session_manager.start_background_extraction(
            tmp_path, 
            filename,
            item_type=item_type,
            custom_series=custom_series,
            custom_number=custom_number
        )
        return {
            "session_id": session_id,
            "status": "processing",
            "message": "Archivo recibido. Iniciando extracción..."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error iniciando proceso: {str(e)}")
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

@app.get("/api/session/{session_id}/status")
async def get_session_status(session_id: str):
    """Retrieves real-time processing progress and error state."""
    status = session_manager.get_job_status(session_id)
    return status

@app.delete("/api/session/{session_id}")
async def cancel_session(session_id: str):
    """Cancels and deletes an in-progress or failed session."""
    session_manager.delete_session(session_id)
    return {"success": True}

@app.post("/api/sessions/batch-delete")
async def batch_delete_sessions_endpoint(req: BatchDeleteSessionsRequest):
    """Deletes multiple sessions at once and frees staging disk space."""
    deleted_count = 0
    for sid in req.session_ids:
        session_manager.delete_session(sid)
        deleted_count += 1
    return {"success": True, "deleted_count": deleted_count}

@app.post("/api/session/{session_id}/confirm-verification")
async def confirm_session_verification_endpoint(session_id: str, req: Optional[ConfirmVerificationRequest] = None):
    """
    Confirms that the exported/overwritten comic is OK in Komga.
    Frees disk space on the staging host (Chuwi minipc) by cleaning up the staging session.
    """
    delete_staging = req.delete_staging if req else True
    try:
        res = session_manager.confirm_verification(session_id, delete_staging=delete_staging)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/sessions/confirm-verification-batch")
async def confirm_batch_verification_endpoint(req: Optional[ConfirmBatchVerificationRequest] = None):
    """
    Confirms verification and frees staging space for multiple sessions or all pending sessions in batch.
    """
    session_ids = req.session_ids if req else None
    try:
        res = session_manager.confirm_verification_batch(session_ids=session_ids)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/revert-overwrite")
async def revert_session_overwrite_endpoint(session_id: str):
    """
    Restores the original comic file on the server/NAS from the safety backup in staging.
    Guarantees zero risk of data loss.
    """
    try:
        res = session_manager.revert_overwrite(session_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.patch("/api/session/{session_id}/quick-meta")
async def update_quick_meta(session_id: str, req: QuickMetaRequest):
    """Quickly updates session item_type, series name, title, or chapter/volume number."""
    try:
        updated = session_manager.update_quick_metadata(
            session_id=session_id,
            item_type=req.item_type,
            series=req.series,
            title=req.title,
            number=req.number,
            volume=req.volume
        )
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/merge")
async def merge_sessions_endpoint(req: MergeSessionsRequest):
    """Merges multiple chapters/sessions into a single volume (Tomo)."""
    try:
        manifest = session_manager.merge_sessions(
            source_session_ids=req.source_session_ids,
            target_series=req.target_series,
            target_volume=req.target_volume,
            target_title=req.target_title,
            delete_sources=req.delete_sources,
            add_chapter_covers=req.add_chapter_covers
        )
        return manifest
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/append-chapters")
async def append_chapters_endpoint(session_id: str, req: AppendChaptersRequest):
    """Appends multiple chapter sessions directly into an existing tomo session."""
    try:
        manifest = session_manager.append_sessions_to_target(
            target_session_id=session_id,
            source_session_ids=req.source_session_ids,
            delete_sources=req.delete_sources,
            add_chapter_covers=req.add_chapter_covers
        )
        return manifest
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/extract-chapter")
async def extract_chapter_endpoint(session_id: str, req: ExtractChapterRequest):
    """Extracts selected pages from a volume into a new standalone chapter session."""
    try:
        result = session_manager.extract_pages_to_chapter(
            source_session_id=session_id,
            page_ids=req.page_ids,
            chapter_number=req.chapter_number,
            chapter_title=req.chapter_title,
            remove_from_source=req.remove_from_source
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/move-pages")
async def move_pages_endpoint(session_id: str, req: MovePagesRequest):
    """Moves or copies selected pages from one session to another."""
    try:
        result = session_manager.move_pages_to_session(
            source_session_id=session_id,
            target_session_id=req.target_session_id,
            page_ids=req.page_ids,
            remove_from_source=req.remove_from_source
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/sessions")
async def list_sessions():
    """Lists all loaded comic sessions in staging with covers and page counts."""
    return session_manager.list_all_sessions()

@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Retrieves current session state (pages, order, metadata)."""
    manifest = session_manager.load_session(session_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return manifest

@app.get("/api/session/{session_id}/thumb/{filename}")
async def get_thumbnail(session_id: str, filename: str):
    """Serves high-performance WebP thumbnail from in-memory cache or storage with immutable browser caching."""
    cache_key = f"{session_id}/{filename}"
    cached_bytes = session_manager.thumbnail_cache.get(cache_key)
    if cached_bytes:
        return Response(
            content=cached_bytes,
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=604800, immutable",
                "X-MangaKuro-Cache": "HIT"
            }
        )

    sdir = session_manager.get_session_dir(session_id)
    path = sdir / "thumbnails" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Miniatura no encontrada")

    data = await asyncio.to_thread(path.read_bytes)
    session_manager.thumbnail_cache.put(cache_key, data)

    return Response(
        content=data,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=604800, immutable",
            "X-MangaKuro-Cache": "MISS"
        }
    )

@app.get("/api/session/{session_id}/image/{filename}")
async def get_full_image(session_id: str, filename: str):
    """Serves full resolution page image with fast cache validation."""
    sdir = session_manager.get_session_dir(session_id)
    path = sdir / "images" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    
    suffix = path.suffix.lower()
    media_map = {
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif"
    }
    return FileResponse(
        path, 
        media_type=media_map.get(suffix, "image/jpeg"),
        headers={"Cache-Control": "public, max-age=604800, immutable"}
    )

# --- Page Actions (Instant Hot-Saving) ---

@app.post("/api/session/{session_id}/reorder")
async def reorder_pages(session_id: str, req: ReorderRequest):
    """Reorders pages in milliseconds."""
    try:
        return session_manager.reorder_pages(session_id, req.ordered_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/rotate")
async def rotate_page(session_id: str, req: RotateRequest):
    """Rotates a single page."""
    try:
        return session_manager.rotate_page(session_id, req.page_id, req.degrees)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/delete")
async def delete_pages(session_id: str, req: DeleteRequest):
    """Deletes one or multiple pages."""
    try:
        return session_manager.delete_pages(session_id, req.page_ids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/cover")
async def set_cover(session_id: str, req: CoverRequest):
    """Sets a page as front cover and moves it to position 1."""
    try:
        return session_manager.set_cover(session_id, req.page_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/split-spread")
async def split_spread(session_id: str, req: SplitSpreadRequest):
    """Splits a wide double-page into two single pages."""
    try:
        return session_manager.split_spread(session_id, req.page_id, req.reading_direction)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/slice-webtoon")
async def slice_webtoon(session_id: str, req: SliceWebtoonRequest):
    """Slices a very tall webtoon strip at clean seams."""
    try:
        return session_manager.slice_webtoon(session_id, req.page_id, req.max_height)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/slice-webtoon-batch")
async def slice_webtoon_batch(session_id: str, req: SliceWebtoonBatchRequest):
    """Slices webtoon strips in batch in a background thread with real-time progress."""
    try:
        return session_manager.start_slice_batch_job(session_id, max_height=req.max_height, only_oversized=req.only_oversized)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/session/{session_id}/slice/status")
async def get_slice_job_status(session_id: str):
    """Returns real-time progress and status of the background webtoon slicing job."""
    return session_manager.get_slice_job_status(session_id)

@app.post("/api/session/{session_id}/undo")
async def undo_session(session_id: str):
    """Restores the previous session state from history with 100% fidelity."""
    try:
        return session_manager.undo(session_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/custom-split-vertical")
async def custom_split_vertical(session_id: str, req: CustomSplitVerticalRequest):
    """Splits a double page vertically at an exact X coordinate."""
    try:
        return session_manager.custom_split_vertical(session_id, req.page_id, req.cut_x, req.reading_direction)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/custom-slice-horizontal")
async def custom_slice_horizontal(session_id: str, req: CustomSliceHorizontalRequest):
    """Slices an image horizontally at user-chosen or adjusted Y coordinate cut lines, optionally discarding specified slices."""
    try:
        return session_manager.custom_slice_horizontal(session_id, req.page_id, req.cut_points, req.discard_indices)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/discard-band")
async def discard_band(session_id: str, req: DiscardBandRequest):
    """Discards a horizontal band between y_start and y_end from a page."""
    try:
        return session_manager.discard_band(session_id, req.page_id, req.y_start, req.y_end)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/session/{session_id}/suggested-cuts/{page_id}")
async def get_suggested_cuts(session_id: str, page_id: str, max_height: int = 2500):
    """Returns auto-calculated clean gutter cut lines for an individual strip."""
    try:
        cuts = session_manager.get_suggested_cuts(session_id, page_id, max_height=max_height)
        return {"cuts": cuts}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/crop-page")
async def crop_page(session_id: str, req: CropPageRequest):
    """Crops a rectangular zone of a page."""
    try:
        return session_manager.crop_page(session_id, req.page_id, req.x, req.y, req.width, req.height, req.save_as_new)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/add-text-annotations")
async def add_text_annotations(session_id: str, req: AddTextAnnotationsRequest):
    """Burns translation notes and SFX text directly into the page image."""
    try:
        return session_manager.add_text_annotations(session_id, req.page_id, [a.dict() for a in req.annotations])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/page/{page_id}/ocr")
async def ocr_page(session_id: str, page_id: str, req: PageOcrRequest):
    """Executes OCR on the page or specific speech bubble region."""
    try:
        return session_manager.ocr_page_region(
            session_id=session_id,
            page_id=page_id,
            x=req.x,
            y=req.y,
            width=req.width,
            height=req.height,
            language=req.language
        )
    except Exception as e:
        logger.error(f"Error running OCR on page {page_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error en OCR: {str(e)}")

@app.post("/api/session/{session_id}/chapter-cover")
async def create_chapter_cover(session_id: str, req: ChapterCoverRequest):
    """Generates and inserts or replaces a Tankōbon chapter separator/cover page."""
    try:
        return session_manager.create_chapter_cover(
            session_id=session_id,
            chapter_number=req.chapter_number,
            chapter_title=req.chapter_title,
            series_name=req.series_name,
            style=req.style,
            bg_page_id=req.bg_page_id,
            insert_before_page_id=req.insert_before_page_id,
            replace_page_id=req.replace_page_id
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/add-pages")
async def add_pages(
    session_id: str,
    files: List[UploadFile] = File(...),
    insert_after: Optional[str] = Form(None),
    insert_at_beginning: bool = Form(True)
):
    """Inserts additional user-uploaded images into the session. By default places them at the beginning as cover."""
    saved_tuples = []
    temp_paths = []
    try:
        for f in files:
            sfx = Path(f.filename or "image.jpg").suffix
            with tempfile.NamedTemporaryFile(delete=False, suffix=sfx) as tmp:
                shutil.copyfileobj(f.file, tmp)
                tpath = Path(tmp.name)
                temp_paths.append(tpath)
                saved_tuples.append((tpath, f.filename or "image.jpg"))

        return session_manager.add_pages(session_id, saved_tuples, insert_after, insert_at_beginning)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        for tp in temp_paths:
            if tp.exists():
                tp.unlink()

# --- Metadata ComicInfo.xml ---

@app.post("/api/session/{session_id}/metadata")
async def update_metadata(session_id: str, metadata: ComicInfoModel):
    """Saves updated ComicInfo metadata for the session."""
    try:
        return session_manager.update_metadata(session_id, metadata)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/batch-metadata")
async def batch_update_metadata_endpoint(req: BatchMetadataRequest):
    """Updates metadata across multiple sessions at once."""
    try:
        updated = session_manager.batch_update_metadata(
            session_ids=req.session_ids,
            metadata=req.metadata,
            apply_common_only=req.apply_common_only,
            fields_to_copy=req.fields_to_copy
        )
        return {"updated_count": len(updated), "sessions": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Online Manga & Comic Search & Covers ---

@app.get("/api/search/online")
async def search_online_endpoint(query: str, source: str = "auto", target_lang: str = "es"):
    """Searches online databases (MangaUpdates, MangaDex, AniList, OpenLibrary) with user-selected target language."""
    from app.services.online_search import unified_online_search
    try:
        results = await asyncio.to_thread(unified_online_search, query=query, source=source, target_lang=target_lang)
        return {"results": results, "count": len(results), "target_lang": target_lang}
    except Exception as e:
        logger.error(f"Error in online search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/series/online-summary")
async def get_series_online_summary_endpoint(series_name: str, target_lang: str = "es"):
    """Fetches official online publication summary (status, total volumes, total chapters, cover, creator roles) for a series."""
    from app.services.online_search import get_series_online_summary
    try:
        summary = await asyncio.to_thread(get_series_online_summary, series_name, target_lang=target_lang)
        return summary
    except Exception as e:
        logger.error(f"Error fetching online summary for '{series_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search/mangadex/{manga_id}/covers")
async def get_mangadex_covers_endpoint(manga_id: str):
    """Fetches volume-specific covers for a MangaDex manga ID."""
    from app.services.online_search import get_mangadex_volume_covers
    try:
        covers = await asyncio.to_thread(get_mangadex_volume_covers, manga_id)
        return {"covers": covers, "count": len(covers)}
    except Exception as e:
        logger.error(f"Error in mangadex covers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/session/{session_id}/apply-online-cover")
async def apply_online_cover_endpoint(session_id: str, req: ApplyOnlineCoverRequest):
    """Downloads an external cover image and sets it as session cover (inserting as page #1 or replacing page #1)."""
    try:
        manifest = await asyncio.to_thread(
            session_manager.apply_online_cover,
            session_id=session_id,
            image_url=req.image_url,
            mode=req.mode,
            custom_name=req.custom_name
        )
        return manifest
    except Exception as e:
        logger.error(f"Error applying online cover to session {session_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- Export & Komga Integration ---

@app.post("/api/session/{session_id}/export")
async def export_session(session_id: str, req: ExportRequest):
    """Starts background export and returns immediately to allow real-time progress tracking."""
    try:
        dest_dir = Path(req.custom_export_dir) if req.custom_export_dir else None
        start_background_export(
            session_id=session_id,
            output_dir=dest_dir,
            export_format=req.export_format,
            compression_format=req.compression,
            quality=req.quality,
            custom_filename=req.custom_filename,
            auto_downscale_oversized=req.auto_downscale_oversized,
            overwrite_source=req.overwrite_source,
            delete_merged_source_chapters=req.delete_merged_source_chapters
        )
        return {"status": "processing", "message": f"Iniciando exportación en formato {req.export_format.upper()}..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error iniciando exportación: {str(e)}")

@app.post("/api/session/{session_id}/page/{page_id}/downscale")
async def downscale_page_endpoint(session_id: str, page_id: str, max_dimension: int = 16383):
    """Downscales an oversized image page to fit within max_dimension (e.g. 16383 px for WebP)."""
    try:
        manifest = session_manager.downscale_page(session_id, page_id, max_dimension=max_dimension)
        return manifest
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/{session_id}/downscale-oversized")
async def downscale_all_oversized_endpoint(session_id: str, max_dimension: int = 16383):
    """Downscales all oversized images in the session so max dimension is within max_dimension."""
    try:
        manifest = session_manager.downscale_all_oversized(session_id, max_dimension=max_dimension)
        return manifest
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/session/{session_id}/export/status")
async def get_export_job_status(session_id: str):
    """Retrieves real-time export progress, current page and result."""
    return get_export_status(session_id)

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """Downloads an exported comic/manga/pdf file directly."""
    settings = load_settings()
    file_path = Path(settings.export_directory) / filename
    if not file_path.exists():
        # Also check staging
        file_path = DEFAULT_STAGING_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    ext = Path(filename).suffix.lower()
    media_map = {
        ".cbz": "application/vnd.comicbook+zip",
        ".cbr": "application/x-cbr",
        ".cb7": "application/x-7z-compressed",
        ".cbt": "application/x-tar",
        ".zip": "application/zip",
        ".rar": "application/x-rar-compressed",
        ".7z": "application/x-7z-compressed",
        ".tar": "application/x-tar",
        ".pdf": "application/pdf",
        ".epub": "application/epub+zip"
    }
    media_type = media_map.get(ext, "application/octet-stream")

    return FileResponse(
        file_path,
        media_type=media_type,
        filename=filename
    )

# --- Configuration & Settings ---

@app.get("/api/settings")
async def get_settings():
    return load_settings()

@app.post("/api/settings")
async def set_settings(new_settings: AppSettings):
    save_settings(new_settings)
    if new_settings.staging_directory and new_settings.staging_directory.strip():
        session_manager.staging_dir = resolve_clean_staging_path(new_settings.staging_directory)
    else:
        session_manager.staging_dir = None
    return {"success": True, "settings": new_settings}

# --- Frontend Static Files Serving & SPA Fallback ---
candidates = [
    Path("/app/frontend/dist"),
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(__file__).resolve().parent.parent / "frontend" / "dist",
    Path.cwd() / "frontend" / "dist",
]
frontend_dist = next((c for c in candidates if c.exists() and (c / "index.html").exists()), None)
if frontend_dist:
    # 1. Mount assets explicitly if present
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # 2. Mount root directory with html=True
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

    # 3. SPA 404 Fallback for client-side routing on reload/deep-linking
    @app.exception_handler(404)
    async def spa_404_fallback(request, exc):
        if not request.url.path.startswith("/api") and (frontend_dist / "index.html").exists():
            return FileResponse(frontend_dist / "index.html")
        return Response(status_code=404, content="Endpoint not found")

if __name__ == "__main__":
    import uvicorn
    # Listen on all interfaces (0.0.0.0) so it's accessible via IP from any device in the LAN
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
