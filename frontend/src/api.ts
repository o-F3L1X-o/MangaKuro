import {
  SessionManifest, ComicInfo, AppSettings, ExportResult,
  ComicSessionSummary, SystemStats, ServerFsBrowseResult,
  ServerImportRequest, AuthStatusResult, OnlineSearchResult, VolumeCoverItem
} from './types';

const API_BASE = '/api';
const AUTH_STORAGE_KEY = 'mangakuro_auth_token';

export function getStoredAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// Global fetch interceptor to append Authorization Bearer token to /api requests
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getStoredAuthToken();
    if (token) {
      init = init || {};
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init.headers = headers;
    }
    return originalFetch(input, init);
  };
}

export function getThumbUrl(sessionId: string, filename: string): string {
  const token = getStoredAuthToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/session/${sessionId}/thumb/${filename}${query}`;
}

export function getImageUrl(sessionId: string, filename: string): string {
  const token = getStoredAuthToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/session/${sessionId}/image/${filename}${query}`;
}

export async function fetchAllSessions(): Promise<ComicSessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) return [];
  return res.json();
}

export interface ProcessingProgressInfo {
  percent: number;
  current: number;
  total: number;
  message: string;
}

export interface ExistingSessionCheck {
  exists: boolean;
  session_id?: string;
  filename?: string;
  page_count?: number;
  created_at?: number;
  updated_at?: number;
}

export async function checkExistingSession(filename: string): Promise<ExistingSessionCheck> {
  const res = await fetch(`${API_BASE}/upload/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename })
  });
  if (!res.ok) return { exists: false };
  return res.json();
}

export async function cleanupAllStaging(): Promise<{ success: boolean; cleaned_sessions: number }> {
  const res = await fetch(`${API_BASE}/staging/cleanup`, { method: 'POST' });
  if (!res.ok) throw new Error('Error al limpiar archivos temporales');
  return res.json();
}

export interface UploadOptions {
  replaceSessionId?: string;
  item_type?: 'tomo' | 'capitulo';
  custom_series?: string;
  custom_number?: string;
}

export async function uploadComic(
  file: File,
  onUploadProgress?: (percent: number) => void,
  onProcessingProgress?: (info: ProcessingProgressInfo) => void,
  options?: UploadOptions | string
): Promise<SessionManifest> {
  const formData = new FormData();
  formData.append('file', file);
  
  if (typeof options === 'string') {
    formData.append('replace_session_id', options);
  } else if (options) {
    if (options.replaceSessionId) formData.append('replace_session_id', options.replaceSessionId);
    if (options.item_type) formData.append('item_type', options.item_type);
    if (options.custom_series) formData.append('custom_series', options.custom_series);
    if (options.custom_number) formData.append('custom_number', options.custom_number);
  }

  // 1. Upload file bytes to server with upload progress tracking
  const uploadResult = await new Promise<{ session_id: string; status: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);

    const token = getStoredAuthToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onUploadProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error('Respuesta del servidor inválida'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.detail || 'Error al subir el archivo'));
        } catch {
          reject(new Error(`Error del servidor (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Error de conexión con el servidor. Verifica que el servidor esté activo.'));
    xhr.send(formData);
  });

  const sessionId = uploadResult.session_id;
  return waitForSessionReady(sessionId, onProcessingProgress);
}

