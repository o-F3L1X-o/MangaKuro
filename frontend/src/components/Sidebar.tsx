import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  CollisionDetection
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  BookOpen, 
  Bookmark,
  BookMarked,
  Plus, 
  Download,
  Trash2, 
  FolderClosed, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Layers, 
  Library,
  Edit3,
  CheckSquare,
  Square,
  Sparkles,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Copy,
  ImagePlus,
  Search,
  FolderInput,
  FolderPlus,
  PlusCircle
} from 'lucide-react';
import { ComicSessionSummary } from '../types';
import { getThumbUrl } from '../api';
import { 
  groupSessionsBySeries, 
  extractSortNumber, 
  SeriesGroup,
  isSessionTomo,
  isSessionChapter,
  cleanSeriesDisplayName
} from '../utils/seriesGrouping';
import { MoveToSeriesModal } from './MoveToSeriesModal';
import { useTranslation } from '../i18n';

interface SidebarProps {
  sessions: ComicSessionSummary[];
  onReorderSessions?: (newOrder: ComicSessionSummary[]) => void;
  activeSessionId: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onCloseCurrent: () => void;
  onOpenUpload: (defaultSeries?: string | null) => void;
  onOpenQuickRename: (session: ComicSessionSummary, groupSeriesName?: string) => void;
  onOpenMerge: (sessionsToMerge: ComicSessionSummary[]) => void;
  onOpenMetadataForSession?: (session: ComicSessionSummary) => void;
  onOpenBatchMetadata?: (markedSessions: ComicSessionSummary[]) => void;
  onOpenCloneModal?: (session: ComicSessionSummary) => void;
  onAddImagesToSession?: (sessionId: string, files: File[]) => void;
  onMoveSessionsToSeries?: (sessionIds: string[], targetSeries: string) => Promise<void>;
  onToggleItemType?: (session: ComicSessionSummary) => void;
  onOpenAppendChapters?: (targetTomo?: ComicSessionSummary, initialChapterIds?: string[]) => void;
  onOpenExportGroup?: (group: SeriesGroup) => void;
  onOpenDeleteGroup?: (group: SeriesGroup) => void;
  onOpenDeleteMarked?: (sessions: ComicSessionSummary[]) => void;
}

interface SortableSessionItemProps {
  item: ComicSessionSummary;
  index: number;
  total: number;
  isActive: boolean;
  isCap: boolean;
  isChecked: boolean;
  isMergeMode: boolean;
  mergeSequenceIndex: number;
  selectedChapterCount?: number;
  onSelect: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
  onMoveUp: (e: React.MouseEvent) => void;
  onMoveDown: (e: React.MouseEvent) => void;
  onQuickRename: (e: React.MouseEvent) => void;
  onOpenMetadata: (e: React.MouseEvent) => void;
  onOpenClone: (e: React.MouseEvent) => void;
  onOpenMoveModal: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggleItemType?: (e: React.MouseEvent) => void;
  onOpenAppendChapters?: (e: React.MouseEvent) => void;
}

const SortableSessionItemComponent: React.FC<SortableSessionItemProps> = ({
  item,
  index,
  total,
  isActive,
  isCap,
  isChecked,
  isMergeMode,
  mergeSequenceIndex,
  onSelect,
  onToggleCheck,
  onMoveUp,
  onMoveDown,
  onQuickRename,
  onOpenMetadata,
  onOpenClone,
  onOpenMoveModal,
  onDelete,
  onToggleItemType,
  onOpenAppendChapters,
  selectedChapterCount = 0
}) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.session_id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.35 : 1,
    contain: 'content'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group relative p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${
        isActive
          ? 'bg-indigo-50/90 dark:bg-indigo-950/80 border-indigo-500/80 border-l-4 border-l-emerald-500 dark:border-l-emerald-400 ring-1 ring-inset ring-indigo-500/30 shadow-md shadow-indigo-500/10 dark:shadow-indigo-500/20'
          : isCap
            ? 'bg-purple-50/70 dark:bg-amber-950/15 border-purple-200 dark:border-amber-900/30 hover:border-purple-300 dark:hover:border-amber-700/60'
            : 'bg-white dark:bg-comic-900/60 border-slate-200 dark:border-comic-800/80 hover:bg-slate-50 dark:hover:bg-comic-900 hover:border-slate-300 dark:hover:border-comic-700 shadow-xs'
      } ${isChecked ? 'ring-1 ring-indigo-400 bg-indigo-50 dark:bg-indigo-950/35' : ''}`}
    >
      {/* Active Left Glowing Accent Indicator */}
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-400 rounded-r shadow-[0_0_8px_rgba(52,211,153,0.9)] z-10 pointer-events-none" />
      )}

      {/* Drag Grip Handle */}
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-300 cursor-grab active:cursor-grabbing hover:bg-slate-200/60 dark:hover:bg-comic-800/90 shrink-0 transition"
        title={t('sidebar.dragToReorder')}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Multi-select Checkbox & Sequence Order Badge */}
      {isMergeMode && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onToggleCheck}
            className="p-0.5 text-slate-400 hover:text-white"
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-indigo-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
          </button>
          {isChecked && (
            <span
              className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm ${
                mergeSequenceIndex === 0
                  ? 'bg-emerald-500 text-slate-950 ring-1 ring-emerald-400'
                  : 'bg-indigo-600 text-white'
              }`}
              title={
                mergeSequenceIndex === 0
                  ? t('sidebar.firstInMergeDesc')
                  : t('sidebar.mergePosition', { pos: mergeSequenceIndex + 1 })
              }
            >
              {mergeSequenceIndex === 0 ? t('sidebar.firstInMerge') : `${mergeSequenceIndex + 1}º`}
            </span>
          )}
        </div>
      )}

      {/* Miniature Thumbnail */}
      <div
        className="w-9 h-13 bg-comic-950 rounded-lg overflow-hidden border border-slate-700/60 shrink-0 flex items-center justify-center relative select-none pointer-events-none"
        title={t('sidebar.clickToOpenTomo')}
      >
        {item.cover_thumb ? (
          <img
            src={getThumbUrl(item.session_id, item.cover_thumb)}
            alt={item.series}
            className="w-full h-full object-cover pointer-events-none select-none"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <BookOpen className="w-4 h-4 text-slate-600" />
        )}
        {isActive && (
          <>
            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-comic-950 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            <span className="absolute bottom-0 inset-x-0 h-1 bg-emerald-500" />
          </>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
          {isCap ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleItemType?.(e);
              }}
              className="px-1.5 py-0.2 rounded bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 hover:text-white font-bold text-[9px] flex items-center gap-0.5 transition cursor-pointer shrink-0"
              title={t('sidebar.switchToTomoTitle')}
            >
              <Bookmark className="w-2.5 h-2.5" />
              {t('common.chapter').toUpperCase()}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleItemType?.(e);
              }}
              className="px-1.5 py-0.2 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 hover:text-white font-bold text-[9px] flex items-center gap-0.5 transition cursor-pointer shrink-0"
              title={t('sidebar.switchToChapterTitle')}
            >
              <BookOpen className="w-2.5 h-2.5" />
              {t('common.tomo').toUpperCase()}
            </button>
          )}

          {item.number && (
            <span className="px-1.5 py-0.2 rounded bg-comic-800 text-slate-300 font-mono text-[9px] shrink-0">
              #{item.number}
            </span>
          )}
          {item.volume && !item.number && (
            <span className="px-1.5 py-0.2 rounded bg-comic-800 text-slate-300 font-mono text-[9px] shrink-0">
              Vol.{item.volume}
            </span>
          )}
          {item.merged_source_files && item.merged_source_files.length > 0 && (
            <span
              className="px-1.5 py-0.2 rounded bg-purple-950/90 text-purple-300 border border-purple-700/60 font-mono text-[9px] flex items-center gap-0.5 shrink-0"
              title={`${item.merged_source_files.length} capítulos compilados: ${item.merged_chapter_names?.join(', ') || ''}`}
            >
              <Layers className="w-2.5 h-2.5 text-purple-400" />
              <span>{item.merged_source_files.length} caps</span>
            </span>
          )}
          {isActive && (
            <span
              className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[9px] flex items-center gap-1 shrink-0 shadow-sm"
              title={t('sidebar.activeItemTitle')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
              <span>{t('common.active')}</span>
            </span>
          )}
        </div>

        <h4 className={`text-xs font-bold truncate leading-tight transition ${
          isActive 
            ? 'text-indigo-950 dark:text-white' 
            : 'text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300'
        }`} title={item.title || item.original_filename || item.series}>
          {item.title || item.original_filename || item.series}
        </h4>
        
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">
          <span>{item.page_count} {t('common.pages')}</span>
          {item.title && item.series && <span className="truncate max-w-[90px] opacity-75">{item.series}</span>}
        </div>
      </div>

      {/* Action buttons (compact 2-row layout so details column has plenty of room) */}
      <div className="flex flex-col gap-0.5 opacity-80 group-hover:opacity-100 transition shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-0.5 rounded hover:bg-comic-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent transition"
              title={t('sidebar.moveUp')}
            >
              <ArrowUp className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="p-0.5 rounded hover:bg-comic-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent transition"
              title={t('sidebar.moveDown')}
            >
              <ArrowDown className="w-2.5 h-2.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onQuickRename}
            className="p-1 rounded-md hover:bg-comic-800 text-slate-400 hover:text-indigo-300 transition"
            title={t('sidebar.editTypeOrNumber')}
          >
            <Edit3 className="w-3 h-3 text-indigo-400" />
          </button>

          <button
            type="button"
            onClick={onOpenMoveModal}
            className="p-1 rounded-md hover:bg-comic-800 text-slate-400 hover:text-amber-400 transition"
            title={t('sidebar.moveFileToSeries')}
          >
            <FolderInput className="w-3 h-3 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded-md hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition"
            title={t('sidebar.removeFromStaging')}
          >
            <Trash2 className="w-3 h-3 text-rose-400" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 justify-end">
          {!isCap && onOpenAppendChapters && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAppendChapters(e);
              }}
              className={`p-1 rounded-md transition ${
                selectedChapterCount > 0
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 ring-1 ring-amber-400/40'
                  : 'hover:bg-comic-800 text-slate-400 hover:text-amber-400'
              }`}
              title={
                selectedChapterCount > 0
                  ? t('sidebar.appendSelectedToTomo', { count: selectedChapterCount, name: item.title || item.original_filename })
                  : t('sidebar.addChaptersToTomo')
              }
            >
              <PlusCircle className="w-3 h-3 text-amber-400" />
            </button>
          )}

          {isCap && onOpenAppendChapters && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAppendChapters(e);
              }}
              className={`p-1 rounded-md transition ${
                isActive
                  ? 'bg-amber-500/25 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 ring-1 ring-amber-400/40'
                  : 'hover:bg-comic-800 text-slate-400 hover:text-amber-400'
              }`}
              title={t('sidebar.appendChapterToTomoTitle', { name: item.title || item.original_filename })}
            >
              <PlusCircle className="w-3 h-3 text-amber-400" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenMetadata}
            className="p-1 rounded-md hover:bg-comic-800 text-slate-400 hover:text-indigo-400 transition"
            title={t('sidebar.editMetadataTitle')}
          >
            <BookMarked className="w-3 h-3 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onOpenClone}
            className="p-1 rounded-md hover:bg-comic-800 text-slate-400 hover:text-indigo-400 transition"
            title={t('sidebar.cloneDataTitle')}
          >
            <Copy className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

