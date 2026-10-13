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
  FolderPlus
} from 'lucide-react';
import { 
  uploadComic, 
  cancelSession, 
  checkExistingSession, 
  fetchSession,
  ExistingSessionCheck, 
  ProcessingProgressInfo,
  mergeSessions,
  appendChaptersToTomo
} from '../api';
import { SessionManifest, ComicSessionSummary } from '../types';
import { ActiveUploadTask } from './FloatingTaskWidget';
import { isSessionTomo, cleanSeriesDisplayName } from '../utils/seriesGrouping';
import { useTranslation } from '../i18n';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (session: SessionManifest) => void;
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

  const [uploadMode, setUploadMode] = useState<'individual' | 'merge_new_tomo' | 'append_to_tomo'>('individual');
  const [tomoSeriesName, setTomoSeriesName] = useState(defaultSeries || '');
  const [tomoVolumeNum, setTomoVolumeNum] = useState<number | ''>(1);
  const [targetTomoId, setTargetTomoId] = useState<string>('');

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

  const guessFromFilename = (fname: string, seriesOverride?: string | null) => {
    const isCap = /\b(c|ch|cap|capitulo|chapter)\.?\s*(\d+)/i.test(fname);
    const isVol = /\b(v|vol|volume|tomo)\.?\s*(\d+)/i.test(fname);
    const type: 'tomo' | 'capitulo' = isVol ? 'tomo' : 'capitulo';

    let num = '';
    const numMatch = fname.match(/\b(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)\.?\s*(\d+(?:\.\d+)?)/i) || fname.match(/\b(\d{1,4})\b/);
    if (numMatch) num = numMatch[1];

    let cleanSeries = fname.replace(/\.[^/.]+$/, '');
    cleanSeries = cleanSeries.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim();
    if (numMatch) {
      const idx = cleanSeries.indexOf(numMatch[0]);
      if (idx > 0) cleanSeries = cleanSeries.substring(0, idx).trim();
    }
    cleanSeries = cleanSeries.replace(/[-_]+$/, '').trim();

    const activeSeries = seriesOverride !== undefined ? seriesOverride : assignedSeries;
    const finalSeries = activeSeries || cleanSeries || 'Cómic';

    return { type, series: finalSeries, number: num };
  };

  const handleSwitchToNewGroup = () => {
    setAssignedSeries(null);
    setTomoSeriesName('');
    setQueue((prev) =>
      prev.map((item) => {
        if (item.status === 'pending') {
          const guess = guessFromFilename(item.file.name, null);
          return { ...item, series: guess.series };
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

    const newItems: BatchQueueItem[] = [];

    comicFiles.forEach((file) => {
      const guess = guessFromFilename(file.name, assignedSeries);
      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        item_type: guess.type,
        series: guess.series,
        number: guess.number,
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

        // If in individual mode, notify parent immediately so it shows up in real-time
        if (uploadMode === 'individual') {
          onUploadSuccess(session);
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
          onUploadSuccess(merged);
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
          onUploadSuccess(appended);
          onClose();
        } catch (err: any) {
          console.error('Error appending uploaded chapters:', err);
          setOverallError(`Error al incorporar capítulos al tomo: ${err.message}`);
        }
      } else if (uploadMode === 'merge_new_tomo' && completedSessions.length === 1) {
        onUploadSuccess(completedSessions[0]);
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

        {/* Global Error Banner */}
        {overallError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{overallError}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {queue.length === 0 ? (
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
                        ? 'No hay tomos cargados en staging.' 
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
