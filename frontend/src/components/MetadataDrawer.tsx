import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Sparkles, 
  Compass, 
  BookMarked, 
  Tag, 
  Calendar, 
  UserCheck, 
  Info, 
  Layers, 
  CheckCircle2, 
  BookOpen, 
  Bookmark,
  Copy,
  Download,
  Upload,
  Loader2,
  Check,
  Search
} from 'lucide-react';
import { ComicInfo, ComicSessionSummary } from '../types';
import { fetchSession } from '../api';
import { useTranslation } from '../i18n';

interface MetadataDrawerProps {
  metadata: ComicInfo;
  isOpen: boolean;
  onClose: () => void;
  onSave: (metadata: ComicInfo) => void;
  onBatchSave?: (sessionIds: string[], metadata: ComicInfo) => void;
  originalFilename: string;
  itemType?: 'tomo' | 'capitulo';
  pageCount?: number;
  markedSessions?: ComicSessionSummary[];
  allSessions?: ComicSessionSummary[];
  activeSessionId?: string;
  onOpenCloneModal?: (currentMetadata?: ComicInfo) => void;
  onOpenOnlineSearch?: () => void;
}

export const MetadataDrawer: React.FC<MetadataDrawerProps> = ({
  metadata,
  isOpen,
  onClose,
  onSave,
  onBatchSave,
  originalFilename,
  itemType = 'tomo',
  pageCount,
  markedSessions = [],
  allSessions = [],
  activeSessionId,
  onOpenCloneModal,
  onOpenOnlineSearch
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<ComicInfo>({ ...metadata });
  const [applyToAllMarked, setApplyToAllMarked] = useState(false);
  const [quickCloneSourceId, setQuickCloneSourceId] = useState<string>('');
  const [cloneNotification, setCloneNotification] = useState<string | null>(null);
  const [isQuickCloning, setIsQuickCloning] = useState(false);

  // Synchronize form whenever metadata changes or drawer opens
  useEffect(() => {
    setFormData({ ...metadata });
    setApplyToAllMarked(false);
  }, [metadata, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof ComicInfo, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyPreset = (preset: 'manga' | 'comic' | 'webtoon') => {
    if (preset === 'manga') {
      setFormData((prev) => ({
        ...prev,
        ReadingDirection: 'rtl',
        Manga: 'YesAndRightToLeft',
        Webtoon: 'No',
        Genre: prev.Genre?.includes('Manga') ? prev.Genre : (prev.Genre ? `${prev.Genre}, Manga` : 'Manga')
      }));
    } else if (preset === 'webtoon') {
      setFormData((prev) => ({
        ...prev,
        ReadingDirection: 'vertical',
        Webtoon: 'Yes',
        Manga: 'No',
        Genre: prev.Genre?.includes('Webtoon') ? prev.Genre : (prev.Genre ? `${prev.Genre}, Webtoon` : 'Webtoon')
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        ReadingDirection: 'ltr',
        Manga: 'No',
        Webtoon: 'No'
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (applyToAllMarked && onBatchSave && markedSessions && markedSessions.length > 1) {
      onBatchSave(markedSessions.map((s) => s.session_id), formData);
    } else {
      onSave(formData);
    }
    onClose();
  };

  const handleQuickCloneFromOtherSession = async () => {
    if (!quickCloneSourceId) return;
    setIsQuickCloning(true);
    setCloneNotification(null);
    try {
      const src = await fetchSession(quickCloneSourceId);
      const m = src.metadata;
      setFormData((prev) => ({
        ...prev,
        Series: m.Series || prev.Series,
        AlternateSeries: m.AlternateSeries || prev.AlternateSeries,
        Writer: m.Writer || prev.Writer,
        Penciller: m.Penciller || prev.Penciller,
        Inker: m.Inker || prev.Inker,
        Colorist: m.Colorist || prev.Colorist,
        Letterer: m.Letterer || prev.Letterer,
        CoverArtist: m.CoverArtist || prev.CoverArtist,
        Editor: m.Editor || prev.Editor,
        Publisher: m.Publisher || prev.Publisher,
        Imprint: m.Imprint || prev.Imprint,
        ScanInformation: m.ScanInformation || prev.ScanInformation,
        Web: m.Web || prev.Web,
        LanguageISO: m.LanguageISO || prev.LanguageISO,
        Genre: m.Genre || prev.Genre,
        AgeRating: m.AgeRating || prev.AgeRating,
        Year: m.Year || prev.Year,
        Month: m.Month || prev.Month,
        ReadingDirection: m.ReadingDirection || prev.ReadingDirection,
        Manga: m.Manga || prev.Manga,
        Webtoon: m.Webtoon || prev.Webtoon,
        BlackAndWhite: m.BlackAndWhite || prev.BlackAndWhite,
        Format: m.Format || prev.Format
      }));
      const srcName = m.Series || src.original_filename;
      setCloneNotification(`¡Datos copiados desde ${srcName}! (Autor, Dibujante, Serie, Editorial, Género y Lectura actualizados)`);
      setTimeout(() => setCloneNotification(null), 5000);
    } catch (err: any) {
      alert('Error al copiar datos del cómic: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsQuickCloning(false);
    }
  };

  const isCap = itemType === 'capitulo';
  const hasMultipleMarked = markedSessions && markedSessions.length > 1;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-white dark:bg-comic-900 border-l border-slate-200 dark:border-comic-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-comic-950/90 border-b border-slate-200 dark:border-comic-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('comicInfo.headerTitle')}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
              title={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Tomo Identity Banner */}
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-comic-900/90 border border-slate-200 dark:border-comic-700/80 flex items-center justify-between gap-3 shadow-inner">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {isCap ? (
                  <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-amber-950 border border-purple-300 dark:border-amber-700/70 text-purple-800 dark:text-amber-300 font-extrabold text-[10px] flex items-center gap-1">
                    <Bookmark className="w-2.5 h-2.5" />
                    {t('common.chapter').toUpperCase()} {formData.Number ? `#${formData.Number}` : ''}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 border border-indigo-300 dark:border-indigo-700/70 text-indigo-800 dark:text-indigo-300 font-extrabold text-[10px] flex items-center gap-1">
                    <BookOpen className="w-2.5 h-2.5" />
                    {t('common.tomo').toUpperCase()} {formData.Volume ? `VOL.${formData.Volume}` : (formData.Number ? `#${formData.Number}` : '')}
                  </span>
                )}
                {pageCount !== undefined && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {pageCount} {t('common.pages')}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {formData.Series || originalFilename}
              </p>
              {formData.Title && (
                <p className="text-[11px] text-indigo-600 dark:text-indigo-300/80 truncate mt-0.5">
                  {formData.Title}
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-600/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shadow-2xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {t('comicInfo.singleFile')}
              </span>
            </div>
          </div>
        </div>

        {/* Online Search Banner / Action */}
        {onOpenOnlineSearch && (
          <div className="px-6 py-2.5 bg-gradient-to-r from-purple-950/70 via-indigo-950/70 to-purple-950/70 border-b border-purple-800/60 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-white">¿Faltan datos o portada?</span>
                <span className="text-slate-400 hidden sm:inline ml-1.5">Busca tomos, capítulos y portadas en MangaDex & AniList.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenOnlineSearch}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition shrink-0 cursor-pointer active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar Online</span>
            </button>
          </div>
        )}

        {/* Quick Clone / Import Bar */}
        {allSessions && allSessions.length > 1 && (
          <div className="px-6 py-2.5 bg-slate-50 dark:bg-comic-950/70 border-b border-slate-200 dark:border-comic-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-indigo-600 dark:text-indigo-300 font-bold flex items-center gap-1 shrink-0">
                <Copy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                {t('comicInfo.copyFrom')}
              </span>
              <select
                value={quickCloneSourceId}
                onChange={(e) => setQuickCloneSourceId(e.target.value)}
                disabled={isQuickCloning}
                className="px-2 py-1 rounded-lg bg-white dark:bg-comic-900 border border-slate-300 dark:border-comic-700 text-slate-800 dark:text-white text-xs max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
              >
                <option value="">{t('comicInfo.selectComic')}</option>
                {allSessions
                  .filter((s) => s.session_id !== activeSessionId)
                  .map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.series || s.original_filename} ({s.item_type === 'capitulo' ? 'Cap.' : 'Vol.'} {s.volume || s.number || '1'})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={handleQuickCloneFromOtherSession}
                disabled={!quickCloneSourceId || isQuickCloning}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold transition flex items-center gap-1 active:scale-95 shadow-2xs"
                title={t('comicInfo.copyDataToFormTitle')}
              >
                {isQuickCloning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>{t('comicInfo.copyToThisTomo')}</span>
              </button>
            </div>

            {onOpenCloneModal && (
              <button
                type="button"
                onClick={() => {
                  onSave(formData);
                  onOpenCloneModal(formData);
                }}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-comic-900 hover:bg-slate-100 dark:hover:bg-comic-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-comic-700/80 transition flex items-center gap-1 font-medium active:scale-95 shadow-2xs"
                title={t('comicInfo.saveAndCloneTitle')}
              >
                <Upload className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                <span>{t('comicInfo.cloneToOthers')}</span>
              </button>
            )}
          </div>
        )}

        {/* Status notification banner */}
        {cloneNotification && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-950/80 border border-emerald-600/70 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in duration-200">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
            <span className="font-semibold">{cloneNotification}</span>
          </div>
        )}

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Multiple Marked Sessions Prompt (Batch Update) */}
          {hasMultipleMarked && (
            <div className={`p-3.5 rounded-xl border transition-all ${
              applyToAllMarked 
                ? 'bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-500/40 shadow-md' 
                : 'bg-comic-950/60 border-comic-800'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-white">
                    Tienes {markedSessions.length} cómics marcados en el panel izquierdo
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyToAllMarked}
                    onChange={(e) => setApplyToAllMarked(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-comic-950 cursor-pointer"
                  />
                  <span className="text-xs text-indigo-300 font-bold hover:text-white transition">
                    Aplicar a los {markedSessions.length}
                  </span>
                </label>
              </div>
              <p className="text-[11px] text-slate-300/90 leading-relaxed mt-2">
                {applyToAllMarked ? (
                  <span className="text-amber-200">
                    ⚡ Se guardarán los campos comunes (<strong>Serie, Guionista, Género, Tipo de Lectura, Sinopsis, Editorial</strong>) en los <strong>{markedSessions.length} cómics marcados</strong> a la vez, respetando el volumen, número y páginas de cada uno.
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Activa la casilla si deseas actualizar la información de la serie en todos los cómics marcados a la vez sin tener que abrir cada uno.
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Quick Reading Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
              {t('comicInfo.readingType')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset('manga')}
                className={`px-3 py-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  formData.ReadingDirection === 'rtl'
                    ? 'bg-purple-100 dark:bg-purple-950/80 border-purple-400 dark:border-purple-500 text-purple-900 dark:text-purple-200 shadow-md'
                    : 'bg-slate-50 dark:bg-comic-950/50 border-slate-200 dark:border-comic-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-comic-700 shadow-2xs'
                }`}
              >
                <span>{t('comicInfo.readingManga')}</span>
                <span className="text-[10px] font-normal opacity-80">{t('comicInfo.readingMangaSub')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('webtoon')}
                className={`px-3 py-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  formData.ReadingDirection === 'vertical'
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 border-emerald-400 dark:border-emerald-500 text-emerald-900 dark:text-emerald-200 shadow-md'
                    : 'bg-slate-50 dark:bg-comic-950/50 border-slate-200 dark:border-comic-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-comic-700 shadow-2xs'
                }`}
              >
                <span>{t('comicInfo.readingWebtoon')}</span>
                <span className="text-[10px] font-normal opacity-80">{t('comicInfo.readingWebtoonSub')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('comic')}
                className={`px-3 py-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                  formData.ReadingDirection === 'ltr'
                    ? 'bg-indigo-100 dark:bg-indigo-950/80 border-indigo-400 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-md'
                    : 'bg-slate-50 dark:bg-comic-950/50 border-slate-200 dark:border-comic-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-comic-700 shadow-2xs'
                }`}
              >
                <span>{t('comicInfo.readingComic')}</span>
                <span className="text-[10px] font-normal opacity-80">{t('comicInfo.readingComicSub')}</span>
              </button>
            </div>
          </div>

          {/* Series & Title */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.series')} <span className="text-indigo-500">*</span>
              </label>
              <input
                type="text"
                value={formData.Series || ''}
                onChange={(e) => handleChange('Series', e.target.value)}
                placeholder="ej. Solo Leveling, Bleach"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('comicInfo.number')}
                </label>
                <input
                  type="text"
                  value={formData.Number || ''}
                  onChange={(e) => handleChange('Number', e.target.value)}
                  placeholder={t('comicInfo.placeholderNumber')}
                  disabled={applyToAllMarked}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none disabled:opacity-40 transition shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('comicInfo.volume')}
                </label>
                <input
                  type="number"
                  value={formData.Volume ?? ''}
                  onChange={(e) => handleChange('Volume', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder={t('comicInfo.placeholderVolume')}
                  disabled={applyToAllMarked}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none disabled:opacity-40 transition shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('comicInfo.totalPages')}
                </label>
                <input
                  type="number"
                  value={formData.PageCount || ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-comic-950/50 border border-slate-200 dark:border-comic-800 text-slate-500 dark:text-slate-400 text-xs cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.title')}
              </label>
              <input
                type="text"
                value={formData.Title || ''}
                onChange={(e) => handleChange('Title', e.target.value)}
                placeholder={t('comicInfo.placeholderTitle')}
                disabled={applyToAllMarked}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none disabled:opacity-40 transition shadow-2xs"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('comicInfo.summary')}
            </label>
            <textarea
              rows={3}
              value={formData.Summary || ''}
              onChange={(e) => handleChange('Summary', e.target.value)}
              placeholder={t('comicInfo.placeholderSummary')}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none resize-none transition shadow-2xs"
            />
          </div>

          {/* Creators / Credits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.writer')}
              </label>
              <input
                type="text"
                value={formData.Writer || ''}
                onChange={(e) => handleChange('Writer', e.target.value)}
                placeholder={t('comicInfo.placeholderWriter')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.penciller')}
              </label>
              <input
                type="text"
                value={formData.Penciller || ''}
                onChange={(e) => handleChange('Penciller', e.target.value)}
                placeholder={t('comicInfo.placeholderPenciller')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>
          </div>

          {/* Date & Publisher */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.year')}
              </label>
              <input
                type="number"
                value={formData.Year || ''}
                onChange={(e) => handleChange('Year', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder={t('comicInfo.placeholderYear')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.scanInformation')}
              </label>
              <input
                type="text"
                value={formData.ScanInformation || ''}
                onChange={(e) => handleChange('ScanInformation', e.target.value)}
                placeholder={t('comicInfo.placeholderScan')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.publisher')}
              </label>
              <input
                type="text"
                value={formData.Publisher || ''}
                onChange={(e) => handleChange('Publisher', e.target.value)}
                placeholder={t('comicInfo.placeholderPublisher')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>
          </div>

          {/* Genre & Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.genre')}
              </label>
              <input
                type="text"
                value={formData.Genre || ''}
                onChange={(e) => handleChange('Genre', e.target.value)}
                placeholder={t('comicInfo.placeholderGenre')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('comicInfo.ageRating')}
              </label>
              <select
                value={formData.AgeRating || 'Unknown'}
                onChange={(e) => handleChange('AgeRating', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:outline-none transition shadow-2xs"
              >
                <option value="Unknown">{t('comicInfo.ratingUnknown')}</option>
                <option value="Everyone">{t('comicInfo.ratingEveryone')}</option>
                <option value="Teen">{t('comicInfo.ratingTeen')}</option>
                <option value="Mature 17+">{t('comicInfo.ratingMature')}</option>
                <option value="Adults Only 18+">{t('comicInfo.ratingAdults')}</option>
              </select>
            </div>
          </div>
        </form>

        {/* Drawer Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-comic-950/90 border-t border-slate-200 dark:border-comic-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-comic-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-comic-800 text-xs font-semibold transition"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>
              {applyToAllMarked && hasMultipleMarked
                ? t('comicInfo.saveApplyAll', { count: markedSessions.length })
                : t('comicInfo.saveSingle')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
