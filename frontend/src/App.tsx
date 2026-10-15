import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  BookOpen, 
  UploadCloud, 
  FileText, 
  Sparkles, 
  Layers, 
  Undo2, 
  ArrowRight,
  HardDrive,
  Library,
  Bookmark,
  ImagePlus,
  Search,
  X,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { SessionManifest, ComicInfo, AppSettings, PageItem, ComicSessionSummary } from './types';
import { 
  fetchSettings, 
  reorderPages, 
  rotatePage, 
  deletePages, 
  setCover, 
  splitSpread, 
  sliceWebtoon, 
  addPages, 
  updateMetadata,
  batchUpdateMetadata,
  updateQuickMetadata,
  fetchAllSessions,
  fetchSession,
  cancelSession,
  batchDeleteSessions,
  getThumbUrl,
  cleanupOrphanedStaging,
  saveSettings,
  exportComic,
  downscalePage,
  downscaleAllOversized,
  sliceWebtoonBatch,
  fetchSliceJobStatus,
  undoSession,
  fetchAuthStatus,
  loginWithPassword,
  logoutAuth
} from './api';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { PageGrid } from './components/PageGrid';
import { Lightbox } from './components/Lightbox';
import { MetadataDrawer } from './components/MetadataDrawer';
import { PageInspectorModal } from './components/PageInspectorModal';
import { SplitSpreadModal } from './components/SplitSpreadModal';
import { WebtoonSlicerModal } from './components/WebtoonSlicerModal';
import { CustomCutModal } from './components/CustomCutModal';
import { TextAnnotationModal } from './components/TextAnnotationModal';
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { UploadModal } from './components/UploadModal';
import { ChapterCoverModal } from './components/ChapterCoverModal';
import { MergeChaptersModal } from './components/MergeChaptersModal';
import { ExtractChapterModal } from './components/ExtractChapterModal';
import { QuickRenameModal } from './components/QuickRenameModal';
import { CloneMetadataModal } from './components/CloneMetadataModal';
import { AppendChaptersModal } from './components/AppendChaptersModal';
import { SystemMonitorWidget } from './components/SystemMonitorWidget';
import { FloatingTaskWidget, ActiveExportTask, ActiveUploadTask, ActiveSliceTask } from './components/FloatingTaskWidget';
import { DonationModal } from './components/DonationModal';
import { DonationBanner } from './components/DonationBanner';
import { ImageAnalysisModal } from './components/ImageAnalysisModal';
import { ExportGroupModal } from './components/ExportGroupModal';
import { DeleteGroupModal } from './components/DeleteGroupModal';
import { OnlineSearchModal } from './components/OnlineSearchModal';
import { cleanSeriesDisplayName, extractSortNumber, isSessionTomo, isSessionChapter, SeriesGroup } from './utils/seriesGrouping';
import { useStorageSanitizer } from './hooks/useStorageSanitizer';
import { useTranslation } from './i18n';

const STORAGE_ACTIVE_SESSION = 'mangajutsu_active_session_id';
const STORAGE_SESSIONS_ORDER = 'mangajutsu_sessions_order';

const getStoredActiveSessionId = (): string | null => {
  return localStorage.getItem(STORAGE_ACTIVE_SESSION) || localStorage.getItem('cbz_active_session_id');
};

const setStoredActiveSessionId = (id: string | null) => {
  if (id) {
    localStorage.setItem(STORAGE_ACTIVE_SESSION, id);
    localStorage.setItem('cbz_active_session_id', id);
  } else {
    localStorage.removeItem(STORAGE_ACTIVE_SESSION);
    localStorage.removeItem('cbz_active_session_id');
  }
};

