import React, { useState } from 'react';
import { X, Layers, Sparkles, CheckCircle2 } from 'lucide-react';
import { PageItem } from '../types';
import { getThumbUrl } from '../api';
import { useTranslation } from '../i18n';

interface WebtoonSlicerModalProps {
  sessionId: string;
  page: PageItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSlice: (pageId: string, maxHeight: number) => void;
}

export const WebtoonSlicerModal: React.FC<WebtoonSlicerModalProps> = ({
  sessionId,
  page,
  isOpen,
  onClose,
  onConfirmSlice
}) => {
  const { t } = useTranslation();
  const [maxHeight, setMaxHeight] = useState(2500);

  if (!isOpen || !page) return null;

  const estimatedSlices = Math.ceil(page.height / maxHeight);

  const handleConfirm = () => {
    onConfirmSlice(page.id, maxHeight);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-comic-900 border border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-comic-950/80 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">{t('webtoonSlicer.modalTitle', { order: page.order })}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4 bg-comic-950/60 p-4 rounded-xl border border-comic-800">
            <div className="w-16 h-28 bg-comic-950 rounded-lg overflow-hidden border border-slate-700 shrink-0 flex items-center justify-center">
              <img
                src={getThumbUrl(sessionId, page.thumb_filename)}
                alt="Webtoon strip"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-mono">
                {t('webtoonSlicer.dimensions')} <strong className="text-cyan-300">{page.width} × {page.height} px</strong>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {t('webtoonSlicer.longStripWarning')}
              </p>
              <div className="text-xs text-emerald-400 flex items-center gap-1 font-semibold pt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('webtoonSlicer.autoCutBadge')}</span>
              </div>
            </div>
          </div>

          {/* Slicing Height Option */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              {t('webtoonSlicer.maxHeightLabel')} <strong className="text-cyan-400">{maxHeight} px</strong> {t('webtoonSlicer.resultingPages', { count: estimatedSlices })}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1800, 2200, 2500, 3000].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setMaxHeight(h)}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition ${
                    maxHeight === h
                      ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 ring-2 ring-cyan-500/30'
                      : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                  }`}
                >
                  {h} px
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {t('webtoonSlicer.algorithmNote', { maxHeight })}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-comic-950/80 border-t border-comic-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-comic-700 text-slate-300 hover:bg-comic-800 text-xs font-semibold"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t('webtoonSlicer.sliceInPages', { count: estimatedSlices })}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

