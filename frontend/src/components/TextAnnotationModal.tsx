import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Type, 
  Plus, 
  Trash2, 
  Sparkles, 
  Save, 
  Move, 
  Info,
  Check,
  ZoomIn,
  ZoomOut,
  ScanText,
  Languages,
  Copy,
  CheckCheck,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Scaling,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FileText,
  Volume2,
  ArrowRight,
  MousePointer
} from 'lucide-react';
import { PageItem, SessionManifest } from '../types';
import { getImageUrl, addTextAnnotations, TextAnnotation, runPageOcr } from '../api';
import { useTranslation } from '../i18n';

interface TextAnnotationModalProps {
  sessionId: string;
  page: PageItem | null;
  pages?: PageItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedSession: SessionManifest, keepOpenPageId?: string) => void;
  onNavigatePage?: (page: PageItem) => void;
}

type AnnotationPresetMode = 'bocadillo' | 'cartela' | 'sfx';

// Reusable offscreen canvas context to eliminate thousands of DOM allocations during text sizing
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

const getMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
    measureCtx = measureCanvas.getContext('2d');
  }
  return measureCtx;
};

// Fast binary search to find maximum font size that fits tightly inside box limits
const computeAutoFitFontSize = (
  text: string,
  boxWidth: number,
  boxHeight: number
): number => {
  const clean = text.trim();
  if (!clean || boxWidth <= 20 || boxHeight <= 20) return 24;

  const ctx = getMeasureContext();
  if (!ctx) return 24;

  const availW = Math.max(10, boxWidth - 4);
  const availH = Math.max(10, boxHeight - 4);

  let low = 12;
  let high = 180;
  let best = 14;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    ctx.font = `bold ${mid}px "Comic Neue", "Comic Sans MS", cursive, sans-serif`;

    const paragraphs = clean.split('\n');
    let fits = true;
    let totalLines = 0;

    for (const para of paragraphs) {
      if (!para.trim()) {
        totalLines += 1;
        continue;
      }
      const words = para.split(/\s+/);
      let curLine = '';
      for (const w of words) {
        const candidate = curLine ? `${curLine} ${w}` : w;
        const lineW = ctx.measureText(candidate).width;
        if (lineW <= availW) {
          curLine = candidate;
        } else {
          if (curLine) {
            totalLines += 1;
            curLine = w;
            if (ctx.measureText(w).width > availW) {
              fits = false;
              break;
            }
          } else {
            fits = false;
            break;
          }
        }
      }
      if (curLine) totalLines += 1;
      if (!fits) break;
    }

    const estimatedH = totalLines * (mid * 1.10);
    if (fits && estimatedH <= availH) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
};

