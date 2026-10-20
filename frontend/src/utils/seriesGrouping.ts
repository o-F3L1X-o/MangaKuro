import { ComicSessionSummary } from '../types';

export interface SeriesGroup {
  key: string;
  name: string;
  sessions: ComicSessionSummary[];
  totalTomos: number;
  totalChapters: number;
  totalPages: number;
  coverThumb: string | null;
  coverSessionId: string | null;
}

export function cleanSeriesDisplayName(raw?: string): string {
  if (!raw) return 'Sin Serie';
  let s = raw.trim();
  // Fix common Latin-1 encoding artifacts in Spanish
  s = s.replace(/\ufffd/g, 'é');
  // Strip file extension if present (.cbz, .cbr, .cb7, .cbt, .pdf, .epub, .zip, .rar, .7z, .tar)
  s = s.replace(/\.(?:cbz|cbr|cb7|cbt|pdf|epub|zip|rar|7z|tar)$/i, '').trim();
  // Strip any bracketed tags: [Scan], [Web], [15-150], etc.
  s = s.replace(/\[[^\]]*\]/g, ' ').trim();
  // Strip any parenthetical tags: (Digital), (Web), (15 - 150), (v04), etc.
  s = s.replace(/\([^\)]*\)/g, ' ').trim();
  // Strip leading chapter/number prefixes like "131 - ", "132 ", "01. ", "#12 - ", "c01 - "
  s = s.replace(/^\s*(?:c|ch|cap|#)?\s*\d{1,4}(?:\.\d+)?\s*[-_.:\s]\s*/i, '').trim();
  // Strip chapter/volume suffixes with tags like #01, #086-130, Tomo 1, Vol. 2, v4, Cap. 131, c12, etc.
  s = s.replace(/\s*(?:#|v|vol|volume|tomo|c|ch|cap|capitulo|chapter)\.?\s*\d+(?:[-–_]\d+)?.*$/i, '').trim();
  // Strip trailing words like tomo, tomos, vol, volume, volumes, cap, capitulo, capitulos, chapter, chapters
  s = s.replace(/\s+(?:tomo|tomos|vol|volume|volumes|cap|capitulo|capitulos|chapter|chapters|ch)\.?\s*$/i, '').trim();
  // Strip bare number / range suffixes at the end of the series name (e.g. "La Vida Después de la Muerte 131", "Series 01")
  s = s.replace(/\s+\d{1,4}(?:[-–_]\d+)?\s*$/i, '').trim();
  // Strip trailing punctuation
  s = s.replace(/[-_.:]+$/, '').trim();
  // If the remaining string is empty or is purely a chapter/volume number (e.g. "Cap 168", "168", "Tomo 1"), it has no series name
  if (!s || /^(?:c|ch|cap|capitulo|chapter|v|vol|volume|tomo|#)?\s*\d+(?:\.\d+)?$/i.test(s)) {
    return 'Sin Serie';
  }
  return s || 'Sin Serie';
}

export function cleanSeriesKey(raw?: string): string {
  const display = cleanSeriesDisplayName(raw);
  let s = display.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s || 'sin_serie';
}

export function extractSortNumber(item: ComicSessionSummary): number {
  if (item.volume !== undefined && item.volume !== null && item.volume > 0) {
    return item.volume;
  }
  if (item.number) {
    const n = parseFloat(item.number);
    if (!isNaN(n)) return n;
  }
  const match = (item.original_filename || item.title || item.series || '').match(/(\d+(?:\.\d+)?)/);
  if (match) return parseFloat(match[1]);
  return 999999;
}

export function isSessionTomo(item: ComicSessionSummary): boolean {
  if (item.item_type === 'capitulo') return false;
  if (item.item_type === 'tomo') return true;
  return Boolean(item.volume !== undefined && item.volume !== null && item.volume > 0);
}

export function isSessionChapter(item: ComicSessionSummary): boolean {
  return !isSessionTomo(item);
}

export function groupSessionsBySeries(sessions: ComicSessionSummary[]): SeriesGroup[] {
  const map = new Map<string, { name: string; sessions: ComicSessionSummary[] }>();

  // 1. Group sessions by normalized key
  for (const session of sessions) {
    const rawSeries = session.series || session.original_filename;
    const key = cleanSeriesKey(rawSeries);
    const cleanedName = cleanSeriesDisplayName(rawSeries);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name: cleanedName,
        sessions: [session]
      });
    } else {
      existing.sessions.push(session);
      // Prefer display name with proper accents / uppercase
      if (cleanedName.length > existing.name.length || (/[A-ZÁÉÍÓÚÑ]/.test(cleanedName) && !/[A-ZÁÉÍÓÚÑ]/.test(existing.name))) {
        existing.name = cleanedName;
      }
    }
  }

  // 2. Build sorted groups
  const groups: SeriesGroup[] = [];

  for (const [key, val] of map.entries()) {
    // Preserve the order of sessions as provided (preserves manual reordering with arrows and drag&drop)
    const sortedSessions = val.sessions;

    let totalTomos = 0;
    let totalChapters = 0;
    let totalPages = 0;
    let coverThumb: string | null = null;
    let coverSessionId: string | null = null;

    for (const item of sortedSessions) {
      const isTomo = isSessionTomo(item);
      if (isTomo) totalTomos++;
      else totalChapters++;
      totalPages += item.page_count;

      if (!coverThumb && item.cover_thumb) {
        coverThumb = item.cover_thumb;
        coverSessionId = item.session_id;
      }
    }

    // Fallback cover if first didn't have one
    if (!coverThumb && sortedSessions.length > 0) {
      coverThumb = sortedSessions[0].cover_thumb || null;
      coverSessionId = sortedSessions[0].session_id;
    }

    groups.push({
      key,
      name: val.name,
      sessions: sortedSessions,
      totalTomos,
      totalChapters,
      totalPages,
      coverThumb,
      coverSessionId
    });
  }

  // Sort groups alphabetically by series name
  groups.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  return groups;
}
