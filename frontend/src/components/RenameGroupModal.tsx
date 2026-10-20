import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Edit3, 
  Layers, 
  Check, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useTranslation } from '../i18n';

interface RenameGroupModalProps {
  isOpen: boolean;
  oldName: string;
  sessionCount: number;
  sessionIds: string[];
  onClose: () => void;
  onConfirmRename: (oldName: string, newName: string, sessionIds: string[], updateMatchingTitles: boolean) => Promise<void>;
}

export const RenameGroupModal: React.FC<RenameGroupModalProps> = ({
  isOpen,
  oldName,
  sessionCount,
  sessionIds,
  onClose,
  onConfirmRename
}) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState(oldName);
  const [updateMatchingTitles, setUpdateMatchingTitles] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(oldName);
      setUpdateMatchingTitles(true);
      setError(null);
      setIsSaving(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, oldName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError(t('renameGroup.emptyError') || 'El nombre de la serie no puede estar vacío.');
      return;
    }
    if (trimmed.toLowerCase() === oldName.trim().toLowerCase()) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onConfirmRename(oldName, trimmed, sessionIds, updateMatchingTitles);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al renombrar el grupo de serie');
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
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-500 dark:text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-sm">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('renameGroup.title') || 'Renombrar Serie / Grupo'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('renameGroup.subtitle') || 'Actualiza el nombre de la serie para todos los tomos y capítulos.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition disabled:opacity-50 cursor-pointer"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Group Banner */}
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-comic-950/80 border border-slate-200 dark:border-comic-800/80 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {t('renameGroup.currentName') || 'Nombre actual:'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {sessionCount} {sessionCount === 1 ? (t('common.work') || 'elemento') : (t('common.works') || 'elementos')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-200 truncate">
              <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span className="truncate" title={oldName}>{oldName}</span>
            </div>
          </div>

          {/* New Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>{t('renameGroup.newNameLabel') || 'Nuevo nombre de la serie:'}</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {t('renameGroup.required') || 'Obligatorio'}
              </span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isSaving}
              placeholder={t('renameGroup.newNamePlaceholder') || 'Ej: Blue Exorcist'}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-comic-950 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition font-medium"
            />
          </div>

          {/* Option: Update matching titles */}
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-comic-950/40 border border-slate-200 dark:border-comic-800/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={updateMatchingTitles}
              onChange={(e) => setUpdateMatchingTitles(e.target.checked)}
              disabled={isSaving}
              className="mt-0.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                {t('renameGroup.updateTitles') || 'Actualizar también los títulos que coincidan'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                {t('renameGroup.updateTitlesDesc') || 'Si un tomo tiene como título el nombre de la serie anterior, se actualizará automáticamente.'}
              </span>
            </div>
          </label>

          {/* Info note */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            💡 {t('renameGroup.infoNote') || 'Se actualizarán los metadatos (ComicInfo.xml y manifest) de todos los archivos de esta serie instantáneamente.'}
          </p>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-comic-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-comic-800 rounded-xl transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || !newName.trim() || newName.trim().toLowerCase() === oldName.trim().toLowerCase()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('common.saving')}...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('renameGroup.applyBtn') || `Renombrar ${sessionCount} elementos`}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
