import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  HardDrive,
  CornerLeftUp,
  RefreshCw,
  AlertCircle,
  Check,
  Network,
  Info
} from 'lucide-react';
import { browseServerFs } from '../api';
import { ServerFsBrowseResult, ServerFsEntry, QuickRoot } from '../types';
import { useTranslation } from '../i18n';

interface DirectoryPickerModalProps {
  isOpen: boolean;
  initialPath?: string;
  title?: string;
  onSelect: (selectedPath: string) => void;
  onClose: () => void;
}

export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  isOpen,
  initialPath,
  title,
  onSelect,
  onClose
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [quickRoots, setQuickRoots] = useState<QuickRoot[]>([]);
  const [directories, setDirectories] = useState<ServerFsEntry[]>([]);
  const [pathInput, setPathInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = async (targetPath?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data: ServerFsBrowseResult = await browseServerFs(targetPath);
      setCurrentPath(data.current_path);
      setParentPath(data.parent_path);
      setQuickRoots(data.quick_roots || []);
      setDirectories(data.directories || []);
      setPathInput(data.current_path);
    } catch (err: any) {
      console.error('Error browsing server filesystem:', err);
      setError(err?.message || 'Error al acceder al directorio en el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory(initialPath && initialPath.trim() ? initialPath.trim() : undefined);
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  const handleNavigateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-comic-950/90 border-b border-slate-200 dark:border-comic-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {title || t('settings.browseTitle') || 'Explorar Directorios del Servidor'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecciona la carpeta física para el almacenamiento de staging
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-comic-800 transition"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Guidance Banner */}
        <div className="px-5 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50 flex items-start gap-2.5 text-[11px] text-indigo-900 dark:text-indigo-200">
          <Network className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
          <div className="leading-snug">
            <span className="font-semibold">Montajes de Red (SMB / NAS):</span> En Docker (Linux), los recursos de red de Windows o NAS se leen habitualmente en <code className="px-1 py-0.5 rounded bg-white/70 dark:bg-comic-900 font-mono text-[10px]">/mnt</code> o <code className="px-1 py-0.5 rounded bg-white/70 dark:bg-comic-900 font-mono text-[10px]">/media</code>. En Windows nativo puedes usar discos (<code className="px-1 py-0.5 rounded bg-white/70 dark:bg-comic-900 font-mono text-[10px]">E:\</code>) o rutas UNC (<code className="px-1 py-0.5 rounded bg-white/70 dark:bg-comic-900 font-mono text-[10px]">\\servidor\share</code>).
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 custom-scrollbar">
          {/* Quick Roots Chips */}
          {quickRoots.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                <span>Accesos directos / Unidades:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {quickRoots.map((qr) => {
                  const isActive = currentPath === qr.path;
                  return (
                    <button
                      key={qr.path}
                      type="button"
                      onClick={() => loadDirectory(qr.path)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-slate-300 border-slate-300 dark:border-comic-700'
                      }`}
                    >
                      {qr.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Path Navigation Bar */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-comic-950 border border-slate-200 dark:border-comic-800">
            <button
              type="button"
              disabled={!parentPath || isLoading}
              onClick={() => parentPath && loadDirectory(parentPath)}
              className="p-1.5 rounded-lg bg-white dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-comic-700 transition"
              title="Subir un nivel"
            >
              <CornerLeftUp className="w-4 h-4" />
            </button>

            <form onSubmit={handleNavigateSubmit} className="flex-1 flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Ruta en el servidor (ej: /mnt/staging, E:\MangaKuro_Data...)"
                className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shrink-0"
              >
                Ir
              </button>
            </form>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => loadDirectory(currentPath)}
              className="p-1.5 rounded-lg bg-white dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-comic-700 transition shrink-0"
              title="Actualizar directorio"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Subdirectories Grid */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Carpetas ({directories.length})
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-xs">Leyendo carpetas del servidor...</span>
              </div>
            ) : directories.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-comic-800 text-center text-slate-500 dark:text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <Folder className="w-8 h-8 text-slate-300 dark:text-comic-700" />
                <span>Esta carpeta no contiene subdirectorios adicionales.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {directories.map((dir) => (
                  <button
                    key={dir.path}
                    type="button"
                    onClick={() => loadDirectory(dir.path)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/60 dark:bg-comic-950/60 dark:hover:bg-comic-800 border border-slate-200 dark:border-comic-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="w-4 h-4 text-amber-500 shrink-0 group-hover:scale-110 transition" />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {dir.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {dir.has_staging && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          Preparación
                        </span>
                      )}
                      {dir.comic_count !== undefined && dir.comic_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                          {dir.comic_count}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Path Confirmation & Action Buttons */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-comic-950/90 border-t border-slate-200 dark:border-comic-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="w-full sm:w-auto min-w-0 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold shrink-0">Ruta seleccionada:</span>
            <span className="font-mono text-slate-900 dark:text-white truncate font-medium bg-slate-200/70 dark:bg-comic-900 px-2 py-0.5 rounded border border-slate-300 dark:border-comic-800 text-[11px]" title={currentPath}>
              {currentPath || '(Ninguna carpeta seleccionada)'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-comic-800 text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSelectCurrent}
              disabled={!currentPath || isLoading}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Check className="w-4 h-4" />
              <span>Seleccionar esta carpeta</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
