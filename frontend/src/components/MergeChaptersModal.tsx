import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  BookOpen, 
  Bookmark, 
  Sparkles,
  Loader2
} from 'lucide-react';
import { ComicSessionSummary, SessionManifest } from '../types';
import { mergeSessions } from '../api';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n';

interface MergeChaptersModalProps {
  isOpen: boolean;
  selectedSessions: ComicSessionSummary[];
  onClose: () => void;
  onSuccess: (newTomo: SessionManifest) => void;
}

export const MergeChaptersModal: React.FC<MergeChaptersModalProps> = ({
  isOpen,
  selectedSessions,
  onClose,
  onSuccess
}) => {
  const { t } = useTranslation();
  const [orderedList, setOrderedList] = useState<ComicSessionSummary[]>(selectedSessions);
  const [targetSeries, setTargetSeries] = useState(
    selectedSessions[0]?.series || selectedSessions[0]?.original_filename || 'Serie Manga'
  );
  const [targetVolume, setTargetVolume] = useState<number | ''>(
    selectedSessions[0]?.volume || 1
  );
  const [targetTitle, setTargetTitle] = useState('');
  const [addCovers, setAddCovers] = useState(true);
  const [deleteSources, setDeleteSources] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if selectedSessions changes
  React.useEffect(() => {
    setOrderedList(selectedSessions);
    if (selectedSessions.length > 0) {
      setTargetSeries(selectedSessions[0].series || selectedSessions[0].original_filename || 'Serie Manga');
      setTargetVolume(selectedSessions[0].volume || 1);
    }
  }, [selectedSessions]);

  if (!isOpen) return null;

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setOrderedList((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= orderedList.length - 1) return;
    setOrderedList((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleRemove = (sessionId: string) => {
    if (orderedList.length <= 2) {
      setError(t('mergeChapters.errorMinTwo'));
      return;
    }
    setOrderedList((prev) => prev.filter((s) => s.session_id !== sessionId));
  };

  const handleMerge = async () => {
    if (!targetSeries.trim()) {
      setError(t('mergeChapters.errorEmptySeries'));
      return;
    }
    if (orderedList.length < 2) {
      setError(t('mergeChapters.errorMinTwo'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const tomo = await mergeSessions({
        source_session_ids: orderedList.map((s) => s.session_id),
        target_series: targetSeries.trim(),
        target_volume: targetVolume === '' ? undefined : Number(targetVolume),
        target_title: targetTitle.trim() || undefined,
        delete_sources: deleteSources,
        add_chapter_covers: addCovers
      });

      onSuccess(tomo);
      onClose();
    } catch (err: any) {
      setError(err.message || t('mergeChapters.errorGeneric'));
    } finally {
      setIsProcessing(false);
    }
  };

  const totalPages = orderedList.reduce((acc, curr) => acc + curr.page_count, 0) + (addCovers ? orderedList.length : 0);

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-comic-900 border border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-comic-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('mergeChapters.title')}</h2>
              <p className="text-xs text-slate-400">
                {t('mergeChapters.subtitle', { count: orderedList.length })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Tomo Metadata inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                {t('mergeChapters.seriesLabel')} <span className="text-indigo-400">*</span>
              </label>
              <input
                type="text"
                value={targetSeries}
                onChange={(e) => setTargetSeries(e.target.value)}
                placeholder={t('mergeChapters.seriesPlaceholder')}
                className="w-full px-3 py-2 rounded-xl bg-comic-950 border border-comic-700 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                {t('mergeChapters.volumeNumberLabel')}
              </label>
              <input
                type="number"
                min="1"
                value={targetVolume}
                onChange={(e) => setTargetVolume(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
                placeholder="1"
                className="w-full px-3 py-2 rounded-xl bg-comic-950 border border-comic-700 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              {t('mergeChapters.volumeTitleLabel')}
            </label>
            <input
              type="text"
              value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              placeholder={t('mergeChapters.titlePlaceholder')}
              className="w-full px-3 py-2 rounded-xl bg-comic-950 border border-comic-700 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Chapter Reorder List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {t('mergeChapters.orderLabel', { count: orderedList.length })}
              </label>
              <span className="text-[11px] text-slate-400">
                {t('mergeChapters.orderHelp')}
              </span>
            </div>

            {/* Informative banner indicating top-to-bottom merge order */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-xs text-indigo-200">
              <ArrowDown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>
                <strong>{t('mergeChapters.orderBannerTitle')}</strong> {t('mergeChapters.orderBanner')}
              </span>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {orderedList.map((item, idx) => (
                <div
                  key={item.session_id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs gap-3 transition ${
                    idx === 0
                      ? 'bg-indigo-950/50 border-indigo-600/80 shadow-sm'
                      : 'bg-comic-950/70 border-comic-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-md font-mono font-bold flex items-center justify-center text-[10px] shrink-0 ${
                        idx === 0
                          ? 'bg-emerald-500 text-slate-950 ring-1 ring-emerald-400'
                          : 'bg-comic-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-white truncate">
                          {item.series} {item.number ? `#${item.number}` : ''}
                        </p>
                        {idx === 0 ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-600/60 text-emerald-300 font-extrabold">
                            {t('mergeChapters.firstCoverBadge')}
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-comic-800 text-slate-400 font-medium">
                            {t('mergeChapters.nextBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        {item.title || item.original_filename} ({item.page_count} {t('common.pages')})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      className="p-1 rounded-md hover:bg-comic-800 text-slate-400 hover:text-white disabled:opacity-30 transition"
                      title={t('common.moveUp')}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === orderedList.length - 1}
                      className="p-1 rounded-md hover:bg-comic-800 text-slate-400 hover:text-white disabled:opacity-30 transition"
                      title={t('common.moveDown')}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.session_id)}
                      className="p-1 rounded-md hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition ml-1"
                      title={t('mergeChapters.removeFromMerge')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-2 border-t border-comic-800">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={addCovers}
                onChange={(e) => setAddCovers(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-comic-950 border-comic-700 focus:ring-0"
              />
              <div className="text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  {t('mergeChapters.insertCoversLabel')}
                </span>
                <p className="text-[11px] text-slate-400">
                  {t('mergeChapters.insertCoversDesc')}
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteSources}
                onChange={(e) => setDeleteSources(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 bg-comic-950 border-comic-700 focus:ring-0"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-300">
                  {t('mergeChapters.deleteSourcesLabel')}
                </span>
                <p className="text-[11px] text-slate-500">
                  {t('mergeChapters.deleteSourcesDesc')}
                </p>
              </div>
            </label>
          </div>

          {/* Summary Box */}
          <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-center justify-between text-xs">
            <span className="text-indigo-300 font-medium">
              {t('mergeChapters.totalResultLabel')}
            </span>
            <span className="font-bold text-white">
              {t('mergeChapters.totalResultPages', { count: totalPages })}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-comic-800 bg-comic-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleMerge}
            disabled={isProcessing || orderedList.length < 2}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('mergeChapters.merging')}</span>
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4" />
                <span>{t('mergeChapters.mergeBtn')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