const SortableSessionItem = React.memo<SortableSessionItemProps>(SortableSessionItemComponent);

interface DroppableSeriesGroupProps {
  group: SeriesGroup;
  isExpanded: boolean;
  isGroupActive: boolean;
  activeSessionId: string | null;
  selectedIds: string[];
  isMergeMode: boolean;
  selectedSessionsInOrder: ComicSessionSummary[];
  activeDragSourceGroupKey: string | null;
  activeDragId: string | null;
  isDraggingAnyItem: boolean;
  onToggleExpandChevron: (key: string, e: React.MouseEvent) => void;
  onSelectGroup: (group: SeriesGroup) => void;
  onSelectSession: (id: string, groupKey: string) => void;
  onToggleCheckSession: (id: string, e: React.MouseEvent) => void;
  onMoveUpWithinGroup: (group: SeriesGroup, index: number, e: React.MouseEvent) => void;
  onMoveDownWithinGroup: (group: SeriesGroup, index: number, e: React.MouseEvent) => void;
  onQuickRename: (item: ComicSessionSummary, groupSeriesName?: string) => void;
  onOpenMetadata: (item: ComicSessionSummary) => void;
  onOpenClone: (item: ComicSessionSummary) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onOpenUpload: (seriesName: string) => void;
  onAutoSortGroup: (group: SeriesGroup, e?: React.MouseEvent) => void;
  onOpenMergeGroup: (group: SeriesGroup) => void;
  onOpenMoveSingle: (item: ComicSessionSummary) => void;
  onOpenMoveGroup: (group: SeriesGroup) => void;
  onToggleItemType?: (session: ComicSessionSummary) => void;
  onOpenAppendChapters?: (targetTomo?: ComicSessionSummary, initialChapterIds?: string[]) => void;
  onOpenExportGroup?: (group: SeriesGroup) => void;
  onOpenDeleteGroup?: (group: SeriesGroup) => void;
}

