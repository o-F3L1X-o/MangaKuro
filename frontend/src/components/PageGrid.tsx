import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { 
  Plus, 
  Trash2, 
  CheckSquare, 
  Square, 
  ArrowUpToLine,
  X,
  Scissors,
  FolderInput,
  SlidersHorizontal,
  MousePointerClick,
  CheckCheck,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Undo2,
  GripVertical,
  PlusCircle,
  AlertTriangle
} from 'lucide-react';
import { PageItem } from '../types';
import { PageCard } from './PageCard';
import { getThumbUrl } from '../api';
import { useTranslation } from '../i18n';

export function formatPageRanges(selectedIds: string[], pages: PageItem[]): string {
  if (selectedIds.length === 0) return '';
  const selectedSet = new Set(selectedIds);
  const selectedOrders = pages
    .filter((p) => selectedSet.has(p.id))
    .map((p) => p.order)
    .sort((a, b) => a - b);

  if (selectedOrders.length === 0) return '';

  const ranges: string[] = [];
  let start = selectedOrders[0];
  let prev = start;

  for (let i = 1; i < selectedOrders.length; i++) {
    const current = selectedOrders[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      ranges.push(start === prev ? `#${start}` : `#${start}-${prev}`);
      start = current;
      prev = current;
    }
  }
  ranges.push(start === prev ? `#${start}` : `#${start}-${prev}`);

  return ranges.join(', ');
}

interface PageGridProps {
  sessionId: string;
  pages: PageItem[];
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onReorder: (newOrderedIds: string[]) => void;
  onRotate: (pageId: string) => void;
  onDelete: (pageIds: string[]) => void;
  onSetCover: (pageId: string) => void;
  onSplitSpread: (pageId: string) => void;
  onSliceWebtoon: (pageId: string) => void;
  onChapterCover: (pageId: string) => void;
  onView: (pageId: string) => void;
  onAddPages: (files: File[], insertAfterId?: string, insertAtBeginning?: boolean) => void;
  onExtractChapter?: (pageIds: string[]) => void;
  onMovePages?: (pageIds: string[]) => void;
  // Unified Sticky Header props
  sessionTitle?: string;
  sessionNumber?: string;
  sessionVolume?: string | number | null;
  canUndo?: boolean;
  onUndo?: () => void;
  onTransferToTomo?: () => void;
  onOpenImageAnalysis?: () => void;
}

