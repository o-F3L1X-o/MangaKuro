import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2,
  Columns,
  Layers,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { PageItem } from '../types';
import { getImageUrl } from '../api';
import { LazyImage } from './LazyImage';
import { useTranslation } from '../i18n';

interface LightboxProps {
  sessionId: string;
  pages: PageItem[];
  initialPageId: string | null;
  readingDirection?: 'ltr' | 'rtl' | 'vertical';
  onClose: () => void;
  onRotate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  sessionId,
  pages,
  initialPageId,
  readingDirection = 'ltr',
  onClose,
  onRotate
}) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = pages.findIndex((p) => p.id === initialPageId);
    return idx !== -1 ? idx : 0;
  });

  const [viewerMode, setViewerMode] = useState<'paged' | 'webtoon'>(() => {
    return readingDirection === 'vertical' ? 'webtoon' : 'paged';
  });

  // Paged Mode states
  const [pagedZoom, setPagedZoom] = useState<number>(1);
  const [fitMode, setFitMode] = useState<'contain' | 'width'>('contain');
  const pagedContainerRef = useRef<HTMLDivElement>(null);

  // Webtoon Mode states
  const [webtoonZoom, setWebtoonZoom] = useState<number>(1);
  const [webtoonFitWidth, setWebtoonFitWidth] = useState<boolean>(false);
  const webtoonContainerRef = useRef<HTMLDivElement>(null);

  // Drag to Pan state for Paged Mode
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });

  // Track window dimensions for pixel-perfect layout calculation
  const [windowSize, setWindowSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    const onResize = () => {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Webtoon Chunking for massive comics (keeps RAM under 150MB instead of 60GB)
  const WEBTOON_CHUNK_SIZE = 30;
  const [webtoonChunk, setWebtoonChunk] = useState(() => Math.floor(currentIndex / WEBTOON_CHUNK_SIZE));
  const totalWebtoonChunks = Math.ceil(pages.length / WEBTOON_CHUNK_SIZE);
  const isChunkedWebtoon = pages.length > 50;
  const visibleWebtoonPages = isChunkedWebtoon
    ? pages.slice(webtoonChunk * WEBTOON_CHUNK_SIZE, (webtoonChunk + 1) * WEBTOON_CHUNK_SIZE)
    : pages;

  const currentPage = pages[currentIndex];

  // Synchronize index if initialPageId changes
  useEffect(() => {
    const idx = pages.findIndex((p) => p.id === initialPageId);
    if (idx !== -1) {
      setCurrentIndex(idx);
      setWebtoonChunk(Math.floor(idx / WEBTOON_CHUNK_SIZE));
      setPagedZoom(1);
    }
  }, [initialPageId, pages]);

  // Jump to initial page in webtoon mode instantly without laggy smooth scrolling
  useEffect(() => {
    if (viewerMode === 'webtoon' && initialPageId) {
      const el = document.getElementById(`webtoon-page-${initialPageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      }
    }
  }, [viewerMode, initialPageId]);

  // Handle Ctrl + Mouse Wheel for zoom in both modes
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        if (viewerMode === 'paged') {
          setPagedZoom((z) => Math.min(4, Math.max(0.5, Number((z + delta).toFixed(2)))));
        } else {
          setWebtoonZoom((z) => Math.min(2.5, Math.max(0.4, Number((z + delta).toFixed(2)))));
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [viewerMode]);

  // Compute displayed image dimensions in paged mode
  const pagedSizeInfo = useMemo(() => {
    if (!currentPage) return { width: undefined, height: undefined, isScrollableY: false };

    const padX = 80;
    const padY = 90;
    const availW = Math.max(300, windowSize.w - padX);
    const availH = Math.max(300, windowSize.h - padY);

    const imgW = currentPage.width || 1000;
    const imgH = currentPage.height || 1400;

    if (fitMode === 'width') {
      // Fit width: spans available width (or max comfortable reading column), height expands naturally
      const baseW = Math.min(availW, Math.max(800, imgW));
      const targetW = Math.round(baseW * pagedZoom);
      const targetH = Math.round((imgH / imgW) * targetW);
      return {
        width: `${targetW}px`,
        height: `${targetH}px`,
        isScrollableY: targetH > availH
      };
    } else {
      // Fit contain (screen height): fits into available screen, multiplied by zoom
      const scale = Math.min(availW / imgW, availH / imgH);
      const baseW = imgW * scale;
      const baseH = imgH * scale;
      const targetW = Math.round(baseW * pagedZoom);
      const targetH = Math.round(baseH * pagedZoom);
      return {
        width: `${targetW}px`,
        height: `${targetH}px`,
        isScrollableY: targetH > availH
      };
    }
  }, [currentPage, fitMode, pagedZoom, windowSize]);

  // Mouse Drag to Pan handler for Paged mode
  const handlePagedMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    const container = pagedContainerRef.current;
    if (!container) return;

    const isScrollable = container.scrollHeight > container.clientHeight || container.scrollWidth > container.clientWidth;
    if (!isScrollable && pagedZoom <= 1 && fitMode === 'contain') return;

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
      const container = pagedContainerRef.current;
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (viewerMode === 'paged') {
        // Page Navigation
        if (readingDirection === 'rtl') {
          // Manga RTL: Left advances, Right goes back
          if (e.key === 'ArrowLeft') handleNext();
          if (e.key === 'ArrowRight') handlePrev();
        } else {
          // Comic LTR: Right advances, Left goes back
          if (e.key === 'ArrowRight') handleNext();
          if (e.key === 'ArrowLeft') handlePrev();
        }

        // Vertical scroll up/down when image is taller than screen
        if (e.key === 'ArrowDown') {
          pagedContainerRef.current?.scrollBy({ top: 150, behavior: 'smooth' });
        } else if (e.key === 'ArrowUp') {
          pagedContainerRef.current?.scrollBy({ top: -150, behavior: 'smooth' });
        } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
          e.preventDefault();
          pagedContainerRef.current?.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
        } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
          e.preventDefault();
          pagedContainerRef.current?.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
        } else if (e.key === 'Home') {
          e.preventDefault();
          pagedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (e.key === 'End') {
          e.preventDefault();
          if (pagedContainerRef.current) {
            pagedContainerRef.current.scrollTo({ top: pagedContainerRef.current.scrollHeight, behavior: 'smooth' });
          }
        }

        // Zoom shortcuts in paged mode
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setPagedZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setPagedZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
        } else if (e.key === '0') {
          e.preventDefault();
          setPagedZoom(1);
        } else if (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setFitMode((m) => (m === 'contain' ? 'width' : 'contain'));
        }

        // Rotate
        if (e.key.toLowerCase() === 'r' && currentPage) {
          e.preventDefault();
          onRotate(currentPage.id);
        }
      } else {
        // Webtoon mode shortcuts
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setWebtoonZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setWebtoonZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
        } else if (e.key === '0') {
          e.preventDefault();
          setWebtoonZoom(1);
          setWebtoonFitWidth(false);
        } else if (e.key === 'Home') {
          e.preventDefault();
          scrollToTop();
        } else if (e.key === 'End') {
          e.preventDefault();
          scrollToBottom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, viewerMode, readingDirection, currentPage]);

  const handleNext = () => {
    if (currentIndex < pages.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setPagedZoom(1);
      if (pagedContainerRef.current) {
        pagedContainerRef.current.scrollTop = 0;
        pagedContainerRef.current.scrollLeft = 0;
      }
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setPagedZoom(1);
      if (pagedContainerRef.current) {
        pagedContainerRef.current.scrollTop = 0;
        pagedContainerRef.current.scrollLeft = 0;
      }
    }
  };

  const scrollToTop = () => {
    webtoonContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    if (webtoonContainerRef.current) {
      webtoonContainerRef.current.scrollTo({
        top: webtoonContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Webtoon Column Width based on webtoonZoom & fit width toggle
  const webtoonColumnWidth = webtoonFitWidth
    ? '100%'
    : `${Math.round(800 * webtoonZoom)}px`;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Floating Control Bar */}
      <div className="h-14 px-3 sm:px-4 bg-comic-950/90 border-b border-comic-800 flex items-center justify-between text-slate-200 select-none shrink-0 z-40 gap-2">
        {/* Left: Identity & Dimensions */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xs sm:text-sm font-bold text-white truncate">
            {viewerMode === 'paged'
              ? t('lightbox.pageOf', { current: currentIndex + 1, total: pages.length })
              : t('lightbox.webtoonModePages', { count: pages.length })}
          </span>
          {currentPage && viewerMode === 'paged' && (
            <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
              ({currentPage.width}×{currentPage.height}px)
            </span>
          )}
        </div>

        {/* Center: View Mode Toggle */}
        <div className="flex items-center gap-1 bg-comic-900 border border-comic-700/80 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setViewerMode('paged')}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold transition ${
              viewerMode === 'paged' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('lightbox.pagedMode')}</span>
            <span className="sm:hidden">{t('lightbox.pagedModeShort')}</span>
          </button>
          <button
            onClick={() => setViewerMode('webtoon')}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold transition ${
              viewerMode === 'webtoon' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('lightbox.webtoonMode')}</span>
            <span className="sm:hidden">{t('lightbox.webtoonModeShort')}</span>
          </button>
        </div>

        {/* Right: Actions and Zoom Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Paged Mode Controls */}
          {viewerMode === 'paged' && currentPage && (
            <div className="flex items-center gap-1">
              {/* Fit Mode Toggle (Contain vs Width) */}
              <button
                onClick={() => setFitMode((m) => (m === 'contain' ? 'width' : 'contain'))}
                className={`px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
                  fitMode === 'width'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-comic-900 text-slate-300 border-comic-700/80 hover:bg-comic-800'
                }`}
                title={
                  fitMode === 'width'
                    ? t('lightbox.fitWidthTitle')
                    : t('lightbox.fitScreenTitle')
                }
              >
                {fitMode === 'width' ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{t('lightbox.fitScreen')}</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{t('lightbox.fitWidth')}</span>
                  </>
                )}
              </button>

              {/* Zoom Controls */}
              <button
                onClick={() => setPagedZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.zoomOut')}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagedZoom(1)}
                className="text-xs font-mono text-slate-300 px-1.5 py-1 rounded hover:bg-comic-800 text-center transition min-w-[3rem]"
                title={t('lightbox.resetZoom')}
              >
                {Math.round(pagedZoom * 100)}%
              </button>
              <button
                onClick={() => setPagedZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.zoomIn')}
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Scroll to Top / Bottom in Paged Mode (for tall or zoomed pages) */}
              {pagedSizeInfo.isScrollableY && (
                <>
                  <div className="h-4 w-px bg-comic-800 mx-1 hidden sm:block" />
                  <button
                    onClick={() => pagedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                    title={t('lightbox.scrollToTop')}
                  >
                    <ArrowUp className="w-4 h-4 text-sky-400" />
                  </button>
                  <button
                    onClick={() =>
                      pagedContainerRef.current?.scrollTo({
                        top: pagedContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                      })
                    }
                    className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                    title={t('lightbox.scrollToBottom')}
                  >
                    <ArrowDown className="w-4 h-4 text-sky-400" />
                  </button>
                </>
              )}

              {/* Rotate Button */}
              <button
                onClick={() => onRotate(currentPage.id)}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.rotate90')}
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Webtoon Mode Controls */}
          {viewerMode === 'webtoon' && (
            <div className="flex items-center gap-1">
              {/* Webtoon Zoom In / Zoom Out */}
              <button
                onClick={() => setWebtoonZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.webtoonZoomOut')}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setWebtoonZoom(1);
                  setWebtoonFitWidth(false);
                }}
                className="text-xs font-mono text-slate-300 px-1.5 py-1 rounded hover:bg-comic-800 text-center transition min-w-[3.5rem]"
                title={t('lightbox.webtoonZoomReset')}
              >
                {webtoonFitWidth ? t('lightbox.width100') : `${Math.round(webtoonZoom * 100)}%`}
              </button>
              <button
                onClick={() => setWebtoonZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.webtoonZoomIn')}
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Fit Width toggle */}
              <button
                onClick={() => setWebtoonFitWidth((v) => !v)}
                className={`p-1.5 sm:p-2 rounded-lg transition ${
                  webtoonFitWidth 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'hover:bg-comic-800 text-slate-300'
                }`}
                title={webtoonFitWidth ? t('lightbox.toggleStandardCol') : t('lightbox.toggleFullWidth')}
              >
                {webtoonFitWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <div className="h-4 w-px bg-comic-800 mx-1" />

              {/* Scroll to Top / Bottom */}
              <button
                onClick={scrollToTop}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.goToStart')}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={scrollToBottom}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-comic-800 text-slate-300 transition"
                title={t('lightbox.goToEnd')}
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-comic-800 mx-0.5" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg bg-comic-800 hover:bg-rose-900/60 text-slate-200 hover:text-rose-300 transition"
            title={t('lightbox.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {viewerMode === 'paged' ? (
        <div
          ref={pagedContainerRef}
          onMouseDown={handlePagedMouseDown}
          className={`flex-1 relative overflow-auto bg-black/95 select-none ${
            pagedSizeInfo.isScrollableY || pagedZoom > 1 || fitMode === 'width'
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
          {/* Navigation Arrows (Fixed on left and right) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              readingDirection === 'rtl' ? handleNext() : handlePrev();
            }}
            disabled={readingDirection === 'rtl' ? currentIndex === pages.length - 1 : currentIndex === 0}
            className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-comic-900/85 hover:bg-comic-800 text-white flex items-center justify-center border border-comic-700/70 transition disabled:opacity-20 disabled:pointer-events-none shadow-2xl active:scale-95 backdrop-blur-md"
            title={readingDirection === 'rtl' ? t('lightbox.nextPageRtl') : t('lightbox.prevPageLtr')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              readingDirection === 'rtl' ? handlePrev() : handleNext();
            }}
            disabled={readingDirection === 'rtl' ? currentIndex === 0 : currentIndex === pages.length - 1}
            className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-comic-900/85 hover:bg-comic-800 text-white flex items-center justify-center border border-comic-700/70 transition disabled:opacity-20 disabled:pointer-events-none shadow-2xl active:scale-95 backdrop-blur-md"
            title={readingDirection === 'rtl' ? t('lightbox.prevPageRtl') : t('lightbox.nextPageLtr')}
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Centered Scrollable Canvas (margin: auto ensures scrolling to top & bottom without clipping) */}
          <div className="min-w-full min-h-full flex items-center justify-center p-3 sm:p-6 m-auto">
            {currentPage && (
              <div
                style={{ margin: 'auto' }}
                className="flex flex-col items-center justify-center transition-all duration-150 ease-out"
              >
                <img
                  src={getImageUrl(sessionId, currentPage.filename)}
                  alt={`Página ${currentPage.order}`}
                  decoding="async"
                  draggable={false}
                  style={{
                    width: pagedSizeInfo.width,
                    height: pagedSizeInfo.height,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    objectFit: 'contain'
                  }}
                  className="shadow-2xl rounded-sm select-none pointer-events-none"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Webtoon Vertical Continuous Cascade Mode */
        <div
          ref={webtoonContainerRef}
          className="flex-1 overflow-y-auto overflow-x-auto webtoon-scroll-container bg-black flex flex-col items-center py-4 select-none"
        >
          {/* Top Chunk Navigator */}
          {totalWebtoonChunks > 1 && (
            <div className="w-full max-w-xl flex items-center justify-between px-4 py-2 mb-3 bg-comic-900/90 rounded-xl border border-comic-800 text-xs shadow-xl sticky top-2 z-20 backdrop-blur-md">
              <button
                onClick={() => {
                  setWebtoonChunk((c) => Math.max(0, c - 1));
                  webtoonContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={webtoonChunk === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 disabled:opacity-20 disabled:hover:bg-comic-800 transition text-xs font-semibold"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('lightbox.prevBlock')}</span>
              </button>
              <span className="text-slate-300 font-medium text-xs">
                {t('lightbox.blockCount', { current: webtoonChunk + 1, total: totalWebtoonChunks })}{' '}
                ({t('lightbox.blockStrips', {
                  start: webtoonChunk * WEBTOON_CHUNK_SIZE + 1,
                  end: Math.min(pages.length, (webtoonChunk + 1) * WEBTOON_CHUNK_SIZE)
                })})
              </span>
              <button
                onClick={() => {
                  setWebtoonChunk((c) => Math.min(totalWebtoonChunks - 1, c + 1));
                  webtoonContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={webtoonChunk >= totalWebtoonChunks - 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 disabled:opacity-20 disabled:hover:bg-comic-800 transition text-xs font-semibold"
              >
                <span>{t('lightbox.nextBlock')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Webtoon Strip Canvas with dynamic Zoom Width */}
          <div 
            className="flex flex-col items-center transition-all duration-150 ease-out"
            style={{
              width: webtoonColumnWidth,
              maxWidth: webtoonFitWidth ? 'none' : '98vw'
            }}
          >
            {visibleWebtoonPages.map((page) => (
              <div
                key={page.id}
                id={`webtoon-page-${page.id}`}
                className="w-full relative flex justify-center bg-black min-h-[300px]"
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 1000px',
                  marginBottom: '-1px' // Seamless strip connection without white seam lines
                }}
              >
                <LazyImage
                  src={getImageUrl(sessionId, page.filename)}
                  alt={`Página ${page.order}`}
                  aspectRatio="aspect-auto"
                  rootMargin="400px"
                  className="w-full h-auto object-contain block select-none"
                />
              </div>
            ))}
          </div>

          {/* Bottom Chunk Navigator */}
          {totalWebtoonChunks > 1 && (
            <div className="w-full max-w-xl flex items-center justify-between px-4 py-2 mt-4 bg-comic-900/90 rounded-xl border border-comic-800 text-xs shadow-xl">
              <button
                onClick={() => {
                  setWebtoonChunk((c) => Math.max(0, c - 1));
                  webtoonContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={webtoonChunk === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 disabled:opacity-20 disabled:hover:bg-comic-800 transition text-xs font-semibold"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('lightbox.prevBlock')}</span>
              </button>
              <span className="text-slate-300 font-medium text-xs">
                {t('lightbox.blockCount', { current: webtoonChunk + 1, total: totalWebtoonChunks })}
              </span>
              <button
                onClick={() => {
                  setWebtoonChunk((c) => Math.min(totalWebtoonChunks - 1, c + 1));
                  webtoonContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={webtoonChunk >= totalWebtoonChunks - 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 disabled:opacity-20 disabled:hover:bg-comic-800 transition text-xs font-semibold"
              >
                <span>{t('lightbox.nextBlock')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
