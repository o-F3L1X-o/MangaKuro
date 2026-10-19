import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  BookOpen,
  Sparkles,
  Layers,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  ImagePlus,
  RefreshCw,
  Loader2,
  Bookmark,
  ChevronRight,
  Info,
  Check,
  Languages
} from 'lucide-react';
import { ComicInfo, OnlineSearchResult, SessionManifest, VolumeCoverItem } from '../types';
import { searchOnlineManga, fetchVolumeCovers, applyOnlineCover, translateOnlineText } from '../api';
import { useTranslation } from '../i18n';

interface OnlineSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionManifest | null;
  defaultQuery?: string;
  onUpdateMetadata: (metadata: ComicInfo) => Promise<any>;
  onCoverApplied?: (updatedManifest: SessionManifest) => void;
}

export const OnlineSearchModal: React.FC<OnlineSearchModalProps> = ({
  isOpen,
  onClose,
  session,
  defaultQuery,
  onUpdateMetadata,
  onCoverApplied
}) => {
  const { t } = useTranslation();

  // Extract initial query from defaultQuery, session Series, or original filename
  const getInitialQuery = useCallback(() => {
    if (defaultQuery && defaultQuery.trim()) {
      return defaultQuery.trim();
    }
    if (!session) return '';
    if (session.metadata.Series && session.metadata.Series.trim()) {
      return session.metadata.Series.trim();
    }
    // Clean common filename parts
    const base = session.original_filename.replace(/\.[^/.]+$/, '');
    return base
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b(vol|v\d+|tomo|cap|ch\d+)\b.*$/i, '')
      .trim();
  }, [session, defaultQuery]);

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'auto' | 'listadomanga' | 'mangaupdates' | 'mangadex' | 'anilist' | 'kitsu' | 'bangumi' | 'openlibrary'>('auto');
  const [targetLang, setTargetLang] = useState<'es' | 'en' | 'ja'>('es');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<OnlineSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Direct cover URL and clipboard paste state
  const [directImageUrl, setDirectImageUrl] = useState('');
  const [isPastingImage, setIsPastingImage] = useState(false);

  // Cover selection action state
  const [pendingCoverTarget, setPendingCoverTarget] = useState<{
    result: OnlineSearchResult;
    coverUrl: string;
    applyMetaToo: boolean;
  } | null>(null);
  const [isApplyingCover, setIsApplyingCover] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Toggle between translated and original synopsis per item
  const [showOriginalFor, setShowOriginalFor] = useState<Record<string, boolean>>({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});

  // Volume covers gallery state
  const [viewingVolumeCoversFor, setViewingVolumeCoversFor] = useState<OnlineSearchResult | null>(null);
  const [volumeCoversList, setVolumeCoversList] = useState<VolumeCoverItem[]>([]);
  const [isLoadingVolumeCovers, setIsLoadingVolumeCovers] = useState(false);

  // Auto-search on open if query exists
  useEffect(() => {
    if (isOpen) {
      const initQ = getInitialQuery();
      setQuery(initQ);
      setResults([]);
      setError(null);
      setDirectImageUrl('');
      setPendingCoverTarget(null);
      setViewingVolumeCoversFor(null);
      if (initQ) {
        performSearch(initQ, sourceFilter, targetLang);
      }
    }
  }, [isOpen, session?.session_id, getInitialQuery]);

  const performSearch = async (searchTerm: string, source: string, lang: 'es' | 'en' | 'ja' = targetLang) => {
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await searchOnlineManga(searchTerm.trim(), source, lang);
      setResults(res);
      if (res.length === 0) {
        setError('No se encontraron resultados para esta búsqueda. Prueba con otro título o cambiando el idioma/fuente.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al conectar con los servicios de búsqueda online.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query, sourceFilter, targetLang);
  };

  const handleSourceTabChange = (newSource: 'auto' | 'listadomanga' | 'mangaupdates' | 'mangadex' | 'anilist' | 'kitsu' | 'bangumi' | 'openlibrary') => {
    setSourceFilter(newSource);
    if (query.trim()) {
      performSearch(query, newSource, targetLang);
    }
  };

  const handleLanguageTabChange = (newLang: 'es' | 'en' | 'ja') => {
    setTargetLang(newLang);
    if (query.trim()) {
      performSearch(query, sourceFilter, newLang);
    }
  };

  // Interactive on-demand translation of synopsis to Spanish with multi-layer fallback
  const handleTranslateSynopsis = async (item: OnlineSearchResult) => {
    const itemKey = `${item.provider}-${item.id}`;
    const textToTranslate = item.synopsis_original || item.synopsis_es;
    if (!textToTranslate || translatingIds[itemKey]) return;

    setTranslatingIds((prev) => ({ ...prev, [itemKey]: true }));
    try {
      let translatedText = '';
      let success = false;

      // 1. Try backend translation
      try {
        const res = await translateOnlineText(textToTranslate, targetLang);
        if (res.success && res.translated) {
          translatedText = res.translated;
          success = true;
        }
      } catch (beErr) {
        console.warn('Backend translation error, falling back to browser translation:', beErr);
      }

      // 2. Client-side browser fallback (uses user's residential IP if Docker container was rate-limited)
      if (!success) {
        try {
          const clientUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate.slice(0, 1500))}`;
          const clientRes = await fetch(clientUrl);
          if (clientRes.ok) {
            const data = await clientRes.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
              translatedText = data[0].map((seg: any) => seg[0]).join('');
              if (translatedText && translatedText.trim() !== textToTranslate.trim()) {
                success = true;
              }
            }
          }
        } catch (clientErr) {
          console.warn('Client-side translation fallback error:', clientErr);
        }
      }

      if (success && translatedText) {
        setResults((prev) =>
          prev.map((r) => {
            if (`${r.provider}-${r.id}` === itemKey) {
              return {
                ...r,
                synopsis_original: r.synopsis_original || r.synopsis_es,
                synopsis_es: translatedText,
                synopsis_was_translated: true,
                synopsis_has_es: true,
                language_status: 'complete',
                language_notice: '✨ Sinopsis traducida al español'
              };
            }
            return r;
          })
        );
      } else {
        setError('No se pudo traducir la sinopsis en este momento. Inténtalo de nuevo.');
      }
    } catch (err: any) {
      setError('No se pudo traducir la sinopsis en este momento. Inténtalo de nuevo.');
    } finally {
      setTranslatingIds((prev) => ({ ...prev, [itemKey]: false }));
    }
  };

  // Direct Cover Application (URL or Base64 Clipboard)
  const handleApplyDirectCover = (imageUrlToUse: string) => {
    if (!imageUrlToUse.trim()) return;
    const mockResult: OnlineSearchResult = {
      id: 'custom_url',
      provider: 'auto' as any,
      provider_label: 'Portada Personalizada / URL Directa',
      title: session?.metadata.Series || session?.original_filename || 'Portada Personalizada',
      synonyms: [],
      synopsis_es: '',
      synopsis_has_es: false,
      status: '',
      status_es: '',
      genres: [],
      authors: [],
      has_volume_covers: false,
      cover_url: imageUrlToUse.trim()
    };
    setPendingCoverTarget({
      result: mockResult,
      coverUrl: imageUrlToUse.trim(),
      applyMetaToo: false
    });
  };

  const handlePasteFromClipboard = async () => {
    try {
      setIsPastingImage(true);
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            handleApplyDirectCover(base64data);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      // If no image blob found, check text
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
        setDirectImageUrl(text.trim());
        handleApplyDirectCover(text.trim());
        return;
      }
      setError('No se encontró ninguna imagen ni enlace en el portapapeles. Copia una imagen o URL primero.');
    } catch (err: any) {
      setError('No se pudo acceder al portapapeles. Puedes pegar el enlace de la imagen manualmente en el campo.');
    } finally {
      setIsPastingImage(false);
    }
  };

  // 1. Apply Metadata only
  const handleApplyMetadata = async (item: OnlineSearchResult) => {
    if (!session) return;
    try {
      const currentMeta = session.metadata || {};

      let chosenTitle: string = item.title || currentMeta.Series || '';
      if (targetLang === 'es') {
        chosenTitle = item.title_spanish || item.title || currentMeta.Series || '';
      } else if (targetLang === 'en') {
        chosenTitle = item.title_english || item.title || currentMeta.Series || '';
      } else {
        chosenTitle = item.title_romaji || item.title || currentMeta.Series || '';
      }

      const allGenres = item.genres && item.genres.length > 0 ? item.genres.join(', ') : currentMeta.Genre;
      const allTags = item.tags && item.tags.length > 0 ? item.tags.join(', ') : (currentMeta.Tags || allGenres);

      const isOriginalShown = showOriginalFor[`${item.provider}-${item.id}`];
      const chosenSummary = (isOriginalShown && item.synopsis_original ? item.synopsis_original : item.synopsis_es) || currentMeta.Summary;

      const updatedMeta: ComicInfo = {
        ...currentMeta,
        Series: chosenTitle || currentMeta.Series,
        AlternateSeries: item.title_english || item.title_romaji || currentMeta.AlternateSeries,
        Summary: chosenSummary,
        Year: item.year ? parseInt(String(item.year)) : currentMeta.Year,
        Genre: allGenres,
        Tags: allTags,
        LanguageISO: targetLang,
        Writer: item.writer || (item.authors && item.authors.length > 0 ? item.authors[0] : currentMeta.Writer),
        Penciller: item.penciller || (item.authors && item.authors.length > 1 ? item.authors[1] : currentMeta.Penciller),
        Publisher: item.publisher || currentMeta.Publisher,
        Imprint: item.imprint || currentMeta.Imprint,
        CommunityRating: item.community_rating ?? currentMeta.CommunityRating
      };

      if (item.volumes) {
        const vNum = parseInt(String(item.volumes));
        if (!isNaN(vNum) && vNum > 0) {
          updatedMeta.Count = vNum;
        }
      }

      await onUpdateMetadata(updatedMeta);
      setSuccessToast(`¡Metadatos de "${updatedMeta.Series}" aplicados con éxito!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Error al aplicar metadatos');
    }
  };

  // 2. Open Cover Mode Dialog
  const handleSelectCoverForApplication = (item: OnlineSearchResult, coverUrl: string, applyMetaToo: boolean) => {
    setPendingCoverTarget({
      result: item,
      coverUrl,
      applyMetaToo
    });
  };

  // 3. Confirm Cover Application with chosen mode (Insert vs Replace)
  const handleConfirmCoverAction = async (mode: 'insert_first' | 'replace_first') => {
    if (!session || !pendingCoverTarget) return;
    setIsApplyingCover(true);
    try {
      // If user chose "Apply Meta Too", apply metadata first
      if (pendingCoverTarget.applyMetaToo) {
        await handleApplyMetadata(pendingCoverTarget.result);
      }

      // Download and apply cover
      const updatedManifest = await applyOnlineCover(session.session_id, {
        image_url: pendingCoverTarget.coverUrl,
        mode: mode,
        custom_name: `${pendingCoverTarget.result.title} - Portada Oficial.jpg`
      });

      onCoverApplied?.(updatedManifest);

      const actionText = mode === 'insert_first' ? 'insertada como página #1' : 'sustituyendo la primera página actual';
      setSuccessToast(`¡Portada oficial ${actionText} con éxito!`);
      setPendingCoverTarget(null);
      setViewingVolumeCoversFor(null);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Error al descargar y aplicar la portada online');
    } finally {
      setIsApplyingCover(false);
    }
  };

  // 4. View Volume Covers
  const handleOpenVolumeCovers = async (item: OnlineSearchResult) => {
    setViewingVolumeCoversFor(item);
    setIsLoadingVolumeCovers(true);
    setVolumeCoversList([]);
    try {
      const covers = await fetchVolumeCovers(item.provider, item.id);
      setVolumeCoversList(covers);
    } catch (err: any) {
      setError('No se pudieron cargar las portadas de los tomos de esta obra.');
    } finally {
      setIsLoadingVolumeCovers(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl max-h-[92vh] bg-comic-950 border border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-comic-900 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Búsqueda Online de Manga & Cómic</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-950 text-purple-300 border border-purple-800 font-mono font-semibold">
                  MangaDex & AniList
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Consulta número de tomos, capítulos, sinopsis y portadas oficiales en español.
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

        {/* Success Toast Banner */}
        {successToast && (
          <div className="px-6 py-2.5 bg-emerald-950/80 border-b border-emerald-800 text-emerald-200 text-xs flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Search Bar & Provider Filter */}
        <div className="p-5 border-b border-comic-800 bg-comic-950/60 space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe el nombre del manga o cómic en español, inglés o japonés..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-comic-900 border border-comic-700 text-white text-xs sm:text-sm focus:border-indigo-500 focus:outline-none transition shadow-inner font-medium"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 shrink-0 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Buscando...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Buscar</span>
                </>
              )}
            </button>
          </form>

          {/* Direct Cover URL or Clipboard Image Paste Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl bg-comic-900/80 border border-comic-800">
            <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 shrink-0 pl-1">
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>Pegar portada directa:</span>
            </div>
            <input
              type="text"
              value={directImageUrl}
              onChange={(e) => setDirectImageUrl(e.target.value)}
              placeholder="Pega enlace de imagen (Viz, Simon & Schuster, Manga-News, Google...)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-comic-950 border border-comic-700 text-white text-xs focus:border-indigo-500 focus:outline-none font-medium"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!directImageUrl.trim()}
                onClick={() => handleApplyDirectCover(directImageUrl)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Usar Portada
              </button>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                disabled={isPastingImage}
                title="Pegar imagen copiada directamente desde el portapapeles (Ctrl+V)"
                className="px-2.5 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 border border-comic-700 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
              >
                {isPastingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>📋 Pegar (Ctrl+V)</span>}
              </button>
            </div>
          </div>

          {/* Controls row: Target Language and Provider Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-comic-800/80">
            {/* Preferred Language Tabs */}
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <span className="text-[11px] font-bold text-slate-300 mr-1 flex items-center gap-1">
                <span>🌐 Idioma:</span>
              </span>
              {[
                { id: 'es', label: '🇪🇸 Español', desc: 'Priorizar títulos y sinopsis oficiales en español' },
                { id: 'en', label: '🇬🇧 English', desc: 'Metadatos en inglés' },
                { id: 'ja', label: '🇯🇵 Romaji / JP', desc: 'Títulos canónicos japoneses' }
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => handleLanguageTabChange(lang.id as any)}
                  title={lang.desc}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border transition cursor-pointer ${
                    targetLang === lang.id
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50 shadow-sm'
                      : 'bg-comic-900 border-comic-800 text-slate-400 hover:text-white hover:border-comic-700'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            {/* Provider Selection Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Fuente:</span>
              {[
                { id: 'auto', label: '⭐ Automático' },
                { id: 'listadomanga', label: '🇪🇸 ListadoManga' },
                { id: 'mangaupdates', label: 'MangaUpdates' },
                { id: 'mangadex', label: 'MangaDex' },
                { id: 'anilist', label: 'AniList' },
                { id: 'kitsu', label: '🦊 Kitsu' },
                { id: 'bangumi', label: '🌸 Bangumi' },
                { id: 'openlibrary', label: 'OpenLibrary' },
              ].map((prov) => (
                <button
                  key={prov.id}
                  type="button"
                  onClick={() => handleSourceTabChange(prov.id as any)}
                  className={`px-2 py-0.5 rounded-lg font-semibold text-[11px] border transition cursor-pointer ${
                    sourceFilter === prov.id
                      ? 'bg-indigo-950 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/40'
                      : 'bg-comic-900 border-comic-800 text-slate-400 hover:text-white hover:border-comic-700'
                  }`}
                >
                  {prov.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Body: Search Results or Volume Covers Gallery */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-400">Consultando bases de datos en español e inglés...</p>
            </div>
          ) : viewingVolumeCoversFor ? (
            /* Volume Covers Gallery View */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between bg-comic-900/60 p-3 rounded-xl border border-comic-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingVolumeCoversFor(null)}
                    className="px-2.5 py-1 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <span>← Volver a resultados</span>
                  </button>
                  <span className="text-xs font-bold text-white truncate max-w-sm">
                    Portadas de: {viewingVolumeCoversFor.title}
                  </span>
                </div>
                <span className="text-[11px] text-purple-300 font-mono">
                  {volumeCoversList.length} portadas disponibles
                </span>
              </div>

              {isLoadingVolumeCovers ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {volumeCoversList.map((cov, idx) => (
                    <div
                      key={idx}
                      className="bg-comic-900 border border-comic-800 rounded-xl overflow-hidden flex flex-col group hover:border-indigo-500/60 transition shadow-md"
                    >
                      <div className="relative aspect-2/3 bg-black/40 overflow-hidden">
                        <img
                          src={cov.cover_url}
                          alt={cov.volume}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-xs text-white font-bold text-[10px] shadow">
                          {cov.volume}
                        </span>
                        {cov.locale_label && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-amber-300 font-semibold text-[9px] shadow">
                            {cov.locale_label}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectCoverForApplication(viewingVolumeCoversFor, cov.cover_url_full || cov.cover_url, false)}
                          className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>Usar Portada</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : results.length > 0 ? (
            /* Results Cards List */
            <div className="space-y-4">
              {results.map((item) => (
                <div
                  key={`${item.provider}-${item.id}`}
                  className="p-4 rounded-xl bg-comic-900/70 border border-comic-800 hover:border-comic-700/80 transition flex flex-col sm:flex-row gap-4 group"
                >
                  {/* Left: Cover Thumbnail */}
                  <div className="w-24 sm:w-28 shrink-0 flex flex-col gap-2">
                    <div className="aspect-2/3 rounded-lg overflow-hidden bg-comic-950 border border-comic-800 relative shadow-md">
                      {item.cover_url ? (
                        <img
                          src={item.cover_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-semibold">
                          Sin Portada
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 text-[9px] text-slate-300 font-mono">
                        {item.provider}
                      </span>
                    </div>

                    {item.has_volume_covers && (
                      <button
                        type="button"
                        onClick={() => handleOpenVolumeCovers(item)}
                        className="w-full py-1 px-1.5 rounded-md bg-purple-950/80 hover:bg-purple-900 border border-purple-800/80 text-purple-300 text-[10px] font-bold transition flex items-center justify-center gap-1"
                        title="Ver portadas individuales de cada tomo"
                      >
                        <Layers className="w-3 h-3 text-purple-400" />
                        <span>Ver por tomos</span>
                      </button>
                    )}
                  </div>

                  {/* Center: Details */}
                  <div className="flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      {/* Provider, Language & Status Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="px-2 py-0.5 rounded bg-comic-800 text-indigo-300 font-semibold text-[10px] border border-comic-700">
                          {item.provider_label}
                        </span>

                        {/* Language Transparency Badge */}
                        {item.language_status === 'complete' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold flex items-center gap-1 shadow-xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>{item.language_notice || 'Completo en Español'}</span>
                          </span>
                        )}
                        {item.language_status === 'partial' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold flex items-center gap-1 shadow-xs">
                            <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="truncate max-w-xs">{item.language_notice || 'Metadatos parciales'}</span>
                          </span>
                        )}
                        {item.language_status === 'missing' && (
                          <span className="px-2 py-0.5 rounded-full bg-comic-800/80 text-slate-400 border border-comic-700 text-[10px] font-medium flex items-center gap-1">
                            <Info className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-xs">{item.language_notice || 'Sin traducción'}</span>
                          </span>
                        )}

                        {item.status_es && (
                          <span className="px-1.5 py-0.5 rounded bg-comic-800 text-slate-300 text-[10px]">
                            {item.status_es}
                          </span>
                        )}
                        {item.year && (
                          <span className="px-1.5 py-0.5 rounded bg-comic-800 text-slate-400 font-mono text-[10px]">
                            {item.year}
                          </span>
                        )}
                      </div>

                      {/* Main Titles */}
                      <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-indigo-300 transition leading-snug">
                        {targetLang === 'es' ? (item.title_spanish || item.title) : (targetLang === 'en' ? (item.title_english || item.title) : (item.title_romaji || item.title))}
                      </h4>
                      {item.title_english && item.title_english !== (item.title_spanish || item.title) && (
                        <p className="text-xs text-slate-400 italic">
                          {item.title_english}
                        </p>
                      )}

                      {/* Creator Roles, Publishers, and Rating */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-300">
                        {(item.writer || item.penciller || item.authors?.length) && (
                          <span className="flex items-center gap-1">
                            <span className="text-slate-400">✍️</span>
                            <span className="text-white font-medium">{item.writer || item.authors?.[0]}</span>
                            {item.penciller && item.penciller !== item.writer && (
                              <span className="text-slate-400 font-normal">• 🎨 {item.penciller}</span>
                            )}
                          </span>
                        )}
                        {item.publisher && (
                          <span className="flex items-center gap-1 text-slate-300">
                            <span>🏛️</span>
                            <span className="font-medium text-slate-200">{item.publisher}</span>
                            {item.imprint && <span className="text-slate-400 font-normal">({item.imprint})</span>}
                          </span>
                        )}
                        {item.community_rating !== undefined && item.community_rating !== null && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-bold text-[10px] flex items-center gap-1">
                            <span>⭐</span>
                            <span>{item.community_rating}/10</span>
                          </span>
                        )}
                      </div>

                      {/* Counter Badges: Volumes & Chapters */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.volumes ? (
                          <div className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-800/80 text-amber-300 font-bold text-xs flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                            <span>{item.volumes} {parseInt(String(item.volumes)) === 1 ? 'Tomo' : 'Tomos'}</span>
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 rounded-md bg-comic-800/80 border border-comic-700 text-slate-400 text-xs">
                            Tomos: En publicación
                          </div>
                        )}

                        {item.chapters && (
                          <div className="px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-800/80 text-purple-300 font-bold text-xs flex items-center gap-1">
                            <Bookmark className="w-3.5 h-3.5 text-purple-400" />
                            <span>{item.chapters} Capítulos</span>
                          </div>
                        )}
                      </div>

                      {/* Tags & Genres Chips */}
                      {(item.tags && item.tags.length > 0 ? item.tags : item.genres).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(item.tags && item.tags.length > 0 ? item.tags : item.genres).slice(0, 8).map((g, i) => (
                            <span key={i} className="px-1.5 py-0.2 rounded bg-comic-950 text-slate-400 text-[10px] border border-comic-800">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Synopsis with Language Badge */}
                      {item.synopsis_es && (
                        <div className="mt-2 bg-comic-950/50 p-2.5 rounded-lg border border-comic-800/60 font-sans space-y-1.5">
                          {item.synopsis_was_translated ? (
                            <div className="flex items-center justify-between text-[11px] pb-1 border-b border-comic-800/40">
                              <span className="text-indigo-400 font-semibold flex items-center gap-1.5">
                                <Languages className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span>Traducido automáticamente al español</span>
                              </span>
                              {item.synopsis_original && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const itemKey = `${item.provider}-${item.id}`;
                                    setShowOriginalFor(prev => ({
                                      ...prev,
                                      [itemKey]: !prev[itemKey]
                                    }));
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-indigo-300 font-medium underline transition cursor-pointer"
                                >
                                  {showOriginalFor[`${item.provider}-${item.id}`] ? 'Ver traducción' : 'Ver original'}
                                </button>
                              )}
                            </div>
                          ) : targetLang === 'es' ? (
                            <div className="flex items-center justify-between text-[11px] pb-1 border-b border-comic-800/40">
                              <span className="text-amber-400/90 text-[10px] font-medium flex items-center gap-1">
                                <span>🌐 Sinopsis en idioma original</span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTranslateSynopsis(item);
                                }}
                                disabled={translatingIds[`${item.provider}-${item.id}`]}
                                className="px-2 py-0.5 rounded bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs disabled:opacity-50"
                                title="Traducir esta sinopsis al español automáticamente"
                              >
                                {translatingIds[`${item.provider}-${item.id}`] ? (
                                  <>
                                    <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                                    <span>Traduciendo...</span>
                                  </>
                                ) : (
                                  <>
                                    <Languages className="w-3 h-3 text-indigo-400" />
                                    <span>Traducir al español</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : null}
                          <p className="text-xs text-slate-300/90 leading-relaxed line-clamp-3">
                            {showOriginalFor[`${item.provider}-${item.id}`] && item.synopsis_original
                              ? item.synopsis_original
                              : item.synopsis_es}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions Toolbar */}
                    <div className="pt-2 border-t border-comic-800/60 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyMetadata(item)}
                        className="px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 text-xs font-semibold border border-comic-700 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Aplicar Metadatos</span>
                      </button>

                      {item.cover_url && (
                        <button
                          type="button"
                          onClick={() => handleSelectCoverForApplication(item, item.cover_url!, false)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <ImagePlus className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Usar Portada</span>
                        </button>
                      )}

                      {item.cover_url && (
                        <button
                          type="button"
                          onClick={() => handleSelectCoverForApplication(item, item.cover_url!, true)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <span>⚡ Aplicar Todo</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center space-y-3 text-slate-500">
              <Search className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-xs font-medium">
                Escribe el título de una obra para buscar tomos, capítulos y portadas oficiales.
              </p>
            </div>
          )}
        </div>

        {/* Modal Prompt: Choice between "Insertar como portada al inicio" or "Sustituir la primera página" */}
        {pendingCoverTarget && (
          <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div 
              className="w-full max-w-md bg-comic-900 border border-comic-700 rounded-2xl p-5 shadow-2xl space-y-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto flex items-center justify-center">
                <ImagePlus className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-white">¿Cómo deseas aplicar esta portada?</h4>
                <p className="text-xs text-slate-300 mt-1">
                  Elige si deseas conservarla como nueva página inicial o reemplazar la existente:
                </p>
              </div>

              {/* Cover Preview Thumbnail */}
              <div className="w-24 h-36 mx-auto rounded-lg overflow-hidden border border-comic-700 shadow-md">
                <img
                  src={pendingCoverTarget.coverUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 pt-1">
                {/* Mode 1: Insert as Page #1 */}
                <button
                  type="button"
                  disabled={isApplyingCover}
                  onClick={() => handleConfirmCoverAction('insert_first')}
                  className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-start gap-3 transition shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-white/20">
                    <ImagePlus className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div>➕ Añadir como Nueva Portada (Insertar al inicio)</div>
                    <div className="text-[10px] text-indigo-200 font-normal">Recomendado si el archivo empieza directo en el capítulo sin portada.</div>
                  </div>
                </button>

                {/* Mode 2: Replace Page #1 */}
                <button
                  type="button"
                  disabled={isApplyingCover}
                  onClick={() => handleConfirmCoverAction('replace_first')}
                  className="p-3 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-200 border border-comic-700 text-xs font-bold flex items-center justify-start gap-3 transition cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-comic-700">
                    <RefreshCw className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <div>🔄 Sustituir la Primera Página Actual</div>
                    <div className="text-[10px] text-slate-400 font-normal">Reemplaza la página #1 actual (útil si tiene baja calidad o créditos).</div>
                  </div>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setPendingCoverTarget(null)}
                  disabled={isApplyingCover}
                  className="px-4 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs font-semibold transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3.5 bg-comic-900 border-t border-comic-800 flex items-center justify-between text-xs text-slate-400">
          <span>Fuente activa: <strong className="text-white">{sourceFilter.toUpperCase()}</strong></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 font-semibold transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