export function waitForSessionReady(
  sessionId: string,
  onProcessingProgress?: (info: ProcessingProgressInfo) => void
): Promise<SessionManifest> {
  return new Promise((resolve, reject) => {
    let pollInterval: any = null;
    let timeoutTimer: any = null;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera agotado al extraer páginas del cómic'));
    }, 600000); // 10 minutes watchdog

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/session/${sessionId}/status`);
        if (!res.ok) {
          cleanup();
          reject(new Error('No se pudo consultar el estado de extracción'));
          return;
        }

        const statusData = await res.json();

        if (onProcessingProgress) {
          onProcessingProgress({
            percent: statusData.percent || 0,
            current: statusData.current_page || 0,
            total: statusData.total_pages || 0,
            message: statusData.message || 'Extrayendo páginas...'
          });
        }

        if (statusData.status === 'ready') {
          cleanup();
          const manifest = await fetchSession(sessionId);
          resolve(manifest);
        } else if (statusData.status === 'error') {
          cleanup();
          reject(new Error(statusData.error || statusData.message || 'Error durante la extracción'));
        }
      } catch (err: any) {
        cleanup();
        reject(new Error(err.message || 'Error durante la verificación del progreso'));
      }
    }, 400);
  });
}

export async function cancelSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('Error cancelando sesión:', err);
  }
}

export async function batchDeleteSessions(sessionIds: string[]): Promise<{ success: boolean; deleted_count: number }> {
  const res = await fetch(`${API_BASE}/sessions/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_ids: sessionIds })
  });
  if (!res.ok) throw new Error('Error al eliminar las sesiones');
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}`);
  if (!res.ok) throw new Error('Error al cargar la sesión');
  return res.json();
}

export async function reorderPages(sessionId: string, orderedIds: string[]): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_ids: orderedIds })
  });
  if (!res.ok) throw new Error('Error al reordenar páginas');
  return res.json();
}

export async function rotatePage(sessionId: string, pageId: string, degrees: number = 90): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/rotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, degrees })
  });
  if (!res.ok) throw new Error('Error al rotar página');
  return res.json();
}

export async function deletePages(sessionId: string, pageIds: string[]): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_ids: pageIds })
  });
  if (!res.ok) throw new Error('Error al eliminar páginas');
  return res.json();
}

export async function setCover(sessionId: string, pageId: string): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId })
  });
  if (!res.ok) throw new Error('Error al asignar portada');
  return res.json();
}

export async function splitSpread(
  sessionId: string,
  pageId: string,
  readingDirection: 'rtl' | 'ltr' = 'rtl'
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/split-spread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, reading_direction: readingDirection })
  });
  if (!res.ok) throw new Error('Error al dividir página doble');
  return res.json();
}

export async function sliceWebtoon(
  sessionId: string,
  pageId: string,
  maxHeight: number = 2500
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/slice-webtoon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, max_height: maxHeight })
  });
  if (!res.ok) throw new Error('Error al cortar tira de webtoon');
  return res.json();
}

export interface TextAnnotation {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  font_size: number;
  style: 'badge_dark' | 'badge_light' | 'speech_bubble' | 'cartela' | 'sfx' | 'sticky_yellow' | 'outline' | 'plain';
  align?: 'center' | 'left' | 'right';
  text_color?: string;
  bg_color?: string;
  bg_opacity?: number;
  border?: boolean;
  border_width?: number;
}

export interface PageOcrResponse {
  success: boolean;
  text: string;
  language: string;
  box?: { x: number; y: number; width: number; height: number };
}

export async function runPageOcr(
  sessionId: string,
  pageId: string,
  box?: { x?: number; y?: number; width?: number; height?: number },
  language: string = 'auto'
): Promise<PageOcrResponse> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/page/${pageId}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x: box?.x,
      y: box?.y,
      width: box?.width,
      height: box?.height,
      language
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Error al ejecutar OCR');
  }
  return res.json();
}

export async function customSplitVertical(
  sessionId: string,
  pageId: string,
  cutX: number,
  readingDirection: 'rtl' | 'ltr' = 'rtl'
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/custom-split-vertical`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, cut_x: cutX, reading_direction: readingDirection })
  });
  if (!res.ok) throw new Error('Error al dividir la página verticalmente');
  return res.json();
}

export async function undoSession(sessionId: string): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/undo`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'No se pudo deshacer la última acción');
  }
  return res.json();
}

export async function customSliceHorizontal(
  sessionId: string,
  pageId: string,
  cutPoints: number[],
  discardIndices?: number[]
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/custom-slice-horizontal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, cut_points: cutPoints, discard_indices: discardIndices })
  });
  if (!res.ok) throw new Error('Error al cortar la tira en los puntos seleccionados');
  return res.json();
}

export async function discardBand(
  sessionId: string,
  pageId: string,
  yStart: number,
  yEnd: number
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/discard-band`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, y_start: yStart, y_end: yEnd })
  });
  if (!res.ok) throw new Error('Error al descartar la zona seleccionada');
  return res.json();
}

export async function fetchSuggestedCuts(
  sessionId: string,
  pageId: string,
  maxHeight: number = 2500
): Promise<number[]> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/suggested-cuts/${pageId}?max_height=${maxHeight}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.cuts || [];
}

export async function cropPage(
  sessionId: string,
  pageId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  saveAsNew: boolean = false
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/crop-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, x, y, width, height, save_as_new: saveAsNew })
  });
  if (!res.ok) throw new Error('Error al recortar la zona seleccionada');
  return res.json();
}

export async function addTextAnnotations(
  sessionId: string,
  pageId: string,
  annotations: TextAnnotation[]
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/add-text-annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, annotations })
  });
  if (!res.ok) throw new Error('Error al guardar notas de texto en la imagen');
  return res.json();
}

