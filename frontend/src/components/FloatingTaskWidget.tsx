import React, { useState } from 'react';
import { 
  Download, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FileArchive, 
  X, 
  ChevronRight, 
  ExternalLink,
  Minimize2,
  Maximize2,
  Scissors,
  Layers
} from 'lucide-react';
import { useTranslation } from '../i18n';

export interface ActiveExportTask {
  id: string;
  sessionId: string;
  comicTitle: string;
  filename: string;
  format: string;
  saveToLibrary: boolean;
  percent: number;
  current: number;
  total: number;
  message: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: {
    download_url: string;
    filename: string;
    filepath: string;
    size_mb: number;
  } | null;
  error?: string | null;
  options?: any;
}

export interface ActiveUploadTask {
  id: string;
  totalFiles: number;
  currentIndex: number;
  currentFileName: string;
  itemTitle: string;
  percent: number;
  status: 'uploading' | 'extracting' | 'completed' | 'error';
  message: string;
  isCompleted: boolean;
  error?: string | null;
}

export interface ActiveSliceTask {
  id: string;
  sessionId: string;
  comicTitle: string;
  percent: number;
  current: number;
  total: number;
  message: string;
  status: 'processing' | 'completed' | 'error';
  error?: string | null;
  newTotalPages?: number;
}

interface FloatingTaskWidgetProps {
  exportTask?: ActiveExportTask | null;
  exportQueue?: ActiveExportTask[];
  uploadTask: ActiveUploadTask | null;
  sliceTask?: ActiveSliceTask | null;
  onDismissExport: () => void;
  onDismissUpload: () => void;
  onDismissSlice?: () => void;
  onOpenUploadQueue?: () => void;
}

