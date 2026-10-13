import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Star, 
  Scissors, 
  Layers, 
  Sparkles, 
  Trash2, 
  Eye, 
  Maximize2,
  Minimize2,
  Check,
  ArrowUp,
  ArrowDown,
  Type
} from 'lucide-react';
import { PageItem } from '../types';
import { getImageUrl } from '../api';
import { useTranslation } from '../i18n';

interface PageInspectorModalProps {
  sessionId: string;
  pages: PageItem[];
  currentPageId: string | null;
  readingDirection?: 'ltr' | 'rtl' | 'vertical';
  isOpen: boolean;
  isSelected?: boolean;
  onToggleSelect?: (pageId: string) => void;
  rangeStartPageId?: string | null;
  onSetRangeStart?: (pageId: string) => void;
  onSelectRangeToHere?: (pageId: string) => void;
  onClose: () => void;
  onSelectPage: (pageId: string) => void;
  onRotate: (pageId: string) => void;
  onSetCover: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onSplitSpread: (pageId: string) => void;
  onSliceWebtoon: (pageId: string) => void;
  onOpenCustomCut?: (pageId: string, initialMode?: 'vertical' | 'webtoon' | 'discard' | 'crop') => void;
  onOpenTextAnnotation?: (pageId: string) => void;
  onChapterCover?: (pageId: string) => void;
  onOpenFullViewer: (pageId: string) => void;
}

