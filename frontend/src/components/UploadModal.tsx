import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  X, 
  UploadCloud, 
  FileText, 
  Layers, 
  BookOpen, 
  Bookmark,
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  RefreshCw,
  Trash2,
  Plus,
  Play,
  Check,
  FolderOpen,
  ArrowRight,
  Clock,
  RotateCcw,
  Minimize2,
  FolderPlus,
  HardDrive,
  Folder,
  CornerLeftUp,
  CheckSquare,
  Square,
  Search,
  Laptop
} from 'lucide-react';
import { 
  uploadComic, 
  cancelSession, 
  checkExistingSession, 
  fetchSession,
  ExistingSessionCheck, 
  ProcessingProgressInfo,
  mergeSessions,
  appendChaptersToTomo,
  browseServerFs,
  importServerFiles,
  waitForSessionReady
} from '../api';
import { SessionManifest, ComicSessionSummary, ServerFsBrowseResult, ServerFsEntry } from '../types';
import { ActiveUploadTask } from './FloatingTaskWidget';
import { isSessionTomo, cleanSeriesDisplayName } from '../utils/seriesGrouping';
import { useTranslation } from '../i18n';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (session: SessionManifest, shouldActivate?: boolean) => void;
  defaultSeries?: string;
  activeSession?: SessionManifest | null;
  allSessions?: ComicSessionSummary[];
  onAddImagesToActiveSession?: (files: File[]) => void;
  onProgressUpdate?: (task: ActiveUploadTask | null) => void;
}

