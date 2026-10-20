import React, { useState, useEffect } from 'react';
import { 
  X, 
  Edit3, 
  BookOpen, 
  Bookmark, 
  Check,
  Loader2,
  Folder,
  FolderInput
} from 'lucide-react';
import { updateQuickMetadata } from '../api';
import { SessionManifest } from '../types';
import { useTranslation } from '../i18n';

interface QuickRenameModalProps {
  isOpen: boolean;
  sessionId: string;
  groupSeriesName?: string;
  initialType?: 'tomo' | 'capitulo';
  initialSeries?: string;
  initialTitle?: string;
  initialNumber?: string;
  initialVolume?: number | null;
  onClose: () => void;
  onSuccess: (updated: SessionManifest) => void;
  onOpenRenameGroup?: (seriesName: string) => void;
}

export const QuickRenameModal: React.FC<QuickRenameModalProps> = ({
  isOpen,
  sessionId,
  groupSeriesName = '',
  initialType = 'tomo',
  initialSeries = '',
  initialTitle = '',
  initialNumber = '',
  initialVolume = null,
  onClose,
  onSuccess,
  onOpenRenameGroup
}) => {
  const { t } = useTranslation();
  const effectiveParentSeries = groupSeriesName || initialSeries || '';
  const [itemType, setItemType] = useState<'tomo' | 'capitulo'>(initialType);
  const [series, setSeries] = useState(effectiveParentSeries);
  const [title, setTitle] = useState(initialTitle);
  const [number, setNumber] = useState(initialNumber);
  const [volume, setVolume] = useState<number | ''>(initialVolume ?? '');
  const [isMoveSeriesOpen, setIsMoveSeriesOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parent = groupSeriesName || initialSeries || '';
    setItemType(initialType);
    setSeries(parent);
    setTitle(initialTitle);
    setNumber(initialNumber);
    setVolume(initialVolume ?? '');
    setIsMoveSeriesOpen(false);
    setError(null);
  }, [isOpen, initialType, initialSeries, initialTitle, initialNumber, initialVolume, groupSeriesName]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    // If the user did not intentionally open and change the series,
    // lock it strictly to the current group/parent series so it NEVER separates into a new group.
    const finalSeries = isMoveSeriesOpen ? series.trim() : (groupSeriesName || initialSeries || '').trim();

    try {
      const updated = await updateQuickMetadata(sessionId, {
        item_type: itemType,
        series: finalSeries || undefined,
        title: title.trim(),
        number: number.trim(),
        volume: itemType === 'capitulo' ? undefined : (volume === '' ? undefined : Number(volume))
      });

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || t('quickRename.errorSaving'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-comic-800 bg-slate-50 dark:bg-comic-950/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm ${
              itemType === 'tomo'
                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                : 'bg-amber-600/20 text-amber-400 border-amber-500/30'
            }`}>
              {itemType === 'tomo' ? <BookOpen className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {itemType === 'tomo' ? t('quickRename.titleTomo') : t('quickRename.titleChapter')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('quickRename.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition disabled:opacity-50"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Group / Series Lock Indicator */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-comic-950/80 border border-slate-200 dark:border-comic-800 shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold block">
                  {t('quickRename.groupSeries')}
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate block" title={effectiveParentSeries}>
                  {effectiveParentSeries || t('quickRename.noSeries')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20 font-medium shrink-0">
                {t('quickRename.insideGroup')}
              </span>
              {onOpenRenameGroup && effectiveParentSeries && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRenameGroup(effectiveParentSeries);
                  }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-[10px] font-bold transition cursor-pointer"
                  title={`Renombrar la serie "${effectiveParentSeries}" para todos los tomos y capítulos del grupo`}
                >
                  <Edit3 className="w-2.5 h-2.5" />
                  <span>Renombrar Serie</span>
                </button>
              )}
            </div>
          </div>

          {/* Primary Field: Title / Name of the chapter or tomo */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
              <span>{itemType === 'tomo' ? t('quickRename.nameTitleTomo') : t('quickRename.nameTitleChapter')}</span>
              <span className="text-[10px] text-slate-400 font-normal">{t('quickRename.visibleInList')}</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={itemType === 'tomo' ? t('quickRename.placeholderTomo') : t('quickRename.placeholderChapter')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-comic-950 border border-slate-300 dark:border-comic-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              autoFocus
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {t('quickRename.nameHelp', { item: itemType === 'tomo' ? t('common.tomo').toLowerCase() : t('common.chapter').toLowerCase() })}
            </p>
          </div>

          {/* Type Selector (Tomo vs Capítulo) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('quickRename.isTomoOrChapter')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setItemType('tomo')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition ${
                  itemType === 'tomo'
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/50 shadow-md'
                    : 'bg-slate-50 dark:bg-comic-950/60 border-slate-200 dark:border-comic-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-comic-800'
                }`}
              >
                <BookOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span>{t('quickRename.tomoVolume')}</span>
              </button>

              <button
                type="button"
                onClick={() => setItemType('capitulo')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition ${
                  itemType === 'capitulo'
                    ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-500 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/50 shadow-md'
                    : 'bg-slate-50 dark:bg-comic-950/60 border-slate-200 dark:border-comic-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-comic-800'
                }`}
              >
                <Bookmark className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>{t('quickRename.singleChapter')}</span>
              </button>
            </div>
          </div>

          {/* Number / Volume */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {itemType === 'tomo' ? t('quickRename.volumeNumber') : t('quickRename.chapterNumber')}
            </label>
            {itemType === 'tomo' ? (
              <input
                type="number"
                min="1"
                value={volume}
                onChange={(e) => setVolume(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
                placeholder="1"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-comic-950 border border-slate-300 dark:border-comic-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition font-mono"
              />
            ) : (
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={t('quickRename.chapterPlaceholder')}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-comic-950 border border-slate-300 dark:border-comic-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition font-mono"
              />
            )}
          </div>

          {/* Optional: Move to another series (Advanced / Collapsed by default) */}
          <div className="pt-2 border-t border-slate-200 dark:border-comic-800/60">
            {!isMoveSeriesOpen ? (
              <button
                type="button"
                onClick={() => setIsMoveSeriesOpen(true)}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition flex items-center gap-1.5"
              >
                <FolderInput className="w-3.5 h-3.5" />
                <span>{t('quickRename.moveSeriesPrompt')}</span>
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <FolderInput className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>{t('quickRename.changeSeriesGroup')}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoveSeriesOpen(false);
                      setSeries(effectiveParentSeries);
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  >
                    {t('quickRename.cancelMove')}
                  </button>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/80 leading-relaxed">
                  {t('quickRename.moveWarning')}
                </p>
                <input
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder={t('quickRename.newSeriesPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-comic-950 border border-amber-300 dark:border-amber-700/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-200 dark:border-comic-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-comic-800 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition border border-slate-300 dark:border-transparent"
            >
              {t('common.cancel')}
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('common.saving')}</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('common.saveChanges')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