export const PageGrid: React.FC<PageGridProps> = ({
  sessionId,
  pages,
  selectedIds: propSelectedIds,
  onSelectionChange,
  onReorder,
  onRotate,
  onDelete,
  onSetCover,
  onSplitSpread,
  onSliceWebtoon,
  onChapterCover,
  onView,
  onAddPages,
  onExtractChapter,
  onMovePages,
  sessionTitle,
  sessionNumber,
  sessionVolume,
  canUndo,
  onUndo,
  onTransferToTomo,
  onOpenImageAnalysis
}) => {
  const { t } = useTranslation();
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const selectedIds = propSelectedIds !== undefined ? propSelectedIds : internalSelectedIds;

  const updateSelectedIds = (idsOrUpdater: string[] | ((prev: string[]) => string[])) => {
    const nextIds = typeof idsOrUpdater === 'function' ? idsOrUpdater(selectedIds) : idsOrUpdater;
    if (onSelectionChange) {
      onSelectionChange(nextIds);
    } else {
      setInternalSelectedIds(nextIds);
    }
  };

  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isRangePanelOpen, setIsRangePanelOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(() => Math.min(25, pages.length || 1));
  const [rangePickMode, setRangePickMode] = useState<boolean>(false);
  const [rangePickStart, setRangePickStart] = useState<number | null>(null);
  const rangePickModeRef = useRef<boolean>(false);
  const rangePickStartRef = useRef<number | null>(null);

  const updateRangePickMode = (mode: boolean) => {
    rangePickModeRef.current = mode;
    setRangePickMode(mode);
  };

  const updateRangePickStart = (start: number | null) => {
    rangePickStartRef.current = start;
    setRangePickStart(start);
  };

  // Keyboard shortcut: Escape cancels 2-click range mode
  useEffect(() => {
    if (!rangePickMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        updateRangePickMode(false);
        updateRangePickStart(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rangePickMode]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activePageDragId, setActivePageDragId] = useState<string | null>(null);

  // Batching / Windowing state (automatically enforced for high page counts to eliminate CPU/RAM locks)
  type BatchSize = 30 | 50 | 100 | 200 | 'all';

  const [batchSize, setBatchSize] = useState<BatchSize>(() => {
    const saved = localStorage.getItem('mangajutsu_batch_size') || localStorage.getItem('cbz_batch_size');
    if (pages.length > 100 && (saved === 'all' || !saved)) return 50;
    if (saved === '30' || saved === '50' || saved === '100' || saved === '200' || saved === 'all') {
      return saved === 'all' ? (pages.length > 100 ? 50 : 'all') : (Number(saved) as 30 | 50 | 100 | 200);
    }
    return 50;
  });
  const [currentBatch, setCurrentBatch] = useState<number>(0);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  useEffect(() => {
    if (pages.length > 100 && batchSize === 'all') {
      setBatchSize(50);
      localStorage.setItem('mangajutsu_batch_size', '50');
    }
  }, [pages.length, batchSize]);

  const totalBatches = batchSize === 'all' ? 1 : Math.ceil(pages.length / batchSize);

  const handleBatchSizeChange = (newSize: BatchSize) => {
    const targetSize = (pages.length > 100 && newSize === 'all') ? 50 : newSize;
    setBatchSize(targetSize);
    localStorage.setItem('mangajutsu_batch_size', String(targetSize));
    if (targetSize !== 'all') {
      const firstVisiblePage = batchStartIndex;
      setCurrentBatch(Math.floor(firstVisiblePage / targetSize));
    } else {
      setCurrentBatch(0);
    }
  };

  // Clamp currentBatch if out of bounds or when totalBatches change (e.g. deleting pages from last batch)
  useEffect(() => {
    if (currentBatch >= totalBatches && totalBatches > 0) {
      setCurrentBatch(totalBatches - 1);
    }
  }, [totalBatches, currentBatch]);

  // Compute visiblePages
  const visiblePages = React.useMemo(() => {
    if (batchSize === 'all') return pages;
    const start = currentBatch * batchSize;
    return pages.slice(start, start + batchSize);
  }, [pages, batchSize, currentBatch]);

  const batchStartIndex = batchSize === 'all' ? 0 : currentBatch * batchSize;
  const batchEndIndex = batchSize === 'all' ? pages.length : Math.min(pages.length, batchStartIndex + batchSize);

  const handleJumpToPage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pages.length) return;
    if (batchSize !== 'all') {
      const targetBatch = Math.floor((pageNum - 1) / batchSize);
      setCurrentBatch(targetBatch);
      setTimeout(() => {
        const el = document.getElementById(`page-card-${pageNum}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
    } else {
      const el = document.getElementById(`page-card-${pageNum}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    setJumpPageInput('');
  };

  // Synchronize range bounds when pages change
  useEffect(() => {
    if (pages.length > 0 && rangeTo > pages.length) {
      setRangeTo(pages.length);
    }
  }, [pages.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Requires 8px movement before drag begins so clicks/checkboxes trigger reliably
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeDraggedPage = useMemo(() => {
    if (!activePageDragId) return null;
    return pages.find((p) => p.id === activePageDragId) || null;
  }, [activePageDragId, pages]);

  const handleDragStart = (event: DragStartEvent) => {
    setActivePageDragId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActivePageDragId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePageDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      if (batchSize === 'all') {
        const oldIndex = pages.findIndex((p) => p.id === active.id);
        const newIndex = pages.findIndex((p) => p.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(pages, oldIndex, newIndex);
          onReorder(reordered.map((p) => p.id));
        }
      } else {
        const oldVisibleIndex = visiblePages.findIndex((p) => p.id === active.id);
        let newVisibleIndex = visiblePages.findIndex((p) => p.id === over.id);
        if (newVisibleIndex === -1 && String(over.id).includes('dropzone')) {
          newVisibleIndex = visiblePages.length - 1;
        }
        if (oldVisibleIndex !== -1 && newVisibleIndex !== -1 && oldVisibleIndex !== newVisibleIndex) {
          const oldGlobalIndex = batchStartIndex + oldVisibleIndex;
          const newGlobalIndex = batchStartIndex + newVisibleIndex;
          const reordered = arrayMove(pages, oldGlobalIndex, newGlobalIndex);
          onReorder(reordered.map((p) => p.id));
        }
      }
    }
  };

  const handleMovePageLeft = (pageId: string) => {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx > 0) {
      const reordered = arrayMove(pages, idx, idx - 1);
      onReorder(reordered.map((p) => p.id));
    }
  };

  const handleMovePageRight = (pageId: string) => {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx >= 0 && idx < pages.length - 1) {
      const reordered = arrayMove(pages, idx, idx + 1);
      onReorder(reordered.map((p) => p.id));
    }
  };

  const handleMovePageToPosition = (pageId: string) => {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return;
    const currentOrder = idx + 1;
    const targetStr = window.prompt(`Mover página #${currentOrder} a la posición (1-${pages.length}):`, String(currentOrder));
    if (!targetStr) return;
    const targetNum = parseInt(targetStr, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > pages.length) {
      alert(`Posición inválida. Debe ser entre 1 y ${pages.length}`);
      return;
    }
    const targetIdx = targetNum - 1;
    if (targetIdx === idx) return;
    const reordered = arrayMove(pages, idx, targetIdx);
    onReorder(reordered.map((p) => p.id));
  };

  const handleToggleSelect = (pageId: string, isShift: boolean) => {
    if (rangePickModeRef.current) {
      handleCardClick(pageId);
      return;
    }

    const currentIndex = pages.findIndex((p) => p.id === pageId);
    if (currentIndex === -1) return;

    if (isShift) {
      const fromIndex = lastSelectedIndex !== null ? lastSelectedIndex : 0;
      const start = Math.min(fromIndex, currentIndex);
      const end = Math.max(fromIndex, currentIndex);
      const rangeIds = pages.slice(start, end + 1).map((p) => p.id);
      updateSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      setLastSelectedIndex(currentIndex);
    } else {
      updateSelectedIds((prev) =>
        prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
      );
      setLastSelectedIndex(currentIndex);
    }
  };

  const handleCardClick = (pageId: string, e?: React.MouseEvent) => {
    const currentIndex = pages.findIndex((p) => p.id === pageId);
    if (currentIndex === -1) return;

    // 2-Click Range Mode
    if (rangePickModeRef.current) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      const startPick = rangePickStartRef.current;
      if (startPick === null) {
        // Step 1: Pick start
        updateRangePickStart(currentIndex);
      } else {
        // Step 2: Pick end
        const start = Math.min(startPick, currentIndex);
        const end = Math.max(startPick, currentIndex);
        const rangeIds = pages.slice(start, end + 1).map((p) => p.id);
        updateSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
        setLastSelectedIndex(currentIndex);
        // Reset 2-click mode
        updateRangePickMode(false);
        updateRangePickStart(null);
      }
      return;
    }

    if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleToggleSelect(pageId, e.shiftKey);
    } else {
      onView(pageId);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === pages.length) {
      updateSelectedIds([]);
    } else {
      updateSelectedIds(pages.map((p) => p.id));
    }
  };

  const handleApplyRangeSelect = () => {
    const minOrder = Math.max(1, Math.min(rangeFrom, rangeTo));
    const maxOrder = Math.min(pages.length, Math.max(rangeFrom, rangeTo));
    const startIdx = minOrder - 1;
    const endIdx = maxOrder - 1;
    const rangeIds = pages.slice(startIdx, endIdx + 1).map((p) => p.id);
    updateSelectedIds(rangeIds);
    setLastSelectedIndex(endIdx);
  };

  const handleAddRangeSelect = () => {
    const minOrder = Math.max(1, Math.min(rangeFrom, rangeTo));
    const maxOrder = Math.min(pages.length, Math.max(rangeFrom, rangeTo));
    const startIdx = minOrder - 1;
    const endIdx = maxOrder - 1;
    const rangeIds = pages.slice(startIdx, endIdx + 1).map((p) => p.id);
    updateSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
    setLastSelectedIndex(endIdx);
  };

  const handleRemoveRangeSelect = () => {
    const minOrder = Math.max(1, Math.min(rangeFrom, rangeTo));
    const maxOrder = Math.min(pages.length, Math.max(rangeFrom, rangeTo));
    const startIdx = minOrder - 1;
    const endIdx = maxOrder - 1;
    const rangeSet = new Set(pages.slice(startIdx, endIdx + 1).map((p) => p.id));
    updateSelectedIds((prev) => prev.filter((id) => !rangeSet.has(id)));
  };

  const handleNextBlock = () => {
    const blockSize = Math.max(1, Math.abs(rangeTo - rangeFrom) + 1);
    const newFrom = Math.min(pages.length, Math.max(rangeFrom, rangeTo) + 1);
    const newTo = Math.min(pages.length, newFrom + blockSize - 1);
    setRangeFrom(newFrom);
    setRangeTo(newTo);
    const rangeIds = pages.slice(newFrom - 1, newTo).map((p) => p.id);
    updateSelectedIds(rangeIds);
    setLastSelectedIndex(newTo - 1);
  };

  const handlePrevBlock = () => {
    const blockSize = Math.max(1, Math.abs(rangeTo - rangeFrom) + 1);
    const currentMin = Math.min(rangeFrom, rangeTo);
    const newTo = Math.max(1, currentMin - 1);
    const newFrom = Math.max(1, newTo - blockSize + 1);
    setRangeFrom(newFrom);
    setRangeTo(newTo);
    const rangeIds = pages.slice(newFrom - 1, newTo).map((p) => p.id);
    updateSelectedIds(rangeIds);
    setLastSelectedIndex(newTo - 1);
  };

  const handleInvertSelection = () => {
    const currentSet = new Set(selectedIds);
    const inverted = pages.filter((p) => !currentSet.has(p.id)).map((p) => p.id);
    updateSelectedIds(inverted);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`¿Seguro que deseas eliminar ${selectedIds.length} página(s)?`)) {
      onDelete(selectedIds);
      updateSelectedIds([]);
    }
  };

  const handleMoveSelectedToFront = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const selectedPages = pages.filter((p) => selectedSet.has(p.id));
    const unselectedPages = pages.filter((p) => !selectedSet.has(p.id));
    const newPages = [...selectedPages, ...unselectedPages];
    onReorder(newPages.map((p) => p.id));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddPages(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const selectedRangeText = formatPageRanges(selectedIds, pages);

  const renderPaginationBar = (position: 'top' | 'bottom') => {
    if (pages.length <= 30 && batchSize === 'all') return null;

    return (
      <div className={`flex flex-wrap items-center justify-between gap-2.5 px-3 py-1.5 bg-white dark:bg-comic-900/90 border border-slate-200 dark:border-comic-800 rounded-xl text-xs backdrop-blur-sm shadow-md ${
        position === 'top' ? 'mb-0' : 'mt-6 px-3.5 py-2.5'
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-600 dark:text-slate-400">
            {t('toolbar.showingPages')} <strong className="text-slate-900 dark:text-white font-mono">{pages.length > 0 ? batchStartIndex + 1 : 0}–{batchEndIndex}</strong> {t('toolbar.ofPages')} <strong className="text-slate-900 dark:text-white font-mono">{pages.length}</strong>
          </span>
          {totalBatches > 1 && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-700/60 text-[11px]">
              Lote {currentBatch + 1} de {totalBatches}
            </span>
          )}
        </div>

        {totalBatches > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentBatch(0)}
              disabled={currentBatch === 0}
              className="p-1 rounded-lg bg-slate-100 dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-300 disabled:opacity-20 border border-slate-300 dark:border-comic-700 transition"
              title={t('toolbar.firstBatch')}
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentBatch((b) => Math.max(0, b - 1))}
              disabled={currentBatch === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-200 font-medium disabled:opacity-20 border border-slate-300 dark:border-comic-700 transition text-[11px]"
              title={t('toolbar.prevBatch')}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('toolbar.prevBlock')}</span>
            </button>

            <span className="font-mono text-slate-700 dark:text-slate-300 px-1.5 font-bold text-[11px]">
              {currentBatch + 1} / {totalBatches}
            </span>

            <button
              type="button"
              onClick={() => setCurrentBatch((b) => Math.min(totalBatches - 1, b + 1))}
              disabled={currentBatch >= totalBatches - 1}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-200 font-medium disabled:opacity-20 border border-slate-300 dark:border-comic-700 transition text-[11px]"
              title={t('toolbar.nextBatch')}
            >
              <span className="hidden sm:inline">{t('common.next')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentBatch(totalBatches - 1)}
              disabled={currentBatch >= totalBatches - 1}
              className="p-1 rounded-lg bg-slate-100 dark:bg-comic-800 hover:bg-slate-200 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-300 disabled:opacity-20 border border-slate-300 dark:border-comic-700 transition"
              title={t('toolbar.lastBatch')}
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick jump to page */}
          <form onSubmit={handleJumpToPage} className="flex items-center gap-1">
            <span className="text-slate-600 dark:text-slate-400 hidden sm:inline text-[11px] font-medium">{t('toolbar.goToPage')}</span>
            <input
              type="number"
              min={1}
              max={pages.length || 1}
              placeholder="#"
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              className="w-14 px-1.5 py-0.5 bg-slate-50 dark:bg-comic-950 border border-slate-300 dark:border-comic-700 rounded text-center text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-comic-800 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded border border-slate-300 dark:border-comic-700 transition font-medium text-[11px]"
            >
              {t('toolbar.go')}
            </button>
          </form>

          {/* Batch Size Selector */}
          <div className="flex items-center gap-0.5 bg-comic-950 p-0.5 rounded-lg border border-comic-800">
            <span className="text-[10px] text-slate-500 px-1 font-semibold uppercase">{t('toolbar.batchSize')}</span>
            {(pages.length > 100 ? ([30, 50, 100, 200] as const) : ([30, 50, 100, 200, 'all'] as const)).map((size) => {
              const label = size === 'all' ? t('toolbar.allPages') : `${size}`;
              const isSelected = size === 'all' ? batchSize === 'all' : batchSize === Number(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    if (size === 'all') {
                      handleBatchSizeChange('all');
                    } else {
                      handleBatchSizeChange(Number(size) as 30 | 50 | 100 | 200);
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-comic-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const handleDropExternalFiles = (files: File[], targetPageId: string, isBefore: boolean) => {
    const targetIdx = pages.findIndex((p) => p.id === targetPageId);
    if (targetIdx === -1) {
      onAddPages(files);
      return;
    }
    if (isBefore) {
      if (targetIdx === 0) {
        onAddPages(files, undefined, true);
      } else {
        const prevPage = pages[targetIdx - 1];
        onAddPages(files, prevPage.id, false);
      }
    } else {
      onAddPages(files, targetPageId, false);
    }
  };

  return (
    <div className="relative">
      {/* Unified Sticky Header & Toolbar (Pinned when scrolling down through comic pages) */}
      <div className="sticky top-14 sm:top-16 z-20 bg-slate-50/95 dark:bg-comic-950 backdrop-blur-md pt-2.5 pb-2.5 mb-4 border-b border-slate-200 dark:border-comic-800/80 shadow-xs dark:shadow-2xl -mx-4 lg:-mx-8 px-4 lg:px-8">
        {/* Row 1: Session Title, Volume/Chapter badge & Undo button */}
        {(sessionTitle || sessionNumber || onUndo) && (
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-comic-800/60 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight truncate max-w-xl" title={sessionTitle}>
                {sessionTitle}
              </h1>
              {sessionNumber && (
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs shrink-0">
                  {t('common.chapter')} #{sessionNumber}
                </span>
              )}
              {sessionVolume && !sessionNumber && (
                <span className="px-2 py-0.5 rounded-lg bg-amber-950 border border-amber-800 text-amber-300 font-mono font-bold text-xs shrink-0">
                  {t('common.tomo')} #{sessionVolume}
                </span>
              )}
              {onTransferToTomo && (
                <button
                  type="button"
                  onClick={onTransferToTomo}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 text-xs font-bold transition active:scale-95 shrink-0"
                  title={t('toolbar.incorporateToTomoTitle')}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t('header.incorporateToTomo')}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo || !onUndo}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition active:scale-95 shrink-0 ${
                  canUndo && onUndo
                    ? 'bg-slate-100 dark:bg-comic-900 hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white border-slate-300 dark:border-comic-700/80 cursor-pointer shadow-xs'
                    : 'opacity-40 cursor-not-allowed bg-slate-100/50 dark:bg-comic-950/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-comic-800/40'
                }`}
                title={canUndo ? t('common.undo') : 'Deshacer (Ctrl+Z) - Sin cambios para deshacer'}
              >
                <Undo2 className={`w-3.5 h-3.5 ${canUndo ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className="hidden sm:inline">{t('common.undo')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Row 2: Grid Selection & Action Tools */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-800 hover:border-slate-400 dark:hover:border-comic-700 text-slate-700 dark:text-slate-300 font-medium transition shadow-sm"
            >
              {selectedIds.length === pages.length ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('common.deselectAll')}</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('common.selectAll')}</span>
                </>
              )}
            </button>

            {/* Toggle Range Panel Button */}
            <button
              type="button"
              onClick={() => {
                setIsRangePanelOpen(!isRangePanelOpen);
                if (rangePickModeRef.current) {
                  updateRangePickMode(false);
                  updateRangePickStart(null);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition border shadow-sm ${
                isRangePanelOpen
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/25'
                  : 'bg-white dark:bg-comic-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-comic-800 hover:border-slate-400 dark:hover:border-comic-700 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t('toolbar.selectRangeTitle')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{t('toolbar.selectRange')}</span>
            </button>

            {/* Toggle 2-Click Mode Button */}
            <button
              type="button"
              onClick={() => {
                const nextMode = !rangePickModeRef.current;
                updateRangePickMode(nextMode);
                updateRangePickStart(null);
                if (nextMode) setIsRangePanelOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition border shadow-sm ${
                rangePickMode
                  ? 'bg-amber-600 text-white border-amber-500 shadow-amber-600/30'
                  : 'bg-white dark:bg-comic-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-comic-800 hover:border-slate-400 dark:hover:border-comic-700 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={t('toolbar.mode2ClicksActive')}
            >
              <MousePointerClick className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>{t('toolbar.mode2Clicks')}</span>
            </button>

            <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-600 dark:text-slate-400">Total: <strong className="text-slate-900 dark:text-white font-mono">{pages.length}</strong> {t('common.pages')}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Undo action button in tool row */}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo || !onUndo}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold shadow-xs transition active:scale-95 ${
                canUndo && onUndo
                  ? 'bg-white dark:bg-comic-800 hover:bg-slate-100 dark:hover:bg-comic-700 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-comic-700 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-comic-900 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-comic-800'
              }`}
              title={canUndo ? t('common.undo') : 'Deshacer (Ctrl+Z) - Sin cambios para deshacer'}
            >
              <Undo2 className={`w-3.5 h-3.5 ${canUndo ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'}`} />
              <span className="hidden sm:inline">{t('common.undoShort') || 'Deshacer'}</span>
              <span className="text-[10px] opacity-60 hidden md:inline font-mono">(Ctrl+Z)</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title={t('toolbar.addImagesFrontTitle')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-comic-800 hover:bg-slate-100 dark:hover:bg-comic-700 text-slate-700 dark:text-slate-200 font-medium border border-slate-300 dark:border-comic-700 shadow-sm transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden sm:inline">{t('toolbar.addImagesFront')}</span>
              <span className="sm:hidden">{t('common.upload')}</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        {/* Selection Action Bar (when pages are selected) */}
        {selectedIds.length > 0 && (
          <div className="mb-2 px-3 py-1.5 rounded-xl bg-indigo-950/90 border border-indigo-500/50 shadow-lg flex flex-wrap items-center justify-between gap-2.5 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)] shrink-0" />
              <div className="flex items-center gap-2 truncate">
                <span className="text-xs sm:text-sm font-bold text-white shrink-0">
                  {selectedIds.length} {selectedIds.length === 1 ? t('common.page') : t('common.pages')}
                </span>
                {selectedRangeText && (
                  <span className="text-xs text-indigo-300 font-mono font-medium truncate" title={selectedRangeText}>
                    ({selectedRangeText})
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleMoveSelectedToFront}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-comic-800 hover:bg-comic-700 text-xs font-semibold text-slate-200 border border-comic-700 transition"
                title={t('toolbar.moveToFrontTitle')}
              >
                <ArrowUpToLine className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">{t('toolbar.moveToFront')}</span>
              </button>

              {onExtractChapter && (
                <button
                  type="button"
                  onClick={() => onExtractChapter(selectedIds)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-xs font-bold text-white shadow-md shadow-amber-600/20 transition active:scale-95"
                  title={t('toolbar.separateToChapterTitle')}
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>{t('toolbar.separateToChapter')}</span>
                </button>
              )}

              {onMovePages && (
                <button
                  type="button"
                  onClick={() => onMovePages(selectedIds)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-xs font-bold text-white shadow-md shadow-indigo-600/25 transition active:scale-95"
                  title={t('toolbar.moveToTomoTitle')}
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  <span>{t('toolbar.moveToTomo')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleInvertSelection}
                className="px-2 py-1 rounded-lg bg-comic-800 hover:bg-comic-700 text-xs text-slate-300 border border-comic-700 transition"
                title={t('toolbar.invertSelectionTitle')}
              >
                {t('toolbar.invertSelection')}
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition"
                title={t('toolbar.deleteSelectedPagesTitle')}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('toolbar.deleteSelectedPages', { count: selectedIds.length })}</span>
              </button>

              <button
                type="button"
                onClick={() => updateSelectedIds([])}
                className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                title={t('common.deselectAll')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Range Selection Panel */}
        {isRangePanelOpen && (
          <div className="p-3 bg-comic-900 border border-indigo-500/40 rounded-xl mb-2 shadow-xl flex flex-col md:flex-row items-center justify-between gap-2.5 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <span className="font-bold text-white flex items-center gap-1.5 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                {t('toolbar.rangeLabel')}
              </span>

              <div className="flex items-center gap-1 bg-comic-950 px-2 py-1 rounded-lg border border-comic-800">
                <span className="text-slate-400">{t('toolbar.from')}</span>
                <input
                  type="number"
                  min={1}
                  max={pages.length || 1}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(Math.max(1, Math.min(pages.length || 1, Number(e.target.value))))}
                  className="w-14 px-1 py-0.5 bg-comic-900 border border-comic-700 rounded text-center text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-slate-400">{t('toolbar.to')}</span>
                <input
                  type="number"
                  min={1}
                  max={pages.length || 1}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(Math.max(1, Math.min(pages.length || 1, Number(e.target.value))))}
                  className="w-14 px-1 py-0.5 bg-comic-900 border border-comic-700 rounded text-center text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-slate-500 text-[11px]">{t('toolbar.ofTotal', { count: pages.length })}</span>
              </div>

              <button
                type="button"
                onClick={handleApplyRangeSelect}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow transition flex items-center gap-1 active:scale-95"
                title={t('toolbar.selectRangeExact')}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t('toolbar.selectPages', { count: Math.max(0, Math.min(pages.length, Math.max(rangeFrom, rangeTo)) - Math.max(1, Math.min(rangeFrom, rangeTo)) + 1) })}</span>
              </button>

              <button
                type="button"
                onClick={handleAddRangeSelect}
                className="px-2 py-1 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 border border-comic-700 transition font-medium active:scale-95"
                title={t('toolbar.addRangeTitle')}
              >
                {t('toolbar.addRangeBtn')}
              </button>

              <button
                type="button"
                onClick={handleRemoveRangeSelect}
                className="px-2 py-1 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-300 border border-comic-700 transition active:scale-95"
                title={t('toolbar.removeRangeTitle')}
              >
                {t('toolbar.removeRangeBtn')}
              </button>
            </div>

            {/* Steppers & Navigation for Chapters */}
            <div className="flex items-center gap-1.5 flex-wrap self-end md:self-auto">
              {rangeFrom > 1 && (
                <button
                  type="button"
                  onClick={handlePrevBlock}
                  className="px-2 py-1 rounded-lg bg-comic-950 hover:bg-comic-800 text-slate-300 border border-comic-800 text-[11px] transition flex items-center gap-1"
                  title={t('toolbar.prevBlockTitle')}
                >
                  <ArrowLeft className="w-3 h-3 text-indigo-400" />
                  <span>{t('toolbar.prevBlock')}</span>
                </button>
              )}

              {rangeTo < pages.length && (
                <button
                  type="button"
                  onClick={handleNextBlock}
                  className="px-2 py-1 rounded-lg bg-comic-950 hover:bg-comic-800 text-slate-300 border border-comic-800 text-[11px] transition flex items-center gap-1"
                  title={t('toolbar.nextBlockTitle')}
                >
                  <span>{t('toolbar.nextBlock', { count: Math.max(1, Math.abs(rangeTo - rangeFrom) + 1) })}</span>
                  <ArrowRight className="w-3 h-3 text-indigo-400" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsRangePanelOpen(false)}
                className="p-1 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
                title={t('toolbar.closeRangePanel')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2-Click Range Mode Active Banner */}
        {rangePickMode && (
          <div className="p-2.5 bg-amber-950 border border-amber-500/60 rounded-xl mb-2 shadow-lg flex items-center justify-between gap-2.5 text-xs text-amber-200 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-amber-400 shrink-0" />
              {rangePickStart === null ? (
                <span>
                  <strong>{t('toolbar.step1')}:</strong> {t('toolbar.step1Desc')}
                </span>
              ) : (
                <span>
                  <strong>{t('toolbar.step2')}:</strong> {t('toolbar.step2Desc', { order: pages[rangePickStart]?.order })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                updateRangePickMode(false);
                updateRangePickStart(null);
              }}
              className="px-2 py-0.5 rounded-lg bg-comic-900 hover:bg-comic-800 text-amber-300 border border-amber-600/40 transition font-semibold text-[11px]"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Top Batch Pagination Bar */}
        {renderPaginationBar('top')}

      </div>

      {/* Pages Sortable Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={visiblePages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visiblePages.map((page, idx) => {
              const globalIdx = batchSize === 'all' ? idx : batchStartIndex + idx;
              return (
                <PageCard
                  key={page.id}
                  page={page}
                  sessionId={sessionId}
                  isSelected={selectedIds.includes(page.id)}
                  isRangePickActive={rangePickMode}
                  isRangePickStart={rangePickMode && rangePickStart === globalIdx}
                  isDragDisabled={false}
                  canMoveLeft={globalIdx > 0}
                  canMoveRight={globalIdx < pages.length - 1}
                  onMoveLeft={handleMovePageLeft}
                  onMoveRight={handleMovePageRight}
                  onMoveToPosition={handleMovePageToPosition}
                  onToggleSelect={handleToggleSelect}
                  onCardClick={handleCardClick}
                  onView={onView}
                  onRotate={onRotate}
                  onDelete={(pid) => onDelete([pid])}
                  onSetCover={onSetCover}
                  onSplitSpread={onSplitSpread}
                  onSliceWebtoon={onSliceWebtoon}
                  onChapterCover={onChapterCover}
                  onDropExternalFiles={handleDropExternalFiles}
                />
              );
            })}

            {/* Quick Add Card Dropzone (Show on last batch or when viewing all) */}
            {(batchSize === 'all' || currentBatch === totalBatches - 1 || pages.length === 0) && (
              <div
                id="quick-add-dropzone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = Array.from(e.dataTransfer.files).filter(
                      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name)
                    );
                    if (files.length > 0) {
                      const lastPage = pages[pages.length - 1];
                      onAddPages(files, lastPage?.id, false);
                    }
                  }
                }}
                className="aspect-[2/3] rounded-xl border-2 border-dashed border-comic-800 hover:border-indigo-500/60 bg-comic-900/30 hover:bg-comic-900/60 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer p-4 text-center group"
              >
                <div className="w-10 h-10 rounded-full bg-comic-800 group-hover:bg-indigo-600/20 text-slate-400 group-hover:text-indigo-400 flex items-center justify-center transition">
                  <Plus className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-400 group-hover:text-slate-200">
                  {t('sidebar.addFiles')}
                </p>
                <p className="text-[10px] text-slate-500">
                  JPG, PNG, WebP
                </p>
              </div>
            )}
          </div>
        </SortableContext>

        {/* Page Drag Overlay for smooth visual feedback */}
        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeDraggedPage ? (
            <div className="w-36 aspect-[2/3] rounded-xl overflow-hidden bg-comic-950 border-2 border-indigo-400 ring-2 ring-indigo-500/60 shadow-2xl flex items-center justify-center relative scale-105 pointer-events-none select-none">
              <img
                src={getThumbUrl(sessionId, activeDraggedPage.thumb_filename)}
                alt=""
                className="w-full h-full object-contain"
              />
              <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-comic-950/90 text-[10px] font-mono font-bold text-white border border-slate-700 shadow">
                #{activeDraggedPage.order}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Bottom Batch Pagination Bar */}
      {renderPaginationBar('bottom')}
    </div>
  );
};
