import React, { useState } from 'react';
import { 
  X, 
  BookMarked, 
  Sparkles, 
  Layers, 
  Palette, 
  CheckCircle2, 
  Eye, 
  Type,
  LayoutTemplate
} from 'lucide-react';
import { PageItem, SessionManifest } from '../types';
import { createChapterCover, getImageUrl } from '../api';

interface ChapterCoverModalProps {
  session: SessionManifest;
  targetPage: PageItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSession: SessionManifest) => void;
}

export const ChapterCoverModal: React.FC<ChapterCoverModalProps> = ({
  session,
  targetPage,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [chapterNumber, setChapterNumber] = useState('Capítulo 1');
  const [chapterTitle, setChapterTitle] = useState('');
  const [seriesName, setSeriesName] = useState(session.metadata.Series || '');
  const [style, setStyle] = useState<'minimal_white' | 'minimal_dark' | 'overlay_bg'>('minimal_white');
  const [actionType, setActionType] = useState<'replace' | 'insert'>('replace');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !targetPage) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterNumber.trim()) {
      setError('Por favor indica al menos el número de capítulo.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const updated = await createChapterCover(session.session_id, {
        chapter_number: chapterNumber.trim(),
        chapter_title: chapterTitle.trim(),
        series_name: seriesName.trim() || undefined,
        style,
        bg_page_id: style === 'overlay_bg' ? targetPage.id : undefined,
        replace_page_id: actionType === 'replace' ? targetPage.id : undefined,
        insert_before_page_id: actionType === 'insert' ? targetPage.id : undefined
      });
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al generar la portadilla de capítulo');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-comic-900 border border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-comic-950/80 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">
              Generador de Portadilla de Capítulo (Tankōbon)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Live Preview Box */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Vista Previa de la Portadilla
            </label>
            <div className="w-full aspect-[16/10] sm:aspect-[2/1] rounded-xl overflow-hidden relative border border-comic-700/80 flex items-center justify-center select-none shadow-inner">
              {style === 'overlay_bg' ? (
                <>
                  <img
                    src={getImageUrl(session.session_id, targetPage.filename)}
                    alt="Fondo de página actual"
                    className="absolute inset-0 w-full h-full object-cover filter blur-[1px]"
                  />
                  {/* Translucent Frosted Glass Card */}
                  <div className="relative z-10 w-[84%] py-6 px-4 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/20 text-center space-y-1.5 shadow-2xl">
                    {seriesName && (
                      <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                        {seriesName}
                      </p>
                    )}
                    <h2 className="text-xl sm:text-2xl font-black text-indigo-400 tracking-tight">
                      {chapterNumber || 'Capítulo 1'}
                    </h2>
                    {chapterTitle && (
                      <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                        {chapterTitle}
                      </h3>
                    )}
                  </div>
                </>
              ) : style === 'minimal_dark' ? (
                <div className="w-full h-full bg-slate-900 border border-slate-700/60 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <div className="w-[90%] h-[90%] border border-slate-700/80 rounded-xl flex flex-col items-center justify-center p-4 space-y-2">
                    {seriesName && (
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {seriesName}
                      </p>
                    )}
                    <div className="w-12 h-0.5 bg-indigo-500 rounded-full" />
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      {chapterNumber || 'Capítulo 1'}
                    </h2>
                    {chapterTitle && (
                      <h3 className="text-base sm:text-lg font-bold text-indigo-300">
                        {chapterTitle}
                      </h3>
                    )}
                  </div>
                </div>
              ) : (
                /* minimal_white */
                <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <div className="w-[90%] h-[90%] border border-slate-200 rounded-xl flex flex-col items-center justify-center p-4 space-y-2 shadow-sm">
                    {seriesName && (
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {seriesName}
                      </p>
                    )}
                    <div className="w-12 h-0.5 bg-indigo-600 rounded-full" />
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {chapterNumber || 'Capítulo 1'}
                    </h2>
                    {chapterTitle && (
                      <h3 className="text-base sm:text-lg font-bold text-slate-700">
                        {chapterTitle}
                      </h3>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Número del Capítulo <span className="text-indigo-400">*</span>
              </label>
              <input
                type="text"
                value={chapterNumber}
                onChange={(e) => setChapterNumber(e.target.value)}
                placeholder="ej. Capítulo 1, Episodio 24, Ch. 05"
                className="w-full px-3 py-2 rounded-lg bg-comic-950 border border-comic-700/80 text-white text-sm focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Título del Capítulo
              </label>
              <input
                type="text"
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                placeholder="ej. El final del túnel, Despertar..."
                className="w-full px-3 py-2 rounded-lg bg-comic-950 border border-comic-700/80 text-white text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre de la Serie (Opcional, se muestra arriba)
              </label>
              <input
                type="text"
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                placeholder="ej. El Comienzo Después del Final"
                className="w-full px-3 py-2 rounded-lg bg-comic-950 border border-comic-700/80 text-white text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Style Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Estilo de Portadilla
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStyle('minimal_white')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  style === 'minimal_white'
                    ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                    : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Palette className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Blanco Clásico</span>
                </div>
                <span className="text-[10px] text-slate-400">Estilo Tankōbon impreso tradicional</span>
              </button>

              <button
                type="button"
                onClick={() => setStyle('minimal_dark')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  style === 'minimal_dark'
                    ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                    : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Type className="w-3.5 h-3.5 text-purple-400" />
                  <span>Negro Grafito</span>
                </div>
                <span className="text-[10px] text-slate-400">Minimalista oscuro para lectura nocturna</span>
              </button>

              <button
                type="button"
                onClick={() => setStyle('overlay_bg')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  style === 'overlay_bg'
                    ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                    : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <LayoutTemplate className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Plantilla / Dibujo</span>
                </div>
                <span className="text-[10px] text-slate-400">Usa la imagen actual con tarjeta translúcida</span>
              </button>
            </div>
          </div>

          {/* Action Destination */}
          <div className="p-4 rounded-xl bg-comic-950/60 border border-comic-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              ¿Qué deseas hacer con la página actual #{targetPage.order}?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-comic-900 border border-comic-700/80 cursor-pointer hover:border-indigo-500">
                <input
                  type="radio"
                  name="actionType"
                  value="replace"
                  checked={actionType === 'replace'}
                  onChange={() => setActionType('replace')}
                  className="accent-indigo-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-white block">Reemplazar página actual</span>
                  <span className="text-[11px] text-slate-400">Sustituye la página de créditos sucia/con errores</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-comic-900 border border-comic-700/80 cursor-pointer hover:border-indigo-500">
                <input
                  type="radio"
                  name="actionType"
                  value="insert"
                  checked={actionType === 'insert'}
                  onChange={() => setActionType('insert')}
                  className="accent-indigo-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-white block">Insertar como nueva página</span>
                  <span className="text-[11px] text-slate-400">Inserta la portadilla justo antes de la página #{targetPage.order}</span>
                </div>
              </label>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-comic-950/80 border-t border-comic-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-comic-700 text-slate-300 hover:bg-comic-800 text-xs font-semibold transition"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isGenerating}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isGenerating ? 'Generando e Insertando...' : 'Crear Portadilla de Capítulo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
