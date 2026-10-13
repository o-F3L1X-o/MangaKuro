import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Layers, 
  PlusCircle, 
  BookOpen, 
  Bookmark, 
  CheckSquare, 
  Square, 
  AlertCircle, 
  Loader2, 
  ChevronDown 
} from 'lucide-react';
import { ComicSessionSummary, SessionManifest } from '../types';
import { appendChaptersToTomo, getThumbUrl } from '../api';
import { isSessionChapter, isSessionTomo, cleanSeriesDisplayName } from '../utils/seriesGrouping';
import { useTranslation } from '../i18n';

interface AppendChaptersModalProps {
  isOpen: boolean;
  targetTomo: ComicSessionSummary | null;
  allSessions: ComicSessionSummary[];
  initialSelectedChapterIds?: string[];
  onClose: () => void;
  onSuccess: (updatedTomo: SessionManifest, incorporatedSessionIds: string[]) => void;
}

export const AppendChaptersModal: React.FC<AppendChaptersModalProps> = ({
  isOpen,
  targetTomo,
  allSessions,
  initialSelectedChapterIds = [],
  onClose,
  onSuccess
}) => {
  const { t } = useTranslation();
  const allTomos = useMemo(() => allSessions.filter((s) => isSessionTomo(s)), [allSessions]);

  const [selectedTomoId, setSelectedTomoId] = useState<string | null>(targetTomo?.session_id || null);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedChapterIds);
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [addCovers, setAddCovers] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize target tomo and selected chapters on modal open
  useEffect(() => {
    if (!isOpen) return;

    let destinationId = targetTomo?.session_id || null;

    // If no targetTomo passed explicitly, try to infer best tomo from selected chapters
    if (!destinationId && initialSelectedChapterIds.length > 0) {
      const firstChapter = allSessions.find((s) => initialSelectedChapterIds.includes(s.session_id));
      if (firstChapter) {
        const chapterSeries = cleanSeriesDisplayName(firstChapter.series || firstChapter.original_filename);
        const matchingTomo = allTomos.find(
          (t) => cleanSeriesDisplayName(t.series || t.original_filename) === chapterSeries
        );
        if (matchingTomo) {
          destinationId = matchingTomo.session_id;
        }
      }
    }

    // Fallback to first available tomo if still none selected
    if (!destinationId && allTomos.length > 0) {
      destinationId = allTomos[0].session_id;
    }

    setSelectedTomoId(destinationId);

    if (initialSelectedChapterIds && initialSelectedChapterIds.length > 0) {
      setSelectedIds(initialSelectedChapterIds);
    } else if (destinationId) {
      const destTomo = allTomos.find((t) => t.session_id === destinationId);
      if (destTomo) {
        const tomoSeries = cleanSeriesDisplayName(destTomo.series || destTomo.original_filename);
        const matchingChapters = allSessions
          .filter((s) => s.session_id !== destTomo.session_id && isSessionChapter(s))
          .filter((s) => cleanSeriesDisplayName(s.series || s.original_filename) === tomoSeries)
          .map((s) => s.session_id);
        setSelectedIds(matchingChapters);
      }
    }

    setError(null);
  }, [isOpen, targetTomo, initialSelectedChapterIds, allSessions, allTomos]);

  if (!isOpen) return null;

  const effectiveTomo = allTomos.find((t) => t.session_id === selectedTomoId) || targetTomo || allTomos[0] || null;
  const tomoSeries = effectiveTomo ? cleanSeriesDisplayName(effectiveTomo.series || effectiveTomo.original_filename) : '';

  // Filter available chapters (excluding target tomo itself)
  const availableChapters = allSessions.filter((s) => {
    if (effectiveTomo && s.session_id === effectiveTomo.session_id) return false;
    if (!isSessionChapter(s)) return false;
    if (selectedIds.includes(s.session_id)) return true;
    if (showAllSeries) return true;
    return cleanSeriesDisplayName(s.series || s.original_filename) === tomoSeries;
  });

  const selectedChapters = allSessions.filter((s) => selectedIds.includes(s.session_id));
  const pagesToAdd = selectedChapters.reduce((acc, c) => acc + c.page_count, 0) + (addCovers ? selectedChapters.length : 0);
  const projectedTotalPages = effectiveTomo ? effectiveTomo.page_count + pagesToAdd : 0;

  const handleToggleChapter = (id: string) => {
    setSelectedIds((prev) => 
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === availableChapters.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(availableChapters.map((c) => c.session_id));
    }
  };

  const handleConfirmAppend = async () => {
    if (!effectiveTomo) {
      setError(t('appendChapters.noTomos'));
      return;
    }

    if (selectedIds.length === 0) {
      setError(t('appendChapters.noChaptersAvailable'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const updatedManifest = await appendChaptersToTomo(
        effectiveTomo.session_id,
        selectedIds,
        true, // Always transfer directly without duplicating
        addCovers
      );

      onSuccess(updatedManifest, selectedIds);
      onClose();
    } catch (err: any) {
      setError(err.message || t('appendChapters.noChaptersAvailable'));
    } finally {
      setIsProcessing(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-comic-900 border border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-comic-800 bg-comic-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('appendChapters.title')}</span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('appendChapters.subtitle')}
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/80 border border-red-700/60 rounded-xl text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {allTomos.length === 0 ? (
            <div className="p-6 text-center bg-comic-950/60 rounded-xl border border-comic-800 text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-amber-400 opacity-80" />
              <h4 className="text-sm font-bold text-white">{t('appendChapters.noTomos')}</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {t('appendChapters.noTomosDesc', { count: selectedIds.length })}
              </p>
            </div>
          ) : (
            <>
              {/* Destination Tomo Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>{t('appendChapters.selectTargetTomo')}</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {t('appendChapters.tomosAvailable', { count: allTomos.length, plural: allTomos.length > 1 ? 's' : '' })}
                  </span>
                </label>

                <div className="relative">
                  <select
                    value={effectiveTomo?.session_id || ''}
                    onChange={(e) => setSelectedTomoId(e.target.value)}
                    className="w-full text-xs font-semibold bg-comic-950 border border-comic-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 transition cursor-pointer"
                  >
                    {allTomos.map((tomo) => {
                      const sName = cleanSeriesDisplayName(tomo.series || tomo.original_filename);
                      const isMatch = sName === tomoSeries;
                      const volBadge = tomo.volume ? ` [Vol. ${tomo.volume}]` : (tomo.number ? ` [#${tomo.number}]` : '');
                      
                      let titleDesc = '';
                      if (tomo.title && tomo.title.trim().toLowerCase() !== sName.trim().toLowerCase()) {
                        titleDesc = ` — "${tomo.title.trim()}"`;
                      } else if (tomo.original_filename && tomo.original_filename.trim().toLowerCase() !== sName.trim().toLowerCase()) {
                        titleDesc = ` — ${tomo.original_filename}`;
                      }

                      return (
                        <option key={tomo.session_id} value={tomo.session_id}>
                          {isMatch ? '★ ' : ''}📖 {sName}{volBadge}{titleDesc} ({tomo.page_count} {t('common.pages')})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Target Tomo Summary Card */}
              {effectiveTomo && (
                <div className="p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-xl flex items-center gap-3.5">
                  <div className="w-11 h-16 bg-comic-900 rounded-lg overflow-hidden border border-amber-500/40 shrink-0 flex items-center justify-center">
                    {effectiveTomo.cover_thumb ? (
                      <img
                        src={getThumbUrl(effectiveTomo.session_id, effectiveTomo.cover_thumb)}
                        alt={effectiveTomo.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px] uppercase border border-amber-500/40">
                        {t('appendChapters.targetTomoBadge')}
                      </span>
                      {effectiveTomo.volume && (
                        <span className="text-[10px] text-amber-300 font-mono font-semibold bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800">
                          {t('appendChapters.volumeBadge', { vol: effectiveTomo.volume })}
                        </span>
                      )}
                      {effectiveTomo.number && (
                        <span className="text-[10px] text-indigo-300 font-mono font-semibold bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800">
                          #{effectiveTomo.number}
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <h3 className="text-sm font-bold text-white truncate">
                        {cleanSeriesDisplayName(effectiveTomo.series || effectiveTomo.original_filename)}
                      </h3>
                      {effectiveTomo.title && effectiveTomo.title.trim().toLowerCase() !== cleanSeriesDisplayName(effectiveTomo.series || effectiveTomo.original_filename).toLowerCase() && (
                        <p className="text-xs text-amber-300 font-medium truncate mt-0.5">
                          "{effectiveTomo.title}"
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                        {effectiveTomo.original_filename}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {t('appendChapters.currentPages', { count: effectiveTomo.page_count })}
                      {selectedIds.length > 0 && (
                        <span className="text-emerald-400 font-mono ml-2 font-bold">
                          {t('appendChapters.projectedPages', { total: projectedTotalPages, added: pagesToAdd })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Chapters Selection Header */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">
                    {t('appendChapters.chaptersToIncorporate', { selected: selectedIds.length, total: availableChapters.length })}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[11px] text-indigo-400 hover:text-white font-semibold transition"
                  >
                    {selectedIds.length === availableChapters.length ? t('common.deselectAll') : t('common.selectAll')}
                  </button>
                </div>

                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showAllSeries}
                    onChange={(e) => setShowAllSeries(e.target.checked)}
                    className="rounded border-comic-700 bg-comic-800 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>{t('appendChapters.viewOtherMangaChapters')}</span>
                </label>
              </div>

              {/* Chapters List */}
              {availableChapters.length === 0 ? (
                <div className="p-8 text-center bg-comic-950/60 rounded-xl border border-comic-800 text-slate-500 space-y-1.5">
                  <Bookmark className="w-8 h-8 mx-auto text-slate-600 opacity-60" />
                  <p className="text-xs font-semibold text-slate-400">{t('appendChapters.noChaptersAvailable')}</p>
                  <p className="text-[11px]">
                    {showAllSeries 
                      ? t('appendChapters.noChaptersInApp')
                      : t('appendChapters.noChaptersInSeries', { series: tomoSeries })}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {availableChapters.map((cap) => {
                    const isChecked = selectedIds.includes(cap.session_id);
                    return (
                      <div
                        key={cap.session_id}
                        onClick={() => handleToggleChapter(cap.session_id)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isChecked
                            ? 'bg-amber-950/40 border-amber-500/70 shadow-sm'
                            : 'bg-comic-950/60 border-comic-800/80 hover:border-comic-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button type="button" className="p-0.5 text-slate-400 hover:text-white shrink-0">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>

                          <div className="w-7 h-10 bg-comic-900 rounded overflow-hidden border border-slate-700/60 shrink-0 flex items-center justify-center">
                            {cap.cover_thumb ? (
                              <img
                                src={getThumbUrl(cap.session_id, cap.cover_thumb)}
                                alt={cap.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Bookmark className="w-3.5 h-3.5 text-purple-400" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded bg-purple-950/80 border border-purple-700/60 text-purple-300 font-bold text-[9px]">
                                {cap.number ? `${t('common.chapter')} #${cap.number}` : t('common.chapter')}
                              </span>
                              {showAllSeries && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                  {cleanSeriesDisplayName(cap.series || cap.original_filename)}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-semibold text-white truncate max-w-[260px] mt-0.5">
                              {cap.title || cap.original_filename}
                            </h4>
                          </div>
                        </div>

                        <div className="text-right shrink-0 text-slate-400 font-mono text-[11px]">
                          <span>{cap.page_count} {t('common.pages')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Options & Direct Transfer Notice */}
              <div className="p-3.5 bg-comic-950/80 border border-comic-800/80 rounded-xl space-y-2.5 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <span className="text-amber-400 font-bold text-sm">ℹ️</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-white">{t('appendChapters.directTransferTitle')}</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t('appendChapters.directTransferDesc')}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-comic-800/60">
                  <input
                    type="checkbox"
                    checked={addCovers}
                    onChange={(e) => setAddCovers(e.target.checked)}
                    className="rounded border-comic-700 bg-comic-800 text-indigo-600 focus:ring-0 w-4 h-4"
                  />
                  <div className="min-w-0">
                    <span className="font-semibold text-white">{t('appendChapters.insertCoverTitle')}</span>
                    <p className="text-[10px] text-slate-400">{t('appendChapters.insertCoverDesc')}</p>
                  </div>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-comic-800 bg-comic-950/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-bold transition disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleConfirmAppend}
            disabled={isProcessing || selectedIds.length === 0 || !effectiveTomo}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black shadow-lg shadow-amber-600/30 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>{t('appendChapters.incorporating')}</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4 text-slate-950" />
                <span>
                  {t('appendChapters.confirmAppendBtn', { count: selectedIds.length, plural: selectedIds.length > 1 ? 's' : '' })}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

