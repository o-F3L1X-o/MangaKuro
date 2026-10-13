import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Scissors, 
  Sparkles, 
  X, 
  RefreshCw, 
  Eye, 
  Info, 
  ShieldAlert,
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import { SessionManifest, PageItem } from '../types';
import { getThumbUrl } from '../api';
import { useTranslation } from '../i18n';

interface ImageAnalysisModalProps {
  session: SessionManifest;
  isOpen: boolean;
  onClose: () => void;
  onSliceWebtoon: (pageId: string) => void;
  onSliceAllWebtoons: (params: { maxHeight: number; onlyOversized: boolean }) => Promise<void>;
  onInspectPage: (pageId: string) => void;
  onDownscalePage: (pageId: string) => Promise<void>;
  onDownscaleAll: () => Promise<void>;
}

export const ImageAnalysisModal: React.FC<ImageAnalysisModalProps> = ({
  session,
  isOpen,
  onClose,
  onSliceWebtoon,
  onSliceAllWebtoons,
  onInspectPage,
  onDownscalePage,
  onDownscaleAll
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'oversized' | 'all'>('oversized');
  const [processingPageId, setProcessingPageId] = useState<string | null>(null);
  const [isProcessingAllDownscale, setIsProcessingAllDownscale] = useState(false);
  const [isProcessingAllSlice, setIsProcessingAllSlice] = useState(false);
  const [sliceMaxHeight, setSliceMaxHeight] = useState<number>(2500);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  if (!isOpen) return null;

  const oversizedPages = session.pages.filter(
    (p) => p.width > 16383 || p.height > 16383
  );

  const tallWebtoonPages = session.pages.filter(
    (p) => (p.width <= 16383 && p.height <= 16383) && p.height > 2500
  );

  const handleDownscaleSingle = async (pageId: string) => {
    setProcessingPageId(pageId);
    setFeedbackMessage(null);
    try {
      await onDownscalePage(pageId);
      setFeedbackMessage({
        type: 'success',
        text: t('analysis.downscaleSuccessSingle')
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || t('analysis.downscaleError')
      });
    } finally {
      setProcessingPageId(null);
    }
  };

  const handleDownscaleAllOversized = async () => {
    if (!window.confirm(t('analysis.confirmDownscaleAll', { count: oversizedPages.length }))) {
      return;
    }
    setIsProcessingAllDownscale(true);
    setFeedbackMessage(null);
    try {
      await onDownscaleAll();
      setFeedbackMessage({
        type: 'success',
        text: t('analysis.downscaleSuccessAll')
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || t('analysis.downscaleError')
      });
    } finally {
      setIsProcessingAllDownscale(false);
    }
  };

  const handleBatchSlice = async (onlyOversized: boolean) => {
    const targetCount = onlyOversized ? oversizedPages.length : tallWebtoonPages.length;
    if (targetCount === 0) return;

    setIsProcessingAllSlice(true);
    setFeedbackMessage(null);
    try {
      await onSliceAllWebtoons({ maxHeight: sliceMaxHeight, onlyOversized });
      onClose();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || t('common.error')
      });
    } finally {
      setIsProcessingAllSlice(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl bg-comic-900 border border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-comic-950 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl flex items-center justify-center ${
              oversizedPages.length > 0 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' 
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}>
              {oversizedPages.length > 0 ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('analysis.title')}</span>
                {oversizedPages.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700 text-[11px] font-bold">
                    {t('analysis.oversizedCount', { count: oversizedPages.length })}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800 text-[11px] font-bold">
                    {t('analysis.compatibleWebp')}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {t('analysis.webpLimitNote')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quality Advice & Comparison Card */}
        <div className="px-6 py-3.5 bg-comic-950/80 border-b border-comic-800 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>{t('analysis.recommendationTitle')}</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                <strong className="text-cyan-300">{t('analysis.cutStripsRec')} </strong>
                {t('analysis.cutStripsDesc', { height: sliceMaxHeight })}
              </p>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                <strong className="text-indigo-300">{t('analysis.downscaleRec')} </strong>
                {t('analysis.downscaleDesc')}
              </p>
              <p className="text-emerald-300 leading-relaxed text-[11px] pt-0.5">
                {t('analysis.jpgOriginalNote')}
              </p>
            </div>

            {/* Height Selector for Slicing */}
            <div className="bg-comic-900/90 p-2.5 rounded-xl border border-comic-800 shrink-0 space-y-1.5">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                <span>{t('analysis.cutHeight')}</span>
                <span className="text-cyan-400 font-mono font-bold">{sliceMaxHeight} px</span>
              </div>
              <div className="flex items-center gap-1">
                {[2000, 2500, 3000, 3500].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setSliceMaxHeight(h)}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition ${
                      sliceMaxHeight === h
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-comic-950 text-slate-400 hover:text-white hover:bg-comic-800'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Batch Actions Bar for Oversized Pages */}
          {oversizedPages.length > 0 && (
            <div className="pt-2 border-t border-comic-800/60 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                {/* PRIMARY ACTION: Batch Slice */}
                <button
                  onClick={() => handleBatchSlice(true)}
                  disabled={isProcessingAllSlice || isProcessingAllDownscale}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition disabled:opacity-50 active:scale-95"
                  title={t('analysis.cutAllOversizedTitle')}
                >
                  {isProcessingAllSlice ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('common.processing')}...</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4" />
                      <span>{t('analysis.cutAllOversized', { count: oversizedPages.length })}</span>
                    </>
                  )}
                </button>

                {/* SECONDARY ACTION: Downscale */}
                <button
                  onClick={handleDownscaleAllOversized}
                  disabled={isProcessingAllDownscale || isProcessingAllSlice}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 hover:text-white border border-comic-700 font-semibold text-xs transition disabled:opacity-50 active:scale-95"
                  title={t('analysis.downscaleAllTitle', { count: oversizedPages.length })}
                >
                  {isProcessingAllDownscale ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('common.processing')}...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t('analysis.downscaleAll', { count: oversizedPages.length })}</span>
                    </>
                  )}
                </button>
              </div>

              <span className="text-[11px] text-slate-400">
                Límite WebP: <strong className="text-white font-mono">16.383 px</strong>
              </span>
            </div>
          )}
        </div>

        {/* Feedback Alert if any */}
        {feedbackMessage && (
          <div className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
            feedbackMessage.type === 'success' 
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200' 
              : feedbackMessage.type === 'info'
              ? 'bg-cyan-950/70 border-cyan-800 text-cyan-200'
              : 'bg-rose-950/70 border-rose-800 text-rose-200'
          }`}>
            <span>{feedbackMessage.text}</span>
            <button 
              onClick={() => setFeedbackMessage(null)} 
              className="opacity-70 hover:opacity-100 text-xs ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 pb-2 bg-comic-900 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('oversized')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'oversized'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-comic-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{t('analysis.criticalTab', { count: oversizedPages.length })}</span>
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-cyan-700 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-comic-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('analysis.allTab', { count: tallWebtoonPages.length })}</span>
            </button>
          </div>

          {activeTab === 'all' && tallWebtoonPages.length > 0 && (
            <button
              onClick={() => handleBatchSlice(false)}
              disabled={isProcessingAllSlice}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold transition active:scale-95 disabled:opacity-50"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{t('analysis.cutTallStrips', { count: tallWebtoonPages.length })}</span>
            </button>
          )}
        </div>

        {/* List of Pages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'oversized' ? (
            oversizedPages.length === 0 ? (
              /* All clean state */
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-white">{t('analysis.compatibleWebp')}</h4>
                <p className="text-xs text-slate-400 max-w-md">
                  {t('analysis.webpLimitNote')}
                </p>
                <button
                  onClick={onClose}
                  className="mt-2 px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-200 text-xs font-semibold border border-comic-700 transition"
                >
                  {t('common.close')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {oversizedPages.map((page) => {
                  const maxDim = Math.max(page.width, page.height);
                  const excess = maxDim - 16383;
                  const isProcessing = processingPageId === page.id;
                  const estimatedSlices = Math.ceil(page.height / sliceMaxHeight);

                  return (
                    <div 
                      key={page.id}
                      className="p-3.5 rounded-xl bg-comic-950/70 border border-rose-900/60 hover:border-rose-700/80 transition flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md"
                    >
                      {/* Left: Thumbnail and Page details */}
                      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                        <div 
                          className="w-14 h-20 bg-comic-900 rounded-lg overflow-hidden border border-rose-700/60 relative shrink-0 cursor-pointer group"
                          onClick={() => {
                            onClose();
                            onInspectPage(page.id);
                          }}
                          title={t('analysis.inspectBtn')}
                        >
                          <img
                            src={getThumbUrl(session.session_id, page.thumb_filename)}
                            alt={`Pág ${page.order}`}
                            className="w-full h-full object-contain group-hover:scale-105 transition"
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[10px] text-center font-mono text-white py-0.5">
                            #{page.order}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{t('pageInspector.inspectPage', { order: page.order })}</span>
                            <span className="px-1.5 py-0.2 rounded bg-rose-950 border border-rose-800 text-rose-300 font-mono font-bold text-[10px]">
                              +{excess.toLocaleString()} px
                            </span>
                          </div>

                          <p className="text-xs text-rose-300 font-mono mt-1 font-semibold">
                            {page.width} × {page.height} px
                          </p>

                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {page.filename}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions for this page */}
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                        {/* Primary Slice Webtoon button */}
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSliceWebtoon(page.id);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition active:scale-95 shadow-md shadow-cyan-600/20"
                          title={`~${estimatedSlices}`}
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>{t('analysis.singleCutBtn')} (~{estimatedSlices})</span>
                        </button>

                        {/* Secondary Downscale button */}
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleDownscaleSingle(page.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-300 hover:text-white border border-comic-700 font-semibold text-xs transition active:scale-95 disabled:opacity-50"
                          title={t('analysis.downscaleAllTitle', { count: 1 })}
                        >
                          {isProcessing ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          <span>{t('analysis.singleDownscaleBtn')}</span>
                        </button>

                        {/* Inspect button */}
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onInspectPage(page.id);
                          }}
                          className="p-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-300 hover:text-white border border-comic-700 transition"
                          title={t('analysis.inspectBtn')}
                        >
                          <Eye className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Tall Webtoon Pages List */
            tallWebtoonPages.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 text-slate-400">
                <Layers className="w-8 h-8 text-slate-600" />
                <p className="text-xs">{t('analysis.allTab', { count: 0 })}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-2">
                  {t('analysis.webpLimitNote')}
                </p>
                {tallWebtoonPages.map((page) => (
                  <div 
                    key={page.id}
                    className="p-3 rounded-xl bg-comic-950/60 border border-comic-800 hover:border-comic-700 transition flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-14 bg-comic-900 rounded overflow-hidden border border-comic-700 shrink-0 cursor-pointer"
                        onClick={() => {
                          onClose();
                          onInspectPage(page.id);
                        }}
                      >
                        <img
                          src={getThumbUrl(session.session_id, page.thumb_filename)}
                          alt={`Pág ${page.order}`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div>
                        <span className="font-bold text-white">{t('pageInspector.inspectPage', { order: page.order })}</span>
                        <p className="font-mono text-cyan-300 text-[11px] mt-0.5">
                          {page.width} × {page.height} px
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSliceWebtoon(page.id);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-800 font-semibold text-xs transition"
                    >
                      <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t('analysis.singleCutBtn')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-comic-950 border-t border-comic-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            {session.pages.length} {t('common.processing') === 'Procesando' ? 'páginas' : 'pages'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-white text-xs font-bold transition"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