const getStoredSessionsOrder = (): string[] | null => {
  const str = localStorage.getItem(STORAGE_SESSIONS_ORDER) || localStorage.getItem('comic_sessions_order');
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const setStoredSessionsOrder = (order: string[]) => {
  const serialized = JSON.stringify(order);
  localStorage.setItem(STORAGE_SESSIONS_ORDER, serialized);
};

export const App: React.FC = () => {
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionManifest | null>(null);
  const [sessionsList, setSessionsList] = useState<ComicSessionSummary[]>([]);
  const activeSessionRequestIdRef = useRef<number>(0);

  const validSessionIds = useMemo(() => sessionsList.map((s) => s.session_id), [sessionsList]);
  const { sanitizeStorage } = useStorageSanitizer({ validSessionIds });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<AppSettings>({
    export_directory: '',
    staging_directory: '',
    default_compression: 'webp',
    default_quality: 85,
    komga_server_url: '',
    komga_api_key: '',
    clean_junk_files: true,
    split_max_height: 2500
  });

  const [isSaving, setIsSaving] = useState(false);
  const [historyStack, setHistoryStack] = useState<SessionManifest[]>([]);

  // Authentication Protection State
  const [authRequired, setAuthRequired] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Safety watchdog: ensure isSaving never stays stuck in the UI
  useEffect(() => {
    if (!isSaving) return;
    const timer = setTimeout(() => {
      console.warn('isSaving watchdog triggered: resetting stuck saving indicator');
      setIsSaving(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [isSaving]);

  // Tab Power & CPU Throttling: Pause animations and background activity when minimized or tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.classList.add('app-tab-hidden');
      } else {
        document.body.classList.remove('app-tab-hidden');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [spreadSplitPage, setSpreadSplitPage] = useState<PageItem | null>(null);
  const [webtoonSlicePage, setWebtoonSlicePage] = useState<PageItem | null>(null);
  const [chapterCoverPage, setChapterCoverPage] = useState<PageItem | null>(null);
  const [viewingPageId, setViewingPageId] = useState<string | null>(null);
  const [inspectingPageId, setInspectingPageId] = useState<string | null>(null);
  const [customCutTargetPage, setCustomCutTargetPage] = useState<PageItem | null>(null);
  const [customCutInitialMode, setCustomCutInitialMode] = useState<'vertical' | 'webtoon' | 'discard' | 'crop'>('vertical');
  const [textAnnotationTargetPage, setTextAnnotationTargetPage] = useState<PageItem | null>(null);

  // New Modals: Merge, Extract, QuickRename, Append
  const [mergeSessionsList, setMergeSessionsList] = useState<ComicSessionSummary[] | null>(null);
  const [appendTargetTomo, setAppendTargetTomo] = useState<ComicSessionSummary | null>(null);
  const [appendInitialChapterIds, setAppendInitialChapterIds] = useState<string[]>([]);
  const [isAppendChaptersOpen, setIsAppendChaptersOpen] = useState(false);
  const [extractPageIds, setExtractPageIds] = useState<string[] | null>(null);
  const [extractInitialTab, setExtractInitialTab] = useState<'new_chapter' | 'move_to_session'>('new_chapter');
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [inspectorRangeStartId, setInspectorRangeStartId] = useState<string | null>(null);
  const [quickRenameTarget, setQuickRenameTarget] = useState<ComicSessionSummary | SessionManifest | null>(null);
  const [quickRenameParentSeries, setQuickRenameParentSeries] = useState<string | null>(null);
  const [markedSessionsForMetadata, setMarkedSessionsForMetadata] = useState<ComicSessionSummary[] | null>(null);
  const [cloneSourceSessionId, setCloneSourceSessionId] = useState<string | null>(null);
  const [cloneInitialMetadata, setCloneInitialMetadata] = useState<ComicInfo | null>(null);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [isImageAnalysisOpen, setIsImageAnalysisOpen] = useState(false);
  const [isOnlineSearchOpen, setIsOnlineSearchOpen] = useState(false);
  const [stagingTab, setStagingTab] = useState<'all' | 'tomos' | 'chapters'>('all');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [uploadDefaultSeries, setUploadDefaultSeries] = useState<string | null>(null);
  const sessionScrollPositionsRef = useRef<Record<string, number>>({});

  // Real-time System Monitor Widget state (Disabled by default, enabled only on request)
  const [isMonitorOpen, setIsMonitorOpen] = useState<boolean>(false);

  const toggleMonitor = useCallback(() => {
    setIsMonitorOpen((prev) => !prev);
  }, []);

  // Background Tasks for Non-blocking Export Queue, Import & Slicing
  const [exportQueue, setExportQueue] = useState<ActiveExportTask[]>([]);
  const isProcessingExportRef = useRef(false);
  const [exportGroupTarget, setExportGroupTarget] = useState<SeriesGroup | null>(null);

  const activeExportTask = useMemo(() => {
    const processing = exportQueue.find((t) => t.status === 'processing');
    if (processing) return processing;
    const pending = exportQueue.find((t) => t.status === 'pending');
    if (pending) return pending;
    if (exportQueue.length > 0) return exportQueue[exportQueue.length - 1];
    return null;
  }, [exportQueue]);

  const [activeUploadTask, setActiveUploadTask] = useState<ActiveUploadTask | null>(null);
  const [activeSliceTask, setActiveSliceTask] = useState<ActiveSliceTask | null>(null);

  const computeSessionExportFilename = useCallback((s: ComicSessionSummary, format: string = 'cbz') => {
    const parts: string[] = [];
    if (s.series && s.series.trim()) parts.push(s.series.trim());
    if (s.volume !== null && s.volume !== undefined && String(s.volume).trim() !== '') {
      parts.push(`v${String(s.volume).padStart(2, '0')}`);
    }
    if (s.number && s.number.trim()) parts.push(`#${s.number.trim()}`);
    if (s.title && s.title.trim()) parts.push(s.title.trim());
    const base = parts.length > 0 ? parts.join(' - ') : (s.original_filename || 'tomo').replace(/\.[^/.]+$/, '');
    return `${base}.${format}`;
  }, []);

  const handleStartBackgroundExport = useCallback((params: {
    sessionId: string;
    comicTitle: string;
    filename: string;
    options: {
      compression: string;
      quality: number;
      save_to_library: boolean;
      custom_filename: string;
      custom_export_dir?: string;
      export_format: 'cbz' | 'zip' | 'cbr' | 'pdf' | 'epub';
      auto_downscale_oversized?: boolean;
      overwrite_source?: boolean;
      delete_merged_source_chapters?: boolean;
    };
  }) => {
    const taskId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const format = params.options.export_format || 'cbz';
    const newTask: ActiveExportTask = {
      id: taskId,
      sessionId: params.sessionId,
      comicTitle: params.comicTitle,
      filename: params.filename,
      format: format,
      saveToLibrary: params.options.save_to_library,
      percent: 0,
      current: 0,
      total: 0,
      message: `En cola de espera (${format.toUpperCase()})...`,
      status: 'pending',
      result: null,
      error: null,
      options: params.options as any
    };

    setExportQueue((prev) => [...prev, newTask]);
  }, []);

  const handleConfirmGroupExport = useCallback((
    sessionsToExport: ComicSessionSummary[],
    options: {
      export_format: any;
      compression: string;
      quality: number;
      save_to_library: boolean;
      custom_export_dir?: string;
      auto_downscale_oversized?: boolean;
    }
  ) => {
    const newTasks: ActiveExportTask[] = sessionsToExport.map((s, idx) => {
      const taskId = `export-group-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      const format = options.export_format || 'cbz';
      const fname = computeSessionExportFilename(s, format);
      const comicTitle = s.title || s.series || s.original_filename;

      return {
        id: taskId,
        sessionId: s.session_id,
        comicTitle: comicTitle,
        filename: fname,
        format: format,
        saveToLibrary: options.save_to_library,
        percent: 0,
        current: 0,
        total: s.page_count || 0,
        message: `En cola de espera (${format.toUpperCase()})...`,
        status: 'pending',
        result: null,
        error: null,
        options: {
          ...options,
          custom_filename: fname
        }
      };
    });

    setExportQueue((prev) => [...prev, ...newTasks]);
  }, [computeSessionExportFilename]);

  // Sequential Queue Worker: processes pending exports one by one without resetting or interrupting
  useEffect(() => {
    if (isProcessingExportRef.current) return;

    const nextTask = exportQueue.find((t) => t.status === 'pending');
    if (!nextTask) return;

    isProcessingExportRef.current = true;

    setExportQueue((prev) =>
      prev.map((t) =>
        t.id === nextTask.id
          ? {
              ...t,
              status: 'processing',
              message: `Iniciando empaquetado en ${t.format.toUpperCase()}...`
            }
          : t
      )
    );

    (async () => {
      try {
        const res = await exportComic(
          nextTask.sessionId,
          nextTask.options,
          (info) => {
            setExportQueue((prev) =>
              prev.map((t) =>
                t.id === nextTask.id
                  ? {
                      ...t,
                      percent: info.percent,
                      current: info.current,
                      total: info.total,
                      message: info.message
                    }
                  : t
              )
            );
          }
        );

        setExportQueue((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? {
                  ...t,
                  percent: 100,
                  status: 'completed',
                  result: res,
                  message: '¡Completado con éxito!'
                }
              : t
          )
        );

        if (!nextTask.saveToLibrary && res.download_url) {
          window.open(res.download_url, '_blank');
        }
      } catch (err: any) {
        console.error(`Error in background export for task ${nextTask.id}:`, err);
        setExportQueue((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? {
                  ...t,
                  status: 'error',
                  error: err.message || 'Error durante la exportación'
                }
              : t
          )
        );
      } finally {
        isProcessingExportRef.current = false;
      }
    })();
  }, [exportQueue]);

  const handleDismissExport = useCallback(() => {
    setExportQueue((prev) => prev.filter((t) => t.status === 'processing' || t.status === 'pending'));
  }, []);

  // Reset page selection when switching active session
  useEffect(() => {
    setSelectedPageIds([]);
    setInspectorRangeStartId(null);
  }, [session?.session_id]);

  // Load initial settings and staging sessions
  const loadSessions = useCallback(async () => {
    try {
      const list = await fetchAllSessions();
      // Apply saved order if exists
      const savedOrder = getStoredSessionsOrder();
      if (savedOrder) {
        try {
          const orderMap = new Map(savedOrder.map((id, index) => [id, index]));
          list.sort((a, b) => {
            const indexA = orderMap.has(a.session_id) ? orderMap.get(a.session_id)! : 999999;
            const indexB = orderMap.has(b.session_id) ? orderMap.get(b.session_id)! : 999999;
            if (indexA !== indexB) return indexA - indexB;
            const numA = extractSortNumber(a);
            const numB = extractSortNumber(b);
            return numA - numB;
          });
        } catch (e) {}
      } else {
        // Initial default sort: group by series name, tomos first, then volume/chapter number ascending
        list.sort((a, b) => {
          const seriesA = cleanSeriesDisplayName(a.series || a.original_filename);
          const seriesB = cleanSeriesDisplayName(b.series || b.original_filename);
          const seriesCmp = seriesA.localeCompare(seriesB, 'es', { sensitivity: 'base' });
          if (seriesCmp !== 0) return seriesCmp;

          const isTomoA = isSessionTomo(a);
          const isTomoB = isSessionTomo(b);
          if (isTomoA && !isTomoB) return -1;
          if (!isTomoA && isTomoB) return 1;

          const numA = extractSortNumber(a);
          const numB = extractSortNumber(b);
          return numA - numB;
        });
      }
      setSessionsList(list);
      return list;
    } catch (err) {
      console.warn('Could not load sessions:', err);
      return [];
    }
  }, []);

  // Real-time Background Slicing Poller
  useEffect(() => {
    if (!activeSliceTask || activeSliceTask.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const job = await fetchSliceJobStatus(activeSliceTask.sessionId);
        if (job.status === 'processing') {
          setActiveSliceTask((prev) =>
            prev && prev.id === activeSliceTask.id
              ? {
                  ...prev,
                  percent: job.percent,
                  current: job.current,
                  total: job.total,
                  message: job.message
                }
              : prev
          );
        } else if (job.status === 'ready') {
          setActiveSliceTask((prev) =>
            prev && prev.id === activeSliceTask.id
              ? {
                  ...prev,
                  percent: 100,
                  current: job.total,
                  total: job.total,
                  status: 'completed',
                  message: job.message,
                  newTotalPages: job.result?.new_total_pages
                }
              : prev
          );
          // Refresh session to show newly sliced pages smoothly!
          try {
            const updated = await fetchSession(activeSliceTask.sessionId);
            setSession(updated);
            await loadSessions();
          } catch (e) {
            console.error('Error refreshing session after slice:', e);
          }
        } else if (job.status === 'error') {
          setActiveSliceTask((prev) =>
            prev && prev.id === activeSliceTask.id
              ? {
                  ...prev,
                  status: 'error',
                  error: job.error || job.message
                }
              : prev
          );
        }
      } catch (err) {
        console.error('Error polling slice job status:', err);
      }
    }, 700);

    return () => clearInterval(interval);
  }, [activeSliceTask, loadSessions]);

  useEffect(() => {
    fetchAuthStatus()
      .then((status) => {
        setAuthRequired(status.auth_required);
        setIsAuthenticated(status.authenticated);
        setAuthChecked(true);
        if (!status.auth_required || status.authenticated) {
          fetchSettings()
            .then(setSettings)
            .catch((err) => console.warn('Could not load settings:', err));
          loadSessions().then((list) => {
            if (!list || list.length === 0) return;
            const lastActiveId = getStoredActiveSessionId();
            const targetId = (lastActiveId && list.some((s) => s.session_id === lastActiveId))
              ? lastActiveId
              : null;
            if (targetId) {
              fetchSession(targetId)
                .then(setSession)
                .catch((e) => console.warn('Could not restore last active session:', e));
            }
          });
        }
      })
      .catch(() => {
        setAuthChecked(true);
      });
  }, [loadSessions]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await loginWithPassword(passwordInput);
      setIsAuthenticated(true);
      fetchSettings().then(setSettings).catch(() => {});
      loadSessions().then((list) => {
        if (!list || list.length === 0) return;
        const lastActiveId = getStoredActiveSessionId();
        const targetId = (lastActiveId && list.some((s) => s.session_id === lastActiveId))
          ? lastActiveId
          : null;
        if (targetId) {
          fetchSession(targetId)
            .then(setSession)
            .catch(() => {});
        }
      });
    } catch (err: any) {
      setLoginError(err.message || 'Contraseña incorrecta');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Continuously record scroll position for the active session
  useEffect(() => {
    const handleScroll = () => {
      if (session?.session_id) {
        sessionScrollPositionsRef.current[session.session_id] = window.scrollY;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [session?.session_id]);

  const handleSelectSession = async (sessionId: string) => {
    if (session?.session_id === sessionId) return;
    if (session?.session_id) {
      sessionScrollPositionsRef.current[session.session_id] = window.scrollY;
    }
    const reqId = ++activeSessionRequestIdRef.current;
    try {
      const s = await fetchSession(sessionId);
      if (activeSessionRequestIdRef.current !== reqId) return; // Stale request, discard
      setSession(s);
      setStoredActiveSessionId(sessionId);
      setHistoryStack([]);

      // Scroll position restoration: restore previous position if opened before, or open at top (0)
      const targetScrollY = sessionScrollPositionsRef.current[sessionId];
      requestAnimationFrame(() => {
        window.scrollTo({
          top: targetScrollY !== undefined ? targetScrollY : 0,
          behavior: 'instant' as ScrollBehavior
        });
      });
    } catch (err) {
      if (activeSessionRequestIdRef.current !== reqId) return;
      console.warn('Session not found or deleted:', sessionId, err);
      setSessionsList((prev) => prev.filter((item) => item.session_id !== sessionId));
      if (getStoredActiveSessionId() === sessionId) {
        setStoredActiveSessionId(null);
      }
      loadSessions();
    }
  };

  const handleCloseCurrent = () => {
    if (session?.session_id) {
      sessionScrollPositionsRef.current[session.session_id] = window.scrollY;
    }
    setSession(null);
    setStoredActiveSessionId(null);
    setHistoryStack([]);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    loadSessions();
  };

  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);

  const handleCleanupOrphaned = async () => {
    try {
      setIsCleaningOrphans(true);
      sanitizeStorage(); // Client-side cleanup of dead localStorage keys & caches
      const res = await cleanupOrphanedStaging();
      await loadSessions();
      if (res.cleaned_sessions > 0) {
        alert(`¡Limpieza completada! Se eliminaron ${res.cleaned_sessions} sesiones huérfanas y se liberaron ${res.freed_gb} GB de disco.`);
      } else {
        alert('El almacenamiento temporal está limpio. No se encontraron sesiones huérfanas pendientes.');
      }
    } catch (err: any) {
      alert(`Error al limpiar sesiones huérfanas: ${err.message}`);
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Seguro que deseas eliminar esta sesión de staging? Se borrarán sus archivos temporales.')) return;
    try {
      await cancelSession(sessionId);
      if (session?.session_id === sessionId) {
        setSession(null);
        setStoredActiveSessionId(null);
        setHistoryStack([]);
      }
      await loadSessions();
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const [deleteGroupTarget, setDeleteGroupTarget] = useState<SeriesGroup | null>(null);
  const [deleteMarkedSessions, setDeleteMarkedSessions] = useState<ComicSessionSummary[] | null>(null);

  const handleConfirmBatchDeleteSessions = async (sessionIds: string[]) => {
    try {
      await batchDeleteSessions(sessionIds);
      if (session && sessionIds.includes(session.session_id)) {
        setSession(null);
        setStoredActiveSessionId(null);
        setHistoryStack([]);
      }
      try {
        const savedOrder = getStoredSessionsOrder();
        if (savedOrder) {
          const filtered = savedOrder.filter((id) => !sessionIds.includes(id));
          setStoredSessionsOrder(filtered);
        }
      } catch (e) {}

      await loadSessions();
    } catch (err: any) {
      alert(`Error al eliminar sesiones: ${err.message}`);
      await loadSessions();
    }
  };

  // Push to history for Undo (Ctrl+Z)
  const pushHistory = useCallback((current: SessionManifest) => {
    setHistoryStack((prev) => [...prev.slice(-10), current]);
  }, []);

  const handleUndo = useCallback(async () => {
    if (historyStack.length === 0 || !session) return;
    setIsSaving(true);
    try {
      const restored = await undoSession(session.session_id);
      setSession(restored);
      setHistoryStack((prev) => prev.slice(0, -1));
    } catch (err: any) {
      console.warn('Backend undo failed, falling back:', err);
      const previous = historyStack[historyStack.length - 1];
      setHistoryStack((prev) => prev.slice(0, -1));
      if (previous) {
        setSession(previous);
      }
    } finally {
      setIsSaving(false);
    }
  }, [historyStack, session]);

  // Global Keyboard Shortcuts (Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!isViewerOpen && !isMetadataOpen && !isExportOpen) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, isViewerOpen, isMetadataOpen, isExportOpen]);

  // Session Handlers
  const handleReorder = async (newOrderedIds: string[]) => {
    if (!session) return;
    pushHistory(session);
    // Optimistic UI update for immediate zero lag
    const pageMap = new Map(session.pages.map((p) => [p.id, p]));
    const optimisticPages = newOrderedIds
      .map((id, idx) => {
        const p = pageMap.get(id);
        return p ? { ...p, order: idx + 1, is_cover: idx === 0 } : null;
      })
      .filter((p): p is PageItem => p !== null);

    setSession({ ...session, pages: optimisticPages });

    setIsSaving(true);
    try {
      const updated = await reorderPages(session.session_id, newOrderedIds);
      setSession(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRotate = async (pageId: string) => {
    if (!session) return;
    setIsSaving(true);
    try {
      const updated = await rotatePage(session.session_id, pageId, 90);
      setSession(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (pageIds: string[]) => {
    if (!session) return;
    pushHistory(session);
    setIsSaving(true);
    try {
      const updated = await deletePages(session.session_id, pageIds);
      setSession(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetCover = async (pageId: string) => {
    if (!session) return;
    pushHistory(session);
    setIsSaving(true);
    try {
      const updated = await setCover(session.session_id, pageId);
      setSession(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSplitSpread = async (pageId: string, readingDirection: 'rtl' | 'ltr') => {
    if (!session) return;
    pushHistory(session);
    setIsSaving(true);
    try {
      const origIndex = session.pages.findIndex((p) => p.id === pageId);
      const updated = await splitSpread(session.session_id, pageId, readingDirection);
      setSession(updated);
      const targetIdx = origIndex !== -1 ? Math.min(origIndex, updated.pages.length - 1) : 0;
      const newPage = updated.pages[targetIdx];
      if (newPage) {
        setInspectingPageId(newPage.id);
        setTimeout(() => {
          document.getElementById(`page-card-${newPage.order}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 100);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSliceWebtoon = async (pageId: string, maxHeight: number) => {
    if (!session) return;
    pushHistory(session);
    setIsSaving(true);
    try {
      const origIndex = session.pages.findIndex((p) => p.id === pageId);
      const updated = await sliceWebtoon(session.session_id, pageId, maxHeight);
      setSession(updated);
      const targetIdx = origIndex !== -1 ? Math.min(origIndex, updated.pages.length - 1) : 0;
      const newPage = updated.pages[targetIdx];
      if (newPage) {
        setInspectingPageId(newPage.id);
        setTimeout(() => {
          document.getElementById(`page-card-${newPage.order}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 100);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPages = async (files: File[], insertAfter?: string, insertAtBeginning: boolean = false) => {
    if (!session) return;
    setIsSaving(true);
    try {
      const updated = await addPages(session.session_id, files, insertAfter, insertAtBeginning);
      setSession(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPagesToSession = async (sessionId: string, files: File[]) => {
    setIsSaving(true);
    try {
      const updated = await addPages(sessionId, files);
      if (session?.session_id === sessionId) {
        setSession(updated);
      } else {
        setSession(updated);
        setStoredActiveSessionId(sessionId);
      }
      await loadSessions();
    } catch (err: any) {
      alert(`Error al añadir imágenes: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveSessionsToSeries = async (sessionIds: string[], targetSeries: string) => {
    setIsSaving(true);
    try {
      setSessionsList((prev) =>
        prev.map((s) => (sessionIds.includes(s.session_id) ? { ...s, series: targetSeries } : s))
      );
      if (session && sessionIds.includes(session.session_id)) {
        setSession({
          ...session,
          metadata: { ...session.metadata, Series: targetSeries }
        });
      }

      await Promise.all(
        sessionIds.map((id) => updateQuickMetadata(id, { series: targetSeries }))
      );

      await loadSessions();
    } catch (err: any) {
      alert(`Error al mover elementos: ${err.message}`);
      await loadSessions();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMetadata = async (newMeta: ComicInfo) => {
    if (!session) return;
    setIsSaving(true);
    try {
      const updated = await updateMetadata(session.session_id, newMeta);
      setSession(updated);
      await loadSessions();
    } finally {
      setIsSaving(false);
    }
  };

  const handleOnlineCoverApplied = (updatedManifest: SessionManifest) => {
    setSession(updatedManifest);
    loadSessions();
  };

  const handleBatchSaveMetadata = async (sessionIds: string[], newMeta: ComicInfo) => {
    setIsSaving(true);
    try {
      const res = await batchUpdateMetadata({
        session_ids: sessionIds,
        metadata: newMeta,
        apply_common_only: true
      });
      if (session && sessionIds.includes(session.session_id)) {
        const myUpdated = res.sessions.find((s) => s.session_id === session.session_id);
        if (myUpdated) setSession(myUpdated);
      }
      await loadSessions();
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleItemType = async (item: ComicSessionSummary) => {
    const isCurrentlyTomo = isSessionTomo(item);
    const newType = isCurrentlyTomo ? 'capitulo' : 'tomo';
    try {
      await updateQuickMetadata(item.session_id, {
        item_type: newType,
        volume: newType === 'capitulo' ? undefined : (item.volume || 1)
      });
      await loadSessions();
      if (session && session.session_id === item.session_id) {
        setSession((prev) => prev ? {
          ...prev,
          item_type: newType,
          metadata: {
            ...prev.metadata,
            Format: newType === 'capitulo' ? 'Capítulo' : 'Tomo',
            Volume: newType === 'capitulo' ? undefined : (prev.metadata.Volume || 1)
          }
        } : null);
      }
    } catch (err) {
      console.error('Error toggling item type:', err);
    }
  };

  const handleTransferActiveChapterToTomo = () => {
    if (!session) return;
    const sessionSeries = cleanSeriesDisplayName(session.metadata.Series || session.original_filename);
    const matchingTomo = sessionsList.find(
      (s) => isSessionTomo(s) && cleanSeriesDisplayName(s.series || s.original_filename) === sessionSeries
    );
    setAppendTargetTomo(matchingTomo || null);
    setAppendInitialChapterIds([session.session_id]);
    setIsAppendChaptersOpen(true);
  };

  const handleDownscalePage = async (pageId: string) => {
    if (!session) return;
    setIsSaving(true);
    try {
      pushHistory(session);
      const updated = await downscalePage(session.session_id, pageId, 16383);
      setSession(updated);
      await loadSessions();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownscaleAllOversized = async () => {
    if (!session) return;
    setIsSaving(true);
    try {
      pushHistory(session);
      const updated = await downscaleAllOversized(session.session_id, 16383);
      setSession(updated);
      await loadSessions();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSliceAllWebtoons = async (params: { maxHeight: number; onlyOversized: boolean }) => {
    if (!session) return;
    const taskId = `slice-${Date.now()}`;
    const comicTitle = session.metadata.Title || session.metadata.Series || session.original_filename;

    const targetPages = session.pages.filter((p) =>
      params.onlyOversized ? (p.width > 16383 || p.height > 16383) : (p.height > params.maxHeight * 1.15)
    );

    setActiveSliceTask({
      id: taskId,
      sessionId: session.session_id,
      comicTitle: comicTitle,
      percent: 0,
      current: 0,
      total: targetPages.length,
      message: `Iniciando corte de ${targetPages.length} tiras Webtoon...`,
      status: 'processing'
    });

    try {
      pushHistory(session);
      const job = await sliceWebtoonBatch(session.session_id, params);
      if (job.status === 'ready') {
        setActiveSliceTask((prev) =>
          prev && prev.id === taskId
            ? {
                ...prev,
                percent: 100,
                status: 'completed',
                message: job.message,
                newTotalPages: job.result?.new_total_pages
              }
            : prev
        );
        const updated = await fetchSession(session.session_id);
        setSession(updated);
        await loadSessions();
      }
    } catch (err: any) {
      setActiveSliceTask((prev) =>
        prev && prev.id === taskId
          ? {
              ...prev,
              status: 'error',
              error: err.message || 'Error iniciando corte de tiras'
            }
          : prev
      );
    }
  };

  if (authChecked && authRequired && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-5 shadow-lg shadow-indigo-500/10">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Manga<span className="text-indigo-400">Kuro</span>
          </h2>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1 mb-6">
            Acceso Protegido
          </p>

          {loginError && (
            <div className="w-full mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="w-full space-y-4">
            <div className="text-left">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Contraseña de Acceso
              </label>
              <input
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setLoginError(null);
                }}
                placeholder="Introduce la contraseña..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden transition font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || !passwordInput.trim()}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoggingIn ? (
                <span>Verificando...</span>
              ) : (
                <span>Entrar a MangaKuro</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-comic-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between pb-14">
      <div className="flex-1 flex flex-col">
        {/* Top Navbar */}
        <Header
        session={session}
        isSaving={isSaving}
        isSidebarOpen={isSidebarOpen}
        sessionsCount={sessionsList.length}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onCloseCurrent={handleCloseCurrent}
        onOpenUpload={(defaultSeries) => {
          setUploadDefaultSeries(defaultSeries || null);
          setIsUploadOpen(true);
        }}
        onOpenMetadata={() => setIsMetadataOpen(true)}
        onOpenViewer={() => {
          setViewingPageId(session?.pages[0]?.id || null);
          setIsViewerOpen(true);
        }}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenQuickRename={() => {
          if (session) {
            setQuickRenameTarget(session);
            setQuickRenameParentSeries(session.metadata.Series || null);
          }
        }}
        onTransferActiveToTomo={session?.item_type === 'capitulo' ? handleTransferActiveChapterToTomo : undefined}
        onCleanupOrphaned={handleCleanupOrphaned}
        isCleaningOrphans={isCleaningOrphans}
        isMonitorOpen={isMonitorOpen}
        onToggleMonitor={toggleMonitor}
        onOpenDonation={() => setIsDonationOpen(true)}
        onOpenImageAnalysis={() => setIsImageAnalysisOpen(true)}
        onOpenOnlineSearch={() => setIsOnlineSearchOpen(true)}
      />

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex w-full relative">
        <Sidebar
          sessions={sessionsList}
          onReorderSessions={(newList) => {
            setSessionsList(newList);
            try {
              setStoredSessionsOrder(newList.map((s) => s.session_id));
            } catch (e) {}
          }}
          activeSessionId={session?.session_id || null}
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen((prev) => !prev)}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onCloseCurrent={handleCloseCurrent}
          onOpenUpload={(defaultSeries) => {
            setUploadDefaultSeries(defaultSeries || null);
            setIsUploadOpen(true);
          }}
          onOpenQuickRename={(summary, groupSeriesName) => {
            setQuickRenameTarget(summary);
            setQuickRenameParentSeries(groupSeriesName || summary.series || null);
          }}
          onOpenMerge={(list) => setMergeSessionsList(list)}
          onOpenMetadataForSession={async (summary) => {
            if (session?.session_id !== summary.session_id) {
              await handleSelectSession(summary.session_id);
            }
            setMarkedSessionsForMetadata([]);
            setIsMetadataOpen(true);
          }}
          onOpenBatchMetadata={(markedList) => {
            if (markedList.length > 0 && session?.session_id !== markedList[0].session_id) {
              handleSelectSession(markedList[0].session_id);
            }
            setMarkedSessionsForMetadata(markedList);
            setIsMetadataOpen(true);
          }}
          onOpenCloneModal={(summary) => {
            setCloneSourceSessionId(summary.session_id);
            setCloneInitialMetadata(null);
          }}
          onAddImagesToSession={handleAddPagesToSession}
          onMoveSessionsToSeries={handleMoveSessionsToSeries}
          onToggleItemType={handleToggleItemType}
          onOpenAppendChapters={(targetTomo, initialChapterIds) => {
            setAppendTargetTomo(targetTomo || null);
            setAppendInitialChapterIds(initialChapterIds || []);
            setIsAppendChaptersOpen(true);
          }}
          onOpenExportGroup={(group) => setExportGroupTarget(group)}
          onOpenDeleteGroup={(group) => setDeleteGroupTarget(group)}
          onOpenDeleteMarked={(marked) => setDeleteMarkedSessions(marked)}
        />

        <main
          onDragOver={(e) => {
            if (session && e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            if (!session) return;
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              const imgFiles = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name));
              if (imgFiles.length > 0) {
                const lastPage = session.pages[session.pages.length - 1];
                handleAddPages(imgFiles, lastPage?.id, false);
              }
            }
          }}
          className={`flex-1 min-w-0 max-w-7xl mx-auto px-4 lg:px-8 pb-20 relative ${session ? 'pt-0' : 'pt-2'}`}
        >
          {session ? (
            <div>
              {/* Page Grid with Unified Sticky Header & Toolbar */}
              <PageGrid
                key={session.session_id}
                sessionId={session.session_id}
                pages={session.pages}
                selectedIds={selectedPageIds}
                onSelectionChange={setSelectedPageIds}
                onReorder={handleReorder}
                onRotate={handleRotate}
                onDelete={handleDelete}
                onSetCover={handleSetCover}
                onSplitSpread={(pid) => {
                  const p = session.pages.find((item) => item.id === pid);
                  if (p) setSpreadSplitPage(p);
                }}
                onSliceWebtoon={(pid) => {
                  const p = session.pages.find((item) => item.id === pid);
                  if (p) setWebtoonSlicePage(p);
                }}
                onChapterCover={(pid) => {
                  const p = session.pages.find((item) => item.id === pid);
                  if (p) setChapterCoverPage(p);
                }}
                onView={(pid) => {
                  setInspectingPageId(pid);
                }}
                onAddPages={handleAddPages}
                onExtractChapter={(pageIds) => {
                  setExtractPageIds(pageIds);
                  setExtractInitialTab('new_chapter');
                }}
                onMovePages={(pageIds) => {
                  setExtractPageIds(pageIds);
                  setExtractInitialTab('move_to_session');
                }}
                sessionTitle={session.metadata.Series || session.original_filename}
                sessionNumber={session.metadata.Number}
                sessionVolume={session.metadata.Volume}
                canUndo={historyStack.length > 0}
                onUndo={handleUndo}
                onTransferToTomo={session.item_type === 'capitulo' ? handleTransferActiveChapterToTomo : undefined}
                onOpenImageAnalysis={() => setIsImageAnalysisOpen(true)}
              />
            </div>
          ) : (
            /* Empty State / Welcome Hero & Full-Width Staging Catalog */
            <div className="py-4 flex flex-col items-center justify-center text-center px-4 sm:px-6 md:px-8 w-full max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 mb-2">
                <img
                  src="/logo-icon.png?v=2"
                  alt="MangaKuro"
                  className="h-20 sm:h-24 w-auto object-contain drop-shadow-xl select-none shrink-0"
                />
                <div className="flex flex-col items-center sm:items-start justify-center">
                  <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-none drop-shadow-sm">
                    <span className="text-slate-900 dark:text-white">Manga</span>
                    <span className="text-indigo-600 dark:text-[#786eff]">Kuro</span>
                  </h1>
                  <p className="text-[11px] sm:text-sm font-bold tracking-[0.18em] uppercase text-slate-600 dark:text-[#8ea4c8] mt-1.5 leading-none">
                    ULTIMATE COMIC &amp; MANGA SUITE
                  </p>
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm max-w-xl mt-2 leading-relaxed">
                {t('welcome.heroDescription')}
              </p>

              {/* Full-width Sessions in Staging Catalog */}
              {sessionsList.length > 0 ? (() => {
                const tomos = sessionsList.filter((s) => isSessionTomo(s));
                const chapters = sessionsList.filter((s) => isSessionChapter(s));
                const tabList = stagingTab === 'tomos' 
                  ? tomos 
                  : stagingTab === 'chapters' 
                    ? chapters 
                    : sessionsList;
                const activeList = tabList.filter((item) => {
                  if (!dashboardSearch.trim()) return true;
                  const q = dashboardSearch.toLowerCase();
                  const seriesName = (item.series || item.original_filename || '').toLowerCase();
                  const title = (item.title || '').toLowerCase();
                  const num = (item.number || '').toLowerCase();
                  return seriesName.includes(q) || title.includes(q) || num.includes(q);
                });

                return (
                  <div className="w-full mt-6 p-4 sm:p-5 rounded-2xl bg-white dark:bg-comic-900/90 border border-slate-200 dark:border-comic-800 shadow-xl text-left">
                    {/* Catalog Header with Inline Search and Tabs */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-comic-800">
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                          <Library className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                          <span>{t('welcome.stagingReadyTitle', { count: sessionsList.length })}</span>
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {tomos.length > 0
                            ? t('welcome.stagingTomosCount', { tomos: tomos.length, chapters: chapters.length })
                            : t('welcome.stagingClickToOpen')}
                        </p>
                      </div>

                      {/* Right Toolbar: Quick Search + Filter Tabs */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Inline Search Bar */}
                        <div className="relative w-full sm:w-56 md:w-64">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={dashboardSearch}
                            onChange={(e) => setDashboardSearch(e.target.value)}
                            placeholder={t('welcome.searchPlaceholder')}
                            className="w-full pl-8 pr-7 py-1 text-xs rounded-xl bg-slate-50 dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          {dashboardSearch && (
                            <button
                              type="button"
                              onClick={() => setDashboardSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                              title={t('welcome.clearSearch')}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-comic-950/80 rounded-xl border border-slate-200 dark:border-comic-800/80 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setStagingTab('all')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                              stagingTab === 'all'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {t('welcome.filterAll', { count: sessionsList.length })}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStagingTab('tomos')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                              stagingTab === 'tomos'
                                ? 'bg-amber-600 text-white shadow'
                                : 'text-amber-700 dark:text-amber-400/90 hover:text-amber-800 dark:hover:text-amber-300'
                            }`}
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>{t('welcome.filterTomos', { count: tomos.length })}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setStagingTab('chapters')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                              stagingTab === 'chapters'
                                ? 'bg-purple-600 text-white shadow'
                                : 'text-purple-700 dark:text-purple-400/90 hover:text-purple-800 dark:hover:text-purple-300'
                            }`}
                          >
                            <Bookmark className="w-3 h-3" />
                            <span>{t('welcome.filterChapters', { count: chapters.length })}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Catalog Grid */}
                    {activeList.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-xs">
                        <p>{t('welcome.noSearchResults')}</p>
                        {dashboardSearch && (
                          <button
                            type="button"
                            onClick={() => setDashboardSearch('')}
                            className="mt-2 text-indigo-500 hover:underline font-semibold"
                          >
                            {t('welcome.clearSearch')}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 max-h-[55vh] overflow-y-auto pr-1.5 custom-scrollbar">
                        {activeList.map((item) => {
                          const isTomo = isSessionTomo(item);
                          return (
                            <div
                              key={item.session_id}
                              onClick={() => handleSelectSession(item.session_id)}
                              className={`group p-2.5 rounded-xl bg-slate-50 dark:bg-comic-950/90 border cursor-pointer transition flex flex-col items-center text-center shadow-xs hover:shadow-md relative hover:scale-[1.02] ${
                                isTomo 
                                  ? 'border-amber-400/40 dark:border-amber-600/30 hover:border-amber-500 hover:shadow-amber-500/10' 
                                  : 'border-slate-200 dark:border-comic-800 hover:border-indigo-500 hover:shadow-indigo-500/10'
                              }`}
                            >
                              <div className="w-full aspect-[2/3] bg-slate-100 dark:bg-comic-900 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700/60 mb-2 flex items-center justify-center relative">
                                {item.cover_thumb ? (
                                  <img
                                    src={getThumbUrl(item.session_id, item.cover_thumb)}
                                    alt={item.series}
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                    loading="lazy"
                                  />
                                ) : (
                                  <BookOpen className="w-7 h-7 text-slate-400 dark:text-slate-600" />
                                )}
                                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] text-white font-mono font-medium">
                                  {item.page_count} {t('common.pages')}
                                </span>
                                {isTomo && (
                                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[9px] uppercase tracking-wider shadow">
                                    {t('common.tomo')} {item.volume ? `#${item.volume}` : (item.number ? `#${item.number}` : '')}
                                  </span>
                                )}
                              </div>

                              <span className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 truncate w-full" title={item.series || item.original_filename}>
                                {item.series || item.original_filename}
                              </span>
                              
                              <div className="flex items-center gap-1.5 mt-1 text-[11px] truncate max-w-full">
                                {isTomo ? (
                                  <span className="text-amber-700 dark:text-amber-400 font-medium truncate" title={item.title || undefined}>
                                    {(() => {
                                      const hasMeaningfulTitle = Boolean(
                                        item.title &&
                                        item.title.trim().toLowerCase() !== (item.series || '').trim().toLowerCase() &&
                                        !/^(?:cap|cap[ií]tulo|ch|chapter)\.?\s*\d+/i.test(item.title.trim())
                                      );
                                      const volNum = item.volume ? `#${item.volume}` : (item.number ? `#${item.number}` : '');
                                      const tomoLabel = volNum ? `${t('common.tomo')} ${volNum}` : t('common.tomo');

                                      if (hasMeaningfulTitle) {
                                        return volNum ? `${tomoLabel} · ${item.title}` : item.title;
                                      }
                                      return tomoLabel;
                                    })()}
                                  </span>
                                ) : (
                                  <span className="text-indigo-600 dark:text-indigo-300 font-mono truncate" title={item.title || undefined}>
                                    {(() => {
                                      const hasMeaningfulTitle = Boolean(
                                        item.title &&
                                        item.title.trim().toLowerCase() !== (item.series || '').trim().toLowerCase()
                                      );
                                      const capNum = item.number ? `#${item.number}` : '';
                                      const capLabel = capNum ? `${t('common.chapter')} ${capNum}` : (item.title || t('common.chapter'));

                                      if (hasMeaningfulTitle && capNum) {
                                        return `${capLabel} · ${item.title}`;
                                      }
                                      return capLabel;
                                    })()}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="mt-8 p-6 rounded-2xl bg-slate-50 dark:bg-comic-900/40 border border-slate-200 dark:border-comic-800/80 max-w-lg text-center">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">{t('welcome.emptyTitle')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{t('welcome.emptyDesc')}</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Lightbox / Reader */}
      {isViewerOpen && session && (
        <Lightbox
          sessionId={session.session_id}
          pages={session.pages}
          initialPageId={viewingPageId}
          readingDirection={session.metadata.ReadingDirection}
          onClose={() => setIsViewerOpen(false)}
          onRotate={handleRotate}
          onDelete={(pid) => handleDelete([pid])}
        />
      )}

      {/* Page Inspector Modal (Direct single-page inspection for management) */}
      {session && inspectingPageId && (
        <PageInspectorModal
          sessionId={session.session_id}
          pages={session.pages}
          currentPageId={inspectingPageId}
          readingDirection={session.metadata.ReadingDirection}
          isOpen={Boolean(inspectingPageId)}
          isSelected={selectedPageIds.includes(inspectingPageId)}
          onToggleSelect={(pid) => {
            setSelectedPageIds((prev) =>
              prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
            );
          }}
          rangeStartPageId={inspectorRangeStartId}
          onSetRangeStart={(pid) => setInspectorRangeStartId(pid || null)}
          onSelectRangeToHere={(pid) => {
            if (!inspectorRangeStartId) return;
            const startIdx = session.pages.findIndex((p) => p.id === inspectorRangeStartId);
            const endIdx = session.pages.findIndex((p) => p.id === pid);
            if (startIdx !== -1 && endIdx !== -1) {
              const minIdx = Math.min(startIdx, endIdx);
              const maxIdx = Math.max(startIdx, endIdx);
              const rangeIds = session.pages.slice(minIdx, maxIdx + 1).map((p) => p.id);
              setSelectedPageIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
            }
            setInspectorRangeStartId(null);
          }}
          onClose={() => setInspectingPageId(null)}
          onSelectPage={(pid) => setInspectingPageId(pid)}
          onRotate={handleRotate}
          onSetCover={handleSetCover}
          onDelete={(pid) => handleDelete([pid])}
          onSplitSpread={(pid) => {
            const p = session.pages.find((item) => item.id === pid);
            if (p) setSpreadSplitPage(p);
          }}
          onSliceWebtoon={(pid) => {
            const p = session.pages.find((item) => item.id === pid);
            if (p) setWebtoonSlicePage(p);
          }}
          onOpenCustomCut={(pid, initialMode) => {
            const p = session.pages.find((item) => item.id === pid);
            if (p) {
              setCustomCutTargetPage(p);
              setCustomCutInitialMode(initialMode || ((p.height > p.width * 1.6) ? 'webtoon' : 'vertical'));
            }
          }}
          onOpenTextAnnotation={(pid) => {
            const p = session.pages.find((item) => item.id === pid);
            if (p) setTextAnnotationTargetPage(p);
          }}
          onChapterCover={(pid) => {
            const p = session.pages.find((item) => item.id === pid);
            if (p) setChapterCoverPage(p);
          }}
          onOpenFullViewer={(pid) => {
            setViewingPageId(pid);
            setInspectingPageId(null);
            setIsViewerOpen(true);
          }}
        />
      )}

      {/* Metadata Editor Drawer */}
      {session && (
        <MetadataDrawer
          key={session.session_id}
          metadata={session.metadata}
          isOpen={isMetadataOpen}
          originalFilename={session.original_filename}
          itemType={session.item_type}
          pageCount={session.pages.length}
          markedSessions={markedSessionsForMetadata || []}
          allSessions={sessionsList}
          activeSessionId={session.session_id}
          onOpenCloneModal={(currentMeta) => {
            setCloneSourceSessionId(session.session_id);
            setCloneInitialMetadata(currentMeta || session.metadata);
          }}
          onClose={() => {
            setIsMetadataOpen(false);
            setMarkedSessionsForMetadata(null);
          }}
          onSave={handleSaveMetadata}
          onBatchSave={handleBatchSaveMetadata}
          onOpenOnlineSearch={() => setIsOnlineSearchOpen(true)}
        />
      )}

      {/* Split Spread Modal */}
      <SplitSpreadModal
        sessionId={session?.session_id || ''}
        page={spreadSplitPage}
        isOpen={Boolean(spreadSplitPage)}
        onClose={() => setSpreadSplitPage(null)}
        onConfirmSplit={handleSplitSpread}
      />

      {/* Webtoon Slicer Modal */}
      <WebtoonSlicerModal
        sessionId={session?.session_id || ''}
        page={webtoonSlicePage}
        isOpen={Boolean(webtoonSlicePage)}
        onClose={() => setWebtoonSlicePage(null)}
        onConfirmSlice={handleSliceWebtoon}
      />

      {/* Custom Cut & Split Modal (Vertical Double Page, Webtoon Horizontal, Crop) */}
      {session && customCutTargetPage && (
        <CustomCutModal
          sessionId={session.session_id}
          page={customCutTargetPage}
          isOpen={Boolean(customCutTargetPage)}
          initialMode={customCutInitialMode}
          onClose={() => setCustomCutTargetPage(null)}
          onSuccess={(updated, targetPageId) => {
            pushHistory(session);
            const origIndex = session.pages.findIndex((p) => p.id === customCutTargetPage.id);
            const fallbackIdx = origIndex !== -1 ? Math.min(origIndex, updated.pages.length - 1) : 0;
            const newFocusId = targetPageId || (updated.pages[fallbackIdx]?.id ?? null);

            setSession(updated);
            setCustomCutTargetPage(null);

            // Directly open and focus the newly cut image instead of jumping to the first image
            if (newFocusId) {
              setInspectingPageId(newFocusId);
              const targetPage = updated.pages.find((p) => p.id === newFocusId);
              if (targetPage) {
                setTimeout(() => {
                  document.getElementById(`page-card-${targetPage.order}`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                  });
                }, 100);
              }
            }
            loadSessions();
          }}
        />
      )}

      {/* Translation Notes & SFX Text Annotator Modal */}
      {session && textAnnotationTargetPage && (
        <TextAnnotationModal
          sessionId={session.session_id}
          page={textAnnotationTargetPage}
          pages={session.pages}
          isOpen={Boolean(textAnnotationTargetPage)}
          onClose={() => setTextAnnotationTargetPage(null)}
          onSuccess={(updated, keepOpenPageId) => {
            pushHistory(session);
            setSession(updated);
            if (keepOpenPageId) {
              const nextPage = updated.pages.find((p) => p.id === keepOpenPageId);
              if (nextPage) {
                setTextAnnotationTargetPage(nextPage);
                setInspectingPageId(nextPage.id);
              } else {
                setTextAnnotationTargetPage(null);
              }
            } else {
              const targetId = textAnnotationTargetPage.id;
              setTextAnnotationTargetPage(null);
              setInspectingPageId(targetId);
            }
            loadSessions();
          }}
          onNavigatePage={(newPage) => {
            setTextAnnotationTargetPage(newPage);
            setInspectingPageId(newPage.id);
          }}
        />
      )}

      {/* Chapter Cover Modal */}
      {session && (
        <ChapterCoverModal
          session={session}
          targetPage={chapterCoverPage}
          isOpen={Boolean(chapterCoverPage)}
          onClose={() => setChapterCoverPage(null)}
          onSuccess={(newSession) => {
            pushHistory(session);
            setSession(newSession);
            loadSessions();
          }}
        />
      )}

      {/* Export Modal */}
      {session && isExportOpen && (
        <ExportModal
          key={`${session.session_id}-${isExportOpen}`}
          session={session}
          settings={settings}
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          onOpenImageAnalysis={() => setIsImageAnalysisOpen(true)}
          onStartBackgroundExport={handleStartBackgroundExport}
        />
      )}

      {/* Image Analysis & WebP Validation Modal */}
      {session && isImageAnalysisOpen && (
        <ImageAnalysisModal
          session={session}
          isOpen={isImageAnalysisOpen}
          onClose={() => setIsImageAnalysisOpen(false)}
          onSliceWebtoon={(pid) => {
            const p = session.pages.find((item) => item.id === pid);
            if (p) setWebtoonSlicePage(p);
          }}
          onInspectPage={(pid) => {
            setInspectingPageId(pid);
          }}
          onSliceAllWebtoons={handleSliceAllWebtoons}
          onDownscalePage={handleDownscalePage}
          onDownscaleAll={handleDownscaleAllOversized}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onUpdate={setSettings}
        onOpenDonationModal={() => setIsDonationOpen(true)}
      />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        defaultSeries={uploadDefaultSeries || undefined}
        activeSession={session}
        allSessions={sessionsList}
        onAddImagesToActiveSession={(files) => handleAddPages(files)}
        onProgressUpdate={setActiveUploadTask}
        onClose={() => {
          setIsUploadOpen(false);
          setUploadDefaultSeries(null);
        }}
        onUploadSuccess={(newSession) => {
          setSession(newSession);
          setStoredActiveSessionId(newSession.session_id);
          setHistoryStack([]);
          loadSessions();
        }}
      />

      {/* Merge Chapters Modal */}
      {mergeSessionsList && (
        <MergeChaptersModal
          isOpen={Boolean(mergeSessionsList)}
          selectedSessions={mergeSessionsList}
          onClose={() => setMergeSessionsList(null)}
          onSuccess={(newTomo) => {
            setSession(newTomo);
            setStoredActiveSessionId(newTomo.session_id);
            setHistoryStack([]);
            loadSessions();
          }}
        />
      )}

      {/* Append Chapters to Tomo Modal */}
      <AppendChaptersModal
        isOpen={isAppendChaptersOpen}
        targetTomo={appendTargetTomo}
        allSessions={sessionsList}
        initialSelectedChapterIds={appendInitialChapterIds}
        onClose={() => {
          setIsAppendChaptersOpen(false);
          setAppendTargetTomo(null);
          setAppendInitialChapterIds([]);
        }}
        onSuccess={(updatedTomo, incorporatedIds) => {
          if (incorporatedIds && incorporatedIds.length > 0) {
            setSessionsList((prev) => prev.filter((s) => !incorporatedIds.includes(s.session_id)));
            try {
              const savedOrder = getStoredSessionsOrder();
              if (savedOrder) {
                const filtered = savedOrder.filter((id) => !incorporatedIds.includes(id));
                setStoredSessionsOrder(filtered);
              }
            } catch (e) {}
          }
          setSession(updatedTomo);
          setStoredActiveSessionId(updatedTomo.session_id);
          setHistoryStack([]);
          loadSessions();
        }}
      />

      {/* Extract Chapter Modal */}
      {session && extractPageIds && (
        <ExtractChapterModal
          isOpen={Boolean(extractPageIds)}
          sourceSession={session}
          selectedPageIds={extractPageIds}
          allSessions={sessionsList}
          initialTab={extractInitialTab}
          onClose={() => setExtractPageIds(null)}
          onSuccess={async (updatedSource, targetOrNew) => {
            const sourceSessionId = session.session_id;
            setSelectedPageIds([]);

            if (updatedSource && updatedSource.pages && updatedSource.pages.length > 0) {
              // Source session still has remaining pages
              pushHistory(session);
              setSession(updatedSource);
              setStoredActiveSessionId(updatedSource.session_id);
            } else if (targetOrNew) {
              // Source session was completely transferred and deleted: switch directly to destination tomo
              setSession(targetOrNew);
              setStoredActiveSessionId(targetOrNew.session_id);
              setHistoryStack([]);
              setSessionsList((prev) => prev.filter((s) => s.session_id !== sourceSessionId));
            } else {
              setSession(null);
              setStoredActiveSessionId(null);
              setHistoryStack([]);
              setSessionsList((prev) => prev.filter((s) => s.session_id !== sourceSessionId));
            }

            // Also purge deleted session from saved order
            try {
              const savedOrder = getStoredSessionsOrder();
              if (savedOrder && (!updatedSource || !updatedSource.pages || updatedSource.pages.length === 0)) {
                const filtered = savedOrder.filter((id) => id !== sourceSessionId);
                setStoredSessionsOrder(filtered);
              }
            } catch (e) {}

            await loadSessions();
          }}
        />
      )}

      {/* Quick Rename & Type Toggle Modal */}
      {quickRenameTarget && (
        <QuickRenameModal
          isOpen={Boolean(quickRenameTarget)}
          sessionId={quickRenameTarget.session_id}
          groupSeriesName={quickRenameParentSeries || ('metadata' in quickRenameTarget ? quickRenameTarget.metadata.Series : quickRenameTarget.series) || ''}
          initialType={quickRenameTarget.item_type || 'tomo'}
          initialSeries={'metadata' in quickRenameTarget ? quickRenameTarget.metadata.Series : quickRenameTarget.series}
          initialTitle={'metadata' in quickRenameTarget ? quickRenameTarget.metadata.Title : quickRenameTarget.title}
          initialNumber={'metadata' in quickRenameTarget ? quickRenameTarget.metadata.Number : quickRenameTarget.number}
          initialVolume={'metadata' in quickRenameTarget ? quickRenameTarget.metadata.Volume : quickRenameTarget.volume}
          onClose={() => {
            setQuickRenameTarget(null);
            setQuickRenameParentSeries(null);
          }}
          onSuccess={(updated) => {
            if (session?.session_id === updated.session_id) {
              setSession(updated);
            }
            loadSessions();
          }}
        />
      )}

      {/* Clone Metadata Modal */}
      {cloneSourceSessionId && (
        <CloneMetadataModal
          isOpen={Boolean(cloneSourceSessionId)}
          sourceSessionId={cloneSourceSessionId}
          initialMetadata={cloneInitialMetadata || undefined}
          allSessions={sessionsList}
          onClose={() => {
            setCloneSourceSessionId(null);
            setCloneInitialMetadata(null);
          }}
          onCloneSuccess={async (updated) => {
            if (session) {
              const myUpdate = updated.find((s) => s.session_id === session.session_id);
              if (myUpdate) setSession(myUpdate);
            }
            await loadSessions();
          }}
        />
      )}
      {/* Online Search Modal (Metadata, Tomos/Capítulos counts & Covers) */}
      <OnlineSearchModal
        isOpen={isOnlineSearchOpen}
        onClose={() => setIsOnlineSearchOpen(false)}
        session={session}
        onUpdateMetadata={handleSaveMetadata}
        onCoverApplied={handleOnlineCoverApplied}
      />

      {/* Real-time System Performance Monitor Floating Widget */}
      <SystemMonitorWidget
        isOpen={isMonitorOpen}
        onClose={() => {
          setIsMonitorOpen(false);
          localStorage.setItem('mangajutsu_system_monitor_enabled', 'false');
          localStorage.removeItem('cbz_system_monitor_enabled');
        }}
        onCleanOrphans={handleCleanupOrphaned}
        isCleaningOrphans={isCleaningOrphans}
      />

      {/* Floating Task Widget (Upper Right Non-blocking Import/Export/Slice Progress) */}
      <FloatingTaskWidget
        exportTask={activeExportTask}
        exportQueue={exportQueue}
        uploadTask={activeUploadTask}
        sliceTask={activeSliceTask}
        onDismissExport={handleDismissExport}
        onDismissUpload={() => setActiveUploadTask(null)}
        onDismissSlice={() => setActiveSliceTask(null)}
        onOpenUploadQueue={() => setIsUploadOpen(true)}
      />
      </div>

      {/* Export Group Modal */}
      {exportGroupTarget && (
        <ExportGroupModal
          isOpen={Boolean(exportGroupTarget)}
          group={exportGroupTarget}
          settings={settings}
          onClose={() => setExportGroupTarget(null)}
          onConfirmExport={handleConfirmGroupExport}
        />
      )}

      {/* Delete Group or Selected Items Modal */}
      {(deleteGroupTarget || deleteMarkedSessions) && (
        <DeleteGroupModal
          isOpen={Boolean(deleteGroupTarget || deleteMarkedSessions)}
          group={deleteGroupTarget}
          sessions={deleteMarkedSessions}
          onClose={() => {
            setDeleteGroupTarget(null);
            setDeleteMarkedSessions(null);
          }}
          onConfirmDelete={handleConfirmBatchDeleteSessions}
        />
      )}

      {/* Persistent Bottom Bar with Version, License (GPLv3) & Coffee presets */}
      <DonationBanner 
        onOpenDonationModal={() => setIsDonationOpen(true)}
        donationUrl={settings.donation_url}
      />

      {/* Donation / Support Modal */}
      <DonationModal
        isOpen={isDonationOpen}
        onClose={() => setIsDonationOpen(false)}
        donationUrl={settings.donation_url}
      />
    </div>
  );
};

export default App;