const DroppableSeriesGroup: React.FC<DroppableSeriesGroupProps> = ({
  group,
  isExpanded,
  isGroupActive,
  activeSessionId,
  selectedIds,
  isMergeMode,
  selectedSessionsInOrder,
  activeDragSourceGroupKey,
  activeDragId,
  isDraggingAnyItem,
  onToggleExpandChevron,
  onSelectGroup,
  onSelectSession,
  onToggleCheckSession,
  onMoveUpWithinGroup,
  onMoveDownWithinGroup,
  onQuickRename,
  onOpenMetadata,
  onOpenClone,
  onDeleteSession,
  onOpenUpload,
  onAutoSortGroup,
  onOpenMergeGroup,
  onOpenMoveSingle,
  onOpenMoveGroup,
  onToggleItemType,
  onOpenAppendChapters,
  onOpenExportGroup,
  onOpenDeleteGroup
}) => {
  const { t } = useTranslation();
  const selectedChapterIds = useMemo(() => {
    return selectedSessionsInOrder.filter((s) => isSessionChapter(s)).map((s) => s.session_id);
  }, [selectedSessionsInOrder]);

  const isItemFromThisGroup = activeDragSourceGroupKey === group.key || (activeDragId ? group.sessions.some((s) => s.session_id === activeDragId) : false);

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `group-drop-${group.key}`,
    disabled: isItemFromThisGroup,
    data: {
      type: 'series-group',
      groupKey: group.key,
      groupName: group.name
    }
  });

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragNodeRef,
    isDragging
  } = useDraggable({
    id: `group-drag-${group.key}`,
    data: {
      type: 'group',
      groupKey: group.key,
      groupName: group.name
    }
  });

  const showDropHighlight = isOver && !isItemFromThisGroup && isDraggingAnyItem && !isDragging;

  return (
    <div
      id={`series-group-${group.key}`}
      style={{
        contentVisibility: isExpanded ? 'visible' : 'auto',
        containIntrinsicSize: 'auto 68px'
      }}
      className={`rounded-xl border transition-all relative ${
        isDragging
          ? 'opacity-40 border-dashed border-amber-500 scale-[0.98]'
          : isGroupActive
            ? 'border-indigo-400 dark:border-indigo-500/80 bg-slate-100 dark:bg-slate-800/80 ring-1 ring-indigo-500/30 shadow-xs'
            : 'border-slate-200 dark:border-slate-700/60 bg-slate-100/90 dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {/* Comic / Manga Group Header (Acts as Drop Zone only when dragging from ANOTHER group) */}
      <div
        ref={setDropNodeRef}
        onClick={() => {
          if (isExpanded) {
            onToggleExpandChevron(group.key, {} as any);
          } else {
            onSelectGroup(group);
          }
        }}
        className={`p-2 sm:p-2.5 flex items-center justify-between gap-2 cursor-pointer select-none group/hdr hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-xl transition relative ${
          showDropHighlight ? 'bg-emerald-950/70 border-2 border-dashed border-emerald-400 ring-2 ring-emerald-500/50' : ''
        }`}
      >
        {showDropHighlight && (
          <div className="absolute inset-0 z-30 bg-emerald-950/90 border-2 border-dashed border-emerald-400 rounded-xl flex items-center justify-center pointer-events-none p-2 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs bg-emerald-900/90 px-3 py-1 rounded-xl border border-emerald-400/60 shadow-lg">
              <FolderInput className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              <span>{t('sidebar.dropToMove', { name: group.name })}</span>
            </div>
          </div>
        )}
        {/* Left: Drag Handle and Expand Chevron */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <div
            ref={setDragNodeRef}
            {...dragAttributes}
            {...dragListeners}
            className="p-1 rounded-md text-slate-400 hover:text-amber-500 hover:bg-slate-200/60 dark:hover:bg-slate-700 cursor-grab active:cursor-grabbing transition shrink-0"
            title={t('sidebar.dragGroupTitle', { name: group.name })}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          <button
            type="button"
            onClick={(e) => onToggleExpandChevron(group.key, e)}
            className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-800 dark:hover:text-white transition shrink-0"
            title={isExpanded ? t('sidebar.collapseListTitle') : t('sidebar.expandListTitle')}
            aria-label={isExpanded ? t('sidebar.collapseListTitle') : t('sidebar.expandListTitle')}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? 'rotate-0 text-indigo-500 dark:text-indigo-400' : '-rotate-90 text-slate-400'
              }`}
            />
          </button>
        </div>

        {/* Center: Title & badges centered as a distinct collection/group header (NO tomo thumbnail) */}
        <div className="min-w-0 flex-1 flex flex-col items-center justify-center text-center px-1">
          <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-full">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-700/60 px-1.5 py-0.2 rounded shrink-0">
              {t('sidebar.groupTag')}
            </span>
            <h3
              className="text-xs font-semibold text-slate-800 dark:text-slate-100 tracking-normal truncate max-w-[140px] sm:max-w-[180px] group-hover/hdr:text-indigo-600 dark:group-hover/hdr:text-indigo-300 transition"
              title={group.name}
            >
              {group.name}
            </h3>
            {isGroupActive && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[9px] font-bold flex items-center gap-1 shadow-2xs shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                <span>{t('sidebar.activeTag')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
            {group.totalTomos > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{group.totalTomos} {t('common.tomo')}{group.totalTomos > 1 ? 's' : ''}</span>
            )}
            {group.totalTomos > 0 && group.totalChapters > 0 && <span>•</span>}
            {group.totalChapters > 0 && (
              <span className="text-purple-600 dark:text-purple-300 font-semibold">{group.totalChapters} {t('common.chapter')}{group.totalChapters > 1 ? 's' : ''}</span>
            )}
            {group.totalTomos === 0 && group.totalChapters === 0 && (
              <span className="text-slate-500 font-semibold">{group.sessions.length} {t('sidebar.elements')}</span>
            )}
            <span>•</span>
            <span className="text-slate-500">{group.totalPages} {t('common.pages')}</span>
          </div>
        </div>

        {/* Right: Group Quick Actions with refined microinteractions & accessible tooltips */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Export all tomos in this group */}
          <button
            type="button"
            onClick={() => onOpenExportGroup?.(group)}
            className="p-1 rounded-md text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 transition-colors"
            title={t('sidebar.exportGroupTitle', { name: group.name })}
            aria-label={t('sidebar.exportGroupTitle', { name: group.name })}
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
          </button>

          {/* Move this entire group to another series */}
          <button
            type="button"
            onClick={() => onOpenMoveGroup(group)}
            className="p-1 rounded-md text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors"
            title={t('sidebar.moveGroupTitle', { name: group.name })}
            aria-label={t('sidebar.moveGroupTitle', { name: group.name })}
          >
            <FolderInput className="w-3.5 h-3.5" />
          </button>

          {/* Upload new chapter/tomo pre-associated to this series */}
          <button
            type="button"
            onClick={() => onOpenUpload(group.name)}
            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors"
            title={t('sidebar.uploadToGroupTitle', { name: group.name })}
            aria-label={t('sidebar.uploadToGroupTitle', { name: group.name })}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Auto-sort within this group */}
          <button
            type="button"
            onClick={(e) => onAutoSortGroup(group, e)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
            title={t('sidebar.sortGroupTitle', { name: group.name })}
            aria-label={t('sidebar.sortGroupTitle', { name: group.name })}
          >
            <ArrowUpDown className="w-3 h-3" />
          </button>

          {/* Merge chapters of this series if >= 1 */}
          {group.totalChapters >= 1 && (
            <button
              type="button"
              onClick={() => onOpenMergeGroup(group)}
              className="p-1 rounded-md text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors"
              title={t('sidebar.mergeGroupTitle', { count: group.totalChapters, name: group.name })}
              aria-label={t('sidebar.mergeGroupTitle', { count: group.totalChapters, name: group.name })}
            >
              <Layers className="w-3.5 h-3.5 text-amber-500" />
            </button>
          )}

          {/* Delete entire group */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDeleteGroup?.(group);
            }}
            className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors"
            title={t('sidebar.deleteGroupTitle', { name: group.name, count: group.sessions.length })}
            aria-label={t('sidebar.deleteGroupTitle', { name: group.name, count: group.sessions.length })}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
          </button>
        </div>
      </div>

      {/* Accordion Body: Sortable Sessions List */}
      {isExpanded && (
        <div className="p-2 pt-0 space-y-2 border-t border-comic-800/40">
          {/* Quick Action banner to merge or append chapters in this group */}
          {group.totalChapters > 0 && (
            <div className="mt-2 p-2 bg-gradient-to-r from-purple-950/60 to-indigo-950/60 rounded-xl border border-purple-800/40 flex items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-1.5 min-w-0">
                <Bookmark className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-[11px] text-purple-200 font-medium truncate">
                  {group.totalChapters} capítulo{group.totalChapters > 1 ? 's' : ''} suelto{group.totalChapters > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {group.totalTomos > 0 && onOpenAppendChapters && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const firstTomo = group.sessions.find((s) => isSessionTomo(s));
                      if (firstTomo) {
                        onOpenAppendChapters(firstTomo, selectedChapterIds.length > 0 ? selectedChapterIds : undefined);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold shadow transition flex items-center gap-1 active:scale-95"
                    title={
                      selectedChapterIds.length > 0
                        ? t('sidebar.incorporateChaptersTitleWithCount', { count: selectedChapterIds.length, name: group.name })
                        : t('sidebar.incorporateChaptersTitle', { name: group.name })
                    }
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>{t('sidebar.incorporateChapters')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMergeGroup(group);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shadow transition flex items-center gap-1 active:scale-95"
                  title={t('sidebar.mergeChaptersToNewTomoTitle', { count: group.totalChapters, name: group.name })}
                >
                  <Layers className="w-3 h-3 text-amber-300" />
                  <span>{group.totalTomos > 0 ? t('sidebar.createAnotherTomo') : t('sidebar.mergeToTomo')}</span>
                </button>
              </div>
            </div>
          )}

          <SortableContext
            items={group.sessions.map((s) => s.session_id)}
            strategy={verticalListSortingStrategy}
          >
            {group.sessions.map((item, itemIdxInGroup) => {
              const isActive = item.session_id === activeSessionId;
              const isCap = isSessionChapter(item);
              const isChecked = selectedIds.includes(item.session_id);
              const mergeSequenceIndex = selectedSessionsInOrder.findIndex(
                (s) => s.session_id === item.session_id
              );

              return (
                <SortableSessionItem
                  key={item.session_id}
                  item={item}
                  index={itemIdxInGroup}
                  total={group.sessions.length}
                  isActive={isActive}
                  isCap={isCap}
                  isChecked={isChecked}
                  isMergeMode={isMergeMode}
                  mergeSequenceIndex={mergeSequenceIndex}
                  selectedChapterCount={selectedChapterIds.length}
                  onSelect={() => {
                    onSelectSession(item.session_id, group.key);
                    if (isMergeMode) {
                      onToggleCheckSession(item.session_id, {} as any);
                    }
                  }}
                  onToggleCheck={(e) => onToggleCheckSession(item.session_id, e)}
                  onMoveUp={(e) => onMoveUpWithinGroup(group, itemIdxInGroup, e)}
                  onMoveDown={(e) => onMoveDownWithinGroup(group, itemIdxInGroup, e)}
                  onQuickRename={(e) => {
                    e.stopPropagation();
                    onQuickRename(item, group.name);
                  }}
                  onOpenMetadata={(e) => {
                    e.stopPropagation();
                    onOpenMetadata(item);
                  }}
                  onOpenClone={(e) => {
                    e.stopPropagation();
                    onOpenClone(item);
                  }}
                  onOpenMoveModal={(e) => {
                    e.stopPropagation();
                    onOpenMoveSingle(item);
                  }}
                  onDelete={(e) => onDeleteSession(item.session_id, e)}
                  onToggleItemType={(e) => {
                    e.stopPropagation();
                    onToggleItemType?.(item);
                  }}
                  onOpenAppendChapters={(e) => {
                    e.stopPropagation();
                    if (!isCap) {
                      onOpenAppendChapters?.(item, selectedChapterIds.length > 0 ? selectedChapterIds : undefined);
                    } else {
                      const chapterIdsToAppend = selectedChapterIds.includes(item.session_id) && selectedChapterIds.length > 1
                        ? selectedChapterIds
                        : [item.session_id];
                      const firstTomoInGroup = group.sessions.find((s) => isSessionTomo(s));
                      onOpenAppendChapters?.(firstTomoInGroup || undefined, chapterIdsToAppend);
                    }
                  }}
                />
              );
            })}
          </SortableContext>
        </div>
      )}
    </div>
  );
};

const DEFAULT_SIDEBAR_WIDTH = 352;
const MIN_SIDEBAR_WIDTH = 352;

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  onReorderSessions,
  activeSessionId,
  isOpen,
  onToggleOpen,
  onSelectSession,
  onDeleteSession,
  onCloseCurrent,
  onOpenUpload,
  onOpenQuickRename,
  onOpenMerge,
  onOpenMetadataForSession,
  onOpenBatchMetadata,
  onOpenCloneModal,
  onAddImagesToSession,
  onMoveSessionsToSeries,
  onToggleItemType,
  onOpenAppendChapters,
  onOpenExportGroup,
  onOpenDeleteGroup,
  onOpenDeleteMarked
}) => {
  const { t } = useTranslation();
  // Resizable Sidebar width state (bounded between MIN_SIDEBAR_WIDTH and 50% screen width)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
    const saved = localStorage.getItem('mangajutsu_sidebar_width') || localStorage.getItem('mangamic_sidebar_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      const maxW = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.5));
      if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH) {
        return Math.min(parsed, maxW);
      }
    }
    return DEFAULT_SIDEBAR_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Clamp width when window resizes so it never exceeds half the screen
  useEffect(() => {
    const handleWindowResize = () => {
      const maxW = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.5));
      setSidebarWidth((prev) => (prev > maxW ? maxW : prev));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const maxW = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.5));
      const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(moveEvent.clientX, maxW));
      setSidebarWidth(clampedWidth);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);

      const maxW = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.5));
      const finalWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(upEvent.clientX, maxW));
      localStorage.setItem('mangajutsu_sidebar_width', String(finalWidth));
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, []);

  const handleResetWidth = useCallback(() => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    localStorage.setItem('mangajutsu_sidebar_width', String(DEFAULT_SIDEBAR_WIDTH));
  }, []);

  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchFilter, setSearchFilter] = useState('');

  // Automatically prune selectedIds if sessions were removed or incorporated into another tomo
  useEffect(() => {
    const validIds = new Set(sessions.map((s) => s.session_id));
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [sessions]);

  // Immediate local active session to guarantee instant visual feedback on selection
  const [localActiveSessionId, setLocalActiveSessionId] = useState<string | null>(activeSessionId);

  useEffect(() => {
    setLocalActiveSessionId(activeSessionId);
  }, [activeSessionId]);

  const effectiveActiveSessionId = localActiveSessionId ?? activeSessionId;

  // Move Modal State
  const [moveModalSessions, setMoveModalSessions] = useState<ComicSessionSummary[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Track active drag item for smooth DragOverlay and disabling same-group drop zones
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Group all sessions by comic/manga series
  const seriesGroups = useMemo(() => groupSessionsBySeries(sessions), [sessions]);

  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    if (activeDragId.startsWith('group-drag-')) {
      const gKey = activeDragId.replace('group-drag-', '');
      const grp = seriesGroups.find((g) => g.key === gKey);
      return { type: 'group' as const, group: grp, id: activeDragId };
    }
    const item = sessions.find((s) => s.session_id === activeDragId);
    const grp = seriesGroups.find((g) => g.sessions.some((s) => s.session_id === activeDragId));
    return { type: 'session' as const, item, group: grp, id: activeDragId };
  }, [activeDragId, sessions, seriesGroups]);

  const activeDragSourceGroupKey = activeDragItem?.group?.key || null;

  // Smart collision detection: prioritizes individual session cards and filters out same-group drops
  const collisionDetectionStrategy: CollisionDetection = useCallback((args: Parameters<CollisionDetection>[0]) => {
    const pointerCollisions = pointerWithin(args);
    const validPointerCollisions = activeDragSourceGroupKey
      ? pointerCollisions.filter((c) => String(c.id) !== `group-drop-${activeDragSourceGroupKey}`)
      : pointerCollisions;

    if (validPointerCollisions.length > 0) {
      // Prioritize session items over group drop containers
      const sessionCollision = validPointerCollisions.find(
        (c) => !String(c.id).startsWith('group-drop-') && !String(c.id).startsWith('group-drag-')
      );
      if (sessionCollision) {
        return [sessionCollision];
      }
      return validPointerCollisions;
    }

    const centerCollisions = closestCenter(args);
    return activeDragSourceGroupKey
      ? centerCollisions.filter((c) => String(c.id) !== `group-drop-${activeDragSourceGroupKey}`)
      : centerCollisions;
  }, [activeDragSourceGroupKey]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
  };

  // Find active group based on effectiveActiveSessionId
  const activeGroup = useMemo(() => {
    if (!effectiveActiveSessionId) return null;
    return seriesGroups.find((g) => g.sessions.some((s) => s.session_id === effectiveActiveSessionId)) || null;
  }, [seriesGroups, effectiveActiveSessionId]);

  const activeSeriesKey = activeGroup?.key || null;

  // Track which series is selected/expanded (strict single-expand accordion)
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(() => {
    if (activeSeriesKey) return activeSeriesKey;
    const groups = groupSessionsBySeries(sessions);
    const found = groups.find((g) => g.sessions.some((s) => s.session_id === activeSessionId));
    if (found) return found.key;
    return groups.length > 0 ? groups[0].key : null;
  });

  // Whenever activeSeriesKey changes: ensure the selected comic is expanded!
  useEffect(() => {
    if (activeSeriesKey) {
      setSelectedSeriesKey(activeSeriesKey);
    }
  }, [activeSeriesKey]);

  // Handler when user clicks a manga / comic group header or picks from index: opens that comic
  const handleSelectGroup = (group: SeriesGroup, shouldActivate = true) => {
    setSelectedSeriesKey(group.key);
    if (shouldActivate && group.sessions.length > 0) {
      const isAlreadyInThisGroup = group.sessions.some((s) => s.session_id === effectiveActiveSessionId);
      if (!isAlreadyInThisGroup) {
        const targetSession = group.sessions[0];
        handleSelectSessionItem(targetSession.session_id, group.key);
      }
    }

    setTimeout(() => {
      const el = document.getElementById(`series-group-${group.key}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
  };

  // Handler when user clicks specifically on the chevron button of a group
  const handleToggleExpandChevron = (groupKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSeriesKey((prev) => (prev === groupKey ? null : groupKey));
  };

  // Handler when user clicks an individual tomo / chapter
  const handleSelectSessionItem = (sessionId: string, groupKey: string) => {
    setLocalActiveSessionId(sessionId);
    setSelectedSeriesKey(groupKey);
    onSelectSession(sessionId);
  };

  const handleToggleSelectSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Drag and Drop End: handles reordering, moving items AND moving whole groups!
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 1. Identify Target Series Group
    let targetGroupName: string | null = null;
    let targetGroupKey: string | null = null;

    if (overId.startsWith('group-drop-')) {
      const gKey = overId.replace('group-drop-', '');
      const targetGroup = seriesGroups.find((g) => g.key === gKey);
      if (targetGroup) {
        targetGroupKey = targetGroup.key;
        targetGroupName = targetGroup.name;
      }
    } else {
      const targetGroup = seriesGroups.find((g) =>
        g.sessions.some((s) => s.session_id === overId)
      );
      if (targetGroup) {
        targetGroupKey = targetGroup.key;
        targetGroupName = targetGroup.name;
      }
    }

    // 2. Identify Source Series Group & Handle Group-to-Group Move
    if (activeId.startsWith('group-drag-')) {
      const sourceGroupKey = activeId.replace('group-drag-', '');
      const sourceGroup = seriesGroups.find((g) => g.key === sourceGroupKey);

      if (sourceGroup && targetGroupKey && targetGroupName && sourceGroup.key !== targetGroupKey) {
        const itemsToMoveIds = sourceGroup.sessions.map((s) => s.session_id);
        if (itemsToMoveIds.length === 0) return;

        // Confirmation rule:
        // "si son multiples archivos con confirmación, si es solo uno no es necesaria"
        if (itemsToMoveIds.length > 1) {
          const ok = window.confirm(
            `¿Mover todos los ${itemsToMoveIds.length} elementos de "${sourceGroup.name}" e insertarlos en "${targetGroupName}"?`
          );
          if (!ok) return;
        }

        // Expand target group so user sees moved items immediately and collapses others
        setSelectedSeriesKey(targetGroupKey);

        if (onMoveSessionsToSeries) {
          await onMoveSessionsToSeries(itemsToMoveIds, targetGroupName);
        }
      }
      return;
    }

    // 3. Handle Item-to-Group Move (single item or multi-selected)
    const sourceGroup = seriesGroups.find((g) =>
      g.sessions.some((s) => s.session_id === activeId)
    );

    // If dropped into a DIFFERENT group -> Move items to that comic series!
    if (sourceGroup && targetGroupKey && targetGroupName && sourceGroup.key !== targetGroupKey) {
      const isMulti = selectedIds.length > 1 && selectedIds.includes(activeId);
      const itemsToMoveIds = isMulti ? selectedIds : [activeId];

      // Confirmation rule:
      // "si son multiples archivos con confirmación, si es solo uno no es necesaria"
      if (itemsToMoveIds.length > 1) {
        const ok = window.confirm(
          `¿Mover los ${itemsToMoveIds.length} elementos seleccionados al cómic "${targetGroupName}"?`
        );
        if (!ok) return;
      }

      // Automatically expand target group so user sees moved item(s) immediately
      setSelectedSeriesKey(targetGroupKey);

      // Execute move
      if (onMoveSessionsToSeries) {
        await onMoveSessionsToSeries(itemsToMoveIds, targetGroupName);
        if (isMulti) setSelectedIds([]);
      }
      return;
    }

    // 4. Reordering within the same group / list
    if (sourceGroup && (!targetGroupKey || targetGroupKey === sourceGroup.key)) {
      const fullGroup = seriesGroups.find((g) => g.key === sourceGroup.key) || sourceGroup;
      const activeInGroupIdx = fullGroup.sessions.findIndex((s) => s.session_id === active.id);
      let targetInGroupIdx = fullGroup.sessions.findIndex((s) => s.session_id === over.id);
      if (activeInGroupIdx !== -1 && targetInGroupIdx === -1 && String(over.id).startsWith(`group-drop-${sourceGroup.key}`)) {
        targetInGroupIdx = fullGroup.sessions.length - 1;
      }
      if (activeInGroupIdx !== -1 && targetInGroupIdx !== -1 && activeInGroupIdx !== targetInGroupIdx) {
        const groupSessionIds = new Set(fullGroup.sessions.map((s) => s.session_id));
        const newGroupSessions = arrayMove(fullGroup.sessions, activeInGroupIdx, targetInGroupIdx);
        let gIdx = 0;
        const reordered = sessions.map((s) => {
          if (groupSessionIds.has(s.session_id)) {
            return newGroupSessions[gIdx++];
          }
          return s;
        });
        onReorderSessions?.(reordered);
        return;
      }
    }

    const oldIndex = sessions.findIndex((s) => s.session_id === active.id);
    const newIndex = sessions.findIndex((s) => s.session_id === over.id);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const reordered = arrayMove(sessions, oldIndex, newIndex);
      onReorderSessions?.(reordered);
    }
  };

  const handleMoveUpWithinGroup = (group: SeriesGroup, itemIndexInGroup: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullGroup = seriesGroups.find((g) => g.key === group.key) || group;
    const targetItem = group.sessions[itemIndexInGroup];
    if (!targetItem) return;
    const fullIdx = fullGroup.sessions.findIndex((s) => s.session_id === targetItem.session_id);
    if (fullIdx <= 0) return;

    const groupSessionIds = new Set(fullGroup.sessions.map((s) => s.session_id));
    const newGroupSessions = arrayMove(fullGroup.sessions, fullIdx, fullIdx - 1);

    let gIdx = 0;
    const reordered = sessions.map((s) => {
      if (groupSessionIds.has(s.session_id)) {
        return newGroupSessions[gIdx++];
      }
      return s;
    });

    onReorderSessions?.(reordered);
  };

  const handleMoveDownWithinGroup = (group: SeriesGroup, itemIndexInGroup: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullGroup = seriesGroups.find((g) => g.key === group.key) || group;
    const targetItem = group.sessions[itemIndexInGroup];
    if (!targetItem) return;
    const fullIdx = fullGroup.sessions.findIndex((s) => s.session_id === targetItem.session_id);
    if (fullIdx === -1 || fullIdx >= fullGroup.sessions.length - 1) return;

    const groupSessionIds = new Set(fullGroup.sessions.map((s) => s.session_id));
    const newGroupSessions = arrayMove(fullGroup.sessions, fullIdx, fullIdx + 1);

    let gIdx = 0;
    const reordered = sessions.map((s) => {
      if (groupSessionIds.has(s.session_id)) {
        return newGroupSessions[gIdx++];
      }
      return s;
    });

    onReorderSessions?.(reordered);
  };

  const handleAutoSortGroup = (group: SeriesGroup, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const sortedGroupSessions = [...group.sessions].sort((a, b) => {
      const numA = extractSortNumber(a);
      const numB = extractSortNumber(b);
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });

    const groupSessionIds = new Set(group.sessions.map((s) => s.session_id));
    let gIdx = 0;
    const reordered = sessions.map((s) => {
      if (groupSessionIds.has(s.session_id)) {
        return sortedGroupSessions[gIdx++];
      }
      return s;
    });

    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    onReorderSessions?.(reordered);
  };

  const handleAutoSortAll = () => {
    const sorted = [...sessions].sort((a, b) => {
      const seriesA = a.series || '';
      const seriesB = b.series || '';
      const comp = seriesA.localeCompare(seriesB, 'es', { sensitivity: 'base' });
      if (comp !== 0) return comp;
      const numA = extractSortNumber(a);
      const numB = extractSortNumber(b);
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    onReorderSessions?.(sorted);
  };

  const handleStartMerge = () => {
    const selected = sessions.filter((s) => selectedIds.includes(s.session_id));
    if (selected.length < 2) return;
    onOpenMerge(selected);
  };

  // Filter groups according to search query
  const displayedGroups = useMemo(() => {
    let result = seriesGroups;

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      result = result.map((g) => {
        const matchesSeries = g.name.toLowerCase().includes(q);
        const filteredSessions = g.sessions.filter((s) => {
          return (
            matchesSeries ||
            (s.title && s.title.toLowerCase().includes(q)) ||
            (s.number && s.number.includes(q)) ||
            (s.original_filename && s.original_filename.toLowerCase().includes(q))
          );
        });
        return {
          ...g,
          sessions: filteredSessions
        };
      }).filter((g) => g.sessions.length > 0);
    }

    return result;
  }, [seriesGroups, searchFilter]);

  const selectedSessionsInOrder = sessions.filter((s) => selectedIds.includes(s.session_id));

  if (!isOpen) {
    return (
      <div className="fixed top-16 left-0 z-20 h-[calc(100vh-4rem)] flex flex-col justify-start p-2 pointer-events-none">
        <button
          onClick={onToggleOpen}
          className="pointer-events-auto p-2.5 rounded-xl bg-comic-900 hover:bg-comic-800 text-slate-300 hover:text-white border border-comic-700/80 shadow-2xl transition active:scale-95 flex items-center gap-2 group"
          title={t('sidebar.openLoadedPanel')}
        >
          <Library className="w-5 h-5 text-indigo-400" />
          <span className="text-xs font-bold hidden group-hover:inline transition-all">
            {t('sidebar.viewComicsCompact', { series: seriesGroups.length, items: sessions.length })}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <aside
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${MIN_SIDEBAR_WIDTH}px`,
        maxWidth: `${Math.floor(typeof window !== 'undefined' ? window.innerWidth * 0.5 : 600)}px`,
        transition: isResizing ? 'none' : 'width 150ms ease-out'
      }}
      className="h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] bg-white dark:bg-comic-950 border-r border-slate-200 dark:border-comic-800 flex flex-col shrink-0 sticky top-14 sm:top-16 z-20 shadow-lg dark:shadow-2xl select-none relative group/sidebar"
    >
      {/* Sidebar Header */}
      <div className="p-3 border-b border-slate-200 dark:border-comic-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Library className="w-5 h-5 text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {t('sidebar.stagingComics')}
            </h2>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">
              {seriesGroups.length} {seriesGroups.length === 1 ? t('sidebar.singleComicCount') : t('sidebar.multiComicCount')} ({sessions.length} {t('sidebar.elements')})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {sessions.length >= 2 && (
            <>
              <button
                onClick={handleAutoSortAll}
                className="p-1.5 rounded-lg border bg-comic-900 border-comic-800 text-slate-400 hover:text-white text-xs font-semibold transition"
                title={t('sidebar.sortAlphabeticallyTitle')}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  setIsMergeMode((prev) => !prev);
                  setSelectedIds([]);
                }}
                className={`p-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1 ${
                  isMergeMode
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-comic-900 border-comic-800 text-slate-400 hover:text-white'
                }`}
                title={isMergeMode ? t('sidebar.exitMultiSelect') : t('sidebar.mergeChaptersTitle')}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            onClick={onToggleOpen}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
            title={t('sidebar.collapsePanel')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action / Upload Button */}
      <div className="p-2 border-b border-slate-200 dark:border-comic-800/60 bg-slate-50 dark:bg-comic-950/70">
        {activeGroup ? (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onOpenUpload(activeGroup.name)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition active:scale-98"
              title={t('sidebar.uploadToComic', { name: activeGroup.name })}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {t('sidebar.uploadToComic', { name: activeGroup.name })}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenUpload(null)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-comic-700/80 text-xs font-semibold transition active:scale-98 shadow-xs"
              title={t('sidebar.uploadToNewGroupTitle')}
            >
              <FolderPlus className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">{t('sidebar.uploadToNewGroup')}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenUpload(null)}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition active:scale-98"
            title={t('header.uploadComicTitle')}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {t('header.uploadComic')}
            </span>
          </button>
        )}
      </div>

      {/* Pequeño Índice de Selección (Compact Quick Jump Index & Filter) */}
      {seriesGroups.length >= 1 && (
        <div className="px-2.5 py-2 border-b border-comic-800/60 bg-comic-950 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1 text-[10px]">
              <Bookmark className="w-3 h-3 text-indigo-400" />
              <span>{t('sidebar.quickIndex')} ({seriesGroups.length})</span>
            </span>

            {selectedSeriesKey && (
              <button
                type="button"
                onClick={() => setSelectedSeriesKey(null)}
                className="text-[10px] text-slate-400 hover:text-white font-semibold transition"
                title={t('sidebar.collapseAndShowAll')}
              >
                {t('sidebar.collapse')}
              </button>
            )}
          </div>

          {/* Quick Jump Selector Dropdown */}
          <div className="relative">
            <select
              aria-label={t('sidebar.quickIndexAria')}
              value={selectedSeriesKey || 'all'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'all') {
                  setSelectedSeriesKey(null);
                } else {
                  const targetGroup = seriesGroups.find((g) => g.key === val);
                  if (targetGroup) {
                    handleSelectGroup(targetGroup);
                  }
                }
              }}
              className="w-full text-xs font-semibold bg-comic-900 border border-comic-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer truncate"
            >
              <option value="all">📚 {t('sidebar.viewAllComics', { count: sessions.length })}</option>
              {seriesGroups.map((g) => {
                const isSelected = selectedSeriesKey === g.key;
                return (
                  <option key={g.key} value={g.key}>
                    {isSelected ? '★ ' : ''}📖 {g.name} ({g.sessions.length} {g.totalTomos > 0 ? `· ${g.totalTomos}T` : ''} {g.totalChapters > 0 ? `· ${g.totalChapters}C` : ''})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Quick-Jump Chips (Horizontal Scrollable Pills) */}
          {seriesGroups.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 text-[11px] no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedSeriesKey(null)}
                className={`px-2.5 py-0.5 rounded-full shrink-0 font-medium transition text-[10px] ${
                  selectedSeriesKey === null
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'bg-comic-900 text-slate-400 hover:text-white border border-comic-800'
                }`}
                title={t('sidebar.collapseAndShowAll')}
              >
                {t('sidebar.all')} ({sessions.length})
              </button>
              {seriesGroups.map((g) => {
                const isSelected = selectedSeriesKey === g.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => handleSelectGroup(g)}
                    className={`px-2.5 py-0.5 rounded-full shrink-0 font-medium transition flex items-center gap-1 text-[10px] ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-sm ring-1 ring-indigo-400'
                        : 'bg-comic-900 text-slate-400 hover:text-white border border-comic-800 hover:border-comic-700'
                    }`}
                    title={t('sidebar.selectComicTitle', { name: g.name, count: g.sessions.length })}
                  >
                    <span className="truncate max-w-[110px]">{g.name}</span>
                    <span className="text-[9px] opacity-70 font-mono">({g.sessions.length})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Optional Search filter if many items */}
          {sessions.length >= 10 && (
            <div className="relative pt-0.5">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={t('sidebar.searchPlaceholder')}
                className="w-full text-[11px] bg-comic-900/90 border border-comic-800/80 rounded-lg pl-7 pr-2 py-1 text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/80"
              />
            </div>
          )}
        </div>
      )}

      {/* Multi-select Header banner when Merge Mode is active */}
      {isMergeMode && (
        <div className="px-3 py-2 bg-indigo-950/60 border-b border-indigo-900/60 space-y-1.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-indigo-200 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{selectedIds.length} seleccionados</span>
            </span>
            <button
              onClick={() => {
                if (selectedIds.length === sessions.length) setSelectedIds([]);
                else setSelectedIds(sessions.map((s) => s.session_id));
              }}
              className="text-[11px] text-indigo-400 hover:text-white font-bold"
            >
              {selectedIds.length === sessions.length ? 'Deseleccionar' : 'Todos'}
            </button>
          </div>
          
          <div className="flex items-center gap-1.5 text-[11px] text-indigo-200/90 bg-indigo-900/40 px-2 py-1 rounded-lg border border-indigo-800/40">
            <ArrowDown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>
              <strong>Arrastra para mover:</strong> Arrastra a otro grupo para cambiar de serie.
            </span>
          </div>
        </div>
      )}

      {/* Main Grouped List with Accordion, Droppable Targets and SortableContext */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {sessions.length === 0 ? (
          <div className="p-6 text-center text-slate-500 space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-600 opacity-60" />
            <p className="text-xs font-semibold">No hay cómics cargados</p>
            <p className="text-[11px] text-slate-600">
              Sube uno o varios archivos para organizarlos por serie.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {displayedGroups.map((group) => {
              const isExpanded = selectedSeriesKey === group.key;
              const isGroupActive = activeSeriesKey === group.key;

              return (
                <DroppableSeriesGroup
                  key={group.key}
                  group={group}
                  isExpanded={isExpanded}
                  isGroupActive={isGroupActive}
                  activeSessionId={effectiveActiveSessionId}
                  selectedIds={selectedIds}
                  isMergeMode={isMergeMode}
                  selectedSessionsInOrder={selectedSessionsInOrder}
                  activeDragSourceGroupKey={activeDragSourceGroupKey}
                  activeDragId={activeDragId}
                  isDraggingAnyItem={Boolean(activeDragId)}
                  onToggleExpandChevron={handleToggleExpandChevron}
                  onSelectGroup={handleSelectGroup}
                  onSelectSession={handleSelectSessionItem}
                  onToggleCheckSession={handleToggleSelectSession}
                  onMoveUpWithinGroup={handleMoveUpWithinGroup}
                  onMoveDownWithinGroup={handleMoveDownWithinGroup}
                  onQuickRename={onOpenQuickRename}
                  onOpenMetadata={(item) => onOpenMetadataForSession?.(item)}
                  onOpenClone={(item) => onOpenCloneModal?.(item)}
                  onOpenMoveSingle={(item) => setMoveModalSessions([item])}
                  onOpenMoveGroup={(g) => setMoveModalSessions(g.sessions)}
                  onDeleteSession={onDeleteSession}
                  onOpenUpload={onOpenUpload}
                  onAutoSortGroup={handleAutoSortGroup}
                  onOpenMergeGroup={(g) => {
                    const caps = g.sessions.filter((s) => isSessionChapter(s));
                    onOpenMerge(caps);
                  }}
                  onToggleItemType={onToggleItemType}
                  onOpenAppendChapters={onOpenAppendChapters}
                  onOpenExportGroup={onOpenExportGroup}
                  onOpenDeleteGroup={onOpenDeleteGroup}
                />
              );
            })}

            {/* Polished DragOverlay preview following the cursor */}
            <DragOverlay
              dropAnimation={{
                duration: 160,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
              }}
            >
              {activeDragItem?.type === 'session' && activeDragItem.item ? (
                <div className="p-2 rounded-xl border border-indigo-400 bg-comic-900/95 shadow-2xl ring-2 ring-indigo-500/50 flex items-center gap-2 max-w-[280px] pointer-events-none select-none scale-105 rotate-1">
                  <GripVertical className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <div className="w-9 h-12 bg-comic-950 rounded-lg overflow-hidden border border-slate-700 shrink-0 flex items-center justify-center">
                    {activeDragItem.item.cover_thumb ? (
                      <img
                        src={getThumbUrl(activeDragItem.item.session_id, activeDragItem.item.cover_thumb)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider block">
                      {activeDragItem.item.item_type === 'capitulo' ? 'Capítulo' : 'Tomo'}{' '}
                      {activeDragItem.item.number ? `#${activeDragItem.item.number}` : ''}
                    </span>
                    <h4 className="text-xs font-bold text-white truncate">
                      {activeDragItem.item.title || activeDragItem.item.original_filename || activeDragItem.item.series}
                    </h4>
                    <span className="text-[10px] text-slate-400 block">{activeDragItem.item.page_count} págs</span>
                  </div>
                </div>
              ) : activeDragItem?.type === 'group' && activeDragItem.group ? (
                <div className="p-2.5 rounded-2xl border border-amber-400 bg-comic-900/95 shadow-2xl ring-2 ring-amber-500/50 flex items-center gap-2 max-w-[280px] pointer-events-none select-none scale-105 rotate-1">
                  <GripVertical className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="w-8 h-11 bg-comic-950 rounded-md overflow-hidden border border-slate-700 shrink-0 flex items-center justify-center">
                    {activeDragItem.group.coverThumb && activeDragItem.group.coverSessionId ? (
                      <img
                        src={getThumbUrl(activeDragItem.group.coverSessionId, activeDragItem.group.coverThumb)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider block">
                      Moviendo Grupo
                    </span>
                    <h4 className="text-xs font-bold text-white truncate">{activeDragItem.group.name}</h4>
                    <span className="text-[10px] text-slate-400 block">
                      {activeDragItem.group.sessions.length} elementos
                    </span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Multi-select Action Footer when in Merge Mode */}
      {isMergeMode && selectedIds.length >= 1 && (
        <div className="p-3 border-t border-comic-800/80 bg-indigo-950/70 animate-in slide-in-from-bottom duration-200 space-y-2">
          {selectedIds.length >= 2 && (
            <button
              onClick={handleStartMerge}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-98"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Juntar ({selectedIds.length}) en nuevo Tomo</span>
            </button>
          )}

          {/* Move/incorporate multiple selected chapters into an existing Tomo */}
          {selectedSessionsInOrder.some((s) => isSessionChapter(s)) && (
            <button
              type="button"
              onClick={() => {
                const selectedChapters = selectedSessionsInOrder.filter((s) => isSessionChapter(s));
                const firstChapter = selectedChapters[0];
                const chapterSeries = cleanSeriesDisplayName(firstChapter?.series || firstChapter?.original_filename);
                const matchingTomo = sessions.find(
                  (s) => isSessionTomo(s) && cleanSeriesDisplayName(s.series || s.original_filename) === chapterSeries
                );
                onOpenAppendChapters?.(matchingTomo, selectedChapters.map((s) => s.session_id));
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow-md shadow-amber-600/30 transition active:scale-98"
              title={t('sidebar.moveMarkedChaptersToTomoTitle')}
            >
              <PlusCircle className="w-4 h-4 text-slate-950" />
              <span>
                {t('sidebar.moveMarkedChaptersBtn', { count: selectedSessionsInOrder.filter((s) => isSessionChapter(s)).length })}
              </span>
            </button>
          )}

          {/* Move multiple selected sessions to another series with confirmation */}
          <button
            type="button"
            onClick={() => setMoveModalSessions(selectedSessionsInOrder)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-comic-900 hover:bg-comic-800 text-amber-300 hover:text-white border border-amber-600/50 text-xs font-bold transition active:scale-98"
            title={t('sidebar.moveMarkedToSeriesTitle')}
          >
            <FolderInput className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('sidebar.moveMarkedToSeriesBtn', { count: selectedIds.length })}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenBatchMetadata?.(selectedSessionsInOrder)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-comic-900 hover:bg-comic-800 text-indigo-300 hover:text-white border border-indigo-700/60 text-xs font-bold transition active:scale-98"
            title={t('sidebar.editMarkedMetadataTitle')}
          >
            <BookMarked className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t('sidebar.editMarkedMetadataBtn', { count: selectedIds.length })}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const src = sessions.find((s) => s.session_id === activeSessionId) || selectedSessionsInOrder[0];
              if (src) onOpenCloneModal?.(src);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-comic-900 hover:bg-comic-800 text-slate-300 hover:text-white border border-comic-700/80 text-xs font-semibold transition active:scale-98"
            title={t('sidebar.cloneMarkedDataTitle')}
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>{t('sidebar.cloneMarkedDataBtn')}</span>
          </button>

          {onOpenDeleteMarked && (
            <button
              type="button"
              onClick={() => onOpenDeleteMarked(selectedSessionsInOrder)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-comic-900 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-rose-800/60 text-xs font-bold transition active:scale-98"
              title={t('sidebar.deleteMarkedTitle')}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>{t('sidebar.deleteMarkedBtn', { count: selectedIds.length })}</span>
            </button>
          )}
        </div>
      )}

      {/* Sidebar Footer */}
      {!isMergeMode && activeSessionId && (
        <div className="p-3 border-t border-comic-800/80 bg-comic-950/80">
          <button
            onClick={onCloseCurrent}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-comic-900 hover:bg-comic-800 text-slate-300 hover:text-white border border-comic-700/80 text-xs font-semibold transition active:scale-98"
            title={t('sidebar.closeCurrentComicTitle')}
          >
            <FolderClosed className="w-4 h-4 text-amber-400" />
            <span>{t('sidebar.closeCurrentComicBtn')}</span>
          </button>
        </div>
      )}

      {/* Move To Series Modal */}
      {moveModalSessions && (
        <MoveToSeriesModal
          isOpen={Boolean(moveModalSessions)}
          targetSessions={moveModalSessions}
          existingSeries={seriesGroups.map((g) => g.name)}
          allSessions={sessions}
          onOpenAppendChapters={onOpenAppendChapters}
          onClose={() => setMoveModalSessions(null)}
          onConfirmMove={async (sessionIds, targetSeriesName) => {
            if (onMoveSessionsToSeries) {
              await onMoveSessionsToSeries(sessionIds, targetSeriesName);
              if (selectedIds.length > 0) setSelectedIds([]);
            }
          }}
        />
      )}
      {/* Resizer Splitter Drag Handle */}
      <div
        onPointerDown={handleResizeStart}
        onDoubleClick={handleResetWidth}
        className={`absolute top-0 -right-1.5 bottom-0 w-3 cursor-col-resize z-40 flex items-center justify-center transition-all group/resizer select-none ${
          isResizing ? 'bg-indigo-500/30' : 'hover:bg-indigo-500/20'
        }`}
        title={t('sidebar.resizePanelTitle')}
      >
        <div
          className={`w-1 h-12 rounded-full transition-all shadow-sm ${
            isResizing 
              ? 'bg-indigo-400 scale-y-125 ring-2 ring-indigo-400/50' 
              : 'bg-slate-700/60 group-hover/resizer:bg-indigo-400 group-hover/resizer:scale-y-110'
          }`}
        />
      </div>
    </aside>
  );
};
