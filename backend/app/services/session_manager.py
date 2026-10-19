import json
import time
import uuid
import shutil
import threading
import traceback
import logging
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
from PIL import Image, ImageOps
from app.config import DEFAULT_STAGING_DIR
from app.services.comic_info import ComicInfoModel, infer_metadata_from_filename, generate_comic_info_xml
from app.services.comic_parser import extract_archive_auto
from app.services.image_processor import (
    create_thumbnail, rotate_image, split_double_page, get_image_dimensions,
    split_vertical_at_x, crop_image_box, draw_text_annotations, ocr_image_region
)
from app.services.webtoon_slicer import (
    slice_webtoon_image, calculate_suggested_cuts, slice_image_at_points
)
from app.services.chapter_generator import generate_chapter_card

import collections
import concurrent.futures

logger = logging.getLogger("session_manager")

class ThumbnailCache:
    """In-memory LRU cache for WebP thumbnails to eliminate network SMB roundtrips."""
    def __init__(self, max_items: int = 1200):
        self._cache: collections.OrderedDict[str, bytes] = collections.OrderedDict()
        self._max = max_items
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[bytes]:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return None

    def put(self, key: str, data: bytes):
        with self._lock:
            self._cache[key] = data
            self._cache.move_to_end(key)
            if len(self._cache) > self._max:
                self._cache.popitem(last=False)

    def invalidate_session(self, session_id: str):
        prefix = f"{session_id}/"
        with self._lock:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

class PageItem(BaseModel):
    id: str
    order: int
    filename: str
    thumb_filename: str
    original_name: str
    width: int
    height: int
    rotation: int = 0
    is_cover: bool = False

class SessionManifest(BaseModel):
    session_id: str
    original_filename: str
    created_at: float
    updated_at: float
    pages: List[PageItem]
    metadata: ComicInfoModel
    item_type: str = "tomo"  # "tomo" or "capitulo"
    source_file_path: Optional[str] = None
    merged_source_files: Optional[List[str]] = None
    merged_chapter_names: Optional[List[str]] = None
    verification_status: Optional[str] = None  # "pending_verification" | "verified_ok" | "reverted" | None
    exported_to_path: Optional[str] = None
    last_exported_at: Optional[float] = None
    backup_file_path: Optional[str] = None

def resolve_clean_staging_path(raw_path: Any) -> Optional[Path]:
    if not raw_path:
        return None
    s = str(raw_path).strip().strip('"').strip("'").strip()
    if not s:
        return None
    import os
    # If running on Linux/Unix and path starts with a Windows drive letter (e.g. "E:\..."),
    # it is an invalid local path on Linux. Do not treat as relative directory.
    if os.name != "nt" and re.match(r'^[a-zA-Z]:', s):
        logger.warning(f"Ignoring Windows drive path '{s}' on Linux environment.")
        return None

    # Fix accidental space between drive letter and backslash e.g. "E: \something" -> "E:\something"
    s = re.sub(r'^([a-zA-Z]:)\s*[/\\]', r'\1\\', s)
    # Fix forward slashes on Windows UNC paths: "//server/share" -> "\\server\share"
    if os.name == "nt" and s.startswith("//"):
        s = "\\\\" + s[2:].replace("/", "\\")
    return Path(s)

