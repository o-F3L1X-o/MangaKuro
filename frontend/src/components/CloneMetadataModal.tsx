import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  CheckSquare, 
  Square, 
  Sparkles, 
  BookOpen, 
  Bookmark, 
  ShieldCheck, 
  Loader2,
  Users,
  Building2,
  Compass,
  Tag,
  FileText,
  Calendar,
  PenTool,
  Palette,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ComicSessionSummary, ComicInfo, SessionManifest } from '../types';
import { fetchSession, updateMetadata, batchUpdateMetadata, getThumbUrl } from '../api';

interface CloneMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceSessionId: string;
  initialMetadata?: ComicInfo;
  allSessions: ComicSessionSummary[];
  onCloneSuccess: (updatedSessions: SessionManifest[]) => void;
}

export const CloneMetadataModal: React.FC<CloneMetadataModalProps> = ({
  isOpen,
  onClose,
  sourceSessionId,
  initialMetadata,
  allSessions,
  onCloneSuccess
}) => {
  const [currentSourceId, setCurrentSourceId] = useState<string>(sourceSessionId);
  const [sourceManifest, setSourceManifest] = useState<SessionManifest | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);

  // Editable common metadata to clone
  const [editableMeta, setEditableMeta] = useState<ComicInfo>({
    Series: '',
    Writer: '',
    Penciller: '',
    Publisher: '',
    Genre: '',
    ReadingDirection: 'rtl',
    AgeRating: 'Unknown',
    Year: undefined,
    Summary: ''
  });

  // Target sessions selection
  const otherSessions = allSessions.filter((s) => s.session_id !== currentSourceId);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  // Field group toggles
  const [copyCreators, setCopyCreators] = useState(true);
  const [copySeriesPublisher, setCopySeriesPublisher] = useState(true);
  const [copyGenreAge, setCopyGenreAge] = useState(true);
  const [copyReadingMode, setCopyReadingMode] = useState(true);
  const [copyDate, setCopyDate] = useState(true);
  const [copySummary, setCopySummary] = useState(false);

  const [showSummaryField, setShowSummaryField] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Sync source ID when modal opens or sourceSessionId changes
  useEffect(() => {
    setCurrentSourceId(sourceSessionId);
  }, [sourceSessionId, isOpen]);

  // Load source session manifest when currentSourceId changes
  useEffect(() => {
    if (!isOpen || !currentSourceId) return;

    let isMounted = true;
    setIsLoadingSource(true);
    setError(null);

    // If initialMetadata was passed directly (e.g. from MetadataDrawer) and matches currentSourceId
    if (initialMetadata && currentSourceId === sourceSessionId) {
      setEditableMeta({ ...initialMetadata });
    }

    fetchSession(currentSourceId)
      .then((manifest) => {
        if (isMounted) {
          setSourceManifest(manifest);

          // If initialMetadata was not passed, use manifest.metadata
          if (!initialMetadata || currentSourceId !== sourceSessionId) {
            setEditableMeta({ ...manifest.metadata });
          }

          // Smart auto-selection: prefer tomos of the same series
          const sourceSeries = (initialMetadata?.Series || manifest.metadata.Series || '').trim().toLowerCase();
          const others = allSessions.filter((s) => s.session_id !== currentSourceId);
          
          const sameSeriesOthers = others.filter((s) => {
            const sSeries = (s.series || '').trim().toLowerCase();
            return sourceSeries && sSeries && sSeries === sourceSeries;
          });

          // If there are other tomos of the same series, select those by default; otherwise select all
          if (sameSeriesOthers.length > 0) {
            setSelectedTargetIds(sameSeriesOthers.map((s) => s.session_id));
          } else {
            setSelectedTargetIds(others.map((s) => s.session_id));
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Error al cargar los metadatos del cómic origen');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingSource(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentSourceId, isOpen]);

  if (!isOpen) return null;

  // Handle input changes in the editable clone fields
  const handleMetaChange = (field: keyof ComicInfo, value: any) => {
    setEditableMeta((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // Toggle single target
  const handleToggleTarget = (sid: string) => {
    setSelectedTargetIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  // Select all targets
  const handleSelectAllTargets = () => {
    setSelectedTargetIds(otherSessions.map((s) => s.session_id));
  };

  // Deselect all targets
  const handleDeselectAllTargets = () => {
    setSelectedTargetIds([]);
  };

  // Select only tomos of the same series
  const handleSelectSameSeries = () => {
    const curSeries = (editableMeta.Series || '').trim().toLowerCase();
    if (!curSeries) {
      handleSelectAllTargets();
      return;
    }
    const matching = otherSessions.filter((s) => (s.series || '').trim().toLowerCase() === curSeries);
    setSelectedTargetIds(matching.length > 0 ? matching.map((s) => s.session_id) : otherSessions.map((s) => s.session_id));
  };

  // Execute clone
  const handleExecuteClone = async () => {
    if (selectedTargetIds.length === 0) {
      setError('Selecciona al menos un tomo o capítulo de destino');
      return;
    }

    // Build the list of fields to clone
    const fieldsToCopy: string[] = [];
    if (copyCreators) {
      fieldsToCopy.push('Writer', 'Penciller', 'Inker', 'Colorist', 'Letterer', 'CoverArtist', 'Editor');
    }
    if (copySeriesPublisher) {
      fieldsToCopy.push('Series', 'AlternateSeries', 'Publisher', 'Imprint', 'ScanInformation', 'Web', 'LanguageISO');
    }
    if (copyGenreAge) {
      fieldsToCopy.push('Genre', 'AgeRating');
    }
    if (copyReadingMode) {
      fieldsToCopy.push('ReadingDirection', 'Manga', 'Webtoon', 'BlackAndWhite', 'Format');
    }
    if (copyDate) {
      fieldsToCopy.push('Year', 'Month', 'Day');
    }
    if (copySummary) {
      fieldsToCopy.push('Summary');
    }

    if (fieldsToCopy.length === 0) {
      setError('Debes marcar al menos un grupo de campos para copiar');
      return;
    }

    setIsProcessing(true);
    setError(null);

    // Prepare payload with synchronized ReadingDirection, Manga and Webtoon flags
    const finalMeta: ComicInfo = { ...editableMeta };
    if (finalMeta.ReadingDirection === 'rtl') {
      finalMeta.Manga = 'YesAndRightToLeft';
      finalMeta.Webtoon = 'No';
    } else if (finalMeta.ReadingDirection === 'vertical') {
      finalMeta.Webtoon = 'Yes';
      finalMeta.Manga = 'No';
    } else {
      finalMeta.Manga = 'No';
      finalMeta.Webtoon = 'No';
    }

    try {
      // 1. Also update the source session with the edited fields to keep everything consistent
      try {
        await updateMetadata(currentSourceId, finalMeta);
      } catch (srcErr) {
        console.warn('Could not update source session metadata:', srcErr);
      }

      // 2. Batch update all selected targets
      const res = await batchUpdateMetadata({
        session_ids: selectedTargetIds,
        metadata: finalMeta,
        apply_common_only: true,
        fields_to_copy: fieldsToCopy
      });

      setSuccessToast(`¡Metadatos clonados con éxito en ${res.updated_count} tomos!`);
      
      // Delay closing slightly to allow user to see success feedback
      setTimeout(() => {
        onCloneSuccess(res.sessions);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Error al clonar los metadatos');
      setIsProcessing(false);
    }
  };

  const currentSourceSummary = allSessions.find((s) => s.session_id === currentSourceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-comic-900 border border-comic-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-comic-800 bg-comic-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Clonar Datos Comunes de ComicInfo
              </h2>
              <p className="text-xs text-slate-400">
                Copia autor, dibujante, serie, editorial y tipo de lectura a otros tomos en un solo clic
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {successToast && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
              <span className="font-bold">{successToast}</span>
            </div>
          )}

          {/* Step 1: Source Session Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">1</span>
                Cómic de origen (Plantilla de datos):
              </label>
              <span className="text-[11px] text-slate-500">
                {allSessions.length} cómics en staging
              </span>
            </div>

            <select
              value={currentSourceId}
              onChange={(e) => setCurrentSourceId(e.target.value)}
              disabled={isProcessing || isLoadingSource}
              className="w-full px-3 py-2.5 rounded-xl bg-comic-950 border border-comic-700 text-white text-sm font-semibold focus:border-indigo-500 focus:outline-none"
            >
              {allSessions.map((s) => {
                const sName = s.series || s.original_filename;
                const volPart = s.volume ? ` Vol.${s.volume}` : (s.number ? ` #${s.number}` : '');
                const titlePart = s.title && s.title.trim().toLowerCase() !== sName.trim().toLowerCase() ? ` — "${s.title.trim()}"` : '';
                return (
                  <option key={s.session_id} value={s.session_id}>
                    {sName}{volPart}{titlePart} ({s.item_type === 'capitulo' ? 'Capítulo' : 'Tomo'} - {s.page_count} págs)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Step 2: Editable Metadata Card (WYSIWYG: What You See Is What You Clone) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">2</span>
                Datos que se clonarán (¡Completamente editables!):
              </label>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Puedes rellenar o modificar campos aquí
              </span>
            </div>

            {isLoadingSource ? (
              <div className="p-6 rounded-xl bg-comic-950/60 border border-comic-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Cargando datos del cómic plantilla...</span>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-comic-950/80 border border-indigo-500/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Serie */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                      Serie:
                    </label>
                    <input
                      type="text"
                      value={editableMeta.Series || ''}
                      onChange={(e) => handleMetaChange('Series', e.target.value)}
                      placeholder="Nombre de la serie (ej: Another)"
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>

                  {/* Editorial */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                      Editorial / Publicador:
                    </label>
                    <input
                      type="text"
                      value={editableMeta.Publisher || ''}
                      onChange={(e) => handleMetaChange('Publisher', e.target.value)}
                      placeholder="Ej: Ivrea, Panini, Norma..."
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Autor / Guionista */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <PenTool className="w-3.5 h-3.5 text-indigo-400" />
                      Autor / Guionista (Writer):
                    </label>
                    <input
                      type="text"
                      value={editableMeta.Writer || ''}
                      onChange={(e) => handleMetaChange('Writer', e.target.value)}
                      placeholder="Ej: Yukito Ayatsuji"
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Dibujante / Ilustrador */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-indigo-400" />
                      Dibujante / Ilustrador (Penciller):
                    </label>
                    <input
                      type="text"
                      value={editableMeta.Penciller || ''}
                      onChange={(e) => handleMetaChange('Penciller', e.target.value)}
                      placeholder="Ej: Hiro Kiyohara"
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Géneros */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-indigo-400" />
                      Géneros:
                    </label>
                    <input
                      type="text"
                      value={editableMeta.Genre || ''}
                      onChange={(e) => handleMetaChange('Genre', e.target.value)}
                      placeholder="Ej: Suspense, Horror, Manga..."
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Tipo de lectura */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-indigo-400" />
                      Tipo de lectura:
                    </label>
                    <select
                      value={editableMeta.ReadingDirection || 'rtl'}
                      onChange={(e) => handleMetaChange('ReadingDirection', e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="rtl">📖 Manga Oriental (RTL - Derecha a Izq.)</option>
                      <option value="ltr">📚 Cómic Occidental (LTR - Izq. a Der.)</option>
                      <option value="vertical">📜 Webtoon (Vertical Scroll)</option>
                    </select>
                  </div>

                  {/* Calificación por edad */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      Edad / Clasificación:
                    </label>
                    <select
                      value={editableMeta.AgeRating || 'Unknown'}
                      onChange={(e) => handleMetaChange('AgeRating', e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Unknown">Sin calificar (Unknown)</option>
                      <option value="Everyone">Para todos los públicos (Everyone)</option>
                      <option value="Teen">Adolescentes 13+ (Teen)</option>
                      <option value="Mature 17+">Maduro 17+ (Mature)</option>
                      <option value="Adults Only 18+">Adultos 18+ (Adults Only)</option>
                    </select>
                  </div>

                  {/* Año */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Año de publicación:
                    </label>
                    <input
                      type="number"
                      value={editableMeta.Year || ''}
                      onChange={(e) => handleMetaChange('Year', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      placeholder="Ej: 2013"
                      disabled={isProcessing}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Optional Expandable Summary */}
                <div className="pt-2 border-t border-comic-800/60">
                  <button
                    type="button"
                    onClick={() => setShowSummaryField(!showSummaryField)}
                    className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 font-semibold transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Sinopsis general de la serie</span>
                    {showSummaryField ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showSummaryField && (
                    <div className="mt-2 space-y-1.5">
                      <textarea
                        value={editableMeta.Summary || ''}
                        onChange={(e) => handleMetaChange('Summary', e.target.value)}
                        placeholder="Argumento o sinopsis que describe la serie..."
                        rows={3}
                        disabled={isProcessing}
                        className="w-full px-3 py-2 rounded-lg bg-comic-900 border border-comic-700 text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                      />
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={copySummary}
                          onChange={(e) => setCopySummary(e.target.checked)}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5 bg-comic-900"
                        />
                        <span>Clonar también este argumento en los tomos destino</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Select Fields to Clone */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">3</span>
              Grupos de datos a copiar:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="p-2.5 rounded-xl border border-comic-800 bg-comic-950/40 hover:bg-comic-950/80 cursor-pointer flex items-center gap-2.5 transition">
                <input
                  type="checkbox"
                  checked={copyCreators}
                  onChange={(e) => setCopyCreators(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 bg-comic-900"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    Creadores (Autor, Dibujante...)
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Writer, Penciller, Inker, Colorist, Editor
                  </p>
                </div>
              </label>

              <label className="p-2.5 rounded-xl border border-comic-800 bg-comic-950/40 hover:bg-comic-950/80 cursor-pointer flex items-center gap-2.5 transition">
                <input
                  type="checkbox"
                  checked={copySeriesPublisher}
                  onChange={(e) => setCopySeriesPublisher(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 bg-comic-900"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    Serie y Editorial
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Series, Publisher, Imprint, Fansub
                  </p>
                </div>
              </label>

              <label className="p-2.5 rounded-xl border border-comic-800 bg-comic-950/40 hover:bg-comic-950/80 cursor-pointer flex items-center gap-2.5 transition">
                <input
                  type="checkbox"
                  checked={copyGenreAge}
                  onChange={(e) => setCopyGenreAge(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 bg-comic-900"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-indigo-400" />
                    Género y Calificación
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Genre, AgeRating (Everyone, Teen, 18+)
                  </p>
                </div>
              </label>

              <label className="p-2.5 rounded-xl border border-comic-800 bg-comic-950/40 hover:bg-comic-950/80 cursor-pointer flex items-center gap-2.5 transition">
                <input
                  type="checkbox"
                  checked={copyReadingMode}
                  onChange={(e) => setCopyReadingMode(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 bg-comic-900"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" />
                    Tipo de Lectura
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Manga RTL, Webtoon vertical, Cómic LTR
                  </p>
                </div>
              </label>

              <label className="p-2.5 rounded-xl border border-comic-800 bg-comic-950/40 hover:bg-comic-950/80 cursor-pointer flex items-center gap-2.5 transition">
                <input
                  type="checkbox"
                  checked={copyDate}
                  onChange={(e) => setCopyDate(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 bg-comic-900"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    Fecha y Año
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Year, Month
                  </p>
                </div>
              </label>

              <label className="p-2.5 rounded-xl border border-comic-800 bg-comic-950/40 hover:bg-comic-950/80 cursor-pointer flex items-center gap-2.5 transition">
                <input
                  type="checkbox"
                  checked={copySummary}
                  onChange={(e) => setCopySummary(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 bg-comic-900"
                />
                <div className="min-w-0">
                  <p className="font-bold text-white flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Sinopsis general
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Argumento de la serie (Summary)
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Step 4: Target Sessions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-black">4</span>
                Cómics destino ({selectedTargetIds.length} seleccionados):
              </label>
              <div className="flex items-center gap-3 text-xs">
                {editableMeta.Series && (
                  <button
                    type="button"
                    onClick={handleSelectSameSeries}
                    className="text-xs text-indigo-400 hover:text-white font-semibold transition"
                  >
                    Misma serie
                  </button>
                )}
                <button
                  type="button"
                  onClick={selectedTargetIds.length === otherSessions.length ? handleDeselectAllTargets : handleSelectAllTargets}
                  className="text-xs text-indigo-400 hover:text-white font-semibold transition"
                >
                  {selectedTargetIds.length === otherSessions.length ? 'Deseleccionar todos' : `Seleccionar todos (${otherSessions.length})`}
                </button>
              </div>
            </div>

            {otherSessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-comic-950/60 border border-comic-800 text-center text-xs text-slate-400">
                No hay otros cómics cargados en el área de preparación (staging). Carga otros tomos o capítulos para clonarles metadatos.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {otherSessions.map((item) => {
                  const isChecked = selectedTargetIds.includes(item.session_id);
                  const isCap = item.item_type === 'capitulo';

                  return (
                    <div
                      key={item.session_id}
                      onClick={() => handleToggleTarget(item.session_id)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 text-xs ${
                        isChecked
                          ? 'bg-indigo-950/50 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/30'
                          : 'bg-comic-950/40 border-comic-800/80 hover:bg-comic-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border border-slate-700 bg-comic-900">
                          {isChecked && <Check className="w-3.5 h-3.5 text-indigo-400 stroke-[3]" />}
                        </div>

                        {item.cover_thumb ? (
                          <img
                            src={getThumbUrl(item.session_id, item.cover_thumb)}
                            alt="Cover"
                            className="w-8 h-11 object-cover rounded bg-comic-950 shrink-0 border border-comic-700"
                          />
                        ) : (
                          <div className="w-8 h-11 rounded bg-comic-950 flex items-center justify-center shrink-0 border border-comic-800">
                            {isCap ? <Bookmark className="w-3.5 h-3.5 text-amber-500" /> : <BookOpen className="w-3.5 h-3.5 text-indigo-400" />}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-bold text-white truncate">
                            {item.series || item.original_filename}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isCap ? 'bg-amber-950 text-amber-300' : 'bg-indigo-950 text-indigo-300'
                            }`}>
                              {isCap ? 'Capítulo' : 'Tomo'} {item.volume ? `Vol.${item.volume}` : (item.number ? `#${item.number}` : '')}
                            </span>
                            <span>•</span>
                            <span>{item.page_count} páginas</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isChecked ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[10px] font-bold">
                            Se actualizará
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Sin cambios</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Preservation Safety Banner */}
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-2.5 text-xs text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                <strong>Protección de datos:</strong> El <strong>Volumen, Número, Título y Páginas</strong> propios de cada tomo destino <strong>NUNCA</strong> se modificarán.
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-comic-950/80 border-t border-comic-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold transition"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleExecuteClone}
            disabled={isProcessing || selectedTargetIds.length === 0 || otherSessions.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Clonando metadatos...</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>
                  Clonar datos en {selectedTargetIds.length} {selectedTargetIds.length === 1 ? 'tomo' : 'tomos'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