export interface BatchQueueItem {
  id: string;
  file: File;
  item_type: 'tomo' | 'capitulo';
  series: string;
  number: string;
  status: 'pending' | 'uploading' | 'extracting' | 'completed' | 'error';
  uploadPercent: number;
  processingPercent: number;
  processingMessage: string;
  error?: string;
  session?: SessionManifest;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  defaultSeries,
  activeSession,
  allSessions = [],
  onAddImagesToActiveSession,
  onProgressUpdate
}) => {
  const { t } = useTranslation();
  const [assignedSeries, setAssignedSeries] = useState<string | null>(defaultSeries || null);
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [overallError, setOverallError] = useState<string | null>(null);

  // List of unique series existing in current staging library
  const existingSeriesList = useMemo(() => {
    const set = new Set<string>();
    allSessions.forEach((s) => {
      const cleaned = cleanSeriesDisplayName(s.series || s.title || s.original_filename);
      if (cleaned && cleaned !== 'Sin Serie') {
        set.add(cleaned);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSessions]);

  // Server Ingestion State
  const [activeSourceTab, setActiveSourceTab] = useState<'pc' | 'server'>('pc');
  const [serverBrowsePath, setServerBrowsePath] = useState<string>('');
  const [serverBrowseData, setServerBrowseData] = useState<ServerFsBrowseResult | null>(null);
  const [isBrowsingServer, setIsBrowsingServer] = useState<boolean>(false);
  const [serverBrowseError, setServerBrowseError] = useState<string | null>(null);
  const [selectedServerFiles, setSelectedServerFiles] = useState<Set<string>>(new Set());
  const [isImportingServer, setIsImportingServer] = useState<boolean>(false);
  const [serverImportMessage, setServerImportMessage] = useState<string | null>(null);
  const [serverItemType, setServerItemType] = useState<'auto' | 'tomo' | 'capitulo'>('auto');
  const [serverCustomSeries, setServerCustomSeries] = useState<string>(defaultSeries || '');

  const [uploadMode, setUploadMode] = useState<'individual' | 'merge_new_tomo' | 'append_to_tomo'>('individual');
  const [tomoSeriesName, setTomoSeriesName] = useState(defaultSeries || '');
  const [tomoVolumeNum, setTomoVolumeNum] = useState<number | ''>(1);
  const [targetTomoId, setTargetTomoId] = useState<string>('');

  const loadServerDirectory = async (targetPath?: string) => {
    setIsBrowsingServer(true);
    setServerBrowseError(null);
    try {
      const data = await browseServerFs(targetPath);
      setServerBrowseData(data);
      setServerBrowsePath(data.current_path);
    } catch (err: any) {
      setServerBrowseError(err.message || 'Error al explorar el directorio del servidor');
    } finally {
      setIsBrowsingServer(false);
    }
  };

  const toggleSelectServerFile = (filePath: string) => {
    setSelectedServerFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const selectAllServerFiles = () => {
    if (!serverBrowseData) return;
    setSelectedServerFiles(new Set(serverBrowseData.files.map((f) => f.path)));
  };

  const deselectAllServerFiles = () => {
    setSelectedServerFiles(new Set());
  };

  const handleImportServerSelection = async () => {
    if (selectedServerFiles.size === 0) return;
    setIsImportingServer(true);
    setServerImportMessage(`Importando ${selectedServerFiles.size} archivo(s) desde el disco del servidor...`);
    try {
      const result = await importServerFiles({
        file_paths: Array.from(selectedServerFiles),
        item_type: serverItemType,
        custom_series: serverCustomSeries || assignedSeries || undefined
      });

      if (result.success && result.imported.length > 0) {
        setServerImportMessage(`Extrayendo ${result.imported.length} cómic(s)...`);
        try {
          const firstSession = await waitForSessionReady(result.imported[0].session_id, (p) => {
            setServerImportMessage(`Extrayendo ${result.imported[0].filename} (${p.percent}%): ${p.message}`);
          });
          onUploadSuccess(firstSession, !activeSession);
          onClose();
          return;
        } catch (err: any) {
          console.warn('Extracción en segundo plano en progreso:', err);
        }
        onClose();
      } else {
        setServerBrowseError((result.errors && result.errors.join(', ')) || 'No se pudo importar ningún archivo');
      }
    } catch (err: any) {
      setServerBrowseError(err.message || 'Error al importar archivos');
    } finally {
      setIsImportingServer(false);
    }
  };

  const availableTomos = useMemo(() => {
    return allSessions.filter((s) => isSessionTomo(s));
  }, [allSessions]);

  useEffect(() => {
    if (availableTomos.length > 0 && !targetTomoId) {
      const activeTomo = availableTomos.find((t) => t.session_id === activeSession?.session_id);
      setTargetTomoId(activeTomo ? activeTomo.session_id : availableTomos[0].session_id);
    }
  }, [availableTomos, activeSession, targetTomoId]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelProcessingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setAssignedSeries(defaultSeries || null);
      setTomoSeriesName(defaultSeries || '');
      setIsMinimized(false);
      setUploadMode('individual');
      if (!isProcessing) {
        setQueue((prev) => {
          if (prev.length > 0 && prev.every((item) => item.status === 'completed' || item.status === 'error')) {
            return [];
          }
          return prev;
        });
        setOverallError(null);
      }
    }
  }, [isOpen, defaultSeries, isProcessing]);

  // Keep alive in background while processing
  if (!isOpen && !isProcessing) return null;
  if (isMinimized) return null;

  const extractSeriesCandidate = (fname: string): string => {
    let clean = fname.replace(/\.[^/.]+$/, '');
    clean = clean.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').trim();
    const numMatch = clean.match(/\b(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)\.?\s*(\d+(?:\.\d+)?)/i) || clean.match(/\b(\d{1,4}(?:\.\d+)?)\b/);
    if (numMatch) {
      const idx = clean.indexOf(numMatch[0]);
      if (idx > 0) {
        clean = clean.substring(0, idx).trim();
      } else if (idx === 0) {
        // Starts with the chapter/volume marker (e.g. "Cap 168", "c12", "01") -> no series in filename!
        clean = '';
      }
    }
    clean = clean.replace(/^\s*(?:c|ch|cap|#)?\s*\d{1,4}(?:\.\d+)?\s*[-_.:\s]\s*/i, '').trim();
    clean = clean.replace(/\s*(?:#|v|vol|volume|tomo|c|ch|cap|capitulo|chapter)\.?\s*\d+(?:[-–_]\d+)?.*$/i, '').trim();
    clean = clean.replace(/\s+(?:tomo|tomos|vol|volume|volumes|cap|capitulo|capitulos|chapter|chapters|ch)\.?\s*$/i, '').trim();
    clean = clean.replace(/\s+\d{1,4}(?:[-–_]\d+)?\s*$/i, '').trim();
    clean = clean.replace(/^[-_.:\s]+|[-_.:\s]+$/g, '').trim();

    if (!clean || /^(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)?\s*\d+(?:\.\d+)?$/i.test(clean)) {
      return '';
    }
    const res = cleanSeriesDisplayName(clean);
    return res !== 'Sin Serie' ? res : '';
  };

  const guessFromFilename = (fname: string, seriesOverride?: string | null) => {
    const isVol = /\b(v|vol|volume|tomo)\.?\s*(\d+)/i.test(fname);
    const type: 'tomo' | 'capitulo' = isVol ? 'tomo' : 'capitulo';

    let num = '';
    const numMatch = fname.match(/\b(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)\.?\s*(\d+(?:\.\d+)?)/i) || fname.match(/\b(\d{1,4}(?:\.\d+)?)\b/);
    if (numMatch) num = numMatch[1];

    const cand = extractSeriesCandidate(fname);
    const activeSeries = seriesOverride !== undefined ? seriesOverride : assignedSeries;
    const activeFallback = activeSession?.metadata?.Series ? cleanSeriesDisplayName(activeSession.metadata.Series) : '';
    const fallbackSeries = activeFallback !== 'Sin Serie' ? activeFallback : '';
    const finalSeries = activeSeries || cand || fallbackSeries || 'Cómic';

    return { type, series: finalSeries, number: num };
  };

  const handleApplySeriesToAll = (newSeriesName: string) => {
    const trimmed = newSeriesName.trim();
    setAssignedSeries(trimmed || null);
    if (trimmed) setTomoSeriesName(trimmed);
    setQueue((prev) =>
      prev.map((item) => {
        if (item.status === 'pending') {
          return { ...item, series: trimmed || extractSeriesCandidate(item.file.name) || 'Cómic' };
        }
        return item;
      })
    );
  };

  const handleSwitchToNewGroup = () => {
    setAssignedSeries(null);
    setTomoSeriesName('');
    setQueue((prev) =>
      prev.map((item) => {
        if (item.status === 'pending') {
          const cand = extractSeriesCandidate(item.file.name);
          return { ...item, series: cand || 'Cómic' };
        }
        return item;
      })
    );
  };

  const addFilesToQueue = (files: FileList | File[]) => {
    const validExtensions = ['.cbz', '.cbr', '.cb7', '.cbt', '.zip', '.rar', '.7z', '.tar', '.pdf', '.epub'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];
    const comicFiles: File[] = [];
    const imageFiles: File[] = [];

    Array.from(files).forEach((file) => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (validExtensions.includes(ext)) {
        comicFiles.push(file);
      } else if (imageExtensions.includes(ext) || file.type.startsWith('image/')) {
        imageFiles.push(file);
      }
    });

    // If loose images were dropped and an active comic is selected
    if (imageFiles.length > 0 && activeSession && onAddImagesToActiveSession) {
      const comicName = activeSession.metadata.Series || activeSession.original_filename;
      if (window.confirm(`Se han detectado ${imageFiles.length} imagen(es). ¿Deseas añadirlas directamente como páginas al cómic seleccionado "${comicName}"?`)) {
        onAddImagesToActiveSession(imageFiles);
        onClose();
        return;
      }
    }

    // 1. Detect if any file in the incoming batch has a valid series name
    let detectedBatchSeries = '';
    for (const file of comicFiles) {
      const cand = extractSeriesCandidate(file.name);
      if (cand) {
        detectedBatchSeries = cand;
        break;
      }
    }

    // Series fallback hierarchy:
    // 1. assignedSeries (explicitly assigned or selected)
    // 2. detectedBatchSeries (from one of the files in this batch)
    // 3. activeSession series (if user has a comic open)
    // 4. defaultSeries
    const activeFallback = activeSession?.metadata?.Series ? cleanSeriesDisplayName(activeSession.metadata.Series) : '';
    const fallbackSeries = assignedSeries || detectedBatchSeries || (activeFallback !== 'Sin Serie' ? activeFallback : '') || defaultSeries || '';

    // If assignedSeries wasn't set yet and a valid series is found, assign it globally
    if (!assignedSeries && fallbackSeries && fallbackSeries !== 'Sin Serie') {
      setAssignedSeries(fallbackSeries);
      if (!tomoSeriesName) {
        setTomoSeriesName(fallbackSeries);
      }
    }

    const newItems: BatchQueueItem[] = [];

    comicFiles.forEach((file) => {
      const cand = extractSeriesCandidate(file.name);
      const isVol = /\b(v|vol|volume|tomo)\.?\s*(\d+)/i.test(file.name);
      const type: 'tomo' | 'capitulo' = isVol ? 'tomo' : 'capitulo';

      let num = '';
      const numMatch = file.name.match(/\b(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)\.?\s*(\d+(?:\.\d+)?)/i) || file.name.match(/\b(\d{1,4}(?:\.\d+)?)\b/);
      if (numMatch) num = numMatch[1];

      // Item series: prefer assignedSeries -> cand -> fallbackSeries -> 'Cómic'
      const itemSeries = assignedSeries || cand || fallbackSeries || 'Cómic';

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        item_type: type,
        series: itemSeries,
        number: num,
        status: 'pending',
        uploadPercent: 0,
        processingPercent: 0,
        processingMessage: 'En cola de espera...'
      });
    });

    if (newItems.length === 0 && imageFiles.length === 0) {
      setOverallError('Ningún archivo compatible encontrado. Se admiten cómics (.CBZ, .CBR, .7Z, .CB7, .ZIP, .RAR, .CBT, .TAR, .PDF, .EPUB) o imágenes sueltas (.JPG, .PNG, .WEBP).');
      return;
    }

    setOverallError(null);
    setQueue((prev) => {
      const updated = [...prev, ...newItems];
      if (newItems[0]?.series && !tomoSeriesName) {
        setTomoSeriesName(newItems[0].series);
      }
      return updated;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleRemoveFromQueue = (id: string) => {
    if (isProcessing) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<BatchQueueItem>) => {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
  };

  const startBatchProcessing = async () => {
    if (queue.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setIsMinimized(true);
    onClose();
    cancelProcessingRef.current = false;
    setOverallError(null);

    const completedSessions: SessionManifest[] = [];

    for (let i = 0; i < queue.length; i++) {
      if (cancelProcessingRef.current) break;

      const currentItem = queue[i];
      if (currentItem.status === 'completed') {
        if (currentItem.session) completedSessions.push(currentItem.session);
        continue;
      }

      setCurrentIndex(i);

      // Set to uploading
      setQueue((prev) => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'uploading', uploadPercent: 0, processingMessage: 'Subiendo archivo al servidor...' } : item
      ));

      onProgressUpdate?.({
        id: 'upload-batch',
        totalFiles: queue.length,
        currentIndex: i,
        currentFileName: currentItem.file.name,
        itemTitle: currentItem.series || currentItem.file.name,
        percent: 0,
        status: 'uploading',
        message: 'Subiendo archivo al servidor...',
        isCompleted: false
      });

      try {
        const uploadItemType = uploadMode === 'merge_new_tomo' ? 'capitulo' : currentItem.item_type;

        const session = await uploadComic(
          currentItem.file,
          (uploadPct) => {
            onProgressUpdate?.({
              id: 'upload-batch',
              totalFiles: queue.length,
              currentIndex: i,
              currentFileName: currentItem.file.name,
              itemTitle: currentItem.series || currentItem.file.name,
              percent: uploadPct,
              status: uploadPct >= 100 ? 'extracting' : 'uploading',
              message: uploadPct >= 100 ? 'Extrayendo páginas...' : `Subiendo... ${uploadPct}%`,
              isCompleted: false
            });
            setQueue((prev) => prev.map((item, idx) => 
              idx === i ? { 
                ...item, 
                uploadPercent: uploadPct, 
                status: uploadPct >= 100 ? 'extracting' : 'uploading',
                processingMessage: uploadPct >= 100 ? 'Extrayendo páginas...' : `Subiendo... ${uploadPct}%`
              } : item
            ));
          },
          (procInfo) => {
            onProgressUpdate?.({
              id: 'upload-batch',
              totalFiles: queue.length,
              currentIndex: i,
              currentFileName: currentItem.file.name,
              itemTitle: currentItem.series || currentItem.file.name,
              percent: procInfo.percent,
              status: 'extracting',
              message: procInfo.message || `Página ${procInfo.current} de ${procInfo.total}`,
              isCompleted: false
            });
            setQueue((prev) => prev.map((item, idx) => 
              idx === i ? { 
                ...item, 
                status: 'extracting', 
                processingPercent: procInfo.percent,
                processingMessage: procInfo.message || `Página ${procInfo.current} de ${procInfo.total}`
              } : item
            ));
          },
          {
            item_type: uploadItemType,
            custom_series: currentItem.series.trim(),
            custom_number: currentItem.number.trim()
          }
        );

        // Mark completed
        setQueue((prev) => prev.map((item, idx) => 
          idx === i ? { 
            ...item, 
            status: 'completed', 
            uploadPercent: 100, 
            processingPercent: 100, 
            processingMessage: '¡Completado con éxito!',
            session 
          } : item
        ));

        completedSessions.push(session);

        // If in individual mode, notify parent immediately so it shows up in real-time in sidebar
        if (uploadMode === 'individual') {
          const shouldActivate = !activeSession && queue.length === 1;
          onUploadSuccess(session, shouldActivate);
        }

      } catch (err: any) {
        console.error(`Error uploading item ${currentItem.file.name}:`, err);
        onProgressUpdate?.({
          id: 'upload-batch',
          totalFiles: queue.length,
          currentIndex: i,
          currentFileName: currentItem.file.name,
          itemTitle: currentItem.series || currentItem.file.name,
          percent: 0,
          status: 'error',
          message: err.message || 'Error durante la subida o extracción',
          isCompleted: false,
          error: err.message
        });
        setQueue((prev) => prev.map((item, idx) => 
          idx === i ? { 
            ...item, 
            status: 'error', 
            error: err.message || 'Error durante la subida o extracción' 
          } : item
        ));
      }
    }

    // Post-processing for batch compilation modes
    if (!cancelProcessingRef.current && completedSessions.length > 0) {
      if (uploadMode === 'merge_new_tomo' && completedSessions.length >= 2) {
        try {
          const merged = await mergeSessions({
            source_session_ids: completedSessions.map((s) => s.session_id),
            target_series: tomoSeriesName.trim() || defaultSeries || 'Manga',
            target_volume: tomoVolumeNum === '' ? undefined : Number(tomoVolumeNum),
            delete_sources: true
          });
          onUploadSuccess(merged, !activeSession);
          onClose();
        } catch (err: any) {
          console.error('Error merging uploaded chapters:', err);
          setOverallError(`Error al compilar capítulos en tomo: ${err.message}`);
        }
      } else if (uploadMode === 'append_to_tomo' && targetTomoId && completedSessions.length >= 1) {
        try {
          const appended = await appendChaptersToTomo(
            targetTomoId,
            completedSessions.map((s) => s.session_id),
            true
          );
          onUploadSuccess(appended, !activeSession);
          onClose();
        } catch (err: any) {
          console.error('Error appending uploaded chapters:', err);
          setOverallError(`Error al incorporar capítulos al tomo: ${err.message}`);
        }
      } else if (uploadMode === 'merge_new_tomo' && completedSessions.length === 1) {
        onUploadSuccess(completedSessions[0], !activeSession);
      }

      onProgressUpdate?.({
        id: 'upload-batch',
        totalFiles: queue.length,
        currentIndex: queue.length - 1,
        currentFileName: '',
        itemTitle: `${completedSessions.length} cómics listos`,
        percent: 100,
        status: 'completed',
        message: '¡Importación finalizada con éxito!',
        isCompleted: true
      });
    }

    setIsProcessing(false);
    setCurrentIndex(-1);
    if (cancelProcessingRef.current || !isOpen || isMinimized) {
      setQueue([]);
    }
  };

  const handleStopProcessing = () => {
    cancelProcessingRef.current = true;
    setIsProcessing(false);
    onProgressUpdate?.(null);
  };

  const handleClose = () => {
    if (isProcessing) {
      setIsMinimized(true);
      onClose();
      return;
    }
    setQueue([]);
    setOverallError(null);
    onClose();
  };

  const completedCount = queue.filter((item) => item.status === 'completed').length;
  const isAllFinished = queue.length > 0 && queue.every((item) => item.status === 'completed' || item.status === 'error');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/90 dark:bg-comic-950/90 border-b border-slate-200 dark:border-comic-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t('upload.modalTitle')}</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-bold">
                  {queue.length > 0 ? t('upload.queueCount', { count: queue.length }) : t('upload.batchOrSingle')}
                </span>
              </h3>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {assignedSeries ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-indigo-600 dark:text-indigo-300 font-semibold">
                      {t('upload.assigningTo')} <strong>{assignedSeries}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSwitchToNewGroup}
                      className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-indigo-300 dark:hover:text-white border border-indigo-200 dark:border-indigo-700/60 text-[10px] font-semibold transition active:scale-95 flex items-center gap-1 shadow-xs"
                      title={t('upload.switchToNewGroupTitle')}
                    >
                      <FolderPlus className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      <span>{t('upload.switchToNewGroup')}</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t('upload.newGroupActive')} • {t('upload.dropzoneDesc')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isProcessing && (
              <button
                type="button"
                onClick={() => {
                  setIsMinimized(true);
                  onClose();
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-indigo-400 dark:hover:text-indigo-300 border border-slate-300 dark:border-indigo-700/60 transition flex items-center gap-1 text-xs font-semibold"
                title={t('upload.minimizeTitle')}
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>{t('upload.minimize')}</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
              aria-label={t('upload.closeModal')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Source Tab Switcher: Subir desde PC vs Explorar Servidor / NAS */}
        <div className="flex border-b border-slate-200 dark:border-comic-800 bg-slate-100/70 dark:bg-comic-950/50 px-6 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSourceTab('pc')}
            className={`flex items-center gap-2 pb-2.5 px-4 text-xs font-bold border-b-2 transition ${
              activeSourceTab === 'pc'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Subir desde mi PC</span>
            {queue.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px]">
                {queue.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSourceTab('server');
              if (!serverBrowseData && !isBrowsingServer) {
                loadServerDirectory();
              }
            }}
            className={`flex items-center gap-2 pb-2.5 px-4 text-xs font-bold border-b-2 transition ${
              activeSourceTab === 'server'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Explorar Servidor / NAS</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 font-bold border border-emerald-500/20">
              Directo
            </span>
          </button>
        </div>

        {/* Global Error Banner */}
        {overallError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{overallError}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeSourceTab === 'server' ? (
            <div className="space-y-4">
              {/* Quick Roots Shortcuts */}
              {serverBrowseData?.quick_roots && serverBrowseData.quick_roots.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-indigo-400" />
                    <span>Accesos rápidos:</span>
                  </span>
                  {serverBrowseData.quick_roots.map((qr) => (
                    <button
                      key={qr.path}
                      type="button"
                      onClick={() => loadServerDirectory(qr.path)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                        serverBrowseData.current_path === qr.path
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-slate-300 border-slate-300 dark:border-comic-700'
                      }`}
                    >
                      {qr.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Path Navigation Bar */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-comic-950 border border-slate-200 dark:border-comic-800">
                <button
                  type="button"
                  disabled={!serverBrowseData?.parent_path || isBrowsingServer}
                  onClick={() => serverBrowseData?.parent_path && loadServerDirectory(serverBrowseData.parent_path)}
                  className="p-1.5 rounded-lg bg-white dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-comic-700 transition"
                  title="Subir un nivel"
                >
                  <CornerLeftUp className="w-4 h-4" />
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    loadServerDirectory(serverBrowsePath);
                  }}
                  className="flex-1 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={serverBrowsePath}
                    onChange={(e) => setServerBrowsePath(e.target.value)}
                    placeholder="Ruta en el servidor (ej: /comics_library, E:\Manga...)"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isBrowsingServer}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shrink-0"
                  >
                    Ir
                  </button>
                </form>

                <button
                  type="button"
                  disabled={isBrowsingServer}
                  onClick={() => loadServerDirectory(serverBrowsePath)}
                  className="p-1.5 rounded-lg bg-white dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-comic-700 transition shrink-0"
                  title="Actualizar directorio"
                >
                  <RefreshCw className={`w-4 h-4 ${isBrowsingServer ? 'animate-spin text-indigo-400' : ''}`} />
                </button>
              </div>

              {/* Server Browse Error */}
              {serverBrowseError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{serverBrowseError}</span>
                </div>
              )}

              {/* Subdirectories Grid */}
              {serverBrowseData?.directories && serverBrowseData.directories.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Carpetas ({serverBrowseData.directories.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {serverBrowseData.directories.map((dir) => (
                      <button
                        key={dir.path}
                        type="button"
                        onClick={() => loadServerDirectory(dir.path)}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/50 dark:bg-comic-950/60 dark:hover:bg-comic-800 border border-slate-200 dark:border-comic-800 hover:border-indigo-400 transition text-left group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder className="w-4 h-4 text-amber-500 shrink-0 group-hover:scale-110 transition" />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {dir.name}
                          </span>
                        </div>
                        {dir.comic_count !== undefined && dir.comic_count > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                            {dir.comic_count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Comic Archives List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Archivos de cómic ({serverBrowseData?.files?.length || 0})
                  </div>
                  {serverBrowseData?.files && serverBrowseData.files.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllServerFiles}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold text-[11px]"
                      >
                        Seleccionar todos
                      </button>
                      <span className="text-slate-400">•</span>
                      <button
                        type="button"
                        onClick={deselectAllServerFiles}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-semibold text-[11px]"
                      >
                        Deseleccionar
                      </button>
                    </div>
                  )}
                </div>

                {serverBrowseData?.files && serverBrowseData.files.length > 0 ? (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {serverBrowseData.files.map((file) => {
                      const isSelected = selectedServerFiles.has(file.path);
                      return (
                        <div
                          key={file.path}
                          onClick={() => toggleSelectServerFile(file.path)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition select-none ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600'
                              : 'bg-white dark:bg-comic-950/60 border-slate-200 dark:border-comic-800 hover:border-slate-300 dark:hover:border-comic-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </div>
                            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {file.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {file.size_mb} MB
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 dark:bg-comic-800 text-slate-600 dark:text-slate-300">
                              {file.extension?.replace('.', '') || 'CBZ'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  !isBrowsingServer && (
                    <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-comic-800 text-slate-500 dark:text-slate-400 text-xs">
                      No se encontraron archivos de cómic soportados (.cbz, .cbr, .pdf, .zip, etc.) en esta carpeta.
                    </div>
                  )
                )}
              </div>

              {/* Import Configuration & Action Bar */}
              {selectedServerFiles.size > 0 && (
                <div className="p-4 rounded-xl bg-indigo-50/90 dark:bg-comic-950 border border-indigo-200 dark:border-indigo-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{selectedServerFiles.size} cómic(s) seleccionados para importar</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Se crearán directamente en el área de preparación copiando desde el disco del servidor sin consumir red.
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={serverItemType}
                        onChange={(e) => setServerItemType(e.target.value as any)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="auto">Auto-detectar</option>
                        <option value="tomo">Tomos</option>
                        <option value="capitulo">Capítulos</option>
                      </select>
                    </div>
                  </div>

                  {serverImportMessage && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-comic-900 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-indigo-500" />
                      <span>{serverImportMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isImportingServer}
                      onClick={handleImportServerSelection}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95"
                    >
                      {isImportingServer ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Importando...</span>
                        </>
                      ) : (
                        <>
                          <HardDrive className="w-4 h-4" />
                          <span>Importar {selectedServerFiles.size} cómic(s) al Gestor</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : queue.length === 0 ? (
            /* Dropzone Empty State */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[0.99]'
                  : 'border-slate-300 dark:border-comic-700/80 hover:border-indigo-500/60 bg-slate-50 dark:bg-comic-950/40 hover:bg-slate-100 dark:hover:bg-comic-950/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".cbz,.cbr,.cb7,.7z,.cbt,.tar,.zip,.rar,.pdf,.epub"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    addFilesToQueue(e.target.files);
                  }
                }}
              />

              <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-600/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/10">
                <UploadCloud className="w-8 h-8" />
              </div>

              <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                {t('uploadModal.dropTitle')}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mb-5 leading-relaxed">
                {t('uploadModal.dropDesc')}
              </p>

              <div className="flex items-center gap-3">
                <span className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition active:scale-95 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>{t('uploadModal.selectFilesBtn')}</span>
                </span>
              </div>
            </div>
          ) : (
            /* Queue Table & Batch List */
            <div className="space-y-4">
              {/* Batch Overview & Add More Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-comic-950 border border-comic-800">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-300">
                    <strong>{queue.length}</strong> {t('uploadModal.filesPrepared', { count: queue.length, plural: queue.length > 1 ? 's' : '' })}
                    {completedCount > 0 && (
                      <span className="text-emerald-400 font-semibold ml-2">
                        {t('uploadModal.filesCompleted', { count: completedCount, plural: completedCount > 1 ? 's' : '' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".cbz,.cbr,.cb7,.7z,.cbt,.tar,.zip,.rar,.pdf,.epub"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        addFilesToQueue(e.target.files);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-comic-850 hover:bg-comic-800 disabled:opacity-50 text-slate-200 text-xs font-semibold border border-comic-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('uploadModal.addMoreFiles')}</span>
                  </button>

                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={() => setQueue([])}
                      className="px-2.5 py-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 text-xs font-medium transition"
                      title={t('uploadModal.clearList')}
                    >
                      {t('uploadModal.clearList')}
                    </button>
                  )}
                </div>
              </div>

              {/* Upload Mode Selector (When uploading 1 or more files) */}
              <div className="p-3.5 bg-comic-950/90 border border-comic-800 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>¿Cómo organizar estos {queue.length} archivo(s)?</span>
                  </span>

                  {/* Bulk Set Type buttons */}
                  {!isProcessing && (
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-500 text-[10px] mr-1">Marcar todos:</span>
                      <button
                        type="button"
                        onClick={() => setQueue((prev) => prev.map((item) => ({ ...item, item_type: 'capitulo' })))}
                        className="px-2 py-0.5 rounded bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 text-purple-300 text-[10px] font-bold transition"
                      >
                        Capítulos
                      </button>
                      <button
                        type="button"
                        onClick={() => setQueue((prev) => prev.map((item) => ({ ...item, item_type: 'tomo' })))}
                        className="px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-700/60 text-amber-300 text-[10px] font-bold transition"
                      >
                        Tomos
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setUploadMode('individual')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                      uploadMode === 'individual'
                        ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500/50 shadow-md'
                        : 'bg-comic-900/60 border-comic-800 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-300">
                      <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Capítulos / Tomos individuales</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Crea sesiones independientes para cada archivo (recomendado).
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setUploadMode('merge_new_tomo');
                      if (!tomoSeriesName && queue[0]?.series) {
                        setTomoSeriesName(queue[0].series);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                      uploadMode === 'merge_new_tomo'
                        ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/50 shadow-md'
                        : 'bg-comic-900/60 border-comic-800 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Unir en un solo Tomo</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Compila todos los capítulos en un único volumen recopilatorio.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing || availableTomos.length === 0}
                    onClick={() => setUploadMode('append_to_tomo')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 ${
                      availableTomos.length === 0 
                        ? 'opacity-40 cursor-not-allowed bg-comic-900/30 border-comic-800' 
                        : uploadMode === 'append_to_tomo'
                          ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500/50 shadow-md cursor-pointer'
                          : 'bg-comic-900/60 border-comic-800 hover:border-comic-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-300">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir a Tomo existente</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {availableTomos.length === 0 
                        ? 'No hay tomos cargados en el área de preparación.' 
                        : 'Inserta las páginas al final de un Tomo ya cargado.'}
                    </p>
                  </button>
                </div>

                {/* Sub-options for Merge New Tomo */}
                {uploadMode === 'merge_new_tomo' && (
                  <div className="p-2.5 bg-amber-950/20 border border-amber-500/30 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs animate-in fade-in">
                    <div>
                      <label className="text-[10px] font-bold text-amber-200 mb-0.5 block">Nombre de Serie:</label>
                      <input
                        type="text"
                        value={tomoSeriesName}
                        onChange={(e) => setTomoSeriesName(e.target.value)}
                        placeholder="Ej. Bleach, Naruto..."
                        className="w-full bg-comic-900 border border-comic-700 rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-amber-200 mb-0.5 block">Número de Tomo (Vol):</label>
                      <input
                        type="number"
                        min="1"
                        value={tomoVolumeNum}
                        onChange={(e) => setTomoVolumeNum(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
                        className="w-full bg-comic-900 border border-comic-700 rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Sub-options for Append to Existing Tomo */}
                {uploadMode === 'append_to_tomo' && availableTomos.length > 0 && (
                  <div className="p-2.5 bg-indigo-950/20 border border-indigo-500/30 rounded-lg text-xs animate-in fade-in">
                    <label className="text-[10px] font-bold text-indigo-200 mb-0.5 block">Selecciona el Tomo destino:</label>
                    <select
                      value={targetTomoId}
                      onChange={(e) => setTargetTomoId(e.target.value)}
                      className="w-full bg-comic-900 border border-comic-700 rounded px-2 py-1.5 text-white text-xs"
                    >
                      {availableTomos.map((t) => {
                        const sName = cleanSeriesDisplayName(t.series || t.original_filename);
                        const volPart = t.volume ? ` [Vol. ${t.volume}]` : '';
                        const titlePart = t.title && t.title.trim().toLowerCase() !== sName.trim().toLowerCase()
                          ? ` — "${t.title.trim()}"`
                          : t.original_filename && t.original_filename !== sName
                            ? ` — ${t.original_filename}`
                            : '';
                        return (
                          <option key={t.session_id} value={t.session_id}>
                            📚 {sName}{volPart}{titlePart} ({t.page_count} págs)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              {/* Global Batch Series Selector & Quick Assigner */}
              <div className="p-3.5 bg-slate-100/90 dark:bg-comic-950/90 border border-slate-200 dark:border-comic-800 rounded-xl space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <FolderPlus className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <span>Serie asignada para toda la cola:</span>
                  </div>
                  {assignedSeries && !isProcessing && (
                    <button
                      type="button"
                      onClick={() => handleApplySeriesToAll('')}
                      className="text-[11px] text-slate-500 hover:text-rose-400 dark:text-slate-400 dark:hover:text-rose-300 transition underline underline-offset-2"
                    >
                      Restablecer detección por archivo
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={isProcessing}
                    list="batch-existing-series-list"
                    value={assignedSeries || ''}
                    onChange={(e) => handleApplySeriesToAll(e.target.value)}
                    placeholder="Escribe o selecciona la serie para todos los archivos (ej: Ao No Exorcist)..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-semibold shadow-xs"
                  />
                  <datalist id="batch-existing-series-list">
                    {existingSeriesList.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  {assignedSeries && !isProcessing && (
                    <button
                      type="button"
                      onClick={() => handleApplySeriesToAll(assignedSeries)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shrink-0 active:scale-95 shadow-xs"
                    >
                      Aplicar a todos
                    </button>
                  )}
                </div>

                {/* Quick Series Badges from Library */}
                {existingSeriesList.length > 0 && !isProcessing && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Series en biblioteca:</span>
                    {existingSeriesList.slice(0, 8).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleApplySeriesToAll(s)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition active:scale-95 ${
                          assignedSeries?.toLowerCase() === s.toLowerCase()
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                            : 'bg-white dark:bg-comic-900 hover:bg-indigo-50 dark:hover:bg-comic-800 text-indigo-700 dark:text-indigo-300 border-slate-200 dark:border-comic-700'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Progress Summary if Processing */}
              {isProcessing && (
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/50 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-indigo-300 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                      Procesando lote: Archivo {currentIndex + 1} de {queue.length}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {Math.round(((currentIndex) / queue.length) * 100)}% general
                    </span>
                  </div>
                  <div className="w-full bg-comic-950 rounded-full h-2 overflow-hidden border border-comic-800">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${Math.round(((currentIndex) / queue.length) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {queue.map((item, index) => {
                  const isCurrent = isProcessing && currentIndex === index;
                  const isDone = item.status === 'completed';
                  const isErr = item.status === 'error';
                  const isBusy = item.status === 'uploading' || item.status === 'extracting';

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition flex flex-col gap-2.5 ${
                        isCurrent
                          ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500/40'
                          : isDone
                            ? 'bg-emerald-950/20 border-emerald-800/60'
                            : isErr
                              ? 'bg-rose-950/30 border-rose-800/80'
                              : 'bg-comic-950/70 border-comic-800/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* File Details */}
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            isDone 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : isErr 
                                ? 'bg-rose-500/20 text-rose-400' 
                                : isBusy 
                                  ? 'bg-indigo-500/20 text-indigo-400' 
                                  : 'bg-comic-850 text-slate-400'
                          }`}>
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : isErr ? (
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                            ) : isBusy ? (
                              <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-white truncate font-mono">
                                {item.file.name}
                              </p>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                ({(item.file.size / (1024 * 1024)).toFixed(1)} MB)
                              </span>
                            </div>

                            {/* Status message */}
                            <p className={`text-[11px] mt-0.5 ${
                              isDone ? 'text-emerald-400 font-medium' : isErr ? 'text-rose-400' : isBusy ? 'text-indigo-300 font-semibold' : 'text-slate-400'
                            }`}>
                              {item.processingMessage}
                            </p>
                          </div>
                        </div>

                        {/* Right: Quick actions / remove */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Type toggle: Tomo vs Capitulo */}
                          <div className="flex items-center rounded-lg bg-comic-900 border border-comic-800 p-0.5">
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleUpdateItem(item.id, { item_type: 'tomo' })}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                                item.item_type === 'tomo'
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title={t('uploadModal.setToTomo')}
                            >
                              {t('common.tomo')}
                            </button>
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleUpdateItem(item.id, { item_type: 'capitulo' })}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                                item.item_type === 'capitulo'
                                  ? 'bg-amber-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title={t('uploadModal.setToChapter')}
                            >
                              {t('common.chapter')}
                            </button>
                          </div>

                          {!isProcessing && !isDone && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFromQueue(item.id)}
                              className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition"
                              title={t('uploadModal.removeFromQueue')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Series & Number editable inline */}
                      {!isDone && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-comic-850/60">
                          <div className="sm:col-span-2 flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-semibold shrink-0">{t('uploadModal.seriesLabel')}</span>
                            <input
                              type="text"
                              disabled={isProcessing}
                              value={item.series}
                              onChange={(e) => handleUpdateItem(item.id, { series: e.target.value })}
                              placeholder={t('uploadModal.seriesPlaceholder')}
                              className="w-full px-2.5 py-1 rounded-lg bg-comic-900 border border-comic-800 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                              {item.item_type === 'tomo' ? t('uploadModal.volLabel') : t('uploadModal.capLabel')}
                            </span>
                            <input
                              type="text"
                              disabled={isProcessing}
                              value={item.number}
                              onChange={(e) => handleUpdateItem(item.id, { number: e.target.value })}
                              placeholder={item.item_type === 'tomo' ? '1' : '01'}
                              className="w-full px-2 py-1 rounded-lg bg-comic-900 border border-comic-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                            />
                          </div>
                        </div>
                      )}

                      {/* Active Progress Bar */}
                      {isBusy && (
                        <div className="w-full space-y-1 pt-1">
                          <div className="w-full bg-comic-900 rounded-full h-1.5 overflow-hidden border border-comic-800">
                            <div 
                              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                              style={{ 
                                width: `${item.status === 'uploading' ? item.uploadPercent : item.processingPercent}%` 
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>
                              {item.status === 'uploading' 
                                ? t('uploadModal.uploadingBatch', { pct: item.uploadPercent }) 
                                : t('uploadModal.extractingPagesBatch', { pct: item.processingPercent })}
                            </span>
                            <span className="font-mono">
                              {item.status === 'uploading' ? `${item.uploadPercent}%` : `${item.processingPercent}%`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-comic-950/90 border-t border-comic-800 flex items-center justify-between shrink-0">
          <div>
            {isAllFinished && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t('uploadModal.allFilesProcessed')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMinimized(true);
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/30 active:scale-95"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>{t('uploadModal.minimizeAndContinue')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopProcessing}
                  className="px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold transition"
                >
                  {t('uploadModal.stopBatch')}
                </button>
              </div>
            ) : isAllFinished ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQueue([]);
                    setOverallError(null);
                    setUploadMode('individual');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('uploadModal.addAnotherTomo')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
                >
                  {t('uploadModal.closeAndView')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
              >
                {t('common.cancel')}
              </button>
            )}

            {queue.length > 0 && !isProcessing && !isAllFinished && (
              <button
                type="button"
                onClick={startBatchProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>
                  {uploadMode === 'merge_new_tomo' && queue.length >= 2
                    ? t('uploadModal.uploadCompileTomo', { count: queue.length })
                    : uploadMode === 'append_to_tomo'
                      ? t('uploadModal.uploadIncorporateTomo')
                      : t('uploadModal.startUploadCount', { count: queue.length })}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
