import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Eye, 
  RotateCw, 
  Trash2, 
  Star, 
  Scissors, 
  Layers, 
  GripVertical,
  Check,
  BookMarked,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { PageItem } from '../types';
import { getThumbUrl } from '../api';
import { LazyImage } from './LazyImage';
import { useTranslation } from '../i18n';

interface PageCardProps {
  page: PageItem;
  sessionId: string;
  isSelected: boolean;
  isRangePickActive?: boolean;
  isRangePickStart?: boolean;
  isDragDisabled?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onToggleSelect: (pageId: string, shiftKey: boolean) => void;
  onView: (pageId: string) => void;
  onRotate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onSetCover: (pageId: string) => void;
  onSplitSpread: (pageId: string) => void;
  onSliceWebtoon: (pageId: string) => void;
  onChapterCover: (pageId: string) => void;
  onCardClick?: (pageId: string, e: React.MouseEvent) => void;
  onMoveLeft?: (pageId: string) => void;
  onMoveRight?: (pageId: string) => void;
  onMoveToPosition?: (pageId: string) => void;
  onDropExternalFiles?: (files: File[], targetPageId: string, isBefore: boolean) => void;
}

const PageCardComponent: React.FC<PageCardProps> = ({
  page,
  sessionId,
  isSelected,
  isRangePickActive,
  isRangePickStart,
  isDragDisabled = false,
  canMoveLeft = false,
  canMoveRight = false,
  onToggleSelect,
  onView,
  onRotate,
  onDelete,
  onSetCover,
  onSplitSpread,
  onSliceWebtoon,
  onChapterCover,
  onCardClick,
  onMoveLeft,
  onMoveRight,
  onMoveToPosition,
  onDropExternalFiles
}) => {
  const { t } = useTranslation();
  const [externalDropPosition, setExternalDropPosition] = React.useState<'before' | 'after' | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: page.id, disabled: isDragDisabled });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.35 : 1,
    contain: 'content'
  };

  const isWide = page.width > page.height * 1.15; // Candidate for spread split
  const isTall = page.height > 2200; // Candidate for webtoon slice

  return (
    <div
      ref={setNodeRef}
      id={`page-card-${page.order}`}
      style={style}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const isBefore = (e.clientX - rect.left) < rect.width / 2;
          setExternalDropPosition(isBefore ? 'before' : 'after');
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setExternalDropPosition(null);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const files = Array.from(e.dataTransfer.files).filter(
            (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name)
          );
          const pos = externalDropPosition || 'after';
          setExternalDropPosition(null);
          if (files.length > 0 && onDropExternalFiles) {
            onDropExternalFiles(files, page.id, pos === 'before');
          }
        }
      }}
      className={`group relative rounded-xl overflow-hidden bg-white dark:bg-comic-900 border transition-all duration-200 shadow-xs dark:shadow-md ${
        isRangePickStart
          ? 'border-amber-400 ring-2 ring-inset ring-amber-400 shadow-amber-500/30'
          : isSelected 
            ? 'border-indigo-500 ring-2 ring-inset ring-indigo-500 shadow-indigo-500/20' 
            : isRangePickActive
              ? 'border-amber-500/40 hover:border-amber-400 hover:ring-1 hover:ring-inset hover:ring-amber-400/50'
              : 'border-slate-200 dark:border-comic-800 hover:border-slate-300 dark:hover:border-comic-700 hover:shadow-md dark:hover:shadow-xl'
      }`}
    >
      {/* Visual Drop Indicators for External File Drag */}
      {externalDropPosition === 'before' && (
        <div className="absolute inset-y-0 left-0 w-2.5 z-50 flex items-center justify-center pointer-events-none">
          <div className="w-1.5 h-full bg-indigo-500 rounded-r-md shadow-[0_0_12px_rgba(99,102,241,1)] animate-pulse" />
          <span className="absolute left-3 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold shadow-lg whitespace-nowrap z-50 border border-indigo-400">
            + {t('common.insertHere')}
          </span>
        </div>
      )}
      {externalDropPosition === 'after' && (
        <div className="absolute inset-y-0 right-0 w-2.5 z-50 flex items-center justify-center pointer-events-none">
          <div className="w-1.5 h-full bg-indigo-500 rounded-l-md shadow-[0_0_12px_rgba(99,102,241,1)] animate-pulse" />
          <span className="absolute right-3 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold shadow-lg whitespace-nowrap z-50 border border-indigo-400">
            + {t('common.insertHere')}
          </span>
        </div>
      )}
      {/* Thumbnail */}
      <div 
        className={`aspect-[2/3] w-full bg-slate-100 dark:bg-comic-950 relative overflow-hidden flex items-center justify-center select-none ${
          isRangePickActive ? 'cursor-crosshair' : 'cursor-pointer'
        }`}
        onClick={(e) => {
          if (onCardClick) {
            onCardClick(page.id, e);
          } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onToggleSelect(page.id, e.shiftKey);
          } else {
            onView(page.id);
          }
        }}
      >
        <LazyImage
          key={page.thumb_filename}
          src={getThumbUrl(sessionId, page.thumb_filename)}
          alt={`Página ${page.order}`}
          className="w-full h-full object-contain pointer-events-none no-drag transition-transform duration-300 group-hover:scale-102"
        />

        {/* 2-Click Range Mode Start Badge */}
        {isRangePickStart && (
          <div className="absolute inset-0 border-2 border-amber-400 bg-amber-950/70 z-20 pointer-events-none flex flex-col items-center justify-center gap-1">
            <span className="px-2.5 py-1 rounded-md bg-amber-500 text-amber-950 text-xs font-black uppercase shadow-xl tracking-wider">
              {t('grid.rangeStart')}
            </span>
          </div>
        )}

        {/* Page Order Badge with quick move-to-position on click */}
        <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveToPosition?.(page.id);
            }}
            className="px-2 py-0.5 rounded-md bg-comic-950/95 text-[11px] font-mono font-bold text-slate-200 border border-slate-700/80 shadow hover:border-indigo-400 hover:text-white transition cursor-pointer"
            title={t('grid.pageOrderTitle', { order: page.order })}
          >
            #{page.order}
          </button>
          {page.is_cover && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/90 text-amber-950 text-[10px] font-extrabold uppercase shadow flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-amber-950" /> {t('grid.cover')}
            </span>
          )}
        </div>

        {/* Multi-select Checkbox */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (isRangePickActive && onCardClick) {
              onCardClick(page.id, e);
            } else {
              onToggleSelect(page.id, e.shiftKey);
            }
          }}
          className={`absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center z-10 transition-all ${
            isSelected 
              ? 'bg-indigo-600 text-white shadow-md' 
              : 'bg-comic-950/80 text-transparent border border-slate-700 hover:border-indigo-400 group-hover:text-slate-500'
          }`}
          title={t('grid.selectPageTitle')}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Special Formats Badges */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 z-10 max-w-[70%]">
          {isWide && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold shadow-xs">
              {t('grid.doublePage')}
            </span>
          )}
          {isTall && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 text-[10px] font-bold shadow-xs">
              {t('grid.webtoonStrip')}
            </span>
          )}
        </div>

        {/* Reorder Arrows & Drag Handle Overlay */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10">
          {onMoveLeft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLeft(page.id);
              }}
              disabled={!canMoveLeft}
              className="p-1 rounded-md bg-white/90 dark:bg-comic-950/85 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-slate-700/60 disabled:opacity-20 transition"
              title={t('grid.moveLeftTitle')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {onMoveRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveRight(page.id);
              }}
              disabled={!canMoveRight}
              className="p-1 rounded-md bg-white/90 dark:bg-comic-950/85 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-comic-800 border border-slate-300 dark:border-slate-700/60 disabled:opacity-20 transition"
              title={t('grid.moveRightTitle')}
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Drag Handle */}
          <div 
            {...attributes} 
            {...listeners}
            className="p-1.5 rounded-md bg-white/90 dark:bg-comic-950/90 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white border border-slate-300 dark:border-slate-700/70 cursor-grab active:cursor-grabbing hover:bg-slate-100 dark:hover:bg-comic-800 transition shadow touch-none select-none"
            style={{ touchAction: 'none' }}
            title={t('grid.dragToReorderPage')}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Quick Action Footer */}
      <div className="px-2.5 py-2 bg-slate-50 dark:bg-comic-900 border-t border-slate-200 dark:border-comic-800/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span 
          className="font-mono text-[10px] truncate text-slate-600 dark:text-slate-500 font-medium"
          title={`${page.width}×${page.height} px`}
        >
          {page.width}×{page.height}
        </span>

        <div className="flex items-center gap-1">
          {/* Split Spread (if wide) */}
          {isWide && (
            <button
              type="button"
              onClick={() => onSplitSpread(page.id)}
              className="p-1 rounded text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-comic-800 transition"
              title={t('grid.splitSpreadTitle')}
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Slice Webtoon (if tall) */}
          {isTall && (
            <button
              type="button"
              onClick={() => onSliceWebtoon(page.id)}
              className="p-1 rounded text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:text-cyan-300 dark:hover:bg-comic-800 transition"
              title={t('grid.sliceWebtoonTitle')}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Set Cover */}
          {!page.is_cover && (
            <button
              type="button"
              onClick={() => onSetCover(page.id)}
              className="p-1 rounded text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-comic-800 transition"
              title={t('grid.setAsCover')}
            >
              <Star className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Chapter Separator / Title Page */}
          <button
            type="button"
            onClick={() => onChapterCover(page.id)}
            className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-comic-800 transition"
            title={t('grid.chapterCoverTitle')}
          >
            <BookMarked className="w-3.5 h-3.5" />
          </button>

          {/* Rotate */}
          <button
            type="button"
            onClick={() => onRotate(page.id)}
            className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-300 dark:hover:bg-comic-800 transition"
            title={t('grid.rotate90Title')}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onDelete(page.id)}
            className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/60 transition"
            title={t('grid.deletePageTitle')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const PageCard = React.memo<PageCardProps>(
  PageCardComponent,
  (prev, next) => {
    return (
      prev.page.id === next.page.id &&
      prev.page.order === next.page.order &&
      prev.page.is_cover === next.page.is_cover &&
      prev.page.thumb_filename === next.page.thumb_filename &&
      prev.page.width === next.page.width &&
      prev.page.height === next.page.height &&
      prev.sessionId === next.sessionId &&
      prev.isSelected === next.isSelected &&
      prev.isRangePickActive === next.isRangePickActive &&
      prev.isRangePickStart === next.isRangePickStart &&
      prev.isDragDisabled === next.isDragDisabled &&
      prev.canMoveLeft === next.canMoveLeft &&
      prev.canMoveRight === next.canMoveRight
    );
  }
);
