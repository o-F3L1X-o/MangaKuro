import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Scissors, 
  Layers, 
  Crop, 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Check, 
  Info,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Ban,
  Sliders,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { PageItem, SessionManifest } from '../types';
import { 
  getImageUrl, 
  customSplitVertical, 
  customSliceHorizontal, 
  discardBand,
  fetchSuggestedCuts, 
  cropPage 
} from '../api';
import { useTranslation } from '../i18n';

interface CustomCutModalProps {
  sessionId: string;
  page: PageItem | null;
  isOpen: boolean;
  initialMode?: 'vertical' | 'webtoon' | 'discard' | 'crop';
  onClose: () => void;
  onSuccess: (updatedSession: SessionManifest, targetPageId?: string) => void;
}

export const CustomCutModal: React.FC<CustomCutModalProps> = ({
  sessionId,
  page,
  isOpen,
  initialMode,
  onClose,
  onSuccess
}) => {
  const { t } = useTranslation();
  const defaultMode = initialMode 
    ? initialMode 
    : (page && page.height > page.width * 1.6) 
      ? 'webtoon' 
      : 'vertical';

  const [mode, setMode] = useState<'vertical' | 'webtoon' | 'discard' | 'crop'>(defaultMode);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Exact real image dimensions measured from the natural loaded image
  const [naturalWidth, setNaturalWidth] = useState<number>(page?.width || 1000);
  const [naturalHeight, setNaturalHeight] = useState<number>(page?.height || 1400);

  // Zoom control for tall webtoon images (displayed width in pixels)
  const [webtoonZoomWidth, setWebtoonZoomWidth] = useState<number>(550);

  // Tab 1: Vertical Cut (Double page split)
  const [verticalRatio, setVerticalRatio] = useState<number>(0.5);
  const [readingDirection, setReadingDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [isDraggingVertical, setIsDraggingVertical] = useState<boolean>(false);
  const verticalContainerRef = useRef<HTMLDivElement>(null);
  const verticalImgRef = useRef<HTMLImageElement>(null);

  // Tab 2: Horizontal Webtoon Cut (Default: Pure Manual Cut with 1 line)
  const [singleCutY, setSingleCutY] = useState<number>(700);
  const [isDraggingSingleCut, setIsDraggingSingleCut] = useState<boolean>(false);
  const [isMultiCutMode, setIsMultiCutMode] = useState<boolean>(false);
  const [horizontalCuts, setHorizontalCuts] = useState<number[]>([]);
  const [discardIndices, setDiscardIndices] = useState<number[]>([]);
  const [draggingCutId, setDraggingCutId] = useState<number | null>(null);
  const [hoverCutY, setHoverCutY] = useState<number | null>(null);
  const [manualCutInput, setManualCutInput] = useState<string>('');
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const webtoonCanvasRef = useRef<HTMLDivElement>(null);

  // Tab 3: Dedicated Discard Band (Top/Bottom/Middle Banner)
  const [discardYStart, setDiscardYStart] = useState<number>(0);
  const [discardYEnd, setDiscardYEnd] = useState<number>(600);
  const [draggingDiscardEdge, setDraggingDiscardEdge] = useState<'start' | 'end' | null>(null);
  const discardCanvasRef = useRef<HTMLDivElement>(null);

  // Tab 4: Crop Box
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 100,
    h: 100
  });
  const [cropSaveAsNew, setCropSaveAsNew] = useState<boolean>(false);

  // Initialize and Reset on modal open or page change
  useEffect(() => {
    if (!isOpen || !page) return;
    setError(null);
    setIsProcessing(false);
    setVerticalRatio(0.5);
    setIsMultiCutMode(false);
    setHorizontalCuts([]);
    setDiscardIndices([]);
    setHoverCutY(null);

    const initW = page.width || 1000;
    const initH = page.height || 1400;
    setNaturalWidth(initW);
    setNaturalHeight(initH);

    // Default: 1 single manual cut positioned nicely at 75% or center
    const defaultCut = Math.round(initH * 0.75);
    setSingleCutY(defaultCut);
    setManualCutInput(String(defaultCut));

    setMode(
      initialMode 
        ? initialMode 
        : (page.height > page.width * 1.6) 
          ? 'webtoon' 
          : 'vertical'
    );

    // Default discard band at bottom (last 600px)
    setDiscardYStart(Math.max(0, initH - 600));
    setDiscardYEnd(initH);

    // Default crop box (centered 80%)
    const cW = Math.round(initW * 0.8);
    const cH = Math.round(initH * 0.8);
    const cX = Math.round((initW - cW) / 2);
    const cY = Math.round((initH - cH) / 2);
    setCropBox({ x: cX, y: cY, w: cW, h: cH });
  }, [isOpen, page?.id, initialMode]);

  if (!isOpen || !page) return null;

  const exactVerticalCutX = Math.round(naturalWidth * verticalRatio);
  const displayHeight = naturalWidth > 0 
    ? Math.round((naturalHeight / naturalWidth) * webtoonZoomWidth) 
    : Math.round((1400 / 1000) * webtoonZoomWidth);

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);
    }
  };

  // Dragging for Vertical Cut Line
  const updateVerticalPos = (clientX: number) => {
    if (!verticalImgRef.current) return;
    const rect = verticalImgRef.current.getBoundingClientRect();
    const ratio = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width));
    setVerticalRatio(ratio);
  };

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingVertical(true);
    updateVerticalPos(e.clientX);
  };

  // Global mouse move and up listeners
  // Scroll view to center current cut line
  const scrollToCutLine = (targetY: number = singleCutY) => {
    if (!webtoonCanvasRef.current || !webtoonCanvasRef.current.parentElement) return;
    const parent = webtoonCanvasRef.current.parentElement;
    const ratio = Math.max(0, Math.min(1, targetY / (naturalHeight || 1)));
    const canvasHeight = webtoonCanvasRef.current.clientHeight;
    const targetScroll = ratio * canvasHeight - parent.clientHeight / 2;
    parent.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  };

  // Global mouse move and up listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingVertical) {
        updateVerticalPos(e.clientX);
      } else if (isDraggingSingleCut && webtoonCanvasRef.current) {
        const rect = webtoonCanvasRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
        const newY = Math.max(10, Math.min(naturalHeight - 10, Math.round(naturalHeight * ratio)));
        setSingleCutY(newY);
        setManualCutInput(String(newY));
      } else if (draggingCutId !== null && webtoonCanvasRef.current) {
        const rect = webtoonCanvasRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
        const newY = Math.max(10, Math.min(naturalHeight - 10, Math.round(naturalHeight * ratio)));
        setHorizontalCuts((prev) => {
          const next = [...prev];
          if (draggingCutId >= 0 && draggingCutId < next.length) {
            next[draggingCutId] = newY;
          }
          return next;
        });
      } else if (draggingDiscardEdge !== null && discardCanvasRef.current) {
        const rect = discardCanvasRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
        const newY = Math.max(0, Math.min(naturalHeight, Math.round(naturalHeight * ratio)));
        if (draggingDiscardEdge === 'start') {
          setDiscardYStart(Math.min(newY, discardYEnd - 20));
        } else {
          setDiscardYEnd(Math.max(newY, discardYStart + 20));
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingVertical(false);
      setIsDraggingSingleCut(false);
      if (draggingCutId !== null) {
        setDraggingCutId(null);
        setHorizontalCuts((prev) => Array.from(new Set(prev)).sort((a, b) => a - b));
      }
      if (draggingDiscardEdge !== null) {
        setDraggingDiscardEdge(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingVertical, isDraggingSingleCut, draggingCutId, draggingDiscardEdge, naturalHeight, discardYEnd]);

  // Click & drag handling on Webtoon Canvas
  const handleWebtoonCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!webtoonCanvasRef.current) return;
    const rect = webtoonCanvasRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
    const targetY = Math.max(10, Math.min(naturalHeight - 10, Math.round(ratio * naturalHeight)));

    if (!isMultiCutMode) {
      setSingleCutY(targetY);
      setManualCutInput(String(targetY));
      setIsDraggingSingleCut(true);
    } else {
      // Check if clicking close to an existing cut (within 2% range)
      const threshold = Math.max(25, naturalHeight * 0.02);
      const existingIdx = horizontalCuts.findIndex((y) => Math.abs(y - targetY) < threshold);
      if (existingIdx !== -1) {
        setDraggingCutId(existingIdx);
      } else {
        setHorizontalCuts((prev) => Array.from(new Set([...prev, targetY])).sort((a, b) => a - b));
      }
    }
  };

  const handleWebtoonCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!webtoonCanvasRef.current) return;
    const rect = webtoonCanvasRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
    setHoverCutY(Math.max(10, Math.min(naturalHeight - 10, Math.round(ratio * naturalHeight))));
  };

  // Fine-tuning adjustments for single manual cut
  const handleNudgeCut = (deltaPx: number) => {
    const updated = Math.max(10, Math.min(naturalHeight - 10, singleCutY + deltaPx));
    setSingleCutY(updated);
    setManualCutInput(String(updated));
    setTimeout(() => scrollToCutLine(updated), 50);
  };

  const handleApplyManualInput = () => {
    const parsed = parseInt(manualCutInput);
    if (isNaN(parsed)) return;
    const clamped = Math.max(10, Math.min(naturalHeight - 10, parsed));
    setSingleCutY(clamped);
    setManualCutInput(String(clamped));
    setTimeout(() => scrollToCutLine(clamped), 50);
  };

  // Optional multiple cut suggestions (ONLY triggered if user explicitly clicks button)
  const handleLoadSuggestedCuts = async (hMax: number) => {
    if (!page) return;
    setIsLoadingSuggestions(true);
    try {
      const cuts = await fetchSuggestedCuts(sessionId, page.id, hMax);
      if (cuts && cuts.length > 0) {
        setHorizontalCuts(cuts);
      } else {
        const step = hMax;
        const fallbackCuts: number[] = [];
        let curr = step;
        while (curr < naturalHeight - 200) {
          fallbackCuts.push(curr);
          curr += step;
        }
        setHorizontalCuts(fallbackCuts.length > 0 ? fallbackCuts : [Math.round(naturalHeight / 2)]);
      }
      setIsMultiCutMode(true);
      setDiscardIndices([]);
    } catch (e) {
      console.warn('Error loading suggested cuts:', e);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Multi-cut slices computation
  const sortedCuts = [...horizontalCuts].sort((a, b) => a - b);
  const multiSlicePoints = [0, ...sortedCuts, naturalHeight];
  const multiSlices = [];
  for (let i = 0; i < multiSlicePoints.length - 1; i++) {
    multiSlices.push({
      index: i,
      start: multiSlicePoints[i],
      end: multiSlicePoints[i + 1],
      height: multiSlicePoints[i + 1] - multiSlicePoints[i]
    });
  }

  // Submission Handlers
  const handleConfirmVertical = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await customSplitVertical(
        sessionId,
        page.id,
        exactVerticalCutX,
        readingDirection
      );
      const targetIdx = Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorVerticalCut'));
      setIsProcessing(false);
    }
  };

  // Action 1: Split in 2 pages at singleCutY
  const handleConfirmSingleSplit = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await customSliceHorizontal(
        sessionId,
        page.id,
        [singleCutY],
        []
      );
      // Prefer the main content page: if cut is near top, target part 2; otherwise target part 1
      const preferSecond = singleCutY < naturalHeight * 0.35 && (origIndex + 1 < updated.pages.length);
      const targetIdx = preferSecond ? origIndex + 1 : Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorSplit2'));
      setIsProcessing(false);
    }
  };

  // Action 2: Discard bottom banner (keep top 0..singleCutY, discard singleCutY..end)
  const handleConfirmDiscardBottom = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await discardBand(
        sessionId,
        page.id,
        singleCutY,
        naturalHeight
      );
      const targetIdx = Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorDiscardBottom'));
      setIsProcessing(false);
    }
  };

  // Action 3: Discard top header (discard 0..singleCutY, keep singleCutY..end)
  const handleConfirmDiscardTop = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await discardBand(
        sessionId,
        page.id,
        0,
        singleCutY
      );
      const targetIdx = Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorDiscardTop'));
      setIsProcessing(false);
    }
  };

  // Action 4: Multi-cut confirm
  const handleConfirmMultiSlice = async () => {
    if (horizontalCuts.length === 0) {
      setError(t('slicer.errorNeedCutLine'));
      return;
    }
    const remainingCount = multiSlices.length - discardIndices.length;
    if (remainingCount <= 0) {
      setError(t('slicer.errorKeepAtLeastOne'));
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await customSliceHorizontal(
        sessionId,
        page.id,
        sortedCuts,
        discardIndices
      );
      const targetIdx = Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorSplitHorizontal', { defaultValue: 'Error al cortar la tira' }));
      setIsProcessing(false);
    }
  };

  // Action 5: Discard dedicated band
  const handleConfirmDiscardBand = async () => {
    if (discardYEnd <= discardYStart) {
      setError(t('slicer.errorEndGreaterThanStart'));
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await discardBand(
        sessionId,
        page.id,
        discardYStart,
        discardYEnd
      );
      const targetIdx = Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorDiscardBand'));
      setIsProcessing(false);
    }
  };

  const handleConfirmCrop = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const origIndex = page ? Math.max(0, page.order - 1) : 0;
      const updated = await cropPage(
        sessionId,
        page.id,
        cropBox.x,
        cropBox.y,
        cropBox.w,
        cropBox.h,
        cropSaveAsNew
      );
      const targetIdx = cropSaveAsNew 
        ? Math.min(origIndex + 1, updated.pages.length - 1)
        : Math.max(0, Math.min(origIndex, updated.pages.length - 1));
      onSuccess(updated, updated.pages[targetIdx]?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || t('slicer.errorCrop'));
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-6xl bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-comic-950 border-b border-slate-200 dark:border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {t('slicer.manualCutAndSplit', { order: page.order })}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {t('slicer.realResolution', { width: naturalWidth, height: naturalHeight, filename: page.filename })}
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-slate-100 dark:bg-comic-950/80 p-1 rounded-xl border border-slate-200 dark:border-comic-800">
            <button
              type="button"
              onClick={() => { setMode('webtoon'); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'webtoon'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-comic-800/50'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{t('slicer.manualCutWebtoon')}</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('vertical'); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'vertical'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-comic-800/50'
              }`}
            >
              <MoveHorizontal className="w-3.5 h-3.5" />
              <span>{t('slicer.doublePage')}</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('discard'); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'discard'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-comic-800/50'
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{t('slicer.discardBand')}</span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('crop'); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'crop'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-comic-800/50'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>{t('slicer.freeCrop')}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="px-5 py-2.5 bg-rose-950/80 border-b border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline hover:text-white text-[11px] cursor-pointer">{t('common.close')}</button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: WEBTOON HORIZONTAL MANUAL CUT                                       */}
        {/* ========================================================================= */}
        {mode === 'webtoon' && (
          <div className="flex-1 overflow-hidden flex flex-col p-3 sm:p-4 gap-3">
            {/* Top Toolbar: Guidance, Zoom & Fine Tuning */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-100 dark:bg-comic-950/70 p-2.5 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Info className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />
                <span>
                  {!isMultiCutMode 
                    ? t('slicer.guidanceSingleCut') 
                    : t('slicer.guidanceMultiCut')}
                </span>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-comic-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-comic-700/80 shadow-2xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mr-1">{t('slicer.zoom')}</span>
                <button
                  type="button"
                  onClick={() => setWebtoonZoomWidth((w) => Math.max(300, w - 120))}
                  className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-comic-800 cursor-pointer"
                  title={t('slicer.zoomOut')}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-300 px-1 font-bold">{webtoonZoomWidth}px</span>
                <button
                  type="button"
                  onClick={() => setWebtoonZoomWidth((w) => Math.min(1400, w + 120))}
                  className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-comic-800 cursor-pointer"
                  title={t('slicer.zoomIn')}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWebtoonZoomWidth(480)}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-300 ml-1 font-semibold cursor-pointer"
                >
                  {t('slicer.adjust')}
                </button>
                <button
                  type="button"
                  onClick={() => setWebtoonZoomWidth(Math.min(950, naturalWidth))}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  {t('slicer.real100')}
                </button>
              </div>
            </div>

            {/* Manual Cut Precision Controls Bar */}
            {!isMultiCutMode && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/80 dark:bg-comic-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
                {/* Input & Direct Number */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{t('slicer.exactCutPosition')}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={10}
                      max={naturalHeight - 10}
                      value={manualCutInput}
                      onChange={(e) => setManualCutInput(e.target.value)}
                      onBlur={handleApplyManualInput}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleApplyManualInput(); }}
                      className="w-24 px-2.5 py-1 rounded bg-white dark:bg-comic-900 border border-cyan-500 dark:border-cyan-600/80 text-cyan-700 dark:text-cyan-200 font-mono font-bold text-center text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-mono">/ {naturalHeight} px</span>
                    <button
                      type="button"
                      onClick={handleApplyManualInput}
                      className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition text-[11px] cursor-pointer"
                      title={t('slicer.setCutPositionTitle')}
                    >
                      {t('slicer.setCutPosition')}
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToCutLine()}
                      className="px-2 py-1 rounded bg-white dark:bg-comic-800 hover:bg-slate-100 dark:hover:bg-comic-700 text-cyan-700 dark:text-cyan-300 font-semibold transition text-[11px] border border-cyan-300 dark:border-cyan-700/60 cursor-pointer"
                      title={t('slicer.viewCutTitle')}
                    >
                      {t('slicer.viewCut')}
                    </button>
                  </div>
                </div>

                {/* Micro-Adjustment Nudge Buttons */}
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] mr-1">{t('slicer.fineTuning')}</span>
                  <button
                    type="button"
                    onClick={() => handleNudgeCut(-50)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    -50px
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeCut(-10)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    -10px
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeCut(-1)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    -1px
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeCut(1)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    +1px
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeCut(10)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    +10px
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeCut(50)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    +50px
                  </button>
                </div>

                {/* Mode Switch to Multi-cut */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMultiCutMode(true);
                    setHorizontalCuts([singleCutY]);
                  }}
                  className="px-2.5 py-1 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-300 transition text-[11px] font-semibold cursor-pointer"
                >
                  {t('slicer.multiCutModeBtn')}
                </button>
              </div>
            )}

            {/* If in Multi-cut mode toolbar */}
            {isMultiCutMode && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/80 dark:bg-comic-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{t('slicer.activeManualCuts')}</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-300 font-bold bg-cyan-50 dark:bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-200 dark:border-cyan-800">
                    {t('slicer.cutsLinesPieces', { lines: horizontalCuts.length, pieces: horizontalCuts.length + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMultiCutMode(false);
                      setSingleCutY(horizontalCuts[0] || Math.round(naturalHeight * 0.75));
                    }}
                    className="px-2 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 text-[11px] cursor-pointer"
                  >
                    {t('slicer.backToSingleCut')}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">{t('slicer.autoSuggestions')}</span>
                  {[2000, 2500, 3000].map((h) => (
                    <button
                      key={h}
                      type="button"
                      disabled={isLoadingSuggestions}
                      onClick={() => handleLoadSuggestedCuts(h)}
                      className="px-2 py-0.5 rounded bg-white dark:bg-comic-900 hover:bg-cyan-50 dark:hover:bg-cyan-950/80 border border-slate-300 dark:border-comic-700 hover:border-cyan-400 text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-200 text-[11px] font-mono transition cursor-pointer"
                    >
                      {h}px
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setHorizontalCuts([]); setDiscardIndices([]); }}
                    className="px-2 py-0.5 rounded bg-white dark:bg-comic-900 border border-rose-300 dark:border-comic-700 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-[11px] cursor-pointer"
                  >
                    {t('slicer.clean')}
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Webtoon Canvas */}
            <div className="flex-1 relative min-h-[360px] max-h-[60vh] bg-black/90 rounded-xl overflow-y-auto border border-comic-800 flex justify-center items-start p-4">
              <div 
                ref={webtoonCanvasRef}
                style={{ 
                  width: `${webtoonZoomWidth}px`,
                  minHeight: `${displayHeight}px`,
                  height: `${displayHeight}px`
                }}
                onMouseDown={handleWebtoonCanvasMouseDown}
                onMouseMove={handleWebtoonCanvasMouseMove}
                onMouseLeave={() => setHoverCutY(null)}
                className="relative shrink-0 shadow-2xl select-none cursor-crosshair"
              >
                <img
                  src={getImageUrl(sessionId, page.filename)}
                  alt="Tira Webtoon"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={handleImageLoaded}
                  className="w-full h-auto block rounded-sm pointer-events-none select-none"
                />

                {/* SINGLE CUT MODE: The Manual Cut Line */}
                {!isMultiCutMode && (
                  <>
                    {/* Top zone indicator */}
                    <div 
                      style={{ height: `${(singleCutY / naturalHeight) * 100}%` }}
                      className="absolute inset-x-0 top-0 bg-emerald-500/5 pointer-events-none border-b border-dashed border-emerald-400/40"
                    />

                    {/* Bottom zone indicator */}
                    <div 
                      style={{ 
                        top: `${(singleCutY / naturalHeight) * 100}%`,
                        height: `${((naturalHeight - singleCutY) / naturalHeight) * 100}%` 
                      }}
                      className="absolute inset-x-0 bottom-0 bg-sky-500/5 pointer-events-none"
                    />

                    {/* Interactive Horizontal Cut Line */}
                    <div
                      style={{ top: `${(singleCutY / naturalHeight) * 100}%` }}
                      className="absolute inset-x-0 -translate-y-1/2 z-20 flex items-center group pointer-events-auto cursor-row-resize"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsDraggingSingleCut(true);
                      }}
                    >
                      <div className="w-full h-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)]" />

                      {/* Right coordinate tag & drag badge */}
                      <div className="absolute right-2 flex items-center gap-1.5 bg-comic-950/95 text-cyan-200 border-2 border-cyan-400 px-2.5 py-1 rounded-md shadow-2xl text-[11px] font-mono font-bold cursor-row-resize">
                        <span>{t('slicer.cutLineY', { cut: singleCutY })}</span>
                      </div>

                      {/* Left zone info */}
                      <div className="absolute left-2 bg-comic-950/90 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-mono shadow">
                        {t('slicer.topBottomInfo', { top: singleCutY, bottom: naturalHeight - singleCutY })}
                      </div>
                    </div>
                  </>
                )}

                {/* MULTI CUT MODE: Lines & Slices */}
                {isMultiCutMode && (
                  <>
                    {/* Slices Overlays (Shows Discarded Stripes) */}
                    {multiSlices.map((sl) => {
                      const isDiscarded = discardIndices.includes(sl.index);
                      const topPct = (sl.start / naturalHeight) * 100;
                      const heightPct = (sl.height / naturalHeight) * 100;
                      if (!isDiscarded) return null;

                      return (
                        <div
                          key={`discard-slice-${sl.index}`}
                          style={{ top: `${topPct}%`, height: `${heightPct}%` }}
                          className="absolute inset-x-0 bg-rose-600/35 border-y-2 border-rose-500/80 z-10 flex items-center justify-center pointer-events-none"
                        >
                          <div className="bg-black/90 text-rose-300 font-bold px-3 py-1 rounded border border-rose-500 text-xs shadow-lg flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5" />
                            <span>{t('slicer.pieceDiscarded', { number: sl.index + 1 })}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Draggable Cut Lines in multi-cut mode */}
                    {horizontalCuts.map((cutY, idx) => {
                      const topPercent = (cutY / naturalHeight) * 100;
                      return (
                        <div
                          key={`cut-${idx}`}
                          style={{ top: `${topPercent}%` }}
                          className="absolute inset-x-0 -translate-y-1/2 z-20 flex items-center group pointer-events-auto cursor-row-resize"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingCutId(idx);
                          }}
                        >
                          <div className="w-full h-1 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,1)]" />
                          
                          <div className="absolute right-2 flex items-center gap-1.5 bg-comic-950/95 text-cyan-200 border border-cyan-500 px-2 py-0.5 rounded shadow-xl text-[10px] font-mono">
                            <span className="font-bold">Y: {cutY} px</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHorizontalCuts((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="hover:text-rose-400 p-0.5 rounded hover:bg-comic-800 ml-1 cursor-pointer"
                              title={t('slicer.deleteCutTitle')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="absolute left-2 bg-comic-950/95 text-cyan-300 border border-cyan-600 px-2 py-0.5 rounded text-[10px] font-bold shadow">
                            {t('slicer.cutNumber', { number: idx + 1 })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Hover live guide line */}
                {hoverCutY !== null && !isDraggingSingleCut && draggingCutId === null && (
                  <div
                    style={{ top: `${(hoverCutY / naturalHeight) * 100}%` }}
                    className="absolute inset-x-0 h-0.5 bg-cyan-400/60 border-t border-dashed border-cyan-300 pointer-events-none z-15 flex items-center justify-end pr-2"
                  >
                    <span className="bg-cyan-950/90 text-cyan-200 text-[9px] font-mono px-1.5 rounded border border-cyan-500/60">
                      {t('slicer.pointerAtY', { y: hoverCutY })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Area for Single Manual Cut */}
            {!isMultiCutMode ? (
              <div className="bg-slate-50 dark:bg-comic-950/80 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-comic-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                    <span>{t('slicer.manualCutResult', { cut: singleCutY })}</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400 font-mono text-[11px] mt-1">
                    <span>{t('slicer.part1Top')} <strong className="text-emerald-600 dark:text-emerald-400">0 → {singleCutY} px</strong> ({singleCutY}px)</span>
                    <span>{t('slicer.part2Bottom')} <strong className="text-indigo-600 dark:text-sky-400">{singleCutY} → {naturalHeight} px</strong> ({naturalHeight - singleCutY}px)</span>
                  </div>
                </div>

                {/* The 3 Direct Cut Actions: Clear visual hierarchy */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleConfirmDiscardTop}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-300/60 dark:border-rose-500/30 text-xs font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={t('slicer.discardTopTitle', { cut: singleCutY, total: naturalHeight })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('slicer.discardTop')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleConfirmDiscardBottom}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-300/60 dark:border-rose-500/30 text-xs font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={t('slicer.discardBottomTitle', { cut: singleCutY, total: naturalHeight })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('slicer.discardBottom')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleConfirmSingleSplit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={t('slicer.singleSplitDesc')}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>{t('slicer.splitIn2')}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Bottom Actions for Multi-cut mode */
              <div className="bg-slate-50 dark:bg-comic-950/80 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-comic-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {t('slicer.resultingPiecesHeader', { count: multiSlices.length })}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    {t('slicer.kept')} <strong className="text-emerald-600 dark:text-emerald-400">{multiSlices.length - discardIndices.length}</strong> | {t('slicer.discarded')} <strong className="text-rose-600 dark:text-rose-400">{discardIndices.length}</strong>
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto custom-scrollbar">
                  {multiSlices.map((sl) => {
                    const isDiscarded = discardIndices.includes(sl.index);
                    return (
                      <div
                        key={`multi-slice-${sl.index}`}
                        className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-mono transition ${
                          isDiscarded
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-600 text-rose-700 dark:text-rose-300'
                            : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span>#{sl.index + 1}: {sl.height}px</span>
                        <button
                          type="button"
                          onClick={() => setDiscardIndices((prev) => 
                            prev.includes(sl.index) ? prev.filter((i) => i !== sl.index) : [...prev, sl.index]
                          )}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            isDiscarded ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-comic-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {isDiscarded ? t('slicer.discardBtn') : t('slicer.keepBtn')}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={isProcessing || horizontalCuts.length === 0}
                    onClick={handleConfirmMultiSlice}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    <span>{t('slicer.sliceIntoPages', { count: multiSlices.length - discardIndices.length })}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: VERTICAL CUT (DOUBLE PAGE SPLIT)                                    */}
        {/* ========================================================================= */}
        {mode === 'vertical' && (
          <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-5 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-comic-950/60 p-3 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Info className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span>{t('slicer.verticalGuidance')}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-500 dark:text-slate-400">{t('slicer.splitPoint')}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700/60">
                  X: {exactVerticalCutX} px ({(verticalRatio * 100).toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="flex-1 relative min-h-[300px] max-h-[55vh] bg-slate-900/90 dark:bg-black/80 rounded-xl overflow-hidden border border-slate-200 dark:border-comic-800 flex items-center justify-center select-none">
              <div 
                ref={verticalContainerRef}
                onMouseDown={handleVerticalMouseDown}
                className="relative inline-block max-w-full max-h-full cursor-col-resize shadow-2xl"
              >
                <img
                  ref={verticalImgRef}
                  src={getImageUrl(sessionId, page.filename)}
                  alt="Vista previa corte vertical"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={handleImageLoaded}
                  className="max-h-[52vh] max-w-full object-contain pointer-events-none block select-none"
                />

                {/* Left Page Ghost Overlay */}
                <div 
                  className="absolute inset-y-0 left-0 bg-emerald-500/10 pointer-events-none border-r border-dashed border-emerald-400/50 flex flex-col justify-between p-2"
                  style={{ width: `${verticalRatio * 100}%` }}
                >
                  <span className="bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 rounded w-max border border-slate-700">
                    {t('slicer.pageLeft', { order: readingDirection === 'rtl' ? 2 : 1 })}
                  </span>
                  <span className="text-emerald-400 font-mono text-[10px] bg-black/60 px-1.5 py-0.5 rounded w-max">
                    {exactVerticalCutX} px
                  </span>
                </div>

                {/* Right Page Ghost Overlay */}
                <div 
                  className="absolute inset-y-0 right-0 bg-sky-500/10 pointer-events-none flex flex-col justify-between items-end p-2"
                  style={{ width: `${(1 - verticalRatio) * 100}%` }}
                >
                  <span className="bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 rounded w-max border border-slate-700">
                    {t('slicer.pageRight', { order: readingDirection === 'rtl' ? 1 : 2 })}
                  </span>
                  <span className="text-sky-400 font-mono text-[10px] bg-black/60 px-1.5 py-0.5 rounded w-max">
                    {naturalWidth - exactVerticalCutX} px
                  </span>
                </div>

                {/* Interactive Vertical Cut Line Handle */}
                <div 
                  className="absolute inset-y-0 w-1 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)] z-20 flex items-center justify-center -translate-x-1/2 pointer-events-none"
                  style={{ left: `${verticalRatio * 100}%` }}
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-comic-950 flex items-center justify-center shadow-lg border-2 border-white pointer-events-auto cursor-col-resize active:scale-110">
                    <MoveHorizontal className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-100 dark:bg-comic-950/60 p-3 rounded-xl border border-slate-200 dark:border-comic-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider block mb-2">
                  {t('slicer.quickSplitSettings')}
                </span>
                <div className="flex items-center gap-2">
                  {[
                    { label: '33%', val: 0.333 },
                    { label: '50% (Centro)', val: 0.5 },
                    { label: '66%', val: 0.666 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setVerticalRatio(p.val)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        Math.abs(verticalRatio - p.val) < 0.01
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500 text-emerald-700 dark:text-emerald-200'
                          : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setVerticalRatio(0.5)}
                    className="p-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-700/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    title={t('slicer.reset50Title')}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-100 dark:bg-comic-950/60 p-3 rounded-xl border border-slate-200 dark:border-comic-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider block mb-2">
                  {t('slicer.resultingReadingOrder')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReadingDirection('rtl')}
                    className={`py-1.5 px-2.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                      readingDirection === 'rtl'
                        ? 'bg-purple-50 dark:bg-purple-950/70 border-purple-500 text-purple-700 dark:text-purple-200'
                        : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-700/80 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    <span>{t('slicer.mangaRTL')}</span>
                    <ArrowLeft className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setReadingDirection('ltr')}
                    className={`py-1.5 px-2.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                      readingDirection === 'ltr'
                        ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-500 text-blue-700 dark:text-blue-200'
                        : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-700/80 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    <span>{t('slicer.comicLTR')}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: DEDICATED DISCARD BAND                                               */}
        {/* ========================================================================= */}
        {mode === 'discard' && (
          <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-5 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-comic-950/70 p-3 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Ban className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                <span>{t('slicer.discardBandGuidance')}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDiscardYStart(0);
                    setDiscardYEnd(Math.min(600, Math.round(naturalHeight * 0.1)));
                  }}
                  className="px-2.5 py-1 rounded bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-700 hover:border-rose-400 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-200 text-xs font-semibold transition cursor-pointer"
                >
                  {t('slicer.discardTopMargin')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDiscardYStart(Math.max(0, Math.round(naturalHeight * 0.9)));
                    setDiscardYEnd(naturalHeight);
                  }}
                  className="px-2.5 py-1 rounded bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-700 hover:border-rose-400 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-200 text-xs font-semibold transition cursor-pointer"
                >
                  {t('slicer.discardBottomMargin')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/70 dark:bg-comic-950/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-slate-500 dark:text-slate-400">{t('slicer.yStart')}</span>
                  <input
                    type="number"
                    min={0}
                    max={discardYEnd - 10}
                    value={discardYStart}
                    onChange={(e) => setDiscardYStart(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 px-2 py-1 rounded bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white font-mono text-xs focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-slate-500 dark:text-slate-400">{t('slicer.yEnd')}</span>
                  <input
                    type="number"
                    min={discardYStart + 10}
                    max={naturalHeight}
                    value={discardYEnd}
                    onChange={(e) => setDiscardYEnd(Math.min(naturalHeight, parseInt(e.target.value) || naturalHeight))}
                    className="w-24 px-2 py-1 rounded bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white font-mono text-xs focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <span className="text-rose-600 dark:text-rose-400 font-bold font-mono">
                  {t('slicer.bandToDelete', { height: discardYEnd - discardYStart })}
                </span>
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-comic-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-comic-700">
                <button
                  type="button"
                  onClick={() => setWebtoonZoomWidth((w) => Math.max(300, w - 120))}
                  className="p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] text-rose-600 dark:text-rose-300 px-1">{webtoonZoomWidth}px</span>
                <button
                  type="button"
                  onClick={() => setWebtoonZoomWidth((w) => Math.min(1400, w + 120))}
                  className="p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative min-h-[360px] max-h-[60vh] bg-black/85 rounded-xl overflow-y-auto border border-comic-800 flex justify-center items-start p-4">
              <div 
                ref={discardCanvasRef}
                style={{ 
                  width: `${webtoonZoomWidth}px`,
                  minHeight: `${displayHeight}px`,
                  height: `${displayHeight}px`
                }}
                className="relative shrink-0 shadow-2xl select-none"
              >
                <img
                  src={getImageUrl(sessionId, page.filename)}
                  alt="Tira para descarte"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={handleImageLoaded}
                  className="w-full h-auto block rounded-sm pointer-events-none select-none"
                />

                <div
                  style={{
                    top: `${(discardYStart / naturalHeight) * 100}%`,
                    height: `${((discardYEnd - discardYStart) / naturalHeight) * 100}%`
                  }}
                  className="absolute inset-x-0 bg-rose-600/35 border-y-2 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] z-20 flex flex-col justify-between"
                >
                  <div
                    onMouseDown={(e) => { e.stopPropagation(); setDraggingDiscardEdge('start'); }}
                    className="w-full h-4 -translate-y-2 cursor-row-resize flex items-center justify-center pointer-events-auto group"
                  >
                    <div className="bg-rose-500 text-white font-mono text-[9px] px-2 py-0.5 rounded shadow group-hover:scale-105 transition">
                      {t('slicer.dragYStart', { y: discardYStart })}
                    </div>
                  </div>

                  <div className="self-center bg-black/90 text-rose-300 font-bold px-3 py-1 rounded border border-rose-500 text-xs shadow-xl flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('slicer.zoneToBeDeleted', { height: discardYEnd - discardYStart })}</span>
                  </div>

                  <div
                    onMouseDown={(e) => { e.stopPropagation(); setDraggingDiscardEdge('end'); }}
                    className="w-full h-4 translate-y-2 cursor-row-resize flex items-center justify-center pointer-events-auto group"
                  >
                    <div className="bg-rose-500 text-white font-mono text-[9px] px-2 py-0.5 rounded shadow group-hover:scale-105 transition">
                      {t('slicer.dragYEnd', { y: discardYEnd })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB: CROP BOX AREA                                                       */}
        {/* ========================================================================= */}
        {mode === 'crop' && (
          <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-5 gap-4">
            <div className="flex items-center justify-between bg-slate-100 dark:bg-comic-950/60 p-3 rounded-xl border border-slate-200 dark:border-comic-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <span>{t('slicer.cropGuidance')}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={cropSaveAsNew}
                  onChange={(e) => setCropSaveAsNew(e.target.checked)}
                  className="rounded border-slate-300 dark:border-comic-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-comic-950"
                />
                <span>{t('slicer.cropSaveAsNew')}</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100 dark:bg-comic-950/60 p-3 rounded-xl border border-slate-200 dark:border-comic-800 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-mono">{t('slicer.cropXStart')}</label>
                <input
                  type="number"
                  value={cropBox.x}
                  min={0}
                  max={naturalWidth - 20}
                  onChange={(e) => setCropBox({ ...cropBox, x: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-mono">{t('slicer.cropYStart')}</label>
                <input
                  type="number"
                  value={cropBox.y}
                  min={0}
                  max={naturalHeight - 20}
                  onChange={(e) => setCropBox({ ...cropBox, y: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-mono">{t('slicer.cropWidth')}</label>
                <input
                  type="number"
                  value={cropBox.w}
                  min={20}
                  max={naturalWidth - cropBox.x}
                  onChange={(e) => setCropBox({ ...cropBox, w: Math.max(20, parseInt(e.target.value) || 20) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-[11px] mb-1 font-mono">{t('slicer.cropHeight')}</label>
                <input
                  type="number"
                  value={cropBox.h}
                  min={20}
                  max={naturalHeight - cropBox.y}
                  onChange={(e) => setCropBox({ ...cropBox, h: Math.max(20, parseInt(e.target.value) || 20) })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div className="flex-1 relative min-h-[250px] max-h-[48vh] bg-slate-900/90 dark:bg-black/80 rounded-xl overflow-hidden border border-slate-200 dark:border-comic-800 flex items-center justify-center p-3 select-none">
              <div className="relative inline-block max-w-full max-h-full">
                <img
                  src={getImageUrl(sessionId, page.filename)}
                  alt="Previsualización recorte"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={handleImageLoaded}
                  className="max-h-[45vh] max-w-full object-contain pointer-events-none block select-none"
                />

                <div
                  style={{
                    left: `${(cropBox.x / naturalWidth) * 100}%`,
                    top: `${(cropBox.y / naturalHeight) * 100}%`,
                    width: `${(cropBox.w / naturalWidth) * 100}%`,
                    height: `${(cropBox.h / naturalHeight) * 100}%`
                  }}
                  className="absolute border-2 border-indigo-400 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.5)] flex items-center justify-center pointer-events-none"
                >
                  <span className="bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 rounded border border-indigo-500/60 shadow">
                    {cropBox.w} × {cropBox.h} px
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-comic-950 border-t border-slate-200 dark:border-comic-800 flex items-center justify-between">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-comic-800 text-xs font-semibold disabled:opacity-50 transition"
          >
            {t('common.cancel')}
          </button>

          <div>
            {mode === 'vertical' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmVertical}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-50"
              >
                <Scissors className="w-4 h-4" />
                <span>{isProcessing ? t('slicer.splitting') : t('slicer.splitIn2ByLine')}</span>
              </button>
            )}

            {mode === 'discard' && (
              <button
                type="button"
                disabled={isProcessing || discardYEnd <= discardYStart}
                onClick={handleConfirmDiscardBand}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isProcessing ? t('slicer.deleting') : t('slicer.discardSelectedBand', { height: discardYEnd - discardYStart })}</span>
              </button>
            )}

            {mode === 'crop' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmCrop}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
              >
                <Crop className="w-4 h-4" />
                <span>{isProcessing ? t('slicer.cropping') : t('slicer.applyCrop')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
