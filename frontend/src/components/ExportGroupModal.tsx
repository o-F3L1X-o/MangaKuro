import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  Package, 
  CheckSquare, 
  Square, 
  CheckCircle2, 
  Sparkles,
  Sliders,
  HardDrive,
  FileArchive,
  BookOpen
} from 'lucide-react';
import { ComicSessionSummary, AppSettings } from '../types';
import { SeriesGroup, isSessionTomo } from '../utils/seriesGrouping';
import { useTranslation } from '../i18n';

export type ExportFormatType = 'cbz' | 'zip' | 'pdf' | 'cbr' | 'epub';

export interface ExportGroupModalProps {
  group: SeriesGroup | null;
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onConfirmExport: (
    sessionsToExport: ComicSessionSummary[],
    options: {
      export_format: ExportFormatType;
      compression: string;
      quality: number;
      save_to_library: boolean;
      custom_export_dir?: string;
      auto_downscale_oversized?: boolean;
    }
  ) => void;
}

export const ExportGroupModal: React.FC<ExportGroupModalProps> = ({
  group,
  settings,
  isOpen,
  onClose,
  onConfirmExport
}) => {
  const { t } = useTranslation();
  if (!isOpen || !group) return null;

  // Filter tomos; if none marked as tomo, allow exporting all sessions in the group
  const tomosInGroup = useMemo(() => {
    const onlyTomos = group.sessions.filter((s) => isSessionTomo(s));
    return onlyTomos.length > 0 ? onlyTomos : group.sessions;
  }, [group]);

  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(() =>
    tomosInGroup.map((s) => s.session_id)
  );

  const [exportFormat, setExportFormat] = useState<ExportFormatType>('cbz');
  const [compression, setCompression] = useState<string>(settings.default_compression || 'original');
  const [quality, setQuality] = useState<number>(settings.default_quality || 80);
  const [saveToLibrary, setSaveToLibrary] = useState<boolean>(true);
  const [autoDownscaleOversized, setAutoDownscaleOversized] = useState<boolean>(true);

  const handleToggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedSessionIds.length === tomosInGroup.length) {
      setSelectedSessionIds([]);
    } else {
      setSelectedSessionIds(tomosInGroup.map((s) => s.session_id));
    }
  };

  const selectedSessions = useMemo(() => {
    return tomosInGroup.filter((s) => selectedSessionIds.includes(s.session_id));
  }, [tomosInGroup, selectedSessionIds]);

  const totalPagesSelected = useMemo(() => {
    return selectedSessions.reduce((acc, curr) => acc + (curr.page_count || 0), 0);
  }, [selectedSessions]);

  const handleStartExport = () => {
    if (selectedSessions.length === 0) return;

    onConfirmExport(selectedSessions, {
      export_format: exportFormat,
      compression,
      quality,
      save_to_library: saveToLibrary,
      custom_export_dir: settings.export_directory || undefined,
      auto_downscale_oversized: autoDownscaleOversized
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-comic-900 border border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-comic-800 bg-comic-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('exportGroupModal.title')}</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700/60 text-indigo-300 text-[11px] font-mono font-bold">
                  {group.name}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('exportGroupModal.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Tomos Selection List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-400" />
                <span>{t('exportGroupModal.tomosToExport', { selected: selectedSessionIds.length, total: tomosInGroup.length })}</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition"
              >
                {selectedSessionIds.length === tomosInGroup.length ? t('common.deselectAll') : t('common.selectAll')}
              </button>
            </div>

            <div className="border border-comic-800 rounded-xl bg-comic-950/70 divide-y divide-comic-850/60 max-h-48 overflow-y-auto">
              {tomosInGroup.map((item) => {
                const isChecked = selectedSessionIds.includes(item.session_id);
                return (
                  <div
                    key={item.session_id}
                    onClick={() => handleToggleSession(item.session_id)}
                    className={`flex items-center justify-between p-3 cursor-pointer transition select-none ${
                      isChecked ? 'bg-indigo-950/30 hover:bg-indigo-950/50' : 'opacity-60 hover:opacity-100 hover:bg-comic-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">
                          {item.title || item.original_filename}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {item.volume ? `${t('common.tomo')} #${item.volume}` : item.number ? `${t('common.tomo')} #${item.number}` : t('common.tomo')} • {item.page_count} {t('common.pages')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileArchive className="w-4 h-4 text-indigo-400" />
              <span>{t('exportGroupModal.outputFormat')}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(['cbz', 'zip', 'pdf', 'cbr', 'epub'] as ExportFormatType[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`p-2 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 uppercase ${
                    exportFormat === fmt
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                      : 'bg-comic-950 border-comic-800 text-slate-400 hover:text-white hover:border-comic-700'
                  }`}
                >
                  <span>.{fmt}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Compression & Optimization */}
          <div className="space-y-3 p-4 rounded-xl bg-comic-950 border border-comic-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-purple-400" />
                <span>{t('exportGroupModal.imageCompression')}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCompression('original')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                  compression === 'original'
                    ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-400/50 text-white'
                    : 'bg-comic-900 border-comic-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-bold text-emerald-400">{t('exportGroupModal.optOriginal')}</span>
                <span className="text-[10px] text-slate-400 leading-tight">{t('exportGroupModal.optOriginalDesc')}</span>
              </button>

              <button
                type="button"
                onClick={() => setCompression('webp')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                  compression === 'webp'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-400/50 text-white'
                    : 'bg-comic-900 border-comic-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-bold text-indigo-400">{t('exportGroupModal.optWebp')}</span>
                <span className="text-[10px] text-slate-400 leading-tight">{t('exportGroupModal.optWebpDesc')}</span>
              </button>

              <button
                type="button"
                onClick={() => setCompression('mozjpeg')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                  compression === 'mozjpeg'
                    ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-400/50 text-white'
                    : 'bg-comic-900 border-comic-800 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-xs font-bold text-amber-400">{t('exportGroupModal.optJpg')}</span>
                <span className="text-[10px] text-slate-400 leading-tight">{t('exportGroupModal.optJpgDesc')}</span>
              </button>
            </div>

            {compression !== 'original' && (
              <div className="pt-2 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-300 font-medium">{t('exportGroupModal.imageQuality')}</span>
                <div className="flex items-center gap-3 flex-1 max-w-xs">
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="font-mono text-xs font-bold text-indigo-400 w-10 text-right">
                    {quality}%
                  </span>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-comic-800/60">
              <input
                type="checkbox"
                checked={autoDownscaleOversized}
                onChange={(e) => setAutoDownscaleOversized(e.target.checked)}
                className="rounded border-comic-700 bg-comic-800 text-indigo-600 focus:ring-0 w-4 h-4"
              />
              <span className="text-xs text-slate-300">
                {t('exportGroupModal.autoDownscale')}
              </span>
            </label>
          </div>

          {/* Destination */}
          <div className="p-3 bg-comic-950 rounded-xl border border-comic-800 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveToLibrary}
                onChange={(e) => setSaveToLibrary(e.target.checked)}
                className="rounded border-comic-700 bg-comic-800 text-indigo-600 focus:ring-0 w-4 h-4"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-white">{t('exportGroupModal.saveToLibrary')}</span>
                <p className="text-[11px] text-slate-400">
                  {t('exportGroupModal.saveToLibraryDesc', { dir: settings.export_directory || t('exportGroupModal.defaultDir') })}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-comic-800 bg-comic-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleStartExport}
            disabled={selectedSessions.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>
              {t('exportGroupModal.startExport', {
                count: selectedSessions.length,
                plural: selectedSessions.length > 1 ? 's' : '',
                pages: totalPagesSelected
              })}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
