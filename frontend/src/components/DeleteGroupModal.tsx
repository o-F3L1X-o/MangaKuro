import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Trash2, 
  AlertTriangle, 
  Check, 
  Bookmark, 
  BookOpen, 
  Loader2,
  ShieldAlert
} from 'lucide-react';
import { ComicSessionSummary } from '../types';
import { SeriesGroup, isSessionChapter } from '../utils/seriesGrouping';
import { getThumbUrl } from '../api';

export interface DeleteGroupModalProps {
  isOpen: boolean;
  group?: SeriesGroup | null;
  sessions?: ComicSessionSummary[] | null;
  onClose: () => void;
  onConfirmDelete: (sessionIds: string[]) => Promise<void>;
}

export const DeleteGroupModal: React.FC<DeleteGroupModalProps> = ({
  isOpen,
  group,
  sessions,
  onClose,
  onConfirmDelete
}) => {
  // Items to delete (either from group.sessions or custom sessions list)
  const itemsToDelete = useMemo(() => {
    if (group) return group.sessions;
    if (sessions) return sessions;
    return [];
  }, [group, sessions]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize selected IDs with all items when modal opens or items change
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(itemsToDelete.map((s) => s.session_id));
      setError(null);
      setIsDeleting(false);
    }
  }, [isOpen, itemsToDelete]);

  if (!isOpen || itemsToDelete.length === 0) return null;

  const titleName = group ? group.name : `${itemsToDelete.length} elementos`;

  const handleToggleItem = (sid: string) => {
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  const handleToggleAll = () => {
    if (selectedIds.length === itemsToDelete.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(itemsToDelete.map((s) => s.session_id));
    }
  };

  const totalPagesSelected = itemsToDelete
    .filter((s) => selectedIds.includes(s.session_id))
    .reduce((acc, curr) => acc + (curr.page_count || 0), 0);

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirmDelete(selectedIds);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar los tomos seleccionados');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-comic-900 border border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-comic-800 bg-comic-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {group ? `Eliminar Grupo Completo` : `Eliminar Elementos Seleccionados`}
              </h2>
              <p className="text-xs text-slate-400">
                {group ? `Borrar "${titleName}" de la zona de preparación (staging)` : `Borrar ${itemsToDelete.length} cómics seleccionados`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3 text-xs text-rose-200">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-white">
                ¿Seguro que deseas eliminar {group ? `el grupo "${titleName}"` : 'estos elementos'}?
              </p>
              <p className="text-rose-300/90 text-[11px] leading-relaxed">
                Se borrarán los archivos de trabajo y páginas temporales en disco de los {selectedIds.length} cómics seleccionados ({totalPagesSelected} páginas en total).
              </p>
              <p className="text-slate-400 text-[11px]">
                ℹ️ Los archivos que ya hayas <strong>exportado</strong> a tu biblioteca o descargas <strong>no se borrarán</strong>.
              </p>
            </div>
          </div>

          {/* Items Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold uppercase tracking-wider text-slate-300">
                Tomos y capítulos a eliminar ({selectedIds.length} de {itemsToDelete.length}):
              </label>
              <button
                type="button"
                onClick={handleToggleAll}
                disabled={isDeleting}
                className="text-indigo-400 hover:text-white font-semibold transition"
              >
                {selectedIds.length === itemsToDelete.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {itemsToDelete.map((item) => {
                const isChecked = selectedIds.includes(item.session_id);
                const isCap = isSessionChapter(item);

                return (
                  <div
                    key={item.session_id}
                    onClick={() => !isDeleting && handleToggleItem(item.session_id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 text-xs ${
                      isChecked
                        ? 'bg-rose-950/30 border-rose-700/60 shadow-sm'
                        : 'bg-comic-950/40 border-comic-800/80 hover:bg-comic-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border border-slate-700 bg-comic-900">
                        {isChecked && <Check className="w-3.5 h-3.5 text-rose-400 stroke-[3]" />}
                      </div>

                      {item.cover_thumb ? (
                        <img
                          src={getThumbUrl(item.session_id, item.cover_thumb)}
                          alt="Cover"
                          className="w-8 h-11 object-cover rounded bg-comic-950 shrink-0 border border-comic-700"
                        />
                      ) : (
                        <div className="w-8 h-11 rounded bg-comic-950 flex items-center justify-center shrink-0 border border-comic-800">
                          {isCap ? <Bookmark className="w-3.5 h-3.5 text-amber-500" /> : <BookOpen className="w-3.5 h-3.5 text-indigo-400" />}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">
                          {item.title || item.series || item.original_filename}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            isCap ? 'bg-amber-950 text-amber-300' : 'bg-indigo-950 text-indigo-300'
                          }`}>
                            {isCap ? 'Capítulo' : 'Tomo'} {item.volume ? `Vol.${item.volume}` : (item.number ? `#${item.number}` : '')}
                          </span>
                          <span>•</span>
                          <span>{item.page_count} páginas</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isChecked ? (
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                          Se eliminará
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Conservar</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-comic-950/80 border-t border-comic-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || selectedIds.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition active:scale-95 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Eliminando {selectedIds.length} elementos...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>
                  Eliminar {selectedIds.length} {selectedIds.length === 1 ? 'elemento' : 'elementos'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