export async function createChapterCover(
  sessionId: string,
  params: {
    chapter_number: string;
    chapter_title: string;
    series_name?: string;
    style: 'minimal_white' | 'minimal_dark' | 'overlay_bg';
    bg_page_id?: string;
    insert_before_page_id?: string;
    replace_page_id?: string;
  }
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/chapter-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error('Error al generar la portadilla de capítulo');
  return res.json();
}

export async function addPages(
  sessionId: string,
  files: File[],
  insertAfter?: string,
  insertAtBeginning: boolean = true
): Promise<SessionManifest> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  if (insertAfter) {
    formData.append('insert_after', insertAfter);
  }
  formData.append('insert_at_beginning', String(insertAtBeginning));

  const res = await fetch(`${API_BASE}/session/${sessionId}/add-pages`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Error al añadir páginas');
  return res.json();
}

export async function updateMetadata(sessionId: string, metadata: ComicInfo): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  if (!res.ok) throw new Error('Error al guardar metadatos');
  return res.json();
}

export async function batchUpdateMetadata(params: {
  session_ids: string[];
  metadata: ComicInfo;
  apply_common_only?: boolean;
  fields_to_copy?: string[];
}): Promise<{ updated_count: number; sessions: SessionManifest[] }> {
  const res = await fetch(`${API_BASE}/session/batch-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error('Error al guardar metadatos en lote');
  return res.json();
}

export interface ExportProgressInfo {
  percent: number;
  current: number;
  total: number;
  message: string;
}

export async function exportComic(
  sessionId: string,
  options: {
    compression: string;
    quality: number;
    save_to_library: boolean;
    custom_filename?: string;
    custom_export_dir?: string;
    export_format?: 'cbz' | 'zip' | 'cbr' | 'pdf' | 'epub';
    auto_downscale_oversized?: boolean;
    overwrite_source?: boolean;
    delete_merged_source_chapters?: boolean;
  },
  onProgress?: (info: ExportProgressInfo) => void
): Promise<ExportResult> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error al iniciar la exportación' }));
    throw new Error(err.detail || 'Error al iniciar la exportación');
  }

  return new Promise((resolve, reject) => {
    let pollInterval: any = null;
    let timeoutTimer: any = null;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera agotado durante la exportación'));
    }, 600000); // 10 minutes watchdog

    pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API_BASE}/session/${sessionId}/export/status`);
        if (!statusRes.ok) {
          cleanup();
          reject(new Error('No se pudo consultar el estado de la exportación'));
          return;
        }

        const data = await statusRes.json();

        if (onProgress) {
          onProgress({
            percent: data.percent || 0,
            current: data.current || 0,
            total: data.total || 0,
            message: data.message || 'Empaquetando páginas...'
          });
        }

        if (data.status === 'ready' && data.result) {
          cleanup();
          resolve(data.result);
        } else if (data.status === 'error') {
          cleanup();
          reject(new Error(data.error || data.message || 'Error durante la exportación'));
        }
      } catch (err: any) {
        cleanup();
        reject(new Error(err.message || 'Error consultando el progreso de exportación'));
      }
    }, 350);
  });
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Error al cargar configuración');
  return res.json();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error('Error al guardar configuración');
}

export async function updateQuickMetadata(
  sessionId: string,
  params: {
    item_type?: 'tomo' | 'capitulo';
    series?: string;
    title?: string;
    number?: string;
    volume?: number;
  }
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/quick-meta`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error('Error al actualizar metadatos');
  return res.json();
}

export async function mergeSessions(params: {
  source_session_ids: string[];
  target_series: string;
  target_volume?: number;
  target_title?: string;
  delete_sources?: boolean;
  add_chapter_covers?: boolean;
}): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al fusionar capítulos');
  }
  return res.json();
}

export async function appendChaptersToTomo(
  targetSessionId: string,
  sourceSessionIds: string[],
  deleteSources: boolean = true,
  addChapterCovers: boolean = false
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${targetSessionId}/append-chapters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_session_ids: sourceSessionIds,
      delete_sources: deleteSources,
      add_chapter_covers: addChapterCovers
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al incorporar capítulos al tomo');
  }
  return res.json();
}

export async function extractChapter(
  sessionId: string,
  params: {
    page_ids: string[];
    chapter_number: string;
    chapter_title?: string;
    remove_from_source?: boolean;
  }
): Promise<{ new_session: SessionManifest; source_session: SessionManifest | null }> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/extract-chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al extraer capítulo');
  }
  return res.json();
}

export async function movePagesToSession(
  sessionId: string,
  params: {
    target_session_id: string;
    page_ids: string[];
    remove_from_source?: boolean;
  }
): Promise<{ source_session: SessionManifest | null; target_session: SessionManifest }> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/move-pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al mover páginas');
  }
  return res.json();
}

export async function cleanupOrphanedStaging(): Promise<{
  success: boolean;
  cleaned_sessions: number;
  freed_bytes: number;
  freed_gb: number;
}> {
  const res = await fetch(`${API_BASE}/staging/cleanup-orphaned`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al limpiar sesiones huérfanas');
  }
  return res.json();
}

export async function fetchSystemStats(): Promise<SystemStats> {
  const res = await fetch(`${API_BASE}/system/stats`);
  if (!res.ok) {
    throw new Error('Error al obtener estadísticas del sistema');
  }
  return res.json();
}

export async function downscalePage(sessionId: string, pageId: string, maxDimension: number = 16383): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/page/${pageId}/downscale?max_dimension=${maxDimension}`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al redimensionar la página');
  }
  return res.json();
}