class SessionManager:
    def __init__(self, staging_dir: Optional[Path] = None):
        self._custom_staging_dir: Optional[Path] = resolve_clean_staging_path(staging_dir) if staging_dir else None
        # Background job progress tracker: { session_id: { status, percent, current, total, message, error } }
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.slice_jobs: Dict[str, Dict[str, Any]] = {}
        self._manifest_cache: Dict[str, SessionManifest] = {}
        self._history_snapshots: Dict[str, List[Dict[str, Any]]] = {}
        self._stats_cache: Optional[Dict[str, Any]] = None
        self._stats_cache_time: float = 0.0
        self._stats_lock = threading.Lock()
        self.thumbnail_cache = ThumbnailCache()
        self.extraction_executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=2,
            thread_name_prefix="ExtractionWorker"
        )

    @property
    def staging_dir(self) -> Path:
        if self._custom_staging_dir:
            p = resolve_clean_staging_path(self._custom_staging_dir)
            if p and p.exists():
                if (p / "staging").is_dir():
                    return p / "staging"
                if p.is_dir():
                    return p

        try:
            from app.config import load_settings
            settings = load_settings()
            if settings.staging_directory and settings.staging_directory.strip():
                p = resolve_clean_staging_path(settings.staging_directory)
                if p and p.exists():
                    if (p / "staging").is_dir():
                        return p / "staging"
                    if p.is_dir():
                        return p
        except Exception:
            pass

        # Auto-detect mounted network staging candidates if available
        for candidate in [
            Path("/mnt/mangakuro_data"),
            Path("/mnt/staging"),
        ]:
            try:
                if (candidate / "staging").is_dir():
                    return candidate / "staging"
                if candidate.is_dir():
                    return candidate
            except Exception:
                pass

        if (DEFAULT_STAGING_DIR / "staging").is_dir():
            return DEFAULT_STAGING_DIR / "staging"
        DEFAULT_STAGING_DIR.mkdir(parents=True, exist_ok=True)
        return DEFAULT_STAGING_DIR

    @staging_dir.setter
    def staging_dir(self, value: Any):
        if value:
            clean_p = resolve_clean_staging_path(value)
            self._custom_staging_dir = clean_p
            if clean_p:
                try:
                    clean_p.mkdir(parents=True, exist_ok=True)
                except Exception:
                    pass
        else:
            self._custom_staging_dir = None
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.slice_jobs: Dict[str, Dict[str, Any]] = {}
        self._manifest_cache: Dict[str, SessionManifest] = {}
        self._history_snapshots: Dict[str, List[Dict[str, Any]]] = {}
        self._stats_cache: Optional[Dict[str, Any]] = None
        self._stats_cache_time: float = 0.0
        self._stats_lock = threading.Lock()

    def get_session_dir(self, session_id: str) -> Path:
        return self.staging_dir / session_id

    def get_manifest_path(self, session_id: str) -> Path:
        return self.get_session_dir(session_id) / "manifest.json"

    def find_existing_session_by_filename(self, filename: str) -> Optional[Dict[str, Any]]:
        """Checks if a session with the same original filename already exists in staging."""
        target_name = Path(filename).name.lower().strip()
        if not self.staging_dir.exists():
            return None

        for sdir in self.staging_dir.iterdir():
            if sdir.is_dir():
                mpath = sdir / "manifest.json"
                if mpath.exists():
                    try:
                        manifest = self.load_session(sdir.name)
                        if manifest and Path(manifest.original_filename).name.lower().strip() == target_name:
                            return {
                                "exists": True,
                                "session_id": manifest.session_id,
                                "filename": manifest.original_filename,
                                "page_count": len(manifest.pages),
                                "created_at": manifest.created_at,
                                "updated_at": manifest.updated_at
                            }
                    except Exception:
                        pass
        return None

    def list_all_sessions(self) -> List[Dict[str, Any]]:
        """Returns a summarized list of all active comic sessions in staging."""
        results = []
        if not self.staging_dir.exists():
            return results

        for sdir in self.staging_dir.iterdir():
            if sdir.is_dir():
                mpath = sdir / "manifest.json"
                if mpath.exists():
                    try:
                        manifest = self.load_session(sdir.name)
                        if manifest and manifest.pages:
                            cover_page = next((p for p in manifest.pages if p.is_cover), manifest.pages[0])
                            clean_series = manifest.metadata.Series
                            if not clean_series:
                                inferred_meta = infer_metadata_from_filename(manifest.original_filename)
                                clean_series = inferred_meta.Series or manifest.original_filename

                            results.append({
                                "session_id": manifest.session_id,
                                "original_filename": manifest.original_filename,
                                "series": clean_series,
                                "number": manifest.metadata.Number or "",
                                "volume": manifest.metadata.Volume if getattr(manifest, "item_type", "tomo") != "capitulo" else None,
                                "title": manifest.metadata.Title or "",
                                "page_count": len(manifest.pages),
                                "cover_thumb": cover_page.thumb_filename,
                                "item_type": getattr(manifest, "item_type", "tomo"),
                                "source_file_path": getattr(manifest, "source_file_path", None),
                                "merged_source_files": getattr(manifest, "merged_source_files", None),
                                "merged_chapter_names": getattr(manifest, "merged_chapter_names", None),
                                "verification_status": getattr(manifest, "verification_status", None),
                                "exported_to_path": getattr(manifest, "exported_to_path", None),
                                "last_exported_at": getattr(manifest, "last_exported_at", None),
                                "backup_file_path": getattr(manifest, "backup_file_path", None),
                                "created_at": manifest.created_at,
                                "updated_at": manifest.updated_at
                            })
                    except Exception:
                        pass

        # Sort by updated_at descending (most recently edited first)
        results.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        return results

    def cleanup_all_staging(self) -> int:
        """Cleans up all staging sessions and clears disk space."""
        count = 0
        if self.staging_dir.exists():
            for sdir in self.staging_dir.iterdir():
                if sdir.is_dir():
                    shutil.rmtree(sdir, ignore_errors=True)
                    count += 1
        self.jobs.clear()
        self._manifest_cache.clear()
        return count

    def _scan_disk_and_orphans(self) -> Tuple[Dict[str, Any], Dict[str, Any], int, List[Tuple[Path, str, int]]]:
        """
        Scans staging directory and calculates:
        - Total staging size and drive capacity
        - Real orphan items: broken/empty sessions AND unreferenced image/thumbnail files inside active sessions.
        Returns: (disk_stats, orphans_stats, active_sessions, orphaned_items)
        """
        orphaned_items: List[Tuple[Path, str, int]] = []
        staging_bytes = 0
        active_sessions = 0

        if self.staging_dir.exists():
            for sdir in self.staging_dir.iterdir():
                if not sdir.is_dir():
                    continue

                mpath = sdir / "manifest.json"
                is_broken_session = False
                manifest_pages = None

                if not mpath.exists():
                    is_broken_session = True
                else:
                    try:
                        with open(mpath, "r", encoding="utf-8") as f:
                            sdata = json.load(f)
                            pages = sdata.get("pages", [])
                            if len(pages) == 0:
                                is_broken_session = True
                            else:
                                active_sessions += 1
                                manifest_pages = pages
                    except Exception:
                        is_broken_session = True

                if is_broken_session:
                    # Entire directory is orphaned
                    dir_bytes = 0
                    try:
                        for f in sdir.rglob("*"):
                            if f.is_file():
                                try:
                                    fsize = f.stat().st_size
                                    dir_bytes += fsize
                                    staging_bytes += fsize
                                except Exception:
                                    pass
                        orphaned_items.append((sdir, "dir", dir_bytes))
                    except Exception:
                        pass
                else:
                    # Valid session: check for unreferenced images & thumbnails
                    referenced_files = {
                        "manifest.json",
                        "comicinfo.xml",
                        "ComicInfo.xml"
                    }
                    if manifest_pages:
                        for p in manifest_pages:
                            fn = p.get("filename")
                            if fn:
                                referenced_files.add(fn)
                                referenced_files.add(fn.lower())
                                referenced_files.add(f"images/{fn}")
                                referenced_files.add(f"images\\{fn}")
                            th = p.get("thumb_filename")
                            if th:
                                referenced_files.add(th)
                                referenced_files.add(th.lower())
                                referenced_files.add(f"thumbnails/{th}")
                                referenced_files.add(f"thumbnails\\{th}")

                    try:
                        for f in sdir.rglob("*"):
                            if f.is_file():
                                try:
                                    fsize = f.stat().st_size
                                    staging_bytes += fsize
                                    rel = str(f.relative_to(sdir)).replace("\\", "/")
                                    fname = f.name
                                    fname_lower = fname.lower()
                                    if (
                                        fname in referenced_files or
                                        fname_lower in referenced_files or
                                        rel in referenced_files or
                                        fname_lower == "manifest.json" or
                                        fname_lower == "comicinfo.xml" or
                                        fname.startswith("backup_") or
                                        fname.startswith(".cover_")
                                    ):
                                        continue
                                    orphaned_items.append((f, "file", fsize))
                                except Exception:
                                    pass
                    except Exception:
                        pass

        drive_total_gb = 0.0
        drive_free_gb = 0.0
        drive_used_percent = 0.0
        try:
            du = shutil.disk_usage(self.staging_dir)
            drive_total_gb = round(du.total / (1024 ** 3), 1)
            drive_free_gb = round(du.free / (1024 ** 3), 1)
            drive_used_percent = round((du.used / max(1, du.total)) * 100, 1)
        except Exception:
            pass

        orphaned_bytes = sum(item[2] for item in orphaned_items)
        disk_stats = {
            "staging_bytes": staging_bytes,
            "staging_mb": round(staging_bytes / (1024 * 1024), 1),
            "staging_gb": round(staging_bytes / (1024 ** 3), 2),
            "drive_total_gb": drive_total_gb,
            "drive_free_gb": drive_free_gb,
            "drive_used_percent": drive_used_percent
        }
        orphans_stats = {
            "count": len(orphaned_items),
            "bytes": orphaned_bytes,
            "mb": round(orphaned_bytes / (1024 * 1024), 1),
            "gb": round(orphaned_bytes / (1024 ** 3), 2)
        }

        return disk_stats, orphans_stats, active_sessions, orphaned_items

    def cleanup_orphaned_sessions(self) -> Dict[str, Any]:
        """Cleans up empty/corrupted sessions AND unreferenced image files inside active sessions."""
        _, _, _, orphaned_items = self._scan_disk_and_orphans()
        cleaned_count = 0
        freed_bytes = 0

        for path, kind, bsize in orphaned_items:
            try:
                if kind == "dir":
                    shutil.rmtree(path, ignore_errors=True)
                    self.jobs.pop(path.name, None)
                else:
                    if path.exists():
                        path.unlink()
                cleaned_count += 1
                freed_bytes += bsize
            except Exception as e:
                logger.warning(f"Could not remove orphan {path}: {e}")

        freed_gb = round(freed_bytes / (1024 ** 3), 2)
        freed_mb = round(freed_bytes / (1024 ** 2), 1)
        with self._stats_lock:
            self._stats_cache = None
        return {
            "cleaned_sessions": cleaned_count,
            "freed_bytes": freed_bytes,
            "freed_mb": freed_mb,
            "freed_gb": freed_gb
        }

    def get_system_stats(self) -> Dict[str, Any]:
        """Returns CPU, RAM, staging disk usage, drive capacity, and orphaned session count."""
        now = time.time()
        with self._stats_lock:
            cache_valid = (self._stats_cache is not None) and (now - self._stats_cache_time < 120.0)

        # 1. CPU & Memory via psutil (instant)
        cpu_sys = 0.0
        cpu_proc = 0.0
        ram_sys_pct = 0.0
        ram_sys_used_gb = 0.0
        ram_sys_total_gb = 0.0
        ram_proc_mb = 0.0

        try:
            import psutil
            cpu_sys = psutil.cpu_percent(interval=None)
            vmem = psutil.virtual_memory()
            ram_sys_pct = vmem.percent
            ram_sys_used_gb = round(vmem.used / (1024 ** 3), 2)
            ram_sys_total_gb = round(vmem.total / (1024 ** 3), 2)

            proc = psutil.Process()
            ram_proc_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
            cpu_proc = round(proc.cpu_percent(interval=None) / max(1, psutil.cpu_count() or 1), 1)
        except Exception as e:
            logger.debug(f"psutil error: {e}")

        # 2. Disk & Orphans (cached for 15s to eliminate disk I/O churn)
        if cache_valid and self._stats_cache:
            disk_stats = self._stats_cache["disk"]
            orphans_stats = self._stats_cache["orphans"]
            active_sessions = self._stats_cache.get("active_sessions", 0)
        else:
            disk_stats, orphans_stats, active_sessions, _ = self._scan_disk_and_orphans()
            with self._stats_lock:
                self._stats_cache = {
                    "disk": disk_stats,
                    "orphans": orphans_stats,
                    "active_sessions": active_sessions
                }
                self._stats_cache_time = now

        return {
            "cpu": {
                "system_percent": cpu_sys,
                "process_percent": cpu_proc
            },
            "memory": {
                "system_percent": ram_sys_pct,
                "system_used_gb": ram_sys_used_gb,
                "system_total_gb": ram_sys_total_gb,
                "process_rss_mb": ram_proc_mb
            },
            "disk": disk_stats,
            "orphans": orphans_stats,
            "active_sessions": active_sessions
        }

    def load_session(self, session_id: str) -> Optional[SessionManifest]:
        if session_id in self._manifest_cache:
            return self._manifest_cache[session_id]

        mpath = self.get_manifest_path(session_id)
        if not mpath.exists():
            return None
        with open(mpath, "r", encoding="utf-8") as f:
            data = json.load(f)
            manifest = SessionManifest(**data)
            self._manifest_cache[session_id] = manifest
            return manifest

    def save_session(self, manifest: SessionManifest):
        manifest.updated_at = time.time()
        manifest.metadata.PageCount = len(manifest.pages)
        self._manifest_cache[manifest.session_id] = manifest
        mpath = self.get_manifest_path(manifest.session_id)
        with open(mpath, "w", encoding="utf-8") as f:
            json.dump(manifest.model_dump(), f, indent=2, ensure_ascii=False)

        # Keep ComicInfo.xml in session folder 100% synchronized on disk
        try:
            xml_path = self.get_session_dir(manifest.session_id) / "ComicInfo.xml"
            xml_str = generate_comic_info_xml(manifest.metadata)
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(xml_str)
        except Exception as e:
            logger.warning(f"Error saving ComicInfo.xml for {manifest.session_id}: {e}")

    def create_session_from_file(self, temp_file_path: Path, filename: str) -> SessionManifest:
        session_id = str(uuid.uuid4())
        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)

        extracted = extract_archive_auto(temp_file_path, session_dir)

        pages = [PageItem(**p) for p in extracted.pages]
        manifest = SessionManifest(
            session_id=session_id,
            original_filename=filename,
            created_at=time.time(),
            updated_at=time.time(),
            pages=pages,
            metadata=extracted.metadata
        )
        self.save_session(manifest)
        return manifest

    def get_job_status(self, session_id: str) -> Dict[str, Any]:
        """Returns the real-time processing status of a session."""
        if session_id in self.jobs:
            return self.jobs[session_id]
        # If manifest already exists on disk
        manifest = self.load_session(session_id)
        if manifest:
            return {
                "status": "ready",
                "percent": 100,
                "current_page": len(manifest.pages),
                "total_pages": len(manifest.pages),
                "message": "Completado",
                "error": None
            }
        return {
            "status": "not_found",
            "percent": 0,
            "current_page": 0,
            "total_pages": 0,
            "message": "Sesión no encontrada",
            "error": "Sesión no encontrada"
        }

    def start_background_extraction(
        self, 
        temp_file_path: Path, 
        filename: str,
        item_type: Optional[str] = None,
        custom_series: Optional[str] = None,
        custom_number: Optional[str] = None,
        source_file_path: Optional[str] = None,
        is_server_file: bool = False
    ) -> str:
        """Starts asynchronous archive extraction in a worker thread and tracks real-time progress."""
        session_id = str(uuid.uuid4())
        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)

        if is_server_file:
            source_to_extract = temp_file_path
            saved_source_path = source_file_path or str(temp_file_path)
            temp_to_cleanup = None
        else:
            # Move uploaded source file into session dir
            source_copy = session_dir / f"source_{filename}"
            shutil.copyfile(temp_file_path, source_copy)
            source_to_extract = source_copy
            saved_source_path = None
            temp_to_cleanup = source_copy

        self.jobs[session_id] = {
            "status": "processing",
            "percent": 0,
            "current_page": 0,
            "total_pages": 0,
            "message": "Iniciando análisis del archivo...",
            "error": None
        }

        def worker():
            try:
                def on_progress(current: int, total: int, msg: str):
                    pct = int((current / max(1, total)) * 100)
                    self.jobs[session_id] = {
                        "status": "processing",
                        "percent": pct,
                        "current_page": current,
                        "total_pages": total,
                        "message": msg,
                        "error": None
                    }

                extracted = extract_archive_auto(source_to_extract, session_dir, progress_callback=on_progress)

                # If no Series in metadata, infer from filename
                inferred = infer_metadata_from_filename(filename)
                if not extracted.metadata.Series and inferred.Series:
                    extracted.metadata.Series = inferred.Series
                if not extracted.metadata.Number and inferred.Number:
                    extracted.metadata.Number = inferred.Number
                if extracted.metadata.Volume is None and inferred.Volume is not None:
                    extracted.metadata.Volume = inferred.Volume

                # Determine item_type if not provided
                final_item_type = item_type
                if not final_item_type or final_item_type == "auto":
                    if re.search(r"\b(vol|tomo|volume|v\d+)\b", filename, re.IGNORECASE) or extracted.metadata.Volume is not None:
                        final_item_type = "tomo"
                    elif re.search(r"\b(cap|c\d+|ch\d+|chapter)\b", filename, re.IGNORECASE) or (extracted.metadata.Number and not extracted.metadata.Volume):
                        final_item_type = "capitulo"
                    else:
                        final_item_type = "tomo"

                if final_item_type == "capitulo":
                    extracted.metadata.Format = "Capítulo"
                    extracted.metadata.Volume = None
                else:
                    extracted.metadata.Format = "Tomo"

                if custom_series:
                    extracted.metadata.Series = custom_series
                if custom_number:
                    if final_item_type == "tomo":
                        try:
                            extracted.metadata.Volume = int(custom_number)
                        except ValueError:
                            extracted.metadata.Number = custom_number
                    else:
                        extracted.metadata.Number = custom_number
                        extracted.metadata.Volume = None

                pages = [PageItem(**p) for p in extracted.pages]
                manifest = SessionManifest(
                    session_id=session_id,
                    original_filename=filename,
                    created_at=time.time(),
                    updated_at=time.time(),
                    pages=pages,
                    metadata=extracted.metadata,
                    item_type=final_item_type,
                    source_file_path=saved_source_path
                )
                self.save_session(manifest)

                # Clean up temporary archive copy if it was uploaded to avoid double storage
                if temp_to_cleanup and temp_to_cleanup.exists():
                    try:
                        temp_to_cleanup.unlink(missing_ok=True)
                    except Exception:
                        pass

                self.jobs[session_id] = {
                    "status": "ready",
                    "percent": 100,
                    "current_page": len(pages),
                    "total_pages": len(pages),
                    "message": "¡Procesamiento completado con éxito!",
                    "error": None
                }
            except Exception as e:
                err_msg = str(e)
                logger.error(f"Error procesando sesión {session_id}: {traceback.format_exc()}")
                self.jobs[session_id] = {
                    "status": "error",
                    "percent": 0,
                    "current_page": 0,
                    "total_pages": 0,
                    "message": f"Error: {err_msg}",
                    "error": err_msg
                }

        self.extraction_executor.submit(worker)

        return session_id

    def delete_session(self, session_id: str):
        """Cleans up staging directory on cancel or error."""
        self.thumbnail_cache.invalidate_session(session_id)
        sdir = self.get_session_dir(session_id)
        if sdir.exists():
            mpath = sdir / "manifest.json"
            if mpath.exists():
                try:
                    mpath.unlink()
                except Exception:
                    pass
            shutil.rmtree(sdir, ignore_errors=True)
        self.jobs.pop(session_id, None)
        self._manifest_cache.pop(session_id, None)
        with self._stats_lock:
            self._stats_cache = None

    def confirm_verification(self, session_id: str, delete_staging: bool = True) -> Dict[str, Any]:
        """
        Confirms that the exported/overwritten comic is OK in Komga.
        Frees disk space on the staging host (Chuwi minipc) by cleaning up the staging session.
        """
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        freed_bytes = 0
        sdir = self.get_session_dir(session_id)
        if sdir.exists():
            for f in sdir.rglob("*"):
                if f.is_file():
                    try:
                        freed_bytes += f.stat().st_size
                    except Exception:
                        pass

        if delete_staging:
            self.delete_session(session_id)
        else:
            manifest.verification_status = "verified_ok"
            # Remove safety backup file to save space if keeping session
            if manifest.backup_file_path:
                bp = Path(manifest.backup_file_path)
                if bp.exists():
                    try:
                        bp.unlink()
                    except Exception:
                        pass
                manifest.backup_file_path = None
            self.save_session(manifest)

        return {
            "success": True,
            "session_id": session_id,
            "freed_bytes": freed_bytes,
            "freed_mb": round(freed_bytes / (1024 * 1024), 2)
        }

    def confirm_verification_batch(self, session_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Confirms verification and frees staging space for multiple sessions in batch.
        If session_ids is None, confirms all sessions marked with 'pending_verification'.
        """
        if session_ids is None:
            session_ids = []
            for s in self.list_all_sessions():
                if s.get("verification_status") == "pending_verification":
                    session_ids.append(s["session_id"])

        total_freed = 0
        confirmed_count = 0
        for sid in session_ids:
            try:
                res = self.confirm_verification(sid, delete_staging=True)
                total_freed += res.get("freed_bytes", 0)
                confirmed_count += 1
            except Exception as e:
                logger.warning(f"Error confirmando verificación para {sid}: {e}")

        return {
            "success": True,
            "confirmed_count": confirmed_count,
            "freed_bytes": total_freed,
            "freed_mb": round(total_freed / (1024 * 1024), 2)
        }

    def revert_overwrite(self, session_id: str) -> Dict[str, Any]:
        """
        Restores the original comic file on the server/NAS from the safety backup in staging.
        Guarantees zero data loss if anything was unexpected.
        """
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        if not manifest.backup_file_path or not Path(manifest.backup_file_path).exists():
            raise ValueError("No se encontró el archivo de copia de seguridad previa en staging.")

        if not manifest.source_file_path:
            raise ValueError("No se encontró la ruta del archivo original en el servidor.")

        backup_p = Path(manifest.backup_file_path)
        source_p = Path(manifest.source_file_path)

        # Restore original file
        shutil.copy2(backup_p, source_p)
        logger.info(f"Restaurado archivo original desde backup: {source_p}")

        manifest.verification_status = "reverted"
        self.save_session(manifest)

        # Trigger Komga scan if server configured
        try:
            from app.config import load_settings
            from app.services.exporter import trigger_komga_scan
            settings = load_settings()
            if settings.komga_server_url:
                trigger_komga_scan(settings.komga_server_url, settings.komga_api_key)
        except Exception:
            pass

        return {
            "success": True,
            "session_id": session_id,
            "restored_path": str(source_p)
        }

    def push_history_snapshot(self, session_id: str):
        """Saves a snapshot of the current session manifest and backed-up files for undo."""
        manifest = self.load_session(session_id)
        if not manifest:
            return

        sdir = self.get_session_dir(session_id)
        hist_dir = sdir / ".history"
        hist_dir.mkdir(parents=True, exist_ok=True)

        snap_id = f"snap_{int(time.time() * 1000)}"
        snap_folder = hist_dir / snap_id
        snap_folder.mkdir(parents=True, exist_ok=True)

        with open(snap_folder / "manifest.json", "w", encoding="utf-8") as f:
            f.write(manifest.model_dump_json(indent=2))

        if session_id not in self._history_snapshots:
            self._history_snapshots[session_id] = []
        self._history_snapshots[session_id].append({
            "snap_id": snap_id,
            "snap_folder": snap_folder,
            "manifest_dict": manifest.model_dump()
        })
        if len(self._history_snapshots[session_id]) > 15:
            old = self._history_snapshots[session_id].pop(0)
            try:
                shutil.rmtree(old["snap_folder"], ignore_errors=True)
            except Exception:
                pass

    def backup_page_file(self, session_id: str, filename: str, thumb_filename: Optional[str] = None):
        """Copies an image/thumb file to current snapshot folder before deletion or modification."""
        if session_id not in self._history_snapshots or not self._history_snapshots[session_id]:
            return
        latest = self._history_snapshots[session_id][-1]
        snap_folder = latest["snap_folder"]
        sdir = self.get_session_dir(session_id)

        try:
            src_img = sdir / "images" / filename
            if src_img.exists():
                dest_img = snap_folder / filename
                if not dest_img.exists():
                    shutil.copy2(src_img, dest_img)
            if thumb_filename:
                src_th = sdir / "thumbnails" / thumb_filename
                if src_th.exists():
                    dest_th = snap_folder / thumb_filename
                    if not dest_th.exists():
                        shutil.copy2(src_th, dest_th)
        except Exception as e:
            logger.debug(f"Failed to backup file {filename}: {e}")

    def undo(self, session_id: str) -> SessionManifest:
        """Restores the previous session snapshot with 100% fidelity."""
        if session_id not in self._history_snapshots or not self._history_snapshots[session_id]:
            curr = self.load_session(session_id)
            if curr:
                return curr
            raise ValueError("No hay estados previos para deshacer.")

        snapshot = self._history_snapshots[session_id].pop()
        snap_folder = snapshot["snap_folder"]
        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        # Restore manifest
        m_dict = snapshot["manifest_dict"]
        m_dict["updated_at"] = time.time()
        restored_manifest = SessionManifest(**m_dict)

        # Restore any backed-up files from snapshot into images & thumbnails
        try:
            for p in restored_manifest.pages:
                snap_img = snap_folder / p.filename
                if snap_img.exists():
                    shutil.copy2(snap_img, images_dir / p.filename)
                if p.thumb_filename:
                    snap_th = snap_folder / p.thumb_filename
                    if snap_th.exists():
                        shutil.copy2(snap_th, thumbs_dir / p.thumb_filename)
        except Exception as e:
            logger.warning(f"Error restoring snapshot files: {e}")

        self.save_session(restored_manifest)

        # Cleanup snapshot folder
        try:
            shutil.rmtree(snap_folder, ignore_errors=True)
        except Exception:
            pass

        return restored_manifest

    def reorder_pages(self, session_id: str, ordered_page_ids: List[str]) -> SessionManifest:
        self.push_history_snapshot(session_id)
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        page_map = {p.id: p for p in manifest.pages}
        new_pages = []
        for idx, pid in enumerate(ordered_page_ids):
            if pid in page_map:
                page = page_map[pid]
                page.order = idx + 1
                page.is_cover = (idx == 0)
                new_pages.append(page)

        seen = set(ordered_page_ids)
        for p in manifest.pages:
            if p.id not in seen:
                p.order = len(new_pages) + 1
                new_pages.append(p)

        manifest.pages = new_pages
        self.save_session(manifest)
        return manifest

    def delete_pages(self, session_id: str, page_ids: List[str]) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        to_delete = set(page_ids)
        deleted_pages = [p for p in manifest.pages if p.id in to_delete]
        manifest.pages = [p for p in manifest.pages if p.id not in to_delete]

        sdir = self.get_session_dir(session_id)
        for dp in deleted_pages:
            try:
                img_path = sdir / "images" / dp.filename
                if img_path.exists():
                    img_path.unlink()
                th_path = sdir / "thumbnails" / dp.thumb_filename
                if th_path.exists():
                    th_path.unlink()
            except Exception as e:
                logger.debug(f"Could not delete physical files for {dp.filename}: {e}")

        for idx, page in enumerate(manifest.pages):
            page.order = idx + 1
            if idx == 0:
                page.is_cover = True

        self.save_session(manifest)
        with self._stats_lock:
            self._stats_cache = None
        return manifest

    def rotate_page(self, session_id: str, page_id: str, degrees: int = 90) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        page = next((p for p in manifest.pages if p.id == page_id), None)
        if not page:
            raise ValueError("Página no encontrada")

        self.backup_page_file(session_id, page.filename, page.thumb_filename)

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        old_img = images_dir / page.filename
        old_thumb = thumbs_dir / page.thumb_filename

        ext = old_img.suffix.lower() or ".jpg"
        uid = uuid.uuid4().hex[:8]
        new_filename = f"rot_{page.id[:8]}_{uid}{ext}"
        new_thumb_filename = f"thumb_rot_{page.id[:8]}_{uid}.webp"

        new_img = images_dir / new_filename
        new_thumb = thumbs_dir / new_thumb_filename

        new_w, new_h = rotate_image(old_img, degrees)
        if old_img.exists():
            old_img.rename(new_img)
        create_thumbnail(new_img, new_thumb)

        if old_thumb.exists() and old_thumb != new_thumb:
            try: old_thumb.unlink()
            except Exception: pass

        page.filename = new_filename
        page.thumb_filename = new_thumb_filename
        page.width = new_w
        page.height = new_h
        page.rotation = (page.rotation + degrees) % 360

        self.save_session(manifest)
        return manifest

    def split_spread(self, session_id: str, page_id: str, reading_direction: str = "rtl") -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        src_path = images_dir / page.filename
        ext = src_path.suffix

        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())
        name1 = f"page_split_{id1[:8]}{ext}"
        name2 = f"page_split_{id2[:8]}{ext}"
        path1 = images_dir / name1
        path2 = images_dir / name2

        dim1, dim2 = split_double_page(src_path, path1, path2, reading_direction)

        tname1 = f"thumb_split_{id1[:8]}.webp"
        tname2 = f"thumb_split_{id2[:8]}.webp"
        create_thumbnail(path1, thumbs_dir / tname1)
        create_thumbnail(path2, thumbs_dir / tname2)

        page1 = PageItem(
            id=id1, order=idx + 1, filename=name1, thumb_filename=tname1,
            original_name=f"{page.original_name}_p1", width=dim1[0], height=dim1[1],
            rotation=0, is_cover=False
        )
        page2 = PageItem(
            id=id2, order=idx + 2, filename=name2, thumb_filename=tname2,
            original_name=f"{page.original_name}_p2", width=dim2[0], height=dim2[1],
            rotation=0, is_cover=False
        )

        manifest.pages = manifest.pages[:idx] + [page1, page2] + manifest.pages[idx+1:]

        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        self.save_session(manifest)
        return manifest

    def slice_webtoon(self, session_id: str, page_id: str, max_height: int = 2500) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        src_path = images_dir / page.filename
        base_name = f"webtoon_slice_{page.id[:8]}"

        slices = slice_webtoon_image(src_path, images_dir, base_name, max_height=max_height)

        if len(slices) <= 1:
            return manifest

        new_items = []
        for s_path, sw, sh in slices:
            sid = str(uuid.uuid4())
            tname = f"thumb_slice_{sid[:8]}.webp"
            create_thumbnail(s_path, thumbs_dir / tname)
            new_items.append(PageItem(
                id=sid, order=0, filename=s_path.name, thumb_filename=tname,
                original_name=s_path.name, width=sw, height=sh, rotation=0, is_cover=False
            ))

        manifest.pages = manifest.pages[:idx] + new_items + manifest.pages[idx+1:]
        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        self.save_session(manifest)
        return manifest

    def custom_split_vertical(
        self, 
        session_id: str, 
        page_id: str, 
        cut_x: int, 
        reading_direction: str = "rtl"
    ) -> SessionManifest:
        """Splits a double page or wide page at a custom X pixel line."""
        self.push_history_snapshot(session_id)
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        self.backup_page_file(session_id, page.filename, page.thumb_filename)

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        src_path = images_dir / page.filename
        ext = src_path.suffix

        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())
        name1 = f"page_split_{id1[:8]}{ext}"
        name2 = f"page_split_{id2[:8]}{ext}"
        path1 = images_dir / name1
        path2 = images_dir / name2

        dim1, dim2 = split_vertical_at_x(src_path, path1, path2, cut_x=cut_x, reading_direction=reading_direction)

        tname1 = f"thumb_split_{id1[:8]}.webp"
        tname2 = f"thumb_split_{id2[:8]}.webp"
        create_thumbnail(path1, thumbs_dir / tname1)
        create_thumbnail(path2, thumbs_dir / tname2)

        page1 = PageItem(
            id=id1, order=idx + 1, filename=name1, thumb_filename=tname1,
            original_name=f"{page.original_name}_p1", width=dim1[0], height=dim1[1],
            rotation=0, is_cover=False
        )
        page2 = PageItem(
            id=id2, order=idx + 2, filename=name2, thumb_filename=tname2,
            original_name=f"{page.original_name}_p2", width=dim2[0], height=dim2[1],
            rotation=0, is_cover=False
        )

        manifest.pages = manifest.pages[:idx] + [page1, page2] + manifest.pages[idx+1:]
        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        try:
            src_path.unlink(missing_ok=True)
            (thumbs_dir / page.thumb_filename).unlink(missing_ok=True)
        except Exception:
            pass

        self.save_session(manifest)
        return manifest

    def custom_slice_horizontal(
        self, 
        session_id: str, 
        page_id: str, 
        cut_points: List[int],
        discard_indices: Optional[List[int]] = None
    ) -> SessionManifest:
        """Slices an image horizontally at user-chosen or adjusted Y coordinate cut lines, optionally discarding specified slices."""
        self.push_history_snapshot(session_id)
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        self.backup_page_file(session_id, page.filename, page.thumb_filename)

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        src_path = images_dir / page.filename
        base_name = f"webtoon_slice_{page.id[:8]}"

        slices = slice_image_at_points(src_path, images_dir, base_name, cut_points=cut_points)
        if len(slices) <= 1:
            return manifest

        discard_set = set(discard_indices or [])
        new_items = []
        for s_idx, (s_path, sw, sh) in enumerate(slices):
            if s_idx in discard_set:
                try:
                    s_path.unlink(missing_ok=True)
                except Exception:
                    pass
                continue

            sid = str(uuid.uuid4())
            tname = f"thumb_slice_{sid[:8]}.webp"
            create_thumbnail(s_path, thumbs_dir / tname)
            new_items.append(PageItem(
                id=sid, order=0, filename=s_path.name, thumb_filename=tname,
                original_name=s_path.name, width=sw, height=sh, rotation=0, is_cover=False
            ))

        manifest.pages = manifest.pages[:idx] + new_items + manifest.pages[idx+1:]
        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        try:
            src_path.unlink(missing_ok=True)
            (thumbs_dir / page.thumb_filename).unlink(missing_ok=True)
        except Exception:
            pass

        self.save_session(manifest)
        return manifest

    def discard_band(
        self,
        session_id: str,
        page_id: str,
        y_start: int,
        y_end: int
    ) -> SessionManifest:
        """
        Discards a horizontal band between y_start and y_end.
        - If y_start <= 15: discards top to y_end (crops y_end to bottom).
        - If y_end >= h - 15: discards y_start to bottom (crops 0 to y_start).
        - If middle: cuts out band, producing 2 pages (top and bottom).
        """
        self.push_history_snapshot(session_id)
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        self.backup_page_file(session_id, page.filename, page.thumb_filename)

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"
        src_path = images_dir / page.filename
        ext = src_path.suffix

        with Image.open(src_path) as img:
            img = ImageOps.exif_transpose(img)
            w, h = img.size
            y0 = max(0, min(h, int(y_start)))
            y1 = max(0, min(h, int(y_end)))
            if y0 > y1:
                y0, y1 = y1, y0

            new_items = []
            # Keep top if height >= 20
            if y0 >= 20:
                top_crop = img.crop((0, 0, w, y0))
                id1 = str(uuid.uuid4())
                name1 = f"band_top_{id1[:8]}{ext}"
                p1 = images_dir / name1
                if ext.lower() in [".jpg", ".jpeg"]:
                    if top_crop.mode in ("RGBA", "P"): top_crop = top_crop.convert("RGB")
                    top_crop.save(p1, "JPEG", quality=95, subsampling=0)
                else:
                    top_crop.save(p1)
                t1 = f"thumb_{id1[:8]}.webp"
                create_thumbnail(p1, thumbs_dir / t1)
                new_items.append(PageItem(
                    id=id1, order=0, filename=name1, thumb_filename=t1,
                    original_name=f"{page.original_name}_p1", width=top_crop.width, height=top_crop.height,
                    rotation=0, is_cover=False
                ))

            # Keep bottom if height >= 20
            if h - y1 >= 20:
                bot_crop = img.crop((0, y1, w, h))
                id2 = str(uuid.uuid4())
                name2 = f"band_bot_{id2[:8]}{ext}"
                p2 = images_dir / name2
                if ext.lower() in [".jpg", ".jpeg"]:
                    if bot_crop.mode in ("RGBA", "P"): bot_crop = bot_crop.convert("RGB")
                    bot_crop.save(p2, "JPEG", quality=95, subsampling=0)
                else:
                    bot_crop.save(p2)
                t2 = f"thumb_{id2[:8]}.webp"
                create_thumbnail(p2, thumbs_dir / t2)
                new_items.append(PageItem(
                    id=id2, order=0, filename=name2, thumb_filename=t2,
                    original_name=f"{page.original_name}_p2", width=bot_crop.width, height=bot_crop.height,
                    rotation=0, is_cover=False
                ))

        if new_items:
            manifest.pages = manifest.pages[:idx] + new_items + manifest.pages[idx+1:]
            for i, p in enumerate(manifest.pages):
                p.order = i + 1
                if i == 0:
                    p.is_cover = True
            try:
                src_path.unlink(missing_ok=True)
                (thumbs_dir / page.thumb_filename).unlink(missing_ok=True)
            except Exception:
                pass
            self.save_session(manifest)

        return manifest

    def get_suggested_cuts(self, session_id: str, page_id: str, max_height: int = 2500) -> List[int]:
        """Returns auto-calculated clean gutter cut lines for an individual strip."""
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        sdir = self.get_session_dir(session_id)
        src_path = sdir / "images" / page.filename
        return calculate_suggested_cuts(src_path, max_height=max_height)

    def crop_page(
        self,
        session_id: str,
        page_id: str,
        x: int,
        y: int,
        width: int,
        height: int,
        save_as_new: bool = False
    ) -> SessionManifest:
        """Crops a rectangular zone of a page, either replacing it or saving as new."""
        self.push_history_snapshot(session_id)
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        self.backup_page_file(session_id, page.filename, page.thumb_filename)

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        src_path = images_dir / page.filename

        if save_as_new:
            new_id = str(uuid.uuid4())
            ext = src_path.suffix
            new_filename = f"crop_{new_id[:8]}{ext}"
            dest_path = images_dir / new_filename
            new_w, new_h = crop_image_box(src_path, dest_path, x, y, width, height)

            tname = f"thumb_crop_{new_id[:8]}.webp"
            create_thumbnail(dest_path, thumbs_dir / tname)

            new_page = PageItem(
                id=new_id,
                order=page.order + 1,
                filename=new_filename,
                thumb_filename=tname,
                original_name=f"{page.original_name}_recorte",
                width=new_w,
                height=new_h,
                rotation=0,
                is_cover=False
            )
            manifest.pages.insert(idx + 1, new_page)
        else:
            old_img = src_path
            old_thumb = thumbs_dir / page.thumb_filename
            ext = old_img.suffix.lower() or ".jpg"
            uid = uuid.uuid4().hex[:8]
            new_filename = f"crop_{page.id[:8]}_{uid}{ext}"
            new_thumb_filename = f"thumb_crop_{page.id[:8]}_{uid}.webp"
            new_img = images_dir / new_filename
            new_thumb = thumbs_dir / new_thumb_filename

            new_w, new_h = crop_image_box(old_img, new_img, x, y, width, height)
            create_thumbnail(new_img, new_thumb)

            if old_img.exists() and old_img != new_img:
                try: old_img.unlink()
                except Exception: pass
            if old_thumb.exists() and old_thumb != new_thumb:
                try: old_thumb.unlink()
                except Exception: pass

            page.filename = new_filename
            page.thumb_filename = new_thumb_filename
            page.width = new_w
            page.height = new_h

        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        self.save_session(manifest)
        return manifest

    def add_text_annotations(
        self, 
        session_id: str, 
        page_id: str, 
        annotations: List[Dict[str, Any]]
    ) -> SessionManifest:
        """Burns translation notes and SFX text directly into the page image."""
        self.push_history_snapshot(session_id)
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages[idx]
        self.backup_page_file(session_id, page.filename, page.thumb_filename)

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        old_img_path = images_dir / page.filename
        old_thumb_path = thumbs_dir / page.thumb_filename

        ext = old_img_path.suffix.lower() or ".jpg"
        uid = uuid.uuid4().hex[:8]
        new_filename = f"ann_{page.id[:8]}_{uid}{ext}"
        new_thumb_filename = f"thumb_ann_{page.id[:8]}_{uid}.webp"

        new_img_path = images_dir / new_filename
        new_thumb_path = thumbs_dir / new_thumb_filename

        # Burn annotations into new image file
        draw_text_annotations(old_img_path, new_img_path, annotations)

        # Regenerate thumbnail so the notes appear immediately in gallery and inspector
        create_thumbnail(new_img_path, new_thumb_path)

        # Remove previous files if different to avoid disk clutter
        if old_img_path.exists() and old_img_path != new_img_path:
            try:
                old_img_path.unlink()
            except Exception as e:
                logger.warning(f"Error unlinking old annotated image: {e}")

        if old_thumb_path.exists() and old_thumb_path != new_thumb_path:
            try:
                old_thumb_path.unlink()
            except Exception as e:
                logger.warning(f"Error unlinking old annotated thumb: {e}")

        # Update page object with new filenames
        page.filename = new_filename
        page.thumb_filename = new_thumb_filename

        self.save_session(manifest)
        return manifest

    def ocr_page_region(
        self,
        session_id: str,
        page_id: str,
        x: Optional[int] = None,
        y: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        language: str = "auto"
    ) -> Dict[str, Any]:
        """Runs OCR on a comic page or speech bubble region."""
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        page = next((p for p in manifest.pages if p.id == page_id), None)
        if not page:
            raise ValueError("Página no encontrada")

        sdir = self.get_session_dir(session_id)
        img_path = sdir / "images" / page.filename
        if not img_path.exists():
            raise ValueError("Archivo de imagen no encontrado")

        return ocr_image_region(
            img_path=img_path,
            x=x,
            y=y,
            width=width,
            height=height,
            language=language
        )

    def slice_all_webtoons(
        self,
        session_id: str,
        max_height: int = 2500,
        only_oversized: bool = True
    ) -> SessionManifest:
        """
        Slices all webtoon strips in the session in batch at clean panel seams.
        If only_oversized is True, only slices images that exceed 16.383 px (WebP limit).
        Otherwise slices all images taller than max_height.
        Preserves 100% of native width and resolution without pixelation.
        """
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        new_pages: List[PageItem] = []
        any_sliced = False

        for page in manifest.pages:
            needs_slice = False
            if only_oversized:
                needs_slice = (page.width > 16383 or page.height > 16383)
            else:
                needs_slice = (page.height > max_height * 1.15)

            if not needs_slice:
                new_pages.append(page)
                continue

            src_path = images_dir / page.filename
            if not src_path.exists():
                new_pages.append(page)
                continue

            base_name = f"webtoon_slice_{page.id[:8]}"
            slices = slice_webtoon_image(src_path, images_dir, base_name, max_height=max_height)

            if len(slices) <= 1:
                new_pages.append(page)
                continue

            any_sliced = True
            for s_path, sw, sh in slices:
                sid = str(uuid.uuid4())
                tname = f"thumb_slice_{sid[:8]}.webp"
                create_thumbnail(s_path, thumbs_dir / tname)
                new_pages.append(PageItem(
                    id=sid, order=0, filename=s_path.name, thumb_filename=tname,
                    original_name=s_path.name, width=sw, height=sh, rotation=0, is_cover=False
                ))

            # Safely clean up old oversized file and thumb to prevent disk bloat
            try:
                src_path.unlink(missing_ok=True)
                (thumbs_dir / page.thumb_filename).unlink(missing_ok=True)
            except Exception:
                pass

        if any_sliced:
            manifest.pages = new_pages
            for i, p in enumerate(manifest.pages):
                p.order = i + 1
                if i == 0:
                    p.is_cover = True
            self.save_session(manifest)

        return manifest

    def start_slice_batch_job(
        self,
        session_id: str,
        max_height: int = 2500,
        only_oversized: bool = True
    ) -> Dict[str, Any]:
        """
        Starts an asynchronous background job to slice webtoon strips in batch,
        updating real-time progress while allowing the user to keep using the application.
        """
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        if only_oversized:
            target_pages = [p for p in manifest.pages if (p.width > 16383 or p.height > 16383)]
        else:
            target_pages = [p for p in manifest.pages if (p.height > max_height * 1.15)]
        total_targets = len(target_pages)
        if total_targets == 0:
            job_info = {
                "status": "ready",
                "percent": 100,
                "current": 0,
                "total": 0,
                "message": "No hay tiras pendientes de corte.",
                "error": None,
                "result": {"success": True, "total_sliced": 0, "new_total_pages": len(manifest.pages)}
            }
            self.slice_jobs[session_id] = job_info
            return job_info

        self.slice_jobs[session_id] = {
            "status": "processing",
            "percent": 0,
            "current": 0,
            "total": total_targets,
            "message": f"Iniciando corte de {total_targets} tiras Webtoon...",
            "error": None,
            "result": None
        }

        def worker():
            try:
                sdir = self.get_session_dir(session_id)
                images_dir = sdir / "images"
                thumbs_dir = sdir / "thumbnails"

                curr_manifest = self.load_session(session_id)
                if not curr_manifest:
                    return

                new_pages: List[PageItem] = []
                sliced_count = 0

                for page in curr_manifest.pages:
                    needs_slice = False
                    if only_oversized:
                        needs_slice = (page.width > 16383 or page.height > 16383)
                    else:
                        needs_slice = (page.height > max_height * 1.15)

                    if not needs_slice:
                        new_pages.append(page)
                        continue

                    src_path = images_dir / page.filename
                    if not src_path.exists():
                        new_pages.append(page)
                        continue

                    sliced_count += 1
                    pct = int(((sliced_count - 1) / max(1, total_targets)) * 100)
                    self.slice_jobs[session_id] = {
                        "status": "processing",
                        "percent": pct,
                        "current": sliced_count,
                        "total": total_targets,
                        "message": f"Cortando tira {sliced_count} de {total_targets} (pág. #{page.order})...",
                        "error": None,
                        "result": None
                    }

                    base_name = f"webtoon_slice_{page.id[:8]}"
                    slices = slice_webtoon_image(src_path, images_dir, base_name, max_height=max_height)

                    if len(slices) <= 1:
                        new_pages.append(page)
                        continue

                    for s_path, sw, sh in slices:
                        sid = str(uuid.uuid4())
                        tname = f"thumb_slice_{sid[:8]}.webp"
                        create_thumbnail(s_path, thumbs_dir / tname)
                        new_pages.append(PageItem(
                            id=sid, order=0, filename=s_path.name, thumb_filename=tname,
                            original_name=s_path.name, width=sw, height=sh, rotation=0, is_cover=False
                        ))

                    try:
                        src_path.unlink(missing_ok=True)
                        (thumbs_dir / page.thumb_filename).unlink(missing_ok=True)
                    except Exception:
                        pass

                curr_manifest.pages = new_pages
                for i, p in enumerate(curr_manifest.pages):
                    p.order = i + 1
                    if i == 0:
                        p.is_cover = True
                self.save_session(curr_manifest)

                self.slice_jobs[session_id] = {
                    "status": "ready",
                    "percent": 100,
                    "current": total_targets,
                    "total": total_targets,
                    "message": f"¡Se han cortado {total_targets} tiras con éxito!",
                    "error": None,
                    "result": {
                        "success": True,
                        "total_sliced": total_targets,
                        "new_total_pages": len(curr_manifest.pages)
                    }
                }
            except Exception as e:
                logger.error(f"Error cortando tiras en lote para sesión {session_id}: {traceback.format_exc()}")
                self.slice_jobs[session_id] = {
                    "status": "error",
                    "percent": 0,
                    "current": 0,
                    "total": total_targets,
                    "message": f"Error cortando tiras: {str(e)}",
                    "error": str(e),
                    "result": None
                }

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

        return self.slice_jobs[session_id]

    def get_slice_job_status(self, session_id: str) -> Dict[str, Any]:
        """Returns the real-time background status of a slice job."""
        return self.slice_jobs.get(session_id, {"status": "idle", "percent": 0, "message": ""})

    def downscale_page(self, session_id: str, page_id: str, max_dimension: int = 16383) -> SessionManifest:
        """Downscales a specific oversized image so its max dimension is within max_dimension (e.g. 16383 for WebP)."""
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        page = next((p for p in manifest.pages if p.id == page_id), None)
        if not page:
            raise ValueError("Página no encontrada")

        sdir = self.get_session_dir(session_id)
        img_path = sdir / "images" / page.filename
        thumb_path = sdir / "thumbnails" / page.thumb_filename

        with Image.open(img_path) as img:
            img = ImageOps.exif_transpose(img)
            cur_max = max(img.width, img.height)
            if cur_max <= max_dimension:
                return manifest
            scale = max_dimension / float(cur_max)
            new_w = max(1, int(img.width * scale))
            new_h = max(1, int(img.height * scale))
            resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            fmt = img.format or "JPEG"
            if fmt == "JPEG" and resized.mode not in ("RGB", "L"):
                resized = resized.convert("RGB")
            resized.save(img_path, format=fmt, quality=95)

        create_thumbnail(img_path, thumb_path)
        page.width = new_w
        page.height = new_h
        self.save_session(manifest)
        return manifest

    def downscale_all_oversized(self, session_id: str, max_dimension: int = 16383) -> SessionManifest:
        """Downscales all oversized images in the session so max dimension is within max_dimension."""
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        modified = False
        for page in manifest.pages:
            if page.width > max_dimension or page.height > max_dimension:
                img_path = images_dir / page.filename
                thumb_path = thumbs_dir / page.thumb_filename
                if img_path.exists():
                    with Image.open(img_path) as img:
                        img = ImageOps.exif_transpose(img)
                        cur_max = max(img.width, img.height)
                        if cur_max > max_dimension:
                            scale = max_dimension / float(cur_max)
                            new_w = max(1, int(img.width * scale))
                            new_h = max(1, int(img.height * scale))
                            resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                            fmt = img.format or "JPEG"
                            if fmt == "JPEG" and resized.mode not in ("RGB", "L"):
                                resized = resized.convert("RGB")
                            resized.save(img_path, format=fmt, quality=95)
                            page.width = new_w
                            page.height = new_h
                            create_thumbnail(img_path, thumb_path)
                            modified = True

        if modified:
            self.save_session(manifest)
        return manifest

    def set_cover(self, session_id: str, page_id: str) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        idx = next((i for i, p in enumerate(manifest.pages) if p.id == page_id), -1)
        if idx == -1:
            raise ValueError("Página no encontrada")

        page = manifest.pages.pop(idx)
        manifest.pages.insert(0, page)

        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            p.is_cover = (i == 0)

        self.save_session(manifest)
        return manifest

    def add_pages(
        self,
        session_id: str,
        uploaded_files: List[Tuple[Path, str]],
        insert_after: Optional[str] = None,
        insert_at_beginning: bool = True
    ) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"
        images_dir.mkdir(parents=True, exist_ok=True)
        thumbs_dir.mkdir(parents=True, exist_ok=True)

        new_pages = []
        for temp_path, orig_name in uploaded_files:
            pid = str(uuid.uuid4())
            ext = Path(orig_name).suffix.lower()
            fname = f"page_added_{pid[:8]}{ext}"
            saved_path = images_dir / fname
            shutil.copyfile(temp_path, saved_path)

            tname = f"thumb_added_{pid[:8]}.webp"
            w, h = create_thumbnail(saved_path, thumbs_dir / tname)

            new_pages.append(PageItem(
                id=pid, order=0, filename=fname, thumb_filename=tname,
                original_name=orig_name, width=w, height=h, rotation=0, is_cover=False
            ))

        if insert_after:
            idx = next((i for i, p in enumerate(manifest.pages) if p.id == insert_after), len(manifest.pages) - 1)
            manifest.pages = manifest.pages[:idx+1] + new_pages + manifest.pages[idx+1:]
        elif insert_at_beginning:
            manifest.pages = new_pages + manifest.pages
        else:
            manifest.pages.extend(new_pages)

        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            p.is_cover = (i == 0)

        manifest.metadata.PageCount = len(manifest.pages)
        manifest.updated_at = time.time()
        self.save_session(manifest)
        return manifest

    def update_metadata(self, session_id: str, metadata: ComicInfoModel) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        manifest.metadata = metadata
        manifest.metadata.PageCount = len(manifest.pages)
        manifest.updated_at = time.time()
        self.save_session(manifest)
        return manifest

    def batch_update_metadata(
        self,
        session_ids: List[str],
        metadata: ComicInfoModel,
        apply_common_only: bool = True,
        fields_to_copy: Optional[List[str]] = None
    ) -> List[SessionManifest]:
        """
        Updates metadata across multiple sessions (tomos/capítulos).
        If fields_to_copy is provided, only updates those specific fields.
        If apply_common_only is True, preserves each session's own Volume, Number, Title, and PageCount,
        while updating shared fields (Series, Writer, Penciller, Genre, Manga, Webtoon, ReadingDirection,
        AgeRating, Publisher, Year, Month, Day, Summary, etc.).
        """
        updated_sessions = []
        for sid in session_ids:
            manifest = self.load_session(sid)
            if not manifest:
                continue

            if fields_to_copy:
                for field in fields_to_copy:
                    if hasattr(manifest.metadata, field) and hasattr(metadata, field):
                        val = getattr(metadata, field)
                        if val is not None:
                            setattr(manifest.metadata, field, val)
                            if field == "ReadingDirection":
                                if val == "rtl":
                                    manifest.metadata.Manga = "YesAndRightToLeft"
                                    manifest.metadata.Webtoon = "No"
                                elif val == "vertical":
                                    manifest.metadata.Webtoon = "Yes"
                                    manifest.metadata.Manga = "No"
                                elif val == "ltr":
                                    manifest.metadata.Manga = "No"
                                    manifest.metadata.Webtoon = "No"
            elif apply_common_only:
                # Keep individual Volume, Number, Title, and PageCount
                saved_vol = manifest.metadata.Volume
                saved_num = manifest.metadata.Number
                saved_title = manifest.metadata.Title

                manifest.metadata = metadata.model_copy()
                manifest.metadata.Volume = saved_vol
                manifest.metadata.Number = saved_num
                manifest.metadata.Title = saved_title
            else:
                manifest.metadata = metadata.model_copy()

            manifest.metadata.PageCount = len(manifest.pages)
            manifest.updated_at = time.time()
            self.save_session(manifest)
            updated_sessions.append(manifest)
        return updated_sessions

    def create_chapter_cover(
        self,
        session_id: str,
        chapter_number: str,
        chapter_title: str,
        series_name: Optional[str] = "",
        style: str = "minimal_white",
        bg_page_id: Optional[str] = None,
        insert_before_page_id: Optional[str] = None,
        replace_page_id: Optional[str] = None
    ) -> SessionManifest:
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"

        # Determine reference dimensions
        ref_page = None
        if replace_page_id:
            ref_page = next((p for p in manifest.pages if p.id == replace_page_id), None)
        elif bg_page_id:
            ref_page = next((p for p in manifest.pages if p.id == bg_page_id), None)
        elif insert_before_page_id:
            ref_page = next((p for p in manifest.pages if p.id == insert_before_page_id), None)
        elif manifest.pages:
            ref_page = manifest.pages[0]

        width = ref_page.width if ref_page else 1800
        height = ref_page.height if ref_page else 2500

        bg_path = (images_dir / ref_page.filename) if (bg_page_id and ref_page) else None

        pid = str(uuid.uuid4())
        fname = f"chapter_{pid[:8]}.jpg"
        tname = f"thumb_chapter_{pid[:8]}.webp"
        card_path = images_dir / fname
        thumb_path = thumbs_dir / tname

        # Generate chapter card
        w, h = generate_chapter_card(
            output_path=card_path,
            chapter_number=chapter_number,
            chapter_title=chapter_title,
            series_name=series_name or manifest.metadata.Series or "",
            style=style,
            bg_image_path=bg_path,
            width=width,
            height=height
        )

        create_thumbnail(card_path, thumb_path)

        new_page = PageItem(
            id=pid,
            order=0,
            filename=fname,
            thumb_filename=tname,
            original_name=f"{chapter_number} - {chapter_title}.jpg",
            width=w,
            height=h,
            rotation=0,
            is_cover=False
        )

        if replace_page_id:
            # Replace existing page
            idx = next((i for i, p in enumerate(manifest.pages) if p.id == replace_page_id), -1)
            if idx != -1:
                manifest.pages[idx] = new_page
            else:
                manifest.pages.append(new_page)
        elif insert_before_page_id:
            # Insert before specified page
            idx = next((i for i, p in enumerate(manifest.pages) if p.id == insert_before_page_id), -1)
            if idx != -1:
                manifest.pages.insert(idx, new_page)
            else:
                manifest.pages.append(new_page)
        else:
            manifest.pages.append(new_page)

        # Renumber
        for i, p in enumerate(manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        self.save_session(manifest)
        return manifest

    def update_quick_metadata(
        self,
        session_id: str,
        item_type: Optional[str] = None,
        series: Optional[str] = None,
        title: Optional[str] = None,
        number: Optional[str] = None,
        volume: Optional[int] = None
    ) -> SessionManifest:
        """Quickly updates session item_type, series name, title, or chapter/volume number."""
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        if item_type is not None:
            manifest.item_type = item_type
            if item_type == "tomo":
                manifest.metadata.Format = "Tomo"
            elif item_type == "capitulo":
                manifest.metadata.Format = "Capítulo"
                manifest.metadata.Volume = None
        if series is not None and series.strip():
            manifest.metadata.Series = series.strip()
        elif not manifest.metadata.Series:
            inferred = infer_metadata_from_filename(manifest.original_filename)
            if inferred.Series:
                manifest.metadata.Series = inferred.Series
        if title is not None:
            manifest.metadata.Title = title.strip()
        if number is not None:
            manifest.metadata.Number = number
        if volume is not None and getattr(manifest, "item_type", "tomo") != "capitulo":
            manifest.metadata.Volume = volume
        elif getattr(manifest, "item_type", "tomo") == "capitulo":
            manifest.metadata.Volume = None

        manifest.updated_at = time.time()
        self.save_session(manifest)
        return manifest

    def apply_online_cover(
        self,
        session_id: str,
        image_url: str,
        mode: str = "insert_first",  # "insert_first" or "replace_first"
        custom_name: Optional[str] = "Portada Oficial.jpg"
    ) -> SessionManifest:
        """Downloads an online cover image, optimizes it, and sets it as session cover (inserting as page #1 or replacing current page #1)."""
        manifest = self.load_session(session_id)
        if not manifest:
            raise ValueError("Sesión no encontrada")

        sdir = self.get_session_dir(session_id)
        images_dir = sdir / "images"
        thumbs_dir = sdir / "thumbnails"
        images_dir.mkdir(parents=True, exist_ok=True)
        thumbs_dir.mkdir(parents=True, exist_ok=True)

        import io
        import base64
        import urllib.request
        import urllib.parse

        if image_url.startswith("data:"):
            comma_idx = image_url.find(",")
            if comma_idx != -1:
                data = base64.b64decode(image_url[comma_idx+1:])
            else:
                raise ValueError("Formato de imagen en base64 inválido")
        else:
            parsed = urllib.parse.urlparse(image_url)
            referer = f"{parsed.scheme}://{parsed.netloc}/" if parsed.netloc else ""
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            }
            if referer:
                headers["Referer"] = referer
            req = urllib.request.Request(image_url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()

        pil_img = Image.open(io.BytesIO(data))
        if pil_img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", pil_img.size, (255, 255, 255))
            if pil_img.mode == "P":
                pil_img = pil_img.convert("RGBA")
            bg.paste(pil_img, mask=pil_img.split()[3] if len(pil_img.split()) == 4 else None)
            pil_img = bg
        elif pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        pid = str(uuid.uuid4())
        fname = f"cover_online_{pid[:8]}.jpg"
        tname = f"thumb_cover_online_{pid[:8]}.webp"
        saved_path = images_dir / fname
        thumb_path = thumbs_dir / tname

        pil_img.save(saved_path, format="JPEG", quality=92, optimize=True)
        w, h = create_thumbnail(saved_path, thumb_path)

        new_page = PageItem(
            id=pid,
            order=1,
            filename=fname,
            thumb_filename=tname,
            original_name=custom_name or "Portada Oficial.jpg",
            width=w,
            height=h,
            rotation=0,
            is_cover=True
        )

        if mode == "replace_first" and len(manifest.pages) > 0:
            manifest.pages[0] = new_page
        else:
            manifest.pages.insert(0, new_page)

        # Renumber all pages and ensure page 1 is cover
        for idx, p in enumerate(manifest.pages):
            p.order = idx + 1
            p.is_cover = (idx == 0)

        manifest.metadata.PageCount = len(manifest.pages)
        manifest.updated_at = time.time()
        self.save_session(manifest)
        return manifest

    def merge_sessions(
        self,
        source_session_ids: List[str],
        target_series: str,
        target_volume: Optional[int] = None,
        target_title: Optional[str] = None,
        delete_sources: bool = False,
        add_chapter_covers: bool = False
    ) -> SessionManifest:
        """Merges multiple sessions (chapters) in order into a single Tomo (volume)."""
        if not source_session_ids or len(source_session_ids) < 2:
            raise ValueError("Se requieren al menos 2 sesiones para fusionar")

        new_session_id = str(uuid.uuid4())
        new_session_dir = self.get_session_dir(new_session_id)
        new_images_dir = new_session_dir / "images"
        new_thumbs_dir = new_session_dir / "thumbnails"
        new_images_dir.mkdir(parents=True, exist_ok=True)
        new_thumbs_dir.mkdir(parents=True, exist_ok=True)

        combined_pages: List[PageItem] = []
        order_counter = 1
        first_metadata = None
        collected_merged_files: List[str] = []
        collected_chapter_names: List[str] = []

        for idx, sid in enumerate(source_session_ids):
            s_manifest = self.load_session(sid)
            if not s_manifest:
                continue
            if first_metadata is None:
                first_metadata = s_manifest.metadata.model_copy()

            ch_name = s_manifest.metadata.Title or (f"Capítulo {s_manifest.metadata.Number}" if s_manifest.metadata.Number else s_manifest.original_filename)
            if s_manifest.source_file_path and s_manifest.source_file_path not in collected_merged_files:
                collected_merged_files.append(s_manifest.source_file_path)
                collected_chapter_names.append(ch_name)
            if s_manifest.merged_source_files:
                for mf, mn in zip(s_manifest.merged_source_files, s_manifest.merged_chapter_names or []):
                    if mf not in collected_merged_files:
                        collected_merged_files.append(mf)
                        collected_chapter_names.append(mn)

            s_dir = self.get_session_dir(sid)

            # Optional: Add chapter separator cover if requested
            if add_chapter_covers:
                ch_num = s_manifest.metadata.Number or str(idx + 1)
                ch_title = s_manifest.metadata.Title or f"Capítulo {ch_num}"
                card_filename = f"ch_cover_{idx+1:03d}.jpg"
                card_path = new_images_dir / card_filename
                generate_chapter_card(
                    output_path=card_path,
                    chapter_number=ch_num,
                    chapter_title=ch_title,
                    series_name=target_series,
                    style="minimal_dark",
                    width=1200,
                    height=1800
                )
                card_thumb = f"thumb_{card_filename}.webp"
                create_thumbnail(card_path, new_thumbs_dir / card_thumb)

                combined_pages.append(PageItem(
                    id=str(uuid.uuid4()),
                    order=order_counter,
                    filename=card_filename,
                    thumb_filename=card_thumb,
                    original_name=f"Separador {ch_title}",
                    width=1200,
                    height=1800,
                    rotation=0,
                    is_cover=(order_counter == 1)
                ))
                order_counter += 1

            # Copy each page into new session
            for page in s_manifest.pages:
                new_page_id = str(uuid.uuid4())
                new_filename = f"p_{order_counter:04d}_{page.filename}"
                new_thumb = f"thumb_{order_counter:04d}_{page.thumb_filename}"

                src_img = (s_dir / "images" / page.filename) if (s_dir / "images" / page.filename).exists() else (s_dir / page.filename)
                src_thumb = (s_dir / "thumbnails" / page.thumb_filename) if (s_dir / "thumbnails" / page.thumb_filename).exists() else (s_dir / page.thumb_filename)

                if src_img.exists():
                    shutil.copyfile(src_img, new_images_dir / new_filename)
                if src_thumb.exists():
                    shutil.copyfile(src_thumb, new_thumbs_dir / new_thumb)
                else:
                    create_thumbnail(new_images_dir / new_filename, new_thumbs_dir / new_thumb)

                combined_pages.append(PageItem(
                    id=new_page_id,
                    order=order_counter,
                    filename=new_filename,
                    thumb_filename=new_thumb,
                    original_name=page.original_name,
                    width=page.width,
                    height=page.height,
                    rotation=page.rotation,
                    is_cover=(order_counter == 1)
                ))
                order_counter += 1

        if not combined_pages:
            shutil.rmtree(new_session_dir, ignore_errors=True)
            raise ValueError("No se pudieron combinar páginas de las sesiones indicadas")

        meta = first_metadata or ComicInfoModel()
        meta.Series = target_series
        meta.Volume = target_volume
        meta.Title = target_title or (f"Volumen {target_volume}" if target_volume else target_series)
        meta.Format = "Tomo"
        meta.PageCount = len(combined_pages)

        vol_str = f"v{target_volume:02d}" if target_volume else "Tomo"
        orig_name = f"{target_series} - {vol_str}.cbz"

        new_manifest = SessionManifest(
            session_id=new_session_id,
            original_filename=orig_name,
            created_at=time.time(),
            updated_at=time.time(),
            pages=combined_pages,
            metadata=meta,
            item_type="tomo",
            merged_source_files=collected_merged_files if collected_merged_files else None,
            merged_chapter_names=collected_chapter_names if collected_chapter_names else None
        )
        self.save_session(new_manifest)

        if delete_sources:
            for sid in source_session_ids:
                self.delete_session(sid)

        return new_manifest

    def append_sessions_to_target(
        self,
        target_session_id: str,
        source_session_ids: List[str],
        delete_sources: bool = True,
        add_chapter_covers: bool = False
    ) -> SessionManifest:
        """Appends all pages from multiple source sessions (e.g. chapters) to an existing target session (e.g. Tomo)."""
        target_manifest = self.load_session(target_session_id)
        if not target_manifest:
            raise ValueError("Sesión de destino no encontrada")

        target_dir = self.get_session_dir(target_session_id)
        target_images_dir = target_dir / "images"
        target_thumbs_dir = target_dir / "thumbnails"
        target_images_dir.mkdir(parents=True, exist_ok=True)
        target_thumbs_dir.mkdir(parents=True, exist_ok=True)

        order_counter = len(target_manifest.pages) + 1
        series_name = target_manifest.metadata.Series or target_manifest.original_filename
        target_merged_files = list(target_manifest.merged_source_files or [])
        target_chapter_names = list(target_manifest.merged_chapter_names or [])

        for idx, sid in enumerate(source_session_ids):
            if sid == target_session_id:
                continue
            src_manifest = self.load_session(sid)
            if not src_manifest:
                continue

            ch_name = src_manifest.metadata.Title or (f"Capítulo {src_manifest.metadata.Number}" if src_manifest.metadata.Number else src_manifest.original_filename)
            if src_manifest.source_file_path and src_manifest.source_file_path not in target_merged_files:
                target_merged_files.append(src_manifest.source_file_path)
                target_chapter_names.append(ch_name)
            if src_manifest.merged_source_files:
                for mf, mn in zip(src_manifest.merged_source_files, src_manifest.merged_chapter_names or []):
                    if mf not in target_merged_files:
                        target_merged_files.append(mf)
                        target_chapter_names.append(mn)

            src_dir = self.get_session_dir(sid)

            # Optional: Add chapter separator cover
            if add_chapter_covers:
                ch_num = src_manifest.metadata.Number or str(idx + 1)
                ch_title = src_manifest.metadata.Title or f"Capítulo {ch_num}"
                card_filename = f"ch_cover_{uuid.uuid4().hex[:8]}.jpg"
                card_path = target_images_dir / card_filename
                generate_chapter_card(
                    output_path=card_path,
                    chapter_number=ch_num,
                    chapter_title=ch_title,
                    series_name=series_name,
                    style="minimal_dark",
                    width=1200,
                    height=1800
                )
                card_thumb = f"thumb_{card_filename}.webp"
                create_thumbnail(card_path, target_thumbs_dir / card_thumb)

                target_manifest.pages.append(PageItem(
                    id=str(uuid.uuid4()),
                    order=order_counter,
                    filename=card_filename,
                    thumb_filename=card_thumb,
                    original_name=f"Separador {ch_title}",
                    width=1200,
                    height=1800,
                    rotation=0,
                    is_cover=False
                ))
                order_counter += 1

            # Copy each page from source into target session
            for page in src_manifest.pages:
                new_page_id = str(uuid.uuid4())
                new_filename = f"p_{order_counter:04d}_{page.filename}"
                new_thumb = f"thumb_{order_counter:04d}_{page.thumb_filename}"

                src_img = (src_dir / "images" / page.filename) if (src_dir / "images" / page.filename).exists() else (src_dir / page.filename)
                src_thumb = (src_dir / "thumbnails" / page.thumb_filename) if (src_dir / "thumbnails" / page.thumb_filename).exists() else (src_dir / page.thumb_filename)

                if src_img.exists():
                    shutil.copyfile(src_img, target_images_dir / new_filename)
                if src_thumb.exists():
                    shutil.copyfile(src_thumb, target_thumbs_dir / new_thumb)
                else:
                    create_thumbnail(target_images_dir / new_filename, target_thumbs_dir / new_thumb)

                target_manifest.pages.append(PageItem(
                    id=new_page_id,
                    order=order_counter,
                    filename=new_filename,
                    thumb_filename=new_thumb,
                    original_name=page.original_name,
                    width=page.width,
                    height=page.height,
                    rotation=page.rotation,
                    is_cover=(order_counter == 1)
                ))
                order_counter += 1

        # Re-index order numbers
        for i, p in enumerate(target_manifest.pages):
            p.order = i + 1
            if i == 0:
                p.is_cover = True

        target_manifest.metadata.PageCount = len(target_manifest.pages)
        target_manifest.merged_source_files = target_merged_files if target_merged_files else None
        target_manifest.merged_chapter_names = target_chapter_names if target_chapter_names else None
        target_manifest.updated_at = time.time()
        self.save_session(target_manifest)

        if delete_sources:
            for sid in source_session_ids:
                if sid != target_session_id:
                    self.delete_session(sid)

        return target_manifest

    def extract_pages_to_chapter(
        self,
        source_session_id: str,
        page_ids: List[str],
        chapter_number: str,
        chapter_title: Optional[str] = None,
        remove_from_source: bool = True
    ) -> Dict[str, Any]:
        """Extracts a subset of pages into a new Chapter session in staging."""
        source_manifest = self.load_session(source_session_id)
        if not source_manifest:
            raise ValueError("Sesión origen no encontrada")

        page_id_set = set(page_ids)
        extracted_source_pages = [p for p in source_manifest.pages if p.id in page_id_set]
        if not extracted_source_pages:
            raise ValueError("Ninguna página seleccionada válida")

        new_session_id = str(uuid.uuid4())
        new_session_dir = self.get_session_dir(new_session_id)
        new_images_dir = new_session_dir / "images"
        new_thumbs_dir = new_session_dir / "thumbnails"
        new_images_dir.mkdir(parents=True, exist_ok=True)
        new_thumbs_dir.mkdir(parents=True, exist_ok=True)
        source_dir = self.get_session_dir(source_session_id)

        new_pages: List[PageItem] = []
        for order_idx, p in enumerate(extracted_source_pages, start=1):
            new_filename = f"p_{order_idx:04d}_{p.filename}"
            new_thumb = f"thumb_{order_idx:04d}_{p.thumb_filename}"

            src_img = (source_dir / "images" / p.filename) if (source_dir / "images" / p.filename).exists() else (source_dir / p.filename)
            src_thumb = (source_dir / "thumbnails" / p.thumb_filename) if (source_dir / "thumbnails" / p.thumb_filename).exists() else (source_dir / p.thumb_filename)

            if src_img.exists():
                shutil.copyfile(src_img, new_images_dir / new_filename)
            if src_thumb.exists():
                shutil.copyfile(src_thumb, new_thumbs_dir / new_thumb)
            else:
                create_thumbnail(new_images_dir / new_filename, new_thumbs_dir / new_thumb)

            new_pages.append(PageItem(
                id=str(uuid.uuid4()),
                order=order_idx,
                filename=new_filename,
                thumb_filename=new_thumb,
                original_name=p.original_name,
                width=p.width,
                height=p.height,
                rotation=p.rotation,
                is_cover=(order_idx == 1)
            ))

        meta = source_manifest.metadata.model_copy()
        meta.Number = str(chapter_number)
        meta.Volume = None
        meta.Title = chapter_title or f"Capítulo {chapter_number}"
        meta.Format = "Capítulo"
        meta.PageCount = len(new_pages)

        series_name = meta.Series or source_manifest.original_filename
        orig_name = f"{series_name} - c{chapter_number}.cbz"

        new_manifest = SessionManifest(
            session_id=new_session_id,
            original_filename=orig_name,
            created_at=time.time(),
            updated_at=time.time(),
            pages=new_pages,
            metadata=meta,
            item_type="capitulo"
        )
        self.save_session(new_manifest)

        if remove_from_source:
            remaining_pages = [p for p in source_manifest.pages if p.id not in page_id_set]
            if len(remaining_pages) == 0:
                self.delete_session(source_session_id)
                source_manifest = None
            else:
                for idx, p in enumerate(remaining_pages, start=1):
                    p.order = idx
                    p.is_cover = (idx == 1)
                source_manifest.pages = remaining_pages
                source_manifest.metadata.PageCount = len(remaining_pages)
                source_manifest.updated_at = time.time()
                self.save_session(source_manifest)

        return {
            "new_session": new_manifest,
            "source_session": source_manifest
        }

    def move_pages_to_session(
        self,
        source_session_id: str,
        target_session_id: str,
        page_ids: List[str],
        remove_from_source: bool = True
    ) -> Dict[str, Any]:
        """Moves or copies selected pages from source_session to target_session."""
        source_manifest = self.load_session(source_session_id)
        target_manifest = self.load_session(target_session_id)
        if not source_manifest or not target_manifest:
            raise ValueError("Sesión origen o destino no encontrada")

        page_id_set = set(page_ids)
        pages_to_move = [p for p in source_manifest.pages if p.id in page_id_set]
        if not pages_to_move:
            raise ValueError("Ninguna página seleccionada")

        source_dir = self.get_session_dir(source_session_id)
        target_dir = self.get_session_dir(target_session_id)
        target_images_dir = target_dir / "images"
        target_thumbs_dir = target_dir / "thumbnails"
        target_images_dir.mkdir(parents=True, exist_ok=True)
        target_thumbs_dir.mkdir(parents=True, exist_ok=True)

        start_order = len(target_manifest.pages) + 1
        appended_pages: List[PageItem] = []

        for idx, p in enumerate(pages_to_move):
            order_num = start_order + idx
            new_filename = f"p_{order_num:04d}_{p.filename}"
            new_thumb = f"thumb_{order_num:04d}_{p.thumb_filename}"

            src_img = (source_dir / "images" / p.filename) if (source_dir / "images" / p.filename).exists() else (source_dir / p.filename)
            src_thumb = (source_dir / "thumbnails" / p.thumb_filename) if (source_dir / "thumbnails" / p.thumb_filename).exists() else (source_dir / p.thumb_filename)

            if src_img.exists():
                shutil.copyfile(src_img, target_images_dir / new_filename)
            if src_thumb.exists():
                shutil.copyfile(src_thumb, target_thumbs_dir / new_thumb)
            else:
                create_thumbnail(target_images_dir / new_filename, target_thumbs_dir / new_thumb)

            appended_pages.append(PageItem(
                id=str(uuid.uuid4()),
                order=order_num,
                filename=new_filename,
                thumb_filename=new_thumb,
                original_name=p.original_name,
                width=p.width,
                height=p.height,
                rotation=p.rotation,
                is_cover=False
            ))

        target_manifest.pages.extend(appended_pages)
        target_manifest.metadata.PageCount = len(target_manifest.pages)
        target_manifest.updated_at = time.time()
        self.save_session(target_manifest)

        if remove_from_source:
            for p in pages_to_move:
                try:
                    src_img = (source_dir / "images" / p.filename) if (source_dir / "images" / p.filename).exists() else (source_dir / p.filename)
                    if src_img.exists():
                        src_img.unlink()
                    src_thumb = (source_dir / "thumbnails" / p.thumb_filename) if (source_dir / "thumbnails" / p.thumb_filename).exists() else (source_dir / p.thumb_filename)
                    if src_thumb.exists():
                        src_thumb.unlink()
                except Exception as e:
                    logger.debug(f"Could not remove source file {p.filename}: {e}")

            remaining_pages = [p for p in source_manifest.pages if p.id not in page_id_set]
            if len(remaining_pages) == 0:
                self.delete_session(source_session_id)
                source_manifest = None
            else:
                for idx, p in enumerate(remaining_pages, start=1):
                    p.order = idx
                    p.is_cover = (idx == 1)
                source_manifest.pages = remaining_pages
                source_manifest.metadata.PageCount = len(remaining_pages)
                source_manifest.updated_at = time.time()
                self.save_session(source_manifest)

        with self._stats_lock:
            self._stats_cache = None

        return {
            "source_session": source_manifest,
            "target_session": target_manifest
        }

session_manager = SessionManager()