export const PageInspectorModal: React.FC<PageInspectorModalProps> = ({
  sessionId,
  pages,
  currentPageId,
  readingDirection = 'ltr',
  isOpen,
  isSelected,
  onToggleSelect,
  rangeStartPageId,
  onSetRangeStart,
  onSelectRangeToHere,
  onClose,
  onSelectPage,
  onRotate,
  onSetCover,
  onDelete,
  onSplitSpread,
  onSliceWebtoon,
  onOpenCustomCut,
  onOpenTextAnnotation,
  onChapterCover,
  onOpenFullViewer
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<number>(1);
  const [fitMode, setFitMode] = useState<'contain' | 'width'>('contain');
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse Drag to Pan
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });

  // Track window dimensions
  const [windowSize, setWindowSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const lastValidIndexRef = useRef<number>(0);
  const currentIndex = pages.findIndex((p) => p.id === currentPageId);

  const safeIndex = useMemo(() => {
    if (currentIndex !== -1) {
      lastValidIndexRef.current = currentIndex;
      return currentIndex;
    }
    // If currentPageId was not found (e.g. replaced after cut or split),
    // stay at the last valid index instead of jumping to page 1 (index 0)
    return Math.max(0, Math.min(lastValidIndexRef.current, pages.length - 1));
  }, [currentIndex, pages.length]);

  const currentPage = pages[safeIndex];

  // Synchronize parent state if currentPageId was stale
  useEffect(() => {
    if (currentIndex === -1 && pages[safeIndex]) {
      onSelectPage(pages[safeIndex].id);
    }
  }, [currentIndex, safeIndex, pages, onSelectPage]);

  // Reset zoom & scroll when page changes
  useEffect(() => {
    setZoom(1);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
  }, [currentPageId]);

  // Compute displayed image size
  const sizeInfo = useMemo(() => {
    if (!currentPage) return { width: undefined, height: undefined, isScrollableY: false };

    const padX = 80;
    const padY = 140; // Top header (56px) + bottom toolbar (64px) + margin
    const availW = Math.max(300, windowSize.w - padX);
    const availH = Math.max(300, windowSize.h - padY);

    const imgW = currentPage.width || 1000;
    const imgH = currentPage.height || 1400;

    if (fitMode === 'width') {
      const baseW = Math.min(availW, Math.max(800, imgW));
      const targetW = Math.round(baseW * zoom);
      const targetH = Math.round((imgH / imgW) * targetW);
      return {
        width: `${targetW}px`,
        height: `${targetH}px`,
        isScrollableY: targetH > availH
      };
    } else {
      const scale = Math.min(availW / imgW, availH / imgH);
      const baseW = imgW * scale;
      const baseH = imgH * scale;
      const targetW = Math.round(baseW * zoom);
      const targetH = Math.round(baseH * zoom);
      return {
        width: `${targetW}px`,
        height: `${targetH}px`,
        isScrollableY: targetH > availH
      };
    }
  }, [currentPage, fitMode, zoom, windowSize]);

  // Mouse Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    const isScrollable = container.scrollHeight > container.clientHeight || container.scrollWidth > container.clientWidth;
    if (!isScrollable && zoom <= 1 && fitMode === 'contain') return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      container.scrollLeft = dragStartRef.current.scrollLeft - dx;
      container.scrollTop = dragStartRef.current.scrollTop - dy;
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  // Ctrl + Wheel to zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        setZoom((z) => Math.min(4, Math.max(0.5, Number((z + delta).toFixed(2)))));
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowDown') {
        containerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        containerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
      } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        containerRef.current?.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
      } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        containerRef.current?.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
      } else if (e.key === 'Home') {
        e.preventDefault();
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'End') {
        e.preventDefault();
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
        }
      } else if (e.key.toLowerCase() === 'r' && currentPage) {
        e.preventDefault();
        onRotate(currentPage.id);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
      } else if (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFitMode((m) => (m === 'contain' ? 'width' : 'contain'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, safeIndex, pages, currentPage]);

  if (!isOpen || !currentPage) return null;

  const handleNext = () => {
    if (safeIndex < pages.length - 1) {
      onSelectPage(pages[safeIndex + 1].id);
      setZoom(1);
    }
  };

  const handlePrev = () => {
    if (safeIndex > 0) {
      onSelectPage(pages[safeIndex - 1].id);
      setZoom(1);
    }
  };

  const isWide = currentPage.width > currentPage.height * 1.15;
  const isTall = currentPage.height > 2200;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col backdrop-blur-md animate-in fade-in duration-150 select-none">
      {/* Top Header Bar */}
      <div className="h-14 px-3 sm:px-6 bg-comic-950/90 border-b border-comic-800 flex items-center justify-between text-slate-200 shrink-0 z-40 gap-2">
        {/* Page Identity & Dimensions */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-mono font-bold text-xs shadow-md shrink-0">
            {t('common.page')} {safeIndex + 1} / {pages.length}
          </span>

          {currentPage.is_cover && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-extrabold uppercase shadow flex items-center gap-1 shrink-0">
              <Star className="w-3 h-3 fill-slate-950" /> {t('grid.cover')}
            </span>
          )}

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 min-w-0">
            <span className="font-mono font-semibold shrink-0 text-slate-300">
              {currentPage.width} × {currentPage.height} px
            </span>
            <span className="text-slate-600">•</span>
            <span className="truncate max-w-[200px] text-slate-400">
              {currentPage.original_name || currentPage.filename}
            </span>
          </div>
        </div>

        {/* Right Top Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Fit Mode Toggle */}
          <button
            onClick={() => setFitMode((m) => (m === 'contain' ? 'width' : 'contain'))}
            className={`px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
              fitMode === 'width'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                : 'bg-comic-900 text-slate-300 border-comic-700/80 hover:bg-comic-800'
            }`}
            title={fitMode === 'width' ? t('pageInspector.fitScreen') : t('pageInspector.fitWidth')}
          >
            {fitMode === 'width' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{fitMode === 'width' ? t('pageInspector.fitScreen') : t('pageInspector.fitWidth')}</span>
          </button>

          {/* Page Selection Controls */}
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(currentPage.id)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'bg-comic-900 hover:bg-comic-800 text-slate-300 border-comic-700/80 hover:text-white'
              }`}
              title={isSelected ? t('common.deselectAll') : t('grid.selectPageTitle')}
            >
              <Check className={`w-3.5 h-3.5 ${isSelected ? 'stroke-[3]' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{isSelected ? t('common.active') : t('grid.select')}</span>
            </button>
          )}

          {/* Range marker buttons */}
          {onSetRangeStart && onSelectRangeToHere && (
            rangeStartPageId === currentPage.id ? (
              <button
                type="button"
                onClick={() => onSetRangeStart('')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold shadow-md transition cursor-pointer"
                title={t('common.cancel')}
              >
                <span>📍 #{currentPage.order}</span>
              </button>
            ) : rangeStartPageId ? (
              <button
                type="button"
                onClick={() => onSelectRangeToHere(currentPage.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/30 transition animate-pulse cursor-pointer"
                title={t('pageInspector.inspectPage', { order: currentPage.order })}
              >
                <span>📍 {t('grid.rangeStart')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSetRangeStart(currentPage.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-comic-900 hover:bg-comic-800 text-slate-300 border border-comic-700/80 text-xs font-medium transition cursor-pointer"
                title={t('grid.rangeStart')}
              >
                <span>📍 {t('grid.rangeStart')}</span>
              </button>
            )
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-comic-900 border border-comic-700/80 rounded-lg p-0.5 text-xs text-slate-300">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
              className="p-1 sm:p-1.5 hover:bg-comic-800 rounded transition cursor-pointer"
              title={t('pageInspector.zoomOut')}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-1.5 py-0.5 hover:bg-comic-800 rounded font-mono text-[11px] font-semibold transition min-w-[2.5rem] text-center cursor-pointer"
              title={t('pageInspector.resetZoom')}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
              className="p-1 sm:p-1.5 hover:bg-comic-800 rounded transition cursor-pointer"
              title={t('pageInspector.zoomIn')}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Open Full Reader Button */}
          <button
            onClick={() => onOpenFullViewer(currentPage.id)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 text-xs font-semibold border border-comic-700 transition cursor-pointer"
            title={t('pageInspector.fullViewer')}
          >
            <Eye className="w-4 h-4 text-sky-400" />
            <span className="hidden lg:inline">{t('header.viewer')}</span>
          </button>

          {/* Close Modal */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg bg-comic-800 hover:bg-rose-900/60 text-slate-200 hover:text-rose-300 transition cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Single Page Area (Scrollable with margin: auto for complete top-to-bottom visibility) */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className={`flex-1 relative overflow-auto bg-black/95 select-none ${
          sizeInfo.isScrollableY || zoom > 1 || fitMode === 'width'
            ? isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-default'
        }`}
        style={{
          touchAction: 'pan-x pan-y',
          overscrollBehavior: 'contain'
        }}
      >
        {/* Navigation Arrow: Previous */}
        <button
          onClick={handlePrev}
          disabled={safeIndex === 0}
          className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-comic-950/85 hover:bg-comic-800 text-white flex items-center justify-center border border-comic-700/80 transition disabled:opacity-20 disabled:pointer-events-none shadow-2xl backdrop-blur-md active:scale-95"
          title={t('pageInspector.prevPage')}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Navigation Arrow: Next */}
        <button
          onClick={handleNext}
          disabled={safeIndex === pages.length - 1}
          className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-comic-950/85 hover:bg-comic-800 text-white flex items-center justify-center border border-comic-700/80 transition disabled:opacity-20 disabled:pointer-events-none shadow-2xl backdrop-blur-md active:scale-95"
          title={t('pageInspector.nextPage')}
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Scrollable Canvas */}
        <div className={`min-w-full min-h-full flex ${sizeInfo.isScrollableY || zoom > 1 || fitMode === 'width' ? 'items-start' : 'items-center'} justify-center p-3 sm:p-6 m-auto`}>
          <div 
            style={{ margin: 'auto' }}
            className="flex flex-col items-center justify-center transition-all duration-150 ease-out"
          >
            <img
              key={currentPage.filename}
              src={getImageUrl(sessionId, currentPage.filename)}
              alt={`Página ${currentPage.order}`}
              decoding="async"
              draggable={false}
              style={{
                width: sizeInfo.width,
                height: sizeInfo.height,
                maxWidth: 'none',
                maxHeight: 'none',
                objectFit: 'contain'
              }}
              className="shadow-2xl rounded-sm select-none pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* Bottom Management Toolbar */}
      <div className="h-14 sm:h-16 px-4 bg-comic-950/95 border-t border-comic-800 flex items-center justify-center gap-2 sm:gap-3 text-xs shrink-0 z-40 overflow-x-auto">
        {/* Scroll To Top & Bottom in Inspector if scrollable */}
        {sizeInfo.isScrollableY && (
          <div className="flex items-center gap-1 mr-2 pr-2 border-r border-comic-800">
            <button
              onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="p-1.5 sm:p-2 rounded-xl bg-comic-900 hover:bg-comic-800 text-sky-400 border border-comic-700/80 transition cursor-pointer"
              title={t('pageInspector.scrollToTop')}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              onClick={() =>
                containerRef.current?.scrollTo({
                  top: containerRef.current.scrollHeight,
                  behavior: 'smooth'
                })
              }
              className="p-1.5 sm:p-2 rounded-xl bg-comic-900 hover:bg-comic-800 text-sky-400 border border-comic-700/80 transition cursor-pointer"
              title={t('pageInspector.scrollToBottom')}
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Rotate Button */}
        <button
          onClick={() => onRotate(currentPage.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-comic-900 hover:bg-comic-800 text-slate-200 font-semibold border border-comic-700 transition active:scale-95 cursor-pointer"
          title={t('pageInspector.rotate90Title')}
        >
          <RotateCw className="w-4 h-4 text-indigo-400" />
          <span>{t('pageInspector.rotate90')}</span>
        </button>

        {/* Set Cover Button */}
        {!currentPage.is_cover && (
          <button
            onClick={() => onSetCover(currentPage.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-comic-900 hover:bg-comic-800 text-amber-300 font-semibold border border-comic-700 transition active:scale-95 cursor-pointer"
            title={t('pageInspector.setCoverTitle')}
          >
            <Star className="w-4 h-4 text-amber-400" />
            <span>{t('pageInspector.setCover')}</span>
          </button>
        )}

        {/* Custom Cut / Split Zone Button */}
        {onOpenCustomCut && (
          <button
            onClick={() => onOpenCustomCut(currentPage.id, isTall ? 'webtoon' : isWide ? 'vertical' : 'vertical')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border transition active:scale-95 shadow-md bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border-emerald-600/80 hover:border-emerald-400 cursor-pointer"
            title={t('pageInspector.cutZoneTitle')}
          >
            <Scissors className="w-4 h-4 text-emerald-400" />
            <span>{t('pageInspector.cutZone')}</span>
          </button>
        )}

        {/* Text Annotation / SFX Translation Notes Button */}
        {onOpenTextAnnotation && (
          <button
            onClick={() => onOpenTextAnnotation(currentPage.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border transition active:scale-95 shadow-md bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border-indigo-600/80 hover:border-indigo-400 cursor-pointer"
            title={t('pageInspector.addNoteSfxTitle')}
          >
            <Type className="w-4 h-4 text-indigo-400" />
            <span>{t('pageInspector.addNoteSfx')}</span>
          </button>
        )}

        {/* Split Spread Button */}
        {isWide && (
          <button
            onClick={() => {
              onClose();
              onSplitSpread(currentPage.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 font-semibold border border-emerald-700/80 transition active:scale-95 shadow-md cursor-pointer"
            title={t('pageInspector.splitSpreadTitle')}
          >
            <Scissors className="w-4 h-4 text-emerald-400" />
            <span>{t('pageInspector.splitSpread')}</span>
          </button>
        )}

        {/* Slice Webtoon Button (if tall) */}
        {isTall && (
          <button
            onClick={() => {
              onClose();
              onSliceWebtoon(currentPage.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border transition active:scale-95 shadow-md bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border-cyan-700/80 cursor-pointer"
            title={t('pageInspector.sliceWebtoonTitle')}
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>{t('pageInspector.sliceWebtoon')}</span>
          </button>
        )}

        {/* Chapter Separator Card Button */}
        {onChapterCover && (
          <button
            onClick={() => {
              onClose();
              onChapterCover(currentPage.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-comic-900 hover:bg-comic-800 text-indigo-300 font-semibold border border-comic-700 transition active:scale-95 cursor-pointer"
            title={t('pageInspector.chapterCoverTitle')}
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">{t('pageInspector.chapterCover')}</span>
          </button>
        )}

        {/* Delete Page Button */}
        <button
          onClick={() => {
            onDelete(currentPage.id);
            onClose();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-comic-900 hover:bg-rose-950/80 text-rose-300 font-semibold border border-comic-700/80 hover:border-rose-700 transition active:scale-95 cursor-pointer"
          title={t('pageInspector.deletePageTitle')}
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span>{t('pageInspector.deletePage')}</span>
        </button>
      </div>
    </div>
  );
};
