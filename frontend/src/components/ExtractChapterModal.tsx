import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Bookmark, 
  ArrowRight, 
  Layers, 
  BookOpen, 
  Scissors, 
  FolderInput,
  Loader2
} from 'lucide-react';
import { PageItem, ComicSessionSummary, SessionManifest } from '../types';
import { extractChapter, movePagesToSession, getThumbUrl } from '../api';
import { cleanSeriesDisplayName } from '../utils/seriesGrouping';

interface ExtractChapterModalProps {
  isOpen: boolean;
  sourceSession: SessionManifest;
  selectedPageIds: string[];
  allSessions: ComicSessionSummary[];
  initialTab?: 'new_chapter' | 'move_to_session';
  onClose: () => void;
  onSuccess: (updatedSource: SessionManifest | null, newOrTargetSession?: SessionManifest) => void;
}

export const ExtractChapterModal: React.FC<ExtractChapterModalProps> = ({
  isOpen,
  sourceSession,
  selectedPageIds,
  allSessions,
  initialTab = 'new_chapter',
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'new_chapter' | 'move_to_session'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  
  // Tab 1: New Chapter
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');

  // Tab 2: Move to existing session (ordered: same series tomos first)
  const sourceSeries = cleanSeriesDisplayName(sourceSession.metadata.Series || sourceSession.original_filename);
  const otherSessions = useMemo(() => {
    return allSessions
      .filter((s) => s.session_id !== sourceSession.session_id)
      .sort((a, b) => {
        const sameSeriesA = cleanSeriesDisplayName(a.series || a.original_filename) === sourceSeries;
        const sameSeriesB = cleanSeriesDisplayName(b.series || b.original_filename) === sourceSeries;
        if (sameSeriesA && !sameSeriesB) return -1;
        if (!sameSeriesA && sameSeriesB) return 1;
        if (a.item_type === 'tomo' && b.item_type !== 'tomo') return -1;
        if (a.item_type !== 'tomo' && b.item_type === 'tomo') return 1;
        return 0;
      });
  }, [allSessions, sourceSession.session_id, sourceSeries]);

  const [targetSessionId, setTargetSessionId] = useState<string>('');

  useEffect(() => {
    if (otherSessions.length > 0 && (!targetSessionId || !otherSessions.some((s) => s.session_id === targetSessionId))) {
      setTargetSessionId(otherSessions[0].session_id);
    }
  }, [otherSessions, targetSessionId]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecute = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      if (activeTab === 'new_chapter') {
        if (!chapterNumber.trim()) {
          setError('Por favor indica el número de capítulo (ej. 1, 05)');
          setIsProcessing(false);
          return;
        }

        const res = await extractChapter(sourceSession.session_id, {
          page_ids: selectedPageIds,
          chapter_number: chapterNumber.trim(),
          chapter_title: chapterTitle.trim() || undefined,
          remove_from_source: true
        });

        onSuccess(res.source_session, res.new_session);
        onClose();
      } else {
        if (!targetSessionId) {
          setError('Selecciona el tomo o cómic de destino');
          setIsProcessing(false);
          return;
        }

        const res = await movePagesToSession(sourceSession.session_id, {
          target_session_id: targetSessionId,
          page_ids: selectedPageIds,
          remove_from_source: true
        });

        onSuccess(res.source_session, res.target_session);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Error durante la operación');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-comic-900 border border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-comic-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Separar o Mover Páginas</h2>
              <p className="text-xs text-slate-400">
                {selectedPageIds.length} {selectedPageIds.length === 1 ? 'página seleccionada' : 'páginas seleccionadas'}
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

        {/* Tab Selector */}
        <div className="flex border-b border-comic-800 bg-comic-950/40 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('new_chapter')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'new_chapter'
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-comic-900'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Crear Nuevo Capítulo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('move_to_session')}
            disabled={otherSessions.length === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 ${
              activeTab === 'move_to_session'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-comic-900'
            }`}
            title={otherSessions.length === 0 ? 'No hay otros cómics en staging' : ''}
          >
            <FolderInput className="w-4 h-4" />
            <span>Mover a otro Tomo ({otherSessions.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {activeTab === 'new_chapter' ? (
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Número del nuevo capítulo <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={chapterNumber}
                  onChange={(e) => setChapterNumber(e.target.value)}
                  placeholder="Ej. 1, 05, 12.5"
                  className="w-full px-3 py-2 rounded-xl bg-comic-950 border border-comic-700 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Título del capítulo (opcional)
                </label>
                <input
                  type="text"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder="Ej. El Despertar, Prólogo..."
                  className="w-full px-3 py-2 rounded-xl bg-comic-950 border border-comic-700 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300">
                Selecciona el Tomo o Capítulo destino
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {otherSessions.map((item) => {
                  const isSelected = item.session_id === targetSessionId;
                  const sName = cleanSeriesDisplayName(item.series || item.original_filename);
                  return (
                    <div
                      key={item.session_id}
                      onClick={() => setTargetSessionId(item.session_id)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 text-xs ${
                        isSelected
                          ? 'bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-500'
                          : 'bg-comic-950/60 border-comic-800 hover:bg-comic-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-12 bg-comic-900 rounded overflow-hidden border border-slate-700/60 shrink-0 flex items-center justify-center">
                          {item.cover_thumb ? (
                            <img
                              src={getThumbUrl(item.session_id, item.cover_thumb)}
                              alt={item.title || sName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <BookOpen className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white truncate max-w-[180px]">
                              {sName}
                            </span>
                            {item.volume && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300 font-mono text-[10px] font-semibold">
                                Vol #{item.volume}
                              </span>
                            )}
                            {item.number && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono text-[10px] font-semibold">
                                #{item.number}
                              </span>
                            )}
                          </div>
                          {item.title && item.title.trim().toLowerCase() !== sName.trim().toLowerCase() && (
                            <p className="text-xs text-amber-300 font-medium truncate mt-0.5">
                              "{item.title}"
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {item.item_type === 'capitulo' ? 'Capítulo' : 'Tomo'} • {item.page_count} páginas • <span className="opacity-75 font-mono text-[10px]">{item.original_filename}</span>
                          </p>
                        </div>
                      </div>
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                      }`} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Direct Transfer Information Note */}
          <div className="pt-2 border-t border-comic-800">
            {selectedPageIds.length >= sourceSession.pages.length ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                <span className="text-sm">⚠️</span>
                <div>
                  <p className="font-semibold text-white">Transferencia completa del elemento</p>
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
                    Estás transfiriendo todas las páginas ({selectedPageIds.length}). Este elemento se incorporará directamente en el destino y se retirará del listado al quedar vacío.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200 flex items-start gap-2.5">
                <span className="text-sm">ℹ️</span>
                <div>
                  <p className="font-semibold text-white">Transferencia directa de páginas</p>
                  <p className="text-[11px] text-indigo-300/80 mt-0.5">
                    Se transferirán {selectedPageIds.length} página(s) al destino y se quitarán de este origen. Las {sourceSession.pages.length - selectedPageIds.length} páginas restantes continuarán aquí.
                  </p>
                </div>
              </div>
            )}
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
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleExecute}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg transition active:scale-95 ${
              activeTab === 'new_chapter'
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : activeTab === 'new_chapter' ? (
              <>
                <Bookmark className="w-4 h-4" />
                <span>Crear Capítulo</span>
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span>Transferir Páginas</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