export async function downscaleAllOversized(sessionId: string, maxDimension: number = 16383): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/downscale-oversized?max_dimension=${maxDimension}`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al redimensionar las páginas');
  }
  return res.json();
}

export interface SliceJobStatus {
  status: 'idle' | 'processing' | 'ready' | 'error';
  percent: number;
  current: number;
  total: number;
  message: string;
  error?: string | null;
  result?: {
    success: boolean;
    total_sliced: number;
    new_total_pages: number;
  } | null;
}

export async function sliceWebtoonBatch(
  sessionId: string,
  params: { maxHeight?: number; onlyOversized?: boolean } = {}
): Promise<SliceJobStatus> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/slice-webtoon-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_height: params.maxHeight ?? 2500,
      only_oversized: params.onlyOversized ?? true
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al iniciar corte de tiras en lote');
  }
  return res.json();
}

export async function fetchSliceJobStatus(sessionId: string): Promise<SliceJobStatus> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/slice/status`);
  if (!res.ok) {
    return { status: 'idle', percent: 0, current: 0, total: 0, message: '' };
  }
  return res.json();
}

// --- Server Filesystem Browser & Direct Ingestion ---

export async function browseServerFs(path?: string): Promise<ServerFsBrowseResult> {
  const url = path ? `${API_BASE}/server-fs/browse?path=${encodeURIComponent(path)}` : `${API_BASE}/server-fs/browse`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al explorar el directorio del servidor');
  }
  return res.json();
}

export interface ServerImportResponse {
  success: boolean;
  imported: { session_id: string; filename: string; path: string }[];
  errors: string[];
  count: number;
}

export async function importServerFiles(
  payload: ServerImportRequest
): Promise<ServerImportResponse> {
  const res = await fetch(`${API_BASE}/server-fs/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al importar archivos del servidor');
  }
  return res.json();
}

// --- Authentication Endpoints ---

export async function fetchAuthStatus(): Promise<AuthStatusResult> {
  const res = await fetch(`${API_BASE}/auth/status`);
  if (!res.ok) return { auth_required: false, authenticated: true };
  return res.json();
}

export async function loginWithPassword(password: string): Promise<{ success: boolean; token: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Contraseña incorrecta');
  }
  const data = await res.json();
  if (data.token && data.token !== 'open') {
    setStoredAuthToken(data.token);
  }
  return data;
}

export async function logoutAuth(): Promise<void> {
  clearStoredAuthToken();
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    // Ignore error
  }
}

export async function searchOnlineManga(query: string, source: string = 'auto'): Promise<OnlineSearchResult[]> {
  const params = new URLSearchParams({ query, source });
  const res = await fetch(`${API_BASE}/search/online?${params.toString()}`);
  if (!res.ok) throw new Error('Error al realizar búsqueda online');
  const data = await res.json();
  return data.results || [];
}

export async function fetchMangaDexVolumeCovers(mangaId: string): Promise<VolumeCoverItem[]> {
  const res = await fetch(`${API_BASE}/search/mangadex/${mangaId}/covers`);
  if (!res.ok) throw new Error('Error al cargar portadas de tomos');
  const data = await res.json();
  return data.covers || [];
}

export async function applyOnlineCover(
  sessionId: string,
  params: { image_url: string; mode: 'insert_first' | 'replace_first'; custom_name?: string }
): Promise<SessionManifest> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/apply-online-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error al aplicar portada online' }));
    throw new Error(err.detail || 'Error al aplicar portada online');
  }
  return res.json();
}



