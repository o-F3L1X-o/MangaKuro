import React, { useState } from 'react';
import { X, Scissors, ArrowRight, ArrowLeft } from 'lucide-react';
import { PageItem } from '../types';
import { getImageUrl } from '../api';

interface SplitSpreadModalProps {
  sessionId: string;
  page: PageItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSplit: (pageId: string, readingDirection: 'rtl' | 'ltr') => void;
}

export const SplitSpreadModal: React.FC<SplitSpreadModalProps> = ({
  sessionId,
  page,
  isOpen,
  onClose,
  onConfirmSplit
}) => {
  const [readingDirection, setReadingDirection] = useState<'rtl' | 'ltr'>('rtl');

  if (!isOpen || !page) return null;

  const handleConfirm = () => {
    onConfirmSplit(page.id, readingDirection);
    onClose();
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
            <Scissors className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Dividir Doble Página #{page.order}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview with Cut Line */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="relative w-full aspect-[16/10] bg-black/60 rounded-xl overflow-hidden border border-comic-800 flex items-center justify-center">
            <img
              src={getImageUrl(sessionId, page.filename)}
              alt="Doble página"
              className="w-full h-full object-contain"
            />
            {/* Middle Cut Guide */}
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] pointer-events-none flex flex-col items-center justify-center">
              <span className="bg-emerald-500 text-comic-950 text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow">
                CORTE
              </span>
            </div>

            {/* Left and Right Page Indicator Overlays */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/75 backdrop-blur-md text-xs font-mono font-bold text-white border border-slate-700">
              {readingDirection === 'rtl' ? 'Página 2 (Izquierda)' : 'Página 1 (Izquierda)'}
            </div>
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/75 backdrop-blur-md text-xs font-mono font-bold text-white border border-slate-700">
              {readingDirection === 'rtl' ? 'Página 1 (Derecha)' : 'Página 2 (Derecha)'}
            </div>
          </div>

          {/* Direction Options */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Orden de lectura tras el corte
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReadingDirection('rtl')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  readingDirection === 'rtl'
                    ? 'bg-purple-950/60 border-purple-500 text-purple-200 ring-2 ring-purple-500/30'
                    : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">Manga Oriental (RTL)</span>
                  <ArrowLeft className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-xs text-slate-400">
                  Primero la mitad <strong>derecha</strong>, luego la mitad <strong>izquierda</strong>.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setReadingDirection('ltr')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                  readingDirection === 'ltr'
                    ? 'bg-blue-950/60 border-blue-500 text-blue-200 ring-2 ring-blue-500/30'
                    : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">Cómic Occidental (LTR)</span>
                  <ArrowRight className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xs text-slate-400">
                  Primero la mitad <strong>izquierda</strong>, luego la mitad <strong>derecha</strong>.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-comic-950/80 border-t border-comic-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-comic-700 text-slate-300 hover:bg-comic-800 text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95"
          >
            <Scissors className="w-4 h-4" />
            <span>Dividir en 2 Páginas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