export const FloatingTaskWidget: React.FC<FloatingTaskWidgetProps> = ({
  exportTask,
  exportQueue = [],
  uploadTask,
  sliceTask,
  onDismissExport,
  onDismissUpload,
  onDismissSlice,
  onOpenUploadQueue
}) => {
  const { t } = useTranslation();
  const [isExportCollapsed, setIsExportCollapsed] = useState(false);
  const [isUploadCollapsed, setIsUploadCollapsed] = useState(false);
  const [isSliceCollapsed, setIsSliceCollapsed] = useState(false);

  const effectiveQueue = exportQueue && exportQueue.length > 0 
    ? exportQueue 
    : exportTask 
      ? [exportTask] 
      : [];

  const currentProcessingTask = effectiveQueue.find((t) => t.status === 'processing');
  const pendingTasks = effectiveQueue.filter((t) => t.status === 'pending');
  const completedTasks = effectiveQueue.filter((t) => t.status === 'completed');
  const errorTasks = effectiveQueue.filter((t) => t.status === 'error');
  const isQueueActive = Boolean(currentProcessingTask || pendingTasks.length > 0);

  // The task to display details for: either currently processing, or first pending, or most recent completed/error
  const displayExportTask = currentProcessingTask || pendingTasks[0] || effectiveQueue[effectiveQueue.length - 1] || null;

  const totalExportCount = effectiveQueue.length;
  const processedExportCount = completedTasks.length + errorTasks.length;

  if (effectiveQueue.length === 0 && !uploadTask && !sliceTask) return null;

  return (
    <aside 
      aria-label={t('floatingTask.asideAria')}
      className="fixed top-16 sm:top-18 right-3 sm:right-6 z-50 flex flex-col gap-2.5 items-end pointer-events-none select-none max-w-[calc(100vw-1.5rem)] sm:max-w-sm"
    >
      {/* EXPORT TASK BUBBLE */}
      {displayExportTask && effectiveQueue.length > 0 && (
        <div
          className={`pointer-events-auto w-full sm:w-80 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md animate-in slide-in-from-top-4 fade-in ${
            !isQueueActive && completedTasks.length > 0
              ? 'bg-emerald-950/95 border-emerald-500/60 shadow-emerald-500/20 text-emerald-100'
              : !isQueueActive && errorTasks.length > 0
                ? 'bg-rose-950/95 border-rose-500/60 shadow-rose-500/20 text-rose-100'
                : 'bg-comic-950/95 border-indigo-500/60 shadow-indigo-500/25 text-slate-100'
          }`}
        >
          {isExportCollapsed && isQueueActive ? (
            /* Ultra-Compact Collapsed Pill */
            <div 
              onClick={() => setIsExportCollapsed(false)}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-comic-900/60 rounded-2xl transition"
              title={t('floatingTask.expandExport')}
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">
                  {totalExportCount > 1
                    ? t('floatingTask.exportingCount', { current: processedExportCount + 1, total: totalExportCount })
                    : t('floatingTask.exportingFormat', { format: displayExportTask.format.toUpperCase() })}
                </p>
              </div>
              <span className="font-mono font-extrabold text-xs text-indigo-300">
                {displayExportTask.percent}%
              </span>
              <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            </div>
          ) : (
            /* Full Floating Card */
            <div className="p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                      !isQueueActive && completedTasks.length > 0
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : !isQueueActive && errorTasks.length > 0
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-indigo-500/20 text-indigo-400'
                    }`}
                  >
                    {!isQueueActive && completedTasks.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : !isQueueActive && errorTasks.length > 0 ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate">
                        {isQueueActive
                          ? totalExportCount > 1
                            ? t('floatingTask.exportingCount', { current: processedExportCount + 1, total: totalExportCount })
                            : t('floatingTask.exportingFormat', { format: displayExportTask.format.toUpperCase() })
                          : completedTasks.length > 0
                            ? t('floatingTask.exportReady', { current: completedTasks.length, total: totalExportCount })
                            : t('floatingTask.exportError')}
                      </span>
                      {isQueueActive && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-900/80 border border-indigo-700 text-[10px] font-mono font-bold text-indigo-300">
                          {displayExportTask.percent}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300/90 truncate font-medium" title={displayExportTask.comicTitle}>
                      {displayExportTask.comicTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isQueueActive && (
                    <button
                      type="button"
                      onClick={() => setIsExportCollapsed(true)}
                      className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                      title={t('floatingTask.minimizePill')}
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDismissExport}
                    className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                    title={isQueueActive ? t('floatingTask.hideNotification') : t('floatingTask.closeNotice')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress Bar (when processing) */}
              {isQueueActive && (
                <div className="space-y-1.5">
                  <div className="w-full bg-comic-900 rounded-full h-2 overflow-hidden border border-comic-800">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(4, displayExportTask.percent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="truncate max-w-[190px]">
                      {displayExportTask.total > 0
                        ? `Pág ${displayExportTask.current}/${displayExportTask.total}`
                        : displayExportTask.message || 'Procesando...'}
                    </span>
                    <span className="font-semibold text-slate-300 shrink-0">
                      {displayExportTask.percent}%
                    </span>
                  </div>

                  {/* Pending Queue Indicator */}
                  {pendingTasks.length > 0 && (
                    <div className="pt-1 border-t border-indigo-900/40 flex items-center justify-between text-[10px] text-indigo-300/90">
                      <span className="truncate">
                        ⏳ En cola: <strong>{pendingTasks.length} pendiente{pendingTasks.length > 1 ? 's' : ''}</strong>
                      </span>
                      <span className="text-[9px] text-slate-400 truncate max-w-[140px]" title={pendingTasks.map((t) => t.comicTitle).join(', ')}>
                        {pendingTasks.map((t) => t.comicTitle).slice(0, 2).join(', ')}
                        {pendingTasks.length > 2 ? '...' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Completed Items Actions */}
              {!isQueueActive && completedTasks.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-emerald-800/50">
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-0.5">
                    {completedTasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-1 text-[10px] text-emerald-200 bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-800/40">
                        <span className="truncate font-mono flex-1" title={task.result?.filename || task.filename}>
                          {task.result?.filename || task.filename} {task.result?.size_mb ? `(${task.result.size_mb} MB)` : ''}
                        </span>
                        {task.result?.download_url && (
                          <a
                            href={task.result.download_url}
                            download={task.result.filename}
                            className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold shrink-0 transition"
                          >
                            Descargar
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onDismissExport}
                      className="w-full py-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold border border-emerald-700/60 transition"
                    >
                      Cerrar aviso
                    </button>
                  </div>
                </div>
              )}

              {/* Error Detail */}
              {!isQueueActive && errorTasks.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-rose-800/50">
                  {errorTasks.map((task) => (
                    <p key={task.id} className="text-[11px] text-rose-300 leading-tight font-mono">
                      <strong>{task.comicTitle}:</strong> {task.error || 'Error inesperado.'}
                    </p>
                  ))}
                  <button
                    type="button"
                    onClick={onDismissExport}
                    className="w-full py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold transition"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* UPLOAD / IMPORT TASK BUBBLE */}
      {uploadTask && (
        <div
          className={`pointer-events-auto w-full sm:w-80 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md animate-in slide-in-from-top-4 fade-in ${
            uploadTask.isCompleted
              ? 'bg-emerald-950/95 border-emerald-500/60 shadow-emerald-500/20 text-emerald-100'
              : uploadTask.status === 'error'
                ? 'bg-rose-950/95 border-rose-500/60 shadow-rose-500/20 text-rose-100'
                : 'bg-comic-950/95 border-sky-500/60 shadow-sky-500/25 text-slate-100'
          }`}
        >
          {isUploadCollapsed && !uploadTask.isCompleted ? (
            /* Ultra-Compact Collapsed Pill */
            <div 
              onClick={() => setIsUploadCollapsed(false)}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-comic-900/60 rounded-2xl transition"
              title={t('floatingTask.expandImport')}
            >
              <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                <UploadCloud className="w-3.5 h-3.5 animate-bounce" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">
                  {t('floatingTask.importingCount', { current: uploadTask.currentIndex + 1, total: uploadTask.totalFiles })}
                </p>
              </div>
              <span className="font-mono font-extrabold text-xs text-sky-300">
                {uploadTask.percent}%
              </span>
              <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            </div>
          ) : (
            /* Full Floating Card */
            <div className="p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                      uploadTask.isCompleted
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : uploadTask.status === 'error'
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-sky-500/20 text-sky-400'
                    }`}
                  >
                    {uploadTask.isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : uploadTask.status === 'error' ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <UploadCloud className="w-4 h-4 animate-pulse" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate">
                        {uploadTask.isCompleted
                          ? t('floatingTask.importReady')
                          : uploadTask.status === 'error'
                            ? t('floatingTask.importError')
                            : t('floatingTask.importingCount', { current: uploadTask.currentIndex + 1, total: uploadTask.totalFiles })}
                      </span>
                      {!uploadTask.isCompleted && (
                        <span className="px-1.5 py-0.2 rounded bg-sky-950/80 border border-sky-700 text-[10px] font-mono font-bold text-sky-300">
                          {uploadTask.percent}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300/90 truncate font-medium" title={uploadTask.itemTitle}>
                      {uploadTask.itemTitle || uploadTask.currentFileName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!uploadTask.isCompleted && (
                    <button
                      type="button"
                      onClick={() => setIsUploadCollapsed(true)}
                      className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                      title={t('floatingTask.minimizePill')}
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDismissUpload}
                    className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                    title={uploadTask.isCompleted ? t('floatingTask.closeNotice') : t('floatingTask.hideNotification')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress Bar (when active) */}
              {!uploadTask.isCompleted && (
                <div className="space-y-1">
                  <div className="w-full bg-comic-900 rounded-full h-2 overflow-hidden border border-comic-800">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(4, uploadTask.percent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="truncate max-w-[190px]">
                      {uploadTask.message || 'Extrayendo páginas...'}
                    </span>
                    {onOpenUploadQueue && (
                      <button
                        type="button"
                        onClick={onOpenUploadQueue}
                        className="text-sky-400 hover:text-sky-300 underline font-sans text-[10px] shrink-0"
                      >
                        Ver cola
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Completed Notice */}
              {uploadTask.isCompleted && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-800/50 text-xs">
                  <span className="text-[11px] text-emerald-200">
                    {uploadTask.totalFiles} {uploadTask.totalFiles === 1 ? 'archivo listo' : 'archivos listos'} en Staging
                  </span>
                  <button
                    type="button"
                    onClick={onDismissUpload}
                    className="px-2.5 py-1 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold border border-emerald-700/60 transition"
                  >
                    Entendido
                  </button>
                </div>
              )}

              {/* Error Detail */}
              {uploadTask.status === 'error' && (
                <div className="space-y-1.5 pt-1 border-t border-rose-800/50">
                  <p className="text-[11px] text-rose-300 leading-tight font-mono">
                    {uploadTask.error || 'Error al procesar archivos en la cola.'}
                  </p>
                  <button
                    type="button"
                    onClick={onDismissUpload}
                    className="w-full py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold transition"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SLICE TASK BUBBLE */}
      {sliceTask && (
        <div
          className={`pointer-events-auto w-full sm:w-80 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md animate-in slide-in-from-top-4 fade-in ${
            sliceTask.status === 'completed'
              ? 'bg-emerald-950/95 border-emerald-500/60 shadow-emerald-500/20 text-emerald-100'
              : sliceTask.status === 'error'
                ? 'bg-rose-950/95 border-rose-500/60 shadow-rose-500/20 text-rose-100'
                : 'bg-comic-950/95 border-cyan-500/60 shadow-cyan-500/25 text-slate-100'
          }`}
        >
          {isSliceCollapsed && sliceTask.status === 'processing' ? (
            /* Compact Collapsed Pill */
            <div 
              onClick={() => setIsSliceCollapsed(false)}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-comic-900/60 rounded-2xl transition"
              title={t('floatingTask.expandSlice')}
            >
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">
                  {t('floatingTask.slicingStrips', { percent: sliceTask.percent })}
                </p>
              </div>
              <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            </div>
          ) : (
            /* Full Floating Card */
            <div className="p-3.5 space-y-2.5">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                    sliceTask.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : sliceTask.status === 'error'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    {sliceTask.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : sliceTask.status === 'error' ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <Scissors className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">
                      {sliceTask.status === 'completed' ? t('floatingTask.sliceCompleted') : t('floatingTask.slicingStripsTitle')}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">
                      {sliceTask.comicTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {sliceTask.status === 'processing' && (
                    <button
                      type="button"
                      onClick={() => setIsSliceCollapsed(true)}
                      className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                      title={t('floatingTask.minimizeBubble')}
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onDismissSlice && (
                    <button
                      type="button"
                      onClick={onDismissSlice}
                      className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                      title={t('floatingTask.closeNotification')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Section */}
              {sliceTask.status === 'processing' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-300">
                      Tira {sliceTask.current} de {sliceTask.total}
                    </span>
                    <span className="text-cyan-400 font-bold">{sliceTask.percent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-comic-900 overflow-hidden border border-comic-800">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 rounded-full transition-all duration-300"
                      style={{ width: `${sliceTask.percent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 truncate font-mono">
                    {sliceTask.message || 'Procesando tiras...'}
                  </p>
                </div>
              )}

              {/* Completed Notice */}
              {sliceTask.status === 'completed' && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-800/50 text-xs">
                  <span className="text-[11px] text-emerald-200">
                    {sliceTask.newTotalPages ? `${sliceTask.newTotalPages} páginas totales (100% nitidez)` : 'Páginas actualizadas'}
                  </span>
                  {onDismissSlice && (
                    <button
                      type="button"
                      onClick={onDismissSlice}
                      className="px-2.5 py-1 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold border border-emerald-700/60 transition"
                    >
                      Listo
                    </button>
                  )}
                </div>
              )}

              {/* Error Detail */}
              {sliceTask.status === 'error' && (
                <div className="space-y-1.5 pt-1 border-t border-rose-800/50">
                  <p className="text-[11px] text-rose-300 leading-tight font-mono">
                    {sliceTask.error || 'Error al cortar tiras en lote.'}
                  </p>
                  {onDismissSlice && (
                    <button
                      type="button"
                      onClick={onDismissSlice}
                      className="w-full py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold transition"
                    >
                      Descartar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
