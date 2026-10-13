import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderInput, Plus, Check, BookOpen, PlusCircle } from 'lucide-react';
import { ComicSessionSummary } from '../types';
import { isSessionChapter, isSessionTomo, cleanSeriesDisplayName } from '../utils/seriesGrouping';
import { useTranslation } from '../i18n';

interface MoveToSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSessions: ComicSessionSummary[];
  existingSeries: string[];
  allSessions?: ComicSessionSummary[];
  onConfirmMove: (sessionIds: string[], targetSeriesName: string) => Promise<void>;
  onOpenAppendChapters?: (targetTomo?: ComicSessionSummary, initialChapterIds?: string[]) => void;
}

export const MoveToSeriesModal: React.FC<MoveToSeriesModalProps> = ({
  isOpen,
  onClose,
  targetSessions,
  existingSeries,
  allSessions,
  onConfirmMove,
  onOpenAppendChapters
}) => {
  const { t } = useTranslation();
  const [selectedSeries, setSelectedSeries] = useState<string>(() => {
    return existingSeries.length > 0 ? existingSeries[0] : '';
  });
  const [customSeries, setCustomSeries] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || targetSessions.length === 0) return null;

  const isMulti = targetSessions.length > 1;
  const currentSeriesOfFirst = targetSessions[0].series || t('common.noSeries');

  const handleExecute = async () => {
    const finalSeries = isCustomMode ? customSeries.trim() : selectedSeries.trim();
    if (!finalSeries) {
      alert(t('moveToSeries.emptySeriesAlert'));
      return;
    }

    if (isMulti) {
      const ok = window.confirm(
        t('moveToSeries.confirmMultiMove', { count: targetSessions.length, series: finalSeries })
      );
      if (!ok) return;
    }

    setIsSaving(true);
    try {
      await onConfirmMove(
        targetSessions.map((s) => s.session_id),
        finalSeries
      );
      onClose();
    } catch (err: any) {
      alert(t('moveToSeries.errorMoving', { message: err.message }));
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-comic-900 border border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-comic-950/90 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderInput className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isMulti ? t('moveToSeries.titleMulti', { count: targetSessions.length }) : t('moveToSeries.titleSingle')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t('moveToSeries.currentSeries')} <strong className="text-indigo-300">{currentSeriesOfFirst}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition disabled:opacity-50"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Target Items Preview */}
          <div className="p-2.5 rounded-xl bg-comic-950 border border-comic-800/80 max-h-32 overflow-y-auto space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              {isMulti ? t('moveToSeries.selectedItemsMulti', { count: targetSessions.length }) : t('moveToSeries.itemToMove')}
            </span>
            {targetSessions.map((item) => (
              <div key={item.session_id} className="flex items-center gap-2 text-xs text-slate-200">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate flex-1">
                  {item.title || item.series || item.original_filename}
                </span>
                {item.number && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-comic-800 text-slate-300">
                    #{item.number}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Shortcut to append to Tomo if moving chapters */}
          {targetSessions.some(isSessionChapter) && onOpenAppendChapters && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <PlusCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-white">{t('moveToSeries.appendTomoPrompt')}</p>
                  <p className="text-[11px] text-amber-300/80 truncate">{t('moveToSeries.appendTomoDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAppendChapters(undefined, targetSessions.map((s) => s.session_id));
                }}
                className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs whitespace-nowrap shadow transition active:scale-95 shrink-0"
              >
                {t('moveToSeries.addToTomoBtn')}
              </button>
            </div>
          )}

          {/* Series Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">
              {t('moveToSeries.selectDestinationSeries')}
            </label>

            {/* List of existing series */}
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {existingSeries.map((sName) => {
                const isSelected = !isCustomMode && selectedSeries === sName;
                const seriesSessions = (allSessions || []).filter(
                  (s) => cleanSeriesDisplayName(s.series || s.original_filename) === sName
                );
                const tomos = seriesSessions.filter((s) => isSessionTomo(s));
                const chapters = seriesSessions.filter((s) => isSessionChapter(s));

                return (
                  <button
                    key={sName}
                    type="button"
                    onClick={() => {
                      setSelectedSeries(sName);
                      setIsCustomMode(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-comic-950/70 border-comic-800 hover:border-comic-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="truncate block font-bold">{sName}</span>
                      {seriesSessions.length > 0 && (
                        <span className="text-[10px] text-slate-400 block truncate font-normal mt-0.5">
                          {tomos.length > 0 ? `${tomos.length} ${t('sidebar.tomos')}` : ''}
                          {tomos.length > 0 && chapters.length > 0 ? ' • ' : ''}
                          {chapters.length > 0 ? `${chapters.length} ${t('sidebar.chapters')}` : ''}
                          {tomos.length > 0 && (tomos[0].volume ? ` [Vol. ${tomos[0].volume}]` : (tomos[0].title ? ` (${tomos[0].title})` : ''))}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}

              {/* Option to create a new series name */}
              <button
                type="button"
                onClick={() => setIsCustomMode(true)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${
                  isCustomMode
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                    : 'bg-comic-950/70 border-comic-800 hover:border-comic-700 text-slate-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('moveToSeries.createNewSeries')}</span>
                </div>
                {isCustomMode && <Check className="w-4 h-4 shrink-0" />}
              </button>
            </div>

            {/* Text input if creating a new series */}
            {isCustomMode && (
              <div className="mt-2 animate-in fade-in duration-150">
                <input
                  type="text"
                  autoFocus
                  value={customSeries}
                  onChange={(e) => setCustomSeries(e.target.value)}
                  placeholder={t('moveToSeries.newSeriesPlaceholder')}
                  className="w-full text-xs bg-comic-950 border border-indigo-500 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-comic-950/90 border-t border-comic-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-3.5 py-1.5 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isSaving || (isCustomMode && !customSeries.trim())}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5 active:scale-95"
          >
            <FolderInput className="w-3.5 h-3.5" />
            <span>{isSaving ? t('moveToSeries.moving') : isMulti ? t('moveToSeries.moveMulti', { count: targetSessions.length }) : t('moveToSeries.moveSingle')}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