export const TextAnnotationModal: React.FC<TextAnnotationModalProps> = ({
  sessionId,
  page,
  pages = [],
  isOpen,
  onClose,
  onSuccess,
  onNavigatePage
}) => {
  const { t } = useTranslation();
  const allPages = pages.length > 0 ? pages : (page ? [page] : []);
  const [currentPage, setCurrentPage] = useState<PageItem | null>(page);

  // Notes state for current page
  const [notes, setNotes] = useState<TextAnnotation[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFitEnabled, setAutoFitEnabled] = useState<boolean>(true);

  // In-memory drafts for uncommitted notes across pages in the chapter
  const draftsByPageRef = useRef<Record<string, TextAnnotation[]>>({});

  // Dimensions of current page image
  const [naturalWidth, setNaturalWidth] = useState<number>(page?.width || 1000);
  const [naturalHeight, setNaturalHeight] = useState<number>(page?.height || 1400);

  // Zoom control
  const [zoomLevel, setZoomLevel] = useState<number | 'fit'>('fit');
  const [displayedImgWidth, setDisplayedImgWidth] = useState<number>(600);

  // Dragging state & click suppression refs
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragMovedRef = useRef<boolean>(false);
  const activeDraggingIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef<boolean>(false);
  const suppressClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartOffsetRef = useRef<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });

  // Resizing state refs
  const isResizingRef = useRef<boolean>(false);
  const activeResizeIdRef = useRef<string | null>(null);
  const resizeDirRef = useRef<'se' | 'e' | 's'>('se');
  const resizeStartDataRef = useRef<{ clientX: number; clientY: number; initW: number; initH: number }>({
    clientX: 0,
    clientY: 0,
    initW: 0,
    initH: 0
  });

  // Rubberband drag-to-create box on canvas
  const [isDrawingBox, setIsDrawingBox] = useState<boolean>(false);
  const [drawBoxRect, setDrawBoxRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const isDrawingBoxRef = useRef<boolean>(false);
  const drawStartRealRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Current creation preset mode
  const [activePresetMode, setActivePresetMode] = useState<AnnotationPresetMode>('bocadillo');

  // OCR state
  const [ocrLanguage, setOcrLanguage] = useState<'auto' | 'kor' | 'jpn' | 'spa' | 'eng'>('eng');
  const [isOcrRunning, setIsOcrRunning] = useState<boolean>(false);
  const [ocrFeedback, setOcrFeedback] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update current page when prop changes
  useEffect(() => {
    if (page) {
      setCurrentPage(page);
    }
  }, [page?.id]);

  // Load page state and drafts on switch
  useEffect(() => {
    if (!isOpen || !currentPage) return;
    setError(null);
    setOcrFeedback(null);
    setIsProcessing(false);

    const initW = currentPage.width || 1000;
    const initH = currentPage.height || 1400;
    setNaturalWidth(initW);
    setNaturalHeight(initH);

    // Check if we have draft notes for this page
    const existingDraft = draftsByPageRef.current[currentPage.id];
    if (existingDraft && existingDraft.length > 0) {
      setNotes(existingDraft);
      setSelectedNoteId(existingDraft[0].id!);
    } else {
      // Create initial starter speech bubble
      const starterW = Math.round(initW * 0.28);
      const starterH = Math.round(initH * 0.12);
      const starterX = Math.round(initW * 0.08);
      const starterY = Math.round(initH * 0.08);

      const starterText = t('ocr.defaultStarterText');
      const starter: TextAnnotation = {
        id: `note-${Date.now()}`,
        x: starterX,
        y: starterY,
        width: starterW,
        height: starterH,
        text: starterText,
        font_size: computeAutoFitFontSize(starterText, starterW, starterH),
        style: 'badge_light',
        align: 'center',
        text_color: '#111827',
        bg_color: '#FFFFFF',
        bg_opacity: 1.0,
        border: false,
        border_width: 0
      };
      setNotes([starter]);
      setSelectedNoteId(starter.id!);
      draftsByPageRef.current[currentPage.id] = [starter];
    }
  }, [isOpen, currentPage?.id]);

  // Synchronize draft memory on notes change
  useEffect(() => {
    if (currentPage && notes.length > 0) {
      draftsByPageRef.current[currentPage.id] = notes;
    }
  }, [notes, currentPage?.id]);

  // Keep displayed image width updated with ResizeObserver
  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setDisplayedImgWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [isOpen, currentPage?.id]);

  if (!isOpen || !currentPage) return null;

  const currentIndex = allPages.findIndex((p) => p.id === currentPage.id);
  const currentScale = naturalWidth > 0 ? (displayedImgWidth / naturalWidth) : 0.5;
  const selectedNote = notes.find((n) => n.id === selectedNoteId) || notes[0] || null;

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);
      setDisplayedImgWidth(img.clientWidth);
    }
  };

  // Helper to construct a note according to the 3 clean modes (borderless by default)
  const createNoteWithPreset = (xPx: number, yPx: number, wPx: number, hPx: number, mode: AnnotationPresetMode): TextAnnotation => {
    const finalW = Math.max(50, wPx);
    const finalH = Math.max(30, hPx);

    if (mode === 'cartela') {
      const text = 'Mientras tanto...';
      return {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: xPx,
        y: yPx,
        width: finalW,
        height: finalH,
        text,
        font_size: computeAutoFitFontSize(text, finalW, finalH),
        style: 'cartela',
        align: 'center',
        text_color: '#111827',
        bg_color: '#FFFFFA',
        bg_opacity: 1.0,
        border: false,
        border_width: 0
      };
    } else if (mode === 'sfx') {
      const text = '*SFX: (Efecto)';
      return {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: xPx,
        y: yPx,
        width: Math.max(40, wPx),
        height: Math.max(25, hPx),
        text,
        font_size: computeAutoFitFontSize(text, Math.max(40, wPx), Math.max(25, hPx)),
        style: 'sfx',
        align: 'center',
        text_color: '#FFFFFF',
        bg_color: '#000000',
        bg_opacity: 0.75,
        border: false,
        border_width: 0
      };
    } else {
      // Bocadillo de diálogo (Default - Pure white background, zero border, auto-fit)
      const text = '¡Diálogo aquí!';
      return {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: xPx,
        y: yPx,
        width: finalW,
        height: finalH,
        text,
        font_size: computeAutoFitFontSize(text, finalW, finalH),
        style: 'badge_light',
        align: 'center',
        text_color: '#111827',
        bg_color: '#FFFFFF',
        bg_opacity: 1.0,
        border: false,
        border_width: 0
      };
    }
  };

  // Canvas Mouse Down: Start Drag-to-Create Box
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current || isDraggingRef.current || isResizingRef.current || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const realX = Math.round(naturalWidth * relX);
    const realY = Math.round(naturalHeight * relY);

    isDrawingBoxRef.current = true;
    drawStartRealRef.current = { x: realX, y: realY };
    setIsDrawingBox(true);
    setDrawBoxRect({ x0: realX, y0: realY, x1: realX, y1: realY });
  };

  // Drag existing note
  const handleNoteMouseDown = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedNoteId(noteId);
    setDraggingId(noteId);
    activeDraggingIdRef.current = noteId;
    isDraggingRef.current = true;
    dragMovedRef.current = false;

    if (imgRef.current) {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        const rect = imgRef.current.getBoundingClientRect();
        const clientNoteX = rect.left + (note.x / naturalWidth) * rect.width;
        const clientNoteY = rect.top + (note.y / naturalHeight) * rect.height;
        dragStartOffsetRef.current = {
          offsetX: e.clientX - clientNoteX,
          offsetY: e.clientY - clientNoteY
        };
      }
    }
  };

  // Resize existing note
  const handleResizeMouseDown = (e: React.MouseEvent, noteId: string, direction: 'se' | 'e' | 's') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedNoteId(noteId);
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    isResizingRef.current = true;
    activeResizeIdRef.current = noteId;
    resizeDirRef.current = direction;
    resizeStartDataRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initW: note.width || Math.round(naturalWidth * 0.25),
      initH: note.height || Math.round(naturalHeight * 0.12)
    };
  };

  // Global mousemove and mouseup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. Rubberband draw-to-create box
      if (isDrawingBoxRef.current && imgRef.current) {
        const rect = imgRef.current.getBoundingClientRect();
        const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const curRealX = Math.round(naturalWidth * relX);
        const curRealY = Math.round(naturalHeight * relY);

        setDrawBoxRect({
          x0: Math.min(drawStartRealRef.current.x, curRealX),
          y0: Math.min(drawStartRealRef.current.y, curRealY),
          x1: Math.max(drawStartRealRef.current.x, curRealX),
          y1: Math.max(drawStartRealRef.current.y, curRealY)
        });
        return;
      }

      // 2. Resize handle dragging
      if (isResizingRef.current && activeResizeIdRef.current) {
        const deltaScreenX = e.clientX - resizeStartDataRef.current.clientX;
        const deltaScreenY = e.clientY - resizeStartDataRef.current.clientY;
        const deltaNaturalX = currentScale > 0 ? (deltaScreenX / currentScale) : deltaScreenX * 2;
        const deltaNaturalY = currentScale > 0 ? (deltaScreenY / currentScale) : deltaScreenY * 2;

        const dir = resizeDirRef.current;
        const note = notes.find((n) => n.id === activeResizeIdRef.current);
        const curX = note ? note.x : 0;
        const curY = note ? note.y : 0;

        let newW = resizeStartDataRef.current.initW;
        let newH = resizeStartDataRef.current.initH;

        if (dir.includes('e')) {
          newW = Math.max(40, Math.min(naturalWidth - curX, Math.round(resizeStartDataRef.current.initW + deltaNaturalX)));
        }
        if (dir.includes('s')) {
          newH = Math.max(25, Math.min(naturalHeight - curY, Math.round(resizeStartDataRef.current.initH + deltaNaturalY)));
        }

        setNotes((prev) =>
          prev.map((n) => (n.id === activeResizeIdRef.current ? { ...n, width: newW, height: newH } : n))
        );
        return;
      }

      // 3. Move existing note
      if (!isDraggingRef.current || !activeDraggingIdRef.current || !imgRef.current) return;
      dragMovedRef.current = true;

      const rect = imgRef.current.getBoundingClientRect();
      const targetClientX = e.clientX - dragStartOffsetRef.current.offsetX;
      const targetClientY = e.clientY - dragStartOffsetRef.current.offsetY;

      const relX = Math.max(0, Math.min(1, (targetClientX - rect.left) / rect.width));
      const relY = Math.max(0, Math.min(1, (targetClientY - rect.top) / rect.height));

      const newRealX = Math.round(naturalWidth * relX);
      const newRealY = Math.round(naturalHeight * relY);

      setNotes((prev) =>
        prev.map((n) => (n.id === activeDraggingIdRef.current ? { ...n, x: newRealX, y: newRealY } : n))
      );
    };

    const handleMouseUp = () => {
      // End rubberband box creation
      if (isDrawingBoxRef.current) {
        isDrawingBoxRef.current = false;
        setIsDrawingBox(false);

        if (drawBoxRect) {
          const w = drawBoxRect.x1 - drawBoxRect.x0;
          const h = drawBoxRect.y1 - drawBoxRect.y0;

          // If dragged with meaningful size (> 25px)
          if (w >= 25 && h >= 20) {
            const newNote = createNoteWithPreset(drawBoxRect.x0, drawBoxRect.y0, w, h, activePresetMode);
            const fitSize = computeAutoFitFontSize(newNote.text, w, h);
            newNote.font_size = fitSize;
            setNotes((prev) => [...prev, newNote]);
            setSelectedNoteId(newNote.id!);
            setTimeout(() => textareaRef.current?.focus(), 50);
          } else {
            // Simple click: place standard box
            const defaultW = Math.round(naturalWidth * 0.25);
            const defaultH = Math.round(naturalHeight * 0.11);
            const newNote = createNoteWithPreset(drawBoxRect.x0, drawBoxRect.y0, defaultW, defaultH, activePresetMode);
            const fitSize = computeAutoFitFontSize(newNote.text, defaultW, defaultH);
            newNote.font_size = fitSize;
            setNotes((prev) => [...prev, newNote]);
            setSelectedNoteId(newNote.id!);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }
        }
        setDrawBoxRect(null);
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 300);
        return;
      }

      // End resizing
      if (isResizingRef.current) {
        isResizingRef.current = false;
        const resizedId = activeResizeIdRef.current;
        activeResizeIdRef.current = null;
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 300);

        if (autoFitEnabled && resizedId) {
          setNotes((prev) =>
            prev.map((n) => {
              if (n.id !== resizedId) return n;
              const autoSize = computeAutoFitFontSize(n.text, n.width || 200, n.height || 100);
              return { ...n, font_size: autoSize };
            })
          );
        }
      }

      // End moving
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragMovedRef.current = false;
        activeDraggingIdRef.current = null;
        setDraggingId(null);
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 300);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [naturalWidth, naturalHeight, currentScale, notes, drawBoxRect, activePresetMode, autoFitEnabled]);

  // Update selected note with optional auto-fit font size
  const updateSelectedNote = (fields: Partial<TextAnnotation>, overrideAutoFit?: boolean) => {
    if (!selectedNoteId) return;

    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== selectedNoteId) return n;

        const merged = { ...n, ...fields };

        // If user changed font_size manually, disable autoFitEnabled
        if (fields.font_size !== undefined && !overrideAutoFit) {
          setAutoFitEnabled(false);
          return merged;
        }

        // If autoFitEnabled or requested, auto-scale font size
        if (
          (autoFitEnabled || overrideAutoFit) &&
          (fields.text !== undefined || fields.width !== undefined || fields.height !== undefined || overrideAutoFit)
        ) {
          const w = merged.width || 200;
          const h = merged.height || 100;
          merged.font_size = computeAutoFitFontSize(merged.text, w, h);
        }

        return merged;
      })
    );
  };

  // Maximize font size to fill the current speech bubble box
  const handleMaximizeTextFit = () => {
    if (!selectedNote) return;
    setAutoFitEnabled(true);
    const w = selectedNote.width || 200;
    const h = selectedNote.height || 100;
    const autoSize = computeAutoFitFontSize(selectedNote.text, w, h);
    updateSelectedNote({ font_size: autoSize }, true);
  };

  // Change preset mode of selected note
  const applyPresetMode = (mode: AnnotationPresetMode) => {
    setActivePresetMode(mode);
    if (!selectedNote) return;

    if (mode === 'bocadillo') {
      updateSelectedNote({
        style: 'badge_light',
        bg_color: '#FFFFFF',
        text_color: '#111827',
        bg_opacity: 1.0,
        border: false,
        border_width: 0,
        align: 'center'
      });
    } else if (mode === 'cartela') {
      updateSelectedNote({
        style: 'cartela',
        bg_color: '#FFFFFA',
        text_color: '#111827',
        bg_opacity: 1.0,
        border: false,
        border_width: 0,
        align: 'center'
      });
    } else if (mode === 'sfx') {
      updateSelectedNote({
        style: 'sfx',
        bg_color: '#000000',
        text_color: '#FFFFFF',
        bg_opacity: 0.75,
        border: false,
        border_width: 0,
        align: 'center'
      });
    }
  };

  const handleRemoveNote = (noteId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (selectedNoteId === noteId) {
      const remaining = notes.filter((n) => n.id !== noteId);
      setSelectedNoteId(remaining.length > 0 ? remaining[0].id! : null);
    }
  };

  // OCR on selected speech bubble
  const handleRunOcr = async () => {
    if (!selectedNote) return;
    setIsOcrRunning(true);
    setOcrFeedback(null);
    try {
      const box = {
        x: selectedNote.x,
        y: selectedNote.y,
        width: selectedNote.width || 250,
        height: selectedNote.height || 120
      };

      const res = await runPageOcr(sessionId, currentPage.id, box, ocrLanguage);
      if (res.text && res.text.trim()) {
        const textFound = res.text.trim();
        updateSelectedNote({ text: textFound });
        navigator.clipboard.writeText(textFound).catch(() => {});
        setOcrFeedback(`✓ Texto original copiado al portapapeles (${res.language}): "${textFound.slice(0, 35)}..."`);
      } else {
        setOcrFeedback('No se detectó texto claro. Ajusta el recuadro sobre las letras.');
      }
    } catch (err: any) {
      setOcrFeedback(`Error OCR: ${err.message || 'Error en reconocimiento'}`);
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleCopyNoteText = () => {
    if (!selectedNote?.text) return;
    navigator.clipboard.writeText(selectedNote.text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Save / Burn current page
  const handleSavePage = async (andAdvance: boolean = false) => {
    const validNotes = notes.filter((n) => n.text.trim().length > 0);
    if (validNotes.length === 0) {
      setError(t('ocr.emptyNotesError'));
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const updated = await addTextAnnotations(sessionId, currentPage.id, validNotes);
      // Clear draft for this page since it's burned
      delete draftsByPageRef.current[currentPage.id];

      if (andAdvance && currentIndex < allPages.length - 1) {
        const nextPage = allPages[currentIndex + 1];
        onSuccess(updated, nextPage.id);
        setCurrentPage(nextPage);
        if (onNavigatePage) onNavigatePage(nextPage);
        setIsProcessing(false);
      } else {
        onSuccess(updated);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || t('ocr.stampError'));
      setIsProcessing(false);
    }
  };

  // Page navigation within modal
  const handleNavigate = (delta: number) => {
    const newIdx = currentIndex + delta;
    if (newIdx >= 0 && newIdx < allPages.length) {
      const targetPage = allPages[newIdx];
      setCurrentPage(targetPage);
      if (onNavigatePage) onNavigatePage(targetPage);
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = ['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''));

      if (e.key === 'Escape' && !isProcessing) {
        onClose();
        return;
      }

      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSavePage(true);
        return;
      }

      if (!isInputFocused) {
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          handleNavigate(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          handleNavigate(-1);
        } else if (e.key === 'Delete' && selectedNoteId) {
          handleRemoveNote(selectedNoteId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allPages.length, isProcessing, selectedNoteId, notes]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-1 sm:p-3 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-[98vw] h-[97vh] bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Page Navigation Bar */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-comic-950 border-b border-slate-200 dark:border-comic-800 flex items-center justify-between gap-3">
          {/* Page Navigator */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => handleNavigate(-1)}
              className="p-1.5 rounded-lg bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none border border-slate-300 dark:border-comic-700 transition flex items-center gap-1 text-xs font-semibold shadow-2xs"
              title={t('ocr.prevPageTooltip')}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t('common.prev')}</span>
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-comic-900 rounded-lg border border-slate-300 dark:border-comic-700 shadow-2xs">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {t('common.page')} {currentPage.order}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                / {allPages.length}
              </span>
            </div>

            <button
              type="button"
              disabled={currentIndex >= allPages.length - 1}
              onClick={() => handleNavigate(1)}
              className="p-1.5 rounded-lg bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none border border-slate-300 dark:border-comic-700 transition flex items-center gap-1 text-xs font-semibold shadow-2xs"
              title={t('ocr.nextPageTooltip')}
            >
              <span className="hidden sm:inline">{t('common.next')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Center Help Hint */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-100 dark:bg-comic-900/60 px-3 py-1 rounded-lg border border-slate-200 dark:border-comic-800">
            <MousePointer className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>{t('ocr.dragToCreate')}</span>
          </div>

          {/* Zoom & Close */}
          <div className="flex items-center gap-2">
            {/* Quick Zoom */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-comic-900 px-2 py-1 rounded-lg border border-slate-300 dark:border-comic-700 text-xs">
              <button
                type="button"
                onClick={() => {
                  const cur = zoomLevel === 'fit' ? 0.75 : zoomLevel;
                  setZoomLevel(Math.max(0.4, Number((cur - 0.25).toFixed(2))));
                }}
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded"
                title={t('ocr.zoomOut')}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-300 px-1 min-w-[45px] text-center font-bold">
                {zoomLevel === 'fit' ? t('slicer.adjust') : `${Math.round(zoomLevel * 100)}%`}
              </span>
              <button
                type="button"
                onClick={() => {
                  const cur = zoomLevel === 'fit' ? 1.0 : zoomLevel;
                  setZoomLevel(Math.min(3.0, Number((cur + 0.25).toFixed(2))));
                }}
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded"
                title={t('ocr.zoomIn')}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition ml-1"
              title={t('ocr.closeEsc')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="px-4 py-2 bg-rose-950/90 border-b border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline hover:text-white text-[11px]">Cerrar</button>
          </div>
        )}

        {/* Main Workspace Body: Split View */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Canvas Preview Area */}
          <div 
            ref={imageContainerRef}
            onMouseDown={handleCanvasMouseDown}
            className="flex-1 relative bg-black/90 overflow-auto p-4 flex items-start justify-center select-none border-b md:border-b-0 md:border-r border-comic-800 cursor-crosshair"
          >
            <div 
              style={{
                width: zoomLevel === 'fit' 
                  ? (naturalHeight > naturalWidth * 1.6 ? '550px' : 'auto') 
                  : `${Math.round(naturalWidth * zoomLevel)}px`,
                maxWidth: zoomLevel === 'fit' ? (naturalHeight > naturalWidth * 1.6 ? 'none' : '100%') : 'none'
              }}
              className="relative shrink-0 shadow-2xl"
            >
              <img
                key={currentPage.filename}
                ref={imgRef}
                src={getImageUrl(sessionId, currentPage.filename)}
                alt="Página para traducción"
                onLoad={handleImageLoaded}
                style={{
                  maxHeight: zoomLevel === 'fit' ? (naturalHeight > naturalWidth * 1.6 ? 'none' : '76vh') : 'none',
                  width: zoomLevel === 'fit' ? (naturalHeight > naturalWidth * 1.6 ? '550px' : 'auto') : '100%'
                }}
                className="max-w-full block pointer-events-none rounded-sm"
              />

              {/* Rubberband Draw-to-Create Box Overlay */}
              {isDrawingBox && drawBoxRect && (
                <div
                  style={{
                    left: `${(drawBoxRect.x0 / naturalWidth) * 100}%`,
                    top: `${(drawBoxRect.y0 / naturalHeight) * 100}%`,
                    width: `${((drawBoxRect.x1 - drawBoxRect.x0) / naturalWidth) * 100}%`,
                    height: `${((drawBoxRect.y1 - drawBoxRect.y0) / naturalHeight) * 100}%`
                  }}
                  className="absolute z-50 border-2 border-indigo-400 bg-indigo-500/20 pointer-events-none rounded-md flex items-center justify-center"
                >
                  <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-200 font-mono text-[10px] shadow border border-indigo-500/50">
                    {drawBoxRect.x1 - drawBoxRect.x0} × {drawBoxRect.y1 - drawBoxRect.y0} px
                  </span>
                </div>
              )}

              {/* Render Draggable and Resizable Speech Bubbles */}
              {notes.map((note, noteIdx) => {
                const isSelected = note.id === selectedNoteId;
                const leftPct = (note.x / naturalWidth) * 100;
                const topPct = (note.y / naturalHeight) * 100;

                const visualFontSize = Math.max(9, Math.round(note.font_size * currentScale));
                const visualBoxW = note.width ? Math.round(note.width * currentScale) : undefined;
                const visualBoxH = note.height ? Math.round(note.height * currentScale) : undefined;

                const isSpeechBubble = !note.style || note.style === 'badge_light' || note.style === 'speech_bubble';
                const isCartela = note.style === 'cartela';
                const isSfx = note.style === 'sfx' || note.style === 'outline';

                return (
                  <div
                    key={note.id}
                    onMouseDown={(e) => handleNoteMouseDown(e, note.id!)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNoteId(note.id!);
                    }}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: visualBoxW ? `${visualBoxW}px` : undefined,
                      height: visualBoxH ? `${visualBoxH}px` : undefined,
                      maxWidth: visualBoxW ? undefined : '90%'
                    }}
                    className={`absolute z-30 cursor-grab active:cursor-grabbing transition-shadow ${
                      isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-black/40' : ''
                    }`}
                  >
                    {/* Number Tag - only show when selected so canvas remains clean */}
                    {isSelected && (
                      <div className="absolute -top-4 left-0 px-1 py-0.2 rounded bg-black/80 text-white font-mono text-[9px] pointer-events-none shadow z-40 border border-white/20">
                        #{noteIdx + 1}
                      </div>
                    )}

                    {/* Tight Note Box with Comic Lettering Font (0 borders by default) */}
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        fontSize: `${visualFontSize}px`,
                        padding: '1px 2px', // Minimal padding so text fills right to the bubble edges
                        lineHeight: '1.08',
                        borderRadius: isCartela ? '1px' : isSpeechBubble ? '4px' : '2px',
                        backgroundColor:
                          isSpeechBubble
                            ? `rgba(255,255,255,${note.bg_opacity ?? 1.0})`
                            : isCartela
                            ? `rgba(255,255,250,${note.bg_opacity ?? 1.0})`
                            : isSfx
                            ? `rgba(0,0,0,${note.bg_opacity ?? 0.75})`
                            : (note.bg_color || '#FFFFFF'),
                        color:
                          isSfx
                            ? '#FFFFFF'
                            : (note.text_color || '#111827'),
                        borderWidth: note.border && (note.border_width || 0) > 0 ? `${Math.max(1, (note.border_width || 1) * currentScale)}px` : '0px',
                        borderStyle: note.border ? 'solid' : 'none',
                        borderColor: note.border ? 'rgba(30,30,30,0.9)' : 'transparent',
                        textShadow:
                          isSfx
                            ? '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
                            : 'none',
                        textAlign: note.align || 'center'
                      }}
                      className="font-comic flex flex-col justify-center items-center whitespace-pre-wrap select-none overflow-hidden relative"
                    >
                      {/* Text content wrapped and tightly filling up to the bubble limits */}
                      <div className="w-full h-full flex flex-col justify-center items-center overflow-hidden">
                        <span 
                          style={{ hyphens: 'none', wordBreak: 'normal', overflowWrap: 'break-word', lineHeight: '1.08' }}
                          className="w-full text-center"
                        >
                          {note.text || '(Escribe el diálogo...)'}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Resize Handles when selected */}
                    {isSelected && (
                      <>
                        <div
                          onMouseDown={(e) => handleResizeMouseDown(e, note.id!, 'se')}
                          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                          title={t('ocr.resizeBothTooltip')}
                        />
                        <div
                          onMouseDown={(e) => handleResizeMouseDown(e, note.id!, 'e')}
                          className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-4 rounded-full bg-indigo-400 border border-white shadow cursor-ew-resize z-40 hover:scale-125 transition-transform"
                          title={t('ocr.resizeWidthTooltip')}
                        />
                        <div
                          onMouseDown={(e) => handleResizeMouseDown(e, note.id!, 's')}
                          className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-4 rounded-full bg-indigo-400 border border-white shadow cursor-ns-resize z-40 hover:scale-125 transition-transform"
                          title={t('ocr.resizeHeightTooltip')}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Editor Panel: Streamlined Scanlation Controls */}
          <div className="w-full md:w-80 lg:w-96 bg-slate-50 dark:bg-comic-950/80 p-4 overflow-y-auto flex flex-col gap-4 text-xs border-l border-slate-200 dark:border-comic-800">
            {/* 1. THE 3 DIRECT COMIC MODES (1 CLICK) */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>{t('ocr.elementPresetTitle')}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Bocadillo */}
                <button
                  type="button"
                  onClick={() => applyPresetMode('bocadillo')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                    activePresetMode === 'bocadillo' || selectedNote?.style === 'badge_light' || selectedNote?.style === 'speech_bubble'
                      ? 'bg-white text-slate-900 border-indigo-500 font-bold shadow-md ring-2 ring-indigo-500/30'
                      : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-comic-700 shadow-2xs'
                  }`}
                  title={t('ocr.speechBubbleDesc')}
                >
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px]">{t('ocr.speechBubble')}</span>
                </button>

                {/* Cartela */}
                <button
                  type="button"
                  onClick={() => applyPresetMode('cartela')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                    activePresetMode === 'cartela' || selectedNote?.style === 'cartela'
                      ? 'bg-amber-50 text-slate-900 border-amber-500 font-bold shadow-md ring-2 ring-amber-500/30'
                      : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-comic-700 shadow-2xs'
                  }`}
                  title={t('ocr.captionDesc')}
                >
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span className="text-[11px]">{t('ocr.caption')}</span>
                </button>

                {/* SFX / Margen */}
                <button
                  type="button"
                  onClick={() => applyPresetMode('sfx')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                    activePresetMode === 'sfx' || selectedNote?.style === 'sfx' || selectedNote?.style === 'outline'
                      ? 'bg-indigo-950 text-indigo-200 border-indigo-400 font-bold shadow-md ring-2 ring-indigo-500/30'
                      : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-comic-700 shadow-2xs'
                  }`}
                  title={t('ocr.sfxDesc')}
                >
                  <Volume2 className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <span className="text-[11px]">{t('ocr.sfx')}</span>
                </button>
              </div>
            </div>

            {/* Note Selector Chips if multiple */}
            {notes.length > 1 && (
              <div>
                <label className="block text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                  {t('ocr.dialogsOnPage', { count: notes.length })}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {notes.map((n, idx) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelectedNoteId(n.id!)}
                      className={`px-2 py-0.5 rounded-lg border font-comic text-[11px] transition ${
                        n.id === selectedNoteId
                          ? 'bg-indigo-600 border-indigo-400 text-white font-bold shadow-2xs'
                          : 'bg-white dark:bg-comic-900 border-slate-200 dark:border-comic-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-comic-700'
                      }`}
                    >
                      #{idx + 1} {n.text.slice(0, 10)}...
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedNote ? (
              <>
                {/* 2. TEXT INPUT (COMIC FONT & TIGHT EDGE) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1">
                      <Type className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{t('ocr.translationText')}</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyNoteText}
                      className="px-2 py-0.5 bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-slate-700 dark:text-slate-300 rounded text-[10px] border border-slate-200 dark:border-comic-700 flex items-center gap-1 shadow-2xs transition"
                    >
                      {copiedText ? <CheckCheck className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedText ? t('ocr.copied') : t('ocr.copy')}</span>
                    </button>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={3}
                    value={selectedNote.text}
                    onChange={(e) => updateSelectedNote({ text: e.target.value })}
                    placeholder={t('ocr.textareaPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none resize-none font-comic text-xs leading-snug shadow-2xs"
                  />

                  {/* Quick Tags for scanlation */}
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => updateSelectedNote({ text: `*SFX: ${selectedNote.text.replace(/^\*SFX:\s*/, '')}` })}
                      className="px-1.5 py-0.5 bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-indigo-600 dark:text-indigo-300 rounded text-[10px] font-mono border border-slate-200 dark:border-comic-700 shadow-2xs"
                    >
                      + *SFX:
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedNote({ text: `*Nota: ${selectedNote.text.replace(/^\*(Nota|Note):\s*/i, '')}` })}
                      className="px-1.5 py-0.5 bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-amber-600 dark:text-amber-300 rounded text-[10px] font-mono border border-slate-200 dark:border-comic-700 shadow-2xs"
                      title={t('ocr.tagNote')}
                    >
                      {t('ocr.tagNote')}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedNote({ text: `*T/N: ${selectedNote.text.replace(/^\*T\/N:\s*/, '')}` })}
                      className="px-1.5 py-0.5 bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-emerald-600 dark:text-emerald-300 rounded text-[10px] font-mono border border-slate-200 dark:border-comic-700 shadow-2xs"
                    >
                      + *T/N:
                    </button>
                  </div>
                </div>

                {/* 3. OCR RÁPIDO A 1 CLIC (EXTRAER INGLÉS ORIGINAL) */}
                <div className="bg-indigo-50/70 dark:bg-indigo-950/40 p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-900 dark:text-indigo-300 font-bold flex items-center gap-1 text-[11px]">
                      <ScanText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>{t('ocr.quickOcrTitle')}</span>
                    </span>

                    <select
                      value={ocrLanguage}
                      onChange={(e) => setOcrLanguage(e.target.value as any)}
                      className="bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700 text-slate-800 dark:text-slate-200 text-[10px] rounded px-2 py-0.5 shadow-2xs focus:outline-none"
                    >
                      <option value="eng">{t('ocr.langEnglish')}</option>
                      <option value="kor">{t('ocr.langKorean')}</option>
                      <option value="jpn">{t('ocr.langJapanese')}</option>
                      <option value="spa">{t('ocr.langSpanish')}</option>
                      <option value="auto">{t('ocr.langAuto')}</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={isOcrRunning}
                    onClick={handleRunOcr}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition disabled:opacity-50 text-xs shadow-md shadow-indigo-600/20"
                  >
                    {isOcrRunning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>{t('ocr.ocrScanning')}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>{t('ocr.scanBubbleOcr')}</span>
                      </>
                    )}
                  </button>

                  {ocrFeedback && (
                    <div className="p-2 rounded bg-white dark:bg-comic-950 text-slate-700 dark:text-slate-300 text-[10px] leading-tight border border-indigo-200 dark:border-indigo-900 flex items-start gap-1 shadow-2xs">
                      <Info className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                      <span className="flex-1">{ocrFeedback}</span>
                    </div>
                  )}
                </div>

                {/* 4. TAMAÑO DE FUENTE Y ALINEACIÓN (MAXIMIZAR AL LÍMITE) */}
                <div className="bg-white dark:bg-comic-900/50 p-3 rounded-xl border border-slate-200 dark:border-comic-800 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{t('ocr.fontSize')}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateSelectedNote({ font_size: Math.max(12, selectedNote.font_size - 3) })}
                        className="w-6 h-6 rounded bg-slate-100 dark:bg-comic-950 border border-slate-200 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center hover:bg-slate-200 dark:hover:bg-comic-900"
                        title={t('ocr.decreaseFontSize')}
                      >
                        -
                      </button>
                      <span className="w-12 text-center font-mono font-bold text-indigo-600 dark:text-indigo-300 text-xs">
                        {selectedNote.font_size}px
                      </span>
                      <button
                        type="button"
                        onClick={() => updateSelectedNote({ font_size: Math.min(220, selectedNote.font_size + 3) })}
                        className="w-6 h-6 rounded bg-slate-100 dark:bg-comic-950 border border-slate-200 dark:border-comic-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center hover:bg-slate-200 dark:hover:bg-comic-900"
                        title={t('ocr.increaseFontSize')}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={12}
                    max={160}
                    value={selectedNote.font_size}
                    onChange={(e) => updateSelectedNote({ font_size: parseInt(e.target.value) || 24 })}
                    className="w-full accent-indigo-600 dark:accent-indigo-500 h-2 bg-slate-200 dark:bg-comic-800 rounded-lg cursor-pointer"
                  />

                  {/* Button to maximize font size to limits of speech bubble */}
                  <button
                    type="button"
                    onClick={handleMaximizeTextFit}
                    className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 text-xs shadow-md shadow-indigo-600/20 transition active:scale-95"
                    title={t('ocr.maximizeFitDesc')}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>{t('ocr.maximizeFit')}</span>
                  </button>

                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoFitEnabled}
                        onChange={(e) => {
                          setAutoFitEnabled(e.target.checked);
                          if (e.target.checked) handleMaximizeTextFit();
                        }}
                        className="rounded accent-indigo-600"
                      />
                      <span>{t('ocr.autoFitOnResize')}</span>
                    </label>
                  </div>

                  {/* Alignment buttons */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-comic-800">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t('ocr.alignment')}</span>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-comic-950 p-0.5 rounded-lg border border-slate-200 dark:border-comic-700">
                      <button
                        type="button"
                        onClick={() => updateSelectedNote({ align: 'left' })}
                        className={`p-1 rounded ${selectedNote.align === 'left' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'}`}
                        title={t('ocr.alignLeft')}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedNote({ align: 'center' })}
                        className={`p-1 rounded ${!selectedNote.align || selectedNote.align === 'center' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'}`}
                        title={t('ocr.alignCenter')}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedNote({ align: 'right' })}
                        className={`p-1 rounded ${selectedNote.align === 'right' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'}`}
                        title={t('ocr.alignRight')}
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. DIMENSIONES DEL BOCADILLO (AJUSTADO AL BORDE) */}
                <div className="bg-white dark:bg-comic-900/50 p-3 rounded-xl border border-slate-200 dark:border-comic-800 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Scaling className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{t('ocr.bubbleDimensions')}</span>
                    </span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-300 text-[11px] font-bold">
                      {selectedNote.width || 0} × {selectedNote.height || 0} px
                    </span>
                  </div>

                  {/* Quick Presets */}
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: t('ocr.bubbleSmall'), w: 180, h: 90 },
                      { label: t('ocr.bubbleMedium'), w: 260, h: 130 },
                      { label: t('ocr.bubbleLarge'), w: 380, h: 180 },
                      { label: t('ocr.bubbleSfxStrip'), w: 100, h: 280 }
                    ].map((bp) => (
                      <button
                        key={bp.label}
                        type="button"
                        onClick={() => updateSelectedNote({ width: bp.w, height: bp.h })}
                        className="py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-comic-950 dark:hover:bg-comic-900 border border-slate-200 dark:border-comic-800 text-[10px] text-slate-700 dark:text-slate-300 font-medium transition"
                      >
                        {bp.label}
                      </button>
                    ))}
                  </div>

                  {/* Width & Height manual sliders */}
                  <div className="grid grid-cols-2 gap-2.5 text-[10px]">
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 font-medium">{t('ocr.bubbleWidth')} {selectedNote.width}px</span>
                      <input
                        type="range"
                        min={50}
                        max={Math.min(1000, naturalWidth)}
                        value={selectedNote.width || 200}
                        onChange={(e) => updateSelectedNote({ width: parseInt(e.target.value) || 200 })}
                        className="w-full accent-indigo-600 dark:accent-indigo-500 h-1.5 bg-slate-200 dark:bg-comic-800 rounded cursor-pointer mt-1"
                      />
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 font-medium">{t('ocr.bubbleHeight')} {selectedNote.height}px</span>
                      <input
                        type="range"
                        min={30}
                        max={Math.min(700, naturalHeight)}
                        value={selectedNote.height || 100}
                        onChange={(e) => updateSelectedNote({ height: parseInt(e.target.value) || 100 })}
                        className="w-full accent-indigo-600 dark:accent-indigo-500 h-1.5 bg-slate-200 dark:bg-comic-800 rounded cursor-pointer mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Delete Note Button */}
                <div className="pt-1 flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleRemoveNote(selectedNote.id!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-300/60 dark:border-rose-800/80 font-bold transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>{t('ocr.deleteBubble')}</span>
                  </button>
                  <span className="font-mono text-[10px]">
                    X: {selectedNote.x} • Y: {selectedNote.y}
                  </span>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('ocr.dragToCreate')}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Continuous Translation Actions */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-comic-950 border-t border-slate-200 dark:border-comic-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              {notes.length} {t('common.tomo').toLowerCase()} / {t('common.pages')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-comic-800 text-xs font-semibold disabled:opacity-50 transition"
            >
              {t('common.close')}
            </button>

            {/* Estampar y Avanzar a Siguiente Página */}
            {currentIndex < allPages.length - 1 && (
              <button
                type="button"
                disabled={isProcessing || notes.length === 0}
                onClick={() => handleSavePage(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
                title={t('ocr.stampAndNextTitle')}
              >
                <span>{t('ocr.stampAndNext')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Estampar Página Actual y Guardar */}
            <button
              type="button"
              disabled={isProcessing || notes.length === 0}
              onClick={() => handleSavePage(false)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isProcessing ? t('ocr.stamping') : t('ocr.stampPage')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
