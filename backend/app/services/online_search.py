import json
import logging
import re
import threading
import urllib.parse
import urllib.request
import difflib
import unicodedata
import concurrent.futures
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("online_search")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MangaKuro/0.9.5",
    "Accept": "application/json"
}

_TRANSLATION_CACHE: Dict[str, str] = {}
_TRANSLATION_LOCK = threading.Lock()

def translate_to_language(text: str, target_lang: str = "es") -> str:
    """
    Translates text to target language using Google Translate free endpoint.
    Maintains an in-memory cache and splits into safe paragraph chunks.
    Falls back gracefully to the original text if offline or unreachable.
    """
    if not text or not text.strip():
        return ""

    clean = re.sub(r"<br\s*/?>", "\n", text)
    clean = re.sub(r"<.*?>", "", clean)
    clean = re.sub(r"\[.*?\]\(.*?\)", "", clean).strip()
    if not clean:
        return ""

    target = (target_lang or "es").lower()
    if target in ("es", "es-la", "es-es"):
        tl = "es"
    elif target in ("en", "en-us"):
        tl = "en"
    elif target in ("ja", "ja-ro"):
        tl = "ja"
    else:
        tl = target

    cache_key = f"{tl}:{hash(clean)}"
    with _TRANSLATION_LOCK:
        if cache_key in _TRANSLATION_CACHE:
            return _TRANSLATION_CACHE[cache_key]

    paragraphs = clean.split("\n")
    chunks = []
    current_chunk = ""
    for p in paragraphs:
        if len(current_chunk) + len(p) < 1200:
            current_chunk += ("\n" if current_chunk else "") + p
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = p
    if current_chunk:
        chunks.append(current_chunk)

    translated_chunks = []
    for chunk in chunks[:4]:
        try:
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={tl}&dt=t&q=" + urllib.parse.quote(chunk)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                res_text = "".join([seg[0] for seg in data[0] if seg and seg[0]])
                translated_chunks.append(res_text)
        except Exception as e:
            logger.debug(f"Translation chunk error: {e}")
            translated_chunks.append(chunk)

    result = "\n\n".join(translated_chunks).strip()
    with _TRANSLATION_LOCK:
        if len(_TRANSLATION_CACHE) > 500:
            _TRANSLATION_CACHE.clear()
        _TRANSLATION_CACHE[cache_key] = result
    return result

def normalize_text(text: str) -> str:
    if not text:
        return ""
    t = text.lower()
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"\b(tomo|volume|vol|capitulo|cap|chapter|ch)\s*\d*\b", "", t)
    return " ".join(t.split())

def compute_title_similarity(query: str, title: str) -> float:
    q_norm = normalize_text(query)
    t_norm = normalize_text(title)
    if not q_norm or not t_norm:
        return 0.0
    if q_norm == t_norm:
        return 1.0
    if q_norm in t_norm:
        return max(0.8, len(q_norm) / len(t_norm))
    if t_norm in q_norm:
        return max(0.75, len(t_norm) / len(q_norm))

    q_words = set(q_norm.split())
    t_words = set(t_norm.split())
    if not q_words or not t_words:
        return 0.0

    stopwords = {"the", "a", "an", "el", "la", "los", "las", "un", "una", "de", "del", "no", "of", "and", "y"}
    meaningful_q_words = q_words - stopwords or q_words
    meaningful_t_words = t_words - stopwords or t_words

    common = meaningful_q_words & meaningful_t_words
    if not common:
        fuzzy_common = 0
        for qw in meaningful_q_words:
            if any(difflib.SequenceMatcher(None, qw, tw).ratio() >= 0.82 for tw in meaningful_t_words):
                fuzzy_common += 1
        if fuzzy_common == 0:
            return 0.0
        word_match_ratio = fuzzy_common / len(meaningful_q_words)
    else:
        word_match_ratio = len(common) / len(meaningful_q_words)

    seq_ratio = difflib.SequenceMatcher(None, q_norm, t_norm).ratio()
    return max(word_match_ratio * 0.85, seq_ratio)

def compute_item_similarity(query: str, item: Dict[str, Any]) -> float:
    candidate_titles = [item.get("title")]
    if item.get("title_english"): candidate_titles.append(item["title_english"])
    if item.get("title_spanish"): candidate_titles.append(item["title_spanish"])
    if item.get("title_romaji"): candidate_titles.append(item["title_romaji"])
    for syn in (item.get("synonyms") or []):
        if syn: candidate_titles.append(syn)

    sims = [compute_title_similarity(query, ct) for ct in candidate_titles if ct]
    return max(sims, default=0.0)

GENRE_TRANSLATIONS = {
    "Action": "Acción",
    "Adventure": "Aventura",
    "Comedy": "Comedia",
    "Drama": "Drama",
    "Fantasy": "Fantasía",
    "Horror": "Terror",
    "Mystery": "Misterio",
    "Psychological": "Psicológico",
    "Romance": "Romance",
    "Sci-Fi": "Ciencia Ficción",
    "Slice of Life": "Recuentos de la vida",
    "Supernatural": "Sobrenatural",
    "Thriller": "Suspense",
    "Isekai": "Isekai",
    "Reincarnation": "Reencarnación",
    "Magic": "Magia",
    "Martial Arts": "Artes Marciales",
    "Historical": "Histórico",
    "School": "Escolar",
    "Sports": "Deportes",
    "Mecha": "Mecha",
    "Music": "Música",
    "Demons": "Demonios",
    "Vampire": "Vampiros",
    "Military": "Militar",
    "Shounen": "Shōnen",
    "Seinen": "Seinen",
    "Shoujo": "Shōjo",
    "Josei": "Josei",
    "Webtoon": "Webtoon",
    "Monster Girls": "Chicas Monstruo"
}

def translate_genre(g: str) -> str:
    return GENRE_TRANSLATIONS.get(g, g)

FRENCH_EXCLUSIONS = {"moi", "quand", "je", "dans", "avec", "cette", "mon", "ma", "mes", "du", "au", "aux", "pourquoi", "est", "réincarne", "reincarne"}
GERMAN_EXCLUSIONS = {"der", "die", "das", "und", "ein", "eine", "einer", "nicht", "dem", "den", "tagebücher"}
ITALIAN_EXCLUSIONS = {"sono", "reincarnato", "nella", "nello", "degli", "delle", "della", "attacco", "giganti"}
POLISH_EXCLUSIONS = {"atak", "tytanow", "tytanów", "nie", "jest", "dla", "sie", "się", "jak", "do", "ze", "na", "po", "od"}
SPANISH_KEYWORDS = {"el", "la", "los", "las", "un", "una", "del", "que", "por", "para", "con", "en", "como", "vez", "aquella", "mundo", "vida", "reencarnado", "reencarné", "reencarnación", "tiempo", "cuando", "hombre", "otra", "otro"}

def is_likely_spanish_title(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    words = set(re.findall(r"\b[a-záéíóúñü]+\b", lower))
    if words & FRENCH_EXCLUSIONS or words & GERMAN_EXCLUSIONS or words & ITALIAN_EXCLUSIONS or words & POLISH_EXCLUSIONS:
        return False
    if any(c in lower for c in "áéíóúñ"):
        return True
    if words & SPANISH_KEYWORDS and not (words & {"the", "of", "and", "is", "that", "this", "to", "for"}):
        return True
    return False

def compute_language_status(
    target_lang: str,
    has_title_in_target: bool,
    has_synopsis_in_target: bool,
    target_title_val: Optional[str] = None,
    fallback_title_val: Optional[str] = None,
    synopsis_was_translated: bool = False
) -> Tuple[str, str]:
    """
    Computes (language_status, language_notice) for complete user clarity.
    Status: 'complete' | 'partial' | 'missing'
    Notice: Human-readable badge text in Spanish.
    """
    target = (target_lang or "es").lower()

    if target in ("es", "es-la", "es-es"):
        if synopsis_was_translated:
            if has_title_in_target:
                return "complete", "✅ Metadatos en español (Sinopsis traducida)"
            fb = f" (usando '{fallback_title_val}')" if fallback_title_val else ""
            return "complete", f"✨ Sinopsis traducida al español{fb}"
        elif has_title_in_target and has_synopsis_in_target:
            return "complete", "✅ Metadatos completos en Español"
        elif has_title_in_target and not has_synopsis_in_target:
            return "partial", "🟡 Título en español encontrado. Sinopsis solo disponible en inglés."
        elif not has_title_in_target and has_synopsis_in_target:
            fb = f" (usando '{fallback_title_val}')" if fallback_title_val else ""
            return "partial", f"🟡 Sinopsis oficial en español. Título en español no disponible en BBDD{fb}."
        else:
            fb = f" (mostrando '{fallback_title_val}')" if fallback_title_val else ""
            return "missing", f"⚪ Sin traducción al español en las BBDD{fb}. Datos canónicos en inglés/romaji."
    elif target in ("en", "en-us"):
        if has_title_in_target and has_synopsis_in_target:
            return "complete", "✅ Metadata complete in English"
        elif has_title_in_target or has_synopsis_in_target:
            return "partial", "🟡 Partial English metadata"
        else:
            return "missing", "⚪ English metadata not found (using canonical Romaji)."
    else:
        # ja / other
        if has_title_in_target:
            return "complete", "✅ Título en japonés/romaji disponible."
        return "partial", "⚪ Título en idioma original con sinopsis en inglés."

def search_mangadex(query: str, limit: int = 8, target_lang: str = "es") -> List[Dict[str, Any]]:
    """
    Searches MangaDex for manga titles, extracting localized synopsis, alternate titles,
    creator roles (Author -> Writer, Artist -> Penciller), status, volume and chapter counts,
    and high-quality cover art.
    """
    results = []
    target = (target_lang or "es").lower()

    try:
        url = (
            f"https://api.mangadex.org/manga?title={urllib.parse.quote(query)}"
            f"&limit={limit}&includes[]=cover_art&includes[]=author&includes[]=artist"
            f"&excludedTags[]=b13b2a48-c720-44a9-9c77-39c9979373fb"
            f"&order[followedCount]=desc"
        )
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8")).get("data", [])

        for item in data:
            m_id = item.get("id")
            attrs = item.get("attributes", {})

            # 1. Titles extraction
            raw_title = attrs.get("title", {})
            title_main = raw_title.get("en") or raw_title.get("ja") or next(iter(raw_title.values()), "")

            title_es = None
            title_en = raw_title.get("en")
            title_ja = raw_title.get("ja-ro") or raw_title.get("ja")

            alt_titles = attrs.get("altTitles", [])
            synonyms_list = []
            for alt in alt_titles:
                for lang_code, val in alt.items():
                    if lang_code in ("es", "es-la") and not title_es:
                        title_es = val
                    if lang_code == "en" and not title_en:
                        title_en = val
                    if lang_code in ("ja", "ja-ro") and not title_ja:
                        title_ja = val
                    if val and val not in synonyms_list:
                        synonyms_list.append(val)

            # 2. Descriptions
            desc_map = attrs.get("description", {})
            desc_es = desc_map.get("es") or desc_map.get("es-la")
            desc_en = desc_map.get("en", "")
            desc_ja = desc_map.get("ja", "")

            # Determine title & synopsis based on requested target_lang
            synopsis_was_translated = False
            raw_original_synopsis = desc_en or desc_ja or ""
            if target in ("es", "es-la"):
                chosen_title = title_es or title_en or title_main
                has_title_target = bool(title_es)
                if desc_es:
                    chosen_synopsis = desc_es
                    has_synopsis_target = True
                elif desc_en:
                    translated = translate_to_language(desc_en, "es")
                    if translated and translated != desc_en:
                        chosen_synopsis = translated
                        synopsis_was_translated = True
                        has_synopsis_target = True
                    else:
                        chosen_synopsis = desc_en
                        has_synopsis_target = False
                else:
                    chosen_synopsis = ""
                    has_synopsis_target = False
            elif target in ("en", "en-us"):
                chosen_title = title_en or title_main
                chosen_synopsis = desc_en
                has_title_target = bool(title_en)
                has_synopsis_target = bool(desc_en)
            else:
                chosen_title = title_ja or title_main
                chosen_synopsis = desc_ja or desc_en
                has_title_target = bool(title_ja)
                has_synopsis_target = bool(desc_ja)

            # Clean markdown/HTML links in description
            if chosen_synopsis:
                chosen_synopsis = re.sub(r"\[.*?\]\(.*?\)", "", chosen_synopsis)
                chosen_synopsis = re.sub(r"[*_~`]", "", chosen_synopsis).strip()

            lang_status, lang_notice = compute_language_status(
                target_lang=target,
                has_title_in_target=has_title_target,
                has_synopsis_in_target=has_synopsis_target,
                target_title_val=title_es if target.startswith("es") else title_en,
                fallback_title_val=title_main,
                synopsis_was_translated=synopsis_was_translated
            )

            # 3. Status
            raw_status = attrs.get("status", "")
            status_map = {
                "ongoing": "En emisión",
                "completed": "Finalizado",
                "hiatus": "En pausa",
                "cancelled": "Cancelado"
            }
            status_es = status_map.get(raw_status, raw_status.capitalize() if raw_status else "Desconocido")

            # 4. Covers
            cover_url = None
            for rel in item.get("relationships", []):
                if rel.get("type") == "cover_art":
                    cover_fn = rel.get("attributes", {}).get("fileName")
                    if cover_fn:
                        cover_url = f"https://uploads.mangadex.org/covers/{m_id}/{cover_fn}.512.jpg"
                    break

            # 5. Authors & Artists (ComicInfo role mapping: Writer & Penciller)
            writers = []
            pencillers = []
            all_authors = []
            for rel in item.get("relationships", []):
                rtype = rel.get("type")
                rname = rel.get("attributes", {}).get("name")
                if rname:
                    if rname not in all_authors:
                        all_authors.append(rname)
                    if rtype == "author" and rname not in writers:
                        writers.append(rname)
                    elif rtype == "artist" and rname not in pencillers:
                        pencillers.append(rname)

            writer_val = writers[0] if writers else (all_authors[0] if all_authors else "")
            penciller_val = pencillers[0] if pencillers else (all_authors[1] if len(all_authors) > 1 else "")

            # 6. Tags/Genres
            tags = []
            for tag in attrs.get("tags", []):
                tname = tag.get("attributes", {}).get("name", {}).get("en")
                if tname:
                    tags.append(translate_genre(tname))

            # 7. Volume and chapter counts
            last_vol = attrs.get("lastVolume")
            last_ch = attrs.get("lastChapter")

            results.append({
                "id": m_id,
                "provider": "mangadex",
                "provider_label": "MangaDex (Scanlation / ES)",
                "title": chosen_title,
                "title_spanish": title_es,
                "title_english": title_en,
                "title_romaji": title_ja or title_main,
                "target_lang": target,
                "has_title_in_language": has_title_target,
                "has_synopsis_in_language": has_synopsis_target,
                "synopsis_original": raw_original_synopsis,
                "synopsis_was_translated": synopsis_was_translated,
                "language_status": lang_status,
                "language_notice": lang_notice,
                "synonyms": synonyms_list[:8],
                "synopsis_es": chosen_synopsis or "",
                "synopsis_has_es": bool(desc_es or synopsis_was_translated),
                "volumes": last_vol if last_vol and str(last_vol).strip() else None,
                "chapters": last_ch if last_ch and str(last_ch).strip() else None,
                "status": raw_status,
                "status_es": status_es,
                "year": attrs.get("year"),
                "genres": tags[:8],
                "tags": tags[:12],
                "authors": all_authors,
                "writer": writer_val,
                "penciller": penciller_val,
                "cover_url": cover_url,
                "has_volume_covers": True
            })

    except Exception as e:
        logger.warning(f"Error fetching from MangaDex: {e}")

    return results

def get_mangadex_volume_covers(manga_id: str, limit: int = 36) -> List[Dict[str, Any]]:
    """Fetches volume-specific covers for a MangaDex manga ID."""
    covers = []
    try:
        url = f"https://api.mangadex.org/cover?manga[]={manga_id}&limit={limit}&order[volume]=asc"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8")).get("data", [])

        for c in data:
            fn = c.get("attributes", {}).get("fileName")
            vol = c.get("attributes", {}).get("volume")
            desc = c.get("attributes", {}).get("description")
            if fn:
                covers.append({
                    "volume": f"Tomo {vol}" if vol else "Portada Alternativa",
                    "volume_number": vol,
                    "cover_url": f"https://uploads.mangadex.org/covers/{manga_id}/{fn}.512.jpg",
                    "cover_url_full": f"https://uploads.mangadex.org/covers/{manga_id}/{fn}",
                    "description": desc or ""
                })
    except Exception as e:
        logger.warning(f"Error fetching MangaDex volume covers for {manga_id}: {e}")

    return covers

def search_anilist(query: str, limit: int = 6, target_lang: str = "es") -> List[Dict[str, Any]]:
    """
    Searches AniList GraphQL API for exact volume counts, chapter counts,
    and ultra high-resolution official cover art.
    """
    results = []
    target = (target_lang or "es").lower()

    gql_query = """
    query ($search: String, $limit: Int) {
      Page(page: 1, perPage: $limit) {
        media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
          id
          title {
            romaji
            english
            native
            userPreferred
          }
          synonyms
          volumes
          chapters
          status
          description(asHtml: false)
          genres
          countryOfOrigin
          startDate {
            year
          }
          coverImage {
            extraLarge
            large
          }
          staff(perPage: 6) {
            edges {
              role
              node {
                name {
                  full
                }
              }
            }
          }
        }
      }
    }
    """
    try:
        body = json.dumps({"query": gql_query, "variables": {"search": query, "limit": limit}}).encode("utf-8")
        req = urllib.request.Request(
            "https://graphql.anilist.co",
            data=body,
            headers={**HEADERS, "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=7) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            items = data.get("data", {}).get("Page", {}).get("media", [])

        for item in items:
            t = item.get("title", {})
            romaji = t.get("romaji", "")
            english = t.get("english", "")
            native = t.get("native", "")
            user_pref = t.get("userPreferred", "")

            raw_status = item.get("status", "")
            status_map = {
                "FINISHED": "Finalizado",
                "RELEASING": "En emisión",
                "NOT_YET_RELEASED": "Próximamente",
                "CANCELLED": "Cancelado",
                "HIATUS": "En pausa"
            }
            status_es = status_map.get(raw_status, raw_status)

            raw_desc = item.get("description", "")
            if raw_desc:
                raw_desc = re.sub(r"<br\s*/?>", "\n", raw_desc)
                raw_desc = re.sub(r"<.*?>", "", raw_desc).strip()

            synonyms = item.get("synonyms", [])
            title_es = next((s for s in synonyms if is_likely_spanish_title(s)), None)

            # ComicInfo creator role mapping
            writers = []
            pencillers = []
            all_staff = []
            for edge in item.get("staff", {}).get("edges", []):
                role = (edge.get("role") or "").lower()
                aname = edge.get("node", {}).get("name", {}).get("full")
                if aname:
                    if aname not in all_staff:
                        all_staff.append(aname)
                    if any(w in role for w in ("story", "original creator", "writer", "author")) and aname not in writers:
                        writers.append(aname)
                    elif any(a in role for a in ("art", "illustration", "artist", "penciller")) and aname not in pencillers:
                        pencillers.append(aname)

            writer_val = writers[0] if writers else (all_staff[0] if all_staff else "")
            penciller_val = pencillers[0] if pencillers else (all_staff[1] if len(all_staff) > 1 else "")

            genres = [translate_genre(g) for g in item.get("genres", [])]
            cover = item.get("coverImage", {}).get("extraLarge") or item.get("coverImage", {}).get("large")

            synopsis_was_translated = False
            raw_original_synopsis = raw_desc or ""
            if target in ("es", "es-la"):
                chosen_title = title_es or english or romaji or user_pref
                has_title_target = bool(title_es)
                if raw_desc:
                    translated = translate_to_language(raw_desc, "es")
                    if translated and translated != raw_desc:
                        chosen_synopsis = translated
                        synopsis_was_translated = True
                        has_synopsis_target = True
                    else:
                        chosen_synopsis = raw_desc
                        has_synopsis_target = False
                else:
                    chosen_synopsis = ""
                    has_synopsis_target = False
            elif target in ("en", "en-us"):
                chosen_title = english or romaji or user_pref
                chosen_synopsis = raw_desc
                has_title_target = bool(english)
                has_synopsis_target = bool(raw_desc)
            else:
                chosen_title = romaji or native or user_pref
                chosen_synopsis = raw_desc
                has_title_target = bool(romaji or native)
                has_synopsis_target = False

            lang_status, lang_notice = compute_language_status(
                target_lang=target,
                has_title_in_target=has_title_target,
                has_synopsis_in_target=has_synopsis_target,
                target_title_val=title_es if target.startswith("es") else english,
                fallback_title_val=romaji or english or user_pref,
                synopsis_was_translated=synopsis_was_translated
            )

            results.append({
                "id": str(item.get("id")),
                "provider": "anilist",
                "provider_label": "AniList (Oficial)",
                "title": chosen_title,
                "title_spanish": title_es,
                "title_english": english,
                "title_romaji": romaji,
                "target_lang": target,
                "has_title_in_language": has_title_target,
                "has_synopsis_in_language": has_synopsis_target,
                "synopsis_original": raw_original_synopsis,
                "synopsis_was_translated": synopsis_was_translated,
                "language_status": lang_status,
                "language_notice": lang_notice,
                "synonyms": synonyms[:8],
                "synopsis_es": chosen_synopsis or "",
                "synopsis_has_es": bool(chosen_synopsis),
                "volumes": item.get("volumes"),
                "chapters": item.get("chapters"),
                "status": raw_status,
                "status_es": status_es,
                "year": item.get("startDate", {}).get("year"),
                "genres": genres[:8],
                "tags": genres[:12],
                "authors": all_staff[:4],
                "writer": writer_val,
                "penciller": penciller_val,
                "cover_url": cover,
                "has_volume_covers": False
            })

    except Exception as e:
        logger.warning(f"Error fetching from AniList: {e}")

    return results

def search_openlibrary(query: str, limit: int = 5, target_lang: str = "es") -> List[Dict[str, Any]]:
    """
    Searches Open Library for Western comics, graphic novels, and Spanish editions.
    """
    results = []
    try:
        url = f"https://openlibrary.org/search.json?q={urllib.parse.quote(query)}&limit={limit}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8")).get("docs", [])

        for doc in data:
            cover_i = doc.get("cover_i")
            cover_url = f"https://covers.openlibrary.org/b/id/{cover_i}-L.jpg" if cover_i else None

            publish_year = doc.get("first_publish_year")
            authors = doc.get("author_name", [])
            publisher = doc.get("publisher", [""])[0] if doc.get("publisher") else ""

            results.append({
                "id": doc.get("key", "").replace("/works/", ""),
                "provider": "openlibrary",
                "provider_label": "Open Library (Cómic / Libros)",
                "title": doc.get("title", ""),
                "title_spanish": doc.get("title", ""),
                "title_english": doc.get("title", ""),
                "title_romaji": None,
                "target_lang": target_lang,
                "has_title_in_language": True,
                "has_synopsis_in_language": True,
                "language_status": "complete",
                "language_notice": "✅ Edición registrada en Open Library",
                "synonyms": [],
                "synopsis_original": f"Editorial: {publisher}. Año de edición: {publish_year}." if publisher else "",
                "synopsis_was_translated": False,
                "synopsis_es": f"Editorial: {publisher}. Año de edición: {publish_year}." if publisher else "",
                "synopsis_has_es": True,
                "volumes": None,
                "chapters": None,
                "status": "published",
                "status_es": "Publicado",
                "year": publish_year,
                "genres": ["Cómic"],
                "tags": ["Cómic"],
                "authors": authors[:3],
                "writer": authors[0] if authors else "",
                "publisher": publisher,
                "cover_url": cover_url,
                "has_volume_covers": False
            })
    except Exception as e:
        logger.warning(f"Error fetching from OpenLibrary: {e}")

    return results

def search_mangaupdates(query: str, limit: int = 6, target_lang: str = "es") -> List[Dict[str, Any]]:
    """
    Searches MangaUpdates API with comprehensive ComicInfo metadata mapping:
    - Author -> Writer, Artist -> Penciller
    - Original Publisher -> Publisher, Localized Publisher -> Imprint
    - Bayesian Rating -> CommunityRating
    - Categories -> Tags
    - Associated titles -> Spanish title detection
    - Accurate ongoing volume and chapter status
    """
    results = []
    target = (target_lang or "es").lower()

    try:
        url = "https://api.mangaupdates.com/v1/series/search"
        body = json.dumps({"search": query, "stype": "title", "perpage": limit * 2}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={**HEADERS, "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            hits = data.get("results", [])

        # Filter out Doujinshis unless no other hits exist
        filtered_hits = [h for h in hits if h.get("record", {}).get("type") != "Doujinshi"]
        if not filtered_hits:
            filtered_hits = hits

        for h in filtered_hits[:limit]:
            rec = h.get("record", {})
            sid = rec.get("series_id")
            title = rec.get("title", "")
            img_data = rec.get("image", {}) or {}
            cover_url = (img_data.get("url") or {}).get("original")

            status_es = "Desconocido"
            status_code = "UNKNOWN"
            vols = None
            latest_ch = rec.get("latest_chapter")
            desc = rec.get("description", "")
            authors_list = []
            writers = []
            pencillers = []
            original_publisher = None
            imprint_publisher = None
            community_rating = None
            categories_tags = []
            associated_titles = []
            title_es = None

            try:
                det_req = urllib.request.Request(
                    f"https://api.mangaupdates.com/v1/series/{sid}",
                    headers=HEADERS
                )
                with urllib.request.urlopen(det_req, timeout=5) as det_resp:
                    det = json.loads(det_resp.read().decode("utf-8"))

                    # Status & volumes
                    raw_status = det.get("status") or ""
                    vol_m = re.search(r"(\d+)\s+Volume", raw_status, re.IGNORECASE)
                    if vol_m:
                        vols = int(vol_m.group(1))

                    if "complete" in raw_status.lower():
                        status_es = "Finalizado"
                        status_code = "FINISHED"
                    elif "ongoing" in raw_status.lower():
                        status_es = "En emisión"
                        status_code = "RELEASING"
                    elif "hiatus" in raw_status.lower():
                        status_es = "En pausa"
                        status_code = "HIATUS"
                    elif "cancel" in raw_status.lower():
                        status_es = "Cancelado"
                        status_code = "CANCELLED"

                    if det.get("latest_chapter"):
                        latest_ch = det.get("latest_chapter")
                    if det.get("description"):
                        desc = det.get("description")

                    # Creator role mapping: Author -> Writer, Artist -> Penciller
                    for a in det.get("authors", []):
                        aname = a.get("name")
                        atype = (a.get("type") or "").lower()
                        if aname:
                            if aname not in authors_list:
                                authors_list.append(aname)
                            if atype in ("author", "story") and aname not in writers:
                                writers.append(aname)
                            elif atype in ("artist", "art") and aname not in pencillers:
                                pencillers.append(aname)

                    # Publishers mapping (Original -> Publisher, Localized -> Imprint)
                    for pub in det.get("publishers", []):
                        pname = pub.get("publisher_name")
                        ptype = (pub.get("type") or "").lower()
                        if pname:
                            if ptype == "original" and not original_publisher:
                                original_publisher = pname
                            elif ptype in ("spanish", "english") and not imprint_publisher:
                                imprint_publisher = pname

                    # Bayesian rating
                    if det.get("bayesian_rating") is not None:
                        try:
                            community_rating = round(float(det["bayesian_rating"]), 1)
                        except Exception:
                            pass

                    # Categories / Tags
                    cats = det.get("categories", [])
                    # Sort categories by net votes
                    cats_sorted = sorted(cats, key=lambda c: c.get("votes_plus", 0) - c.get("votes_minus", 0), reverse=True)
                    for c in cats_sorted[:12]:
                        cname = c.get("category")
                        if cname and cname not in categories_tags:
                            categories_tags.append(cname)

                    # Associated titles & Spanish detection
                    for assoc in det.get("associated", []):
                        atitle = assoc.get("title")
                        if atitle:
                            associated_titles.append(atitle)
                            if not title_es and is_likely_spanish_title(atitle):
                                title_es = atitle

            except Exception as det_err:
                logger.debug(f"MangaUpdates details error for {sid}: {det_err}")

            if desc:
                desc = re.sub(r"<.*?>", "", desc)
                desc = re.sub(r"\[.*?\]\(.*?\)", "", desc).strip()

            genres = [translate_genre(g.get("genre")) for g in rec.get("genres", []) if g.get("genre")]
            all_tags = genres + [c for c in categories_tags if c not in genres]

            writer_val = writers[0] if writers else (authors_list[0] if authors_list else "")
            penciller_val = pencillers[0] if pencillers else (authors_list[1] if len(authors_list) > 1 else "")

            # Title and language resolution
            synopsis_was_translated = False
            raw_original_synopsis = desc or ""
            if target in ("es", "es-la"):
                chosen_title = title_es or title
                has_title_target = bool(title_es)
                if desc:
                    translated = translate_to_language(desc, "es")
                    if translated and translated != desc:
                        chosen_synopsis = translated
                        synopsis_was_translated = True
                        has_synopsis_target = True
                    else:
                        chosen_synopsis = desc
                        has_synopsis_target = False
                else:
                    chosen_synopsis = ""
                    has_synopsis_target = False
            elif target in ("en", "en-us"):
                chosen_title = title
                chosen_synopsis = desc
                has_title_target = True
                has_synopsis_target = bool(desc)
            else:
                chosen_title = title
                chosen_synopsis = desc
                has_title_target = True
                has_synopsis_target = False

            lang_status, lang_notice = compute_language_status(
                target_lang=target,
                has_title_in_target=has_title_target,
                has_synopsis_in_target=has_synopsis_target,
                target_title_val=title_es if target.startswith("es") else title,
                fallback_title_val=title,
                synopsis_was_translated=synopsis_was_translated
            )

            results.append({
                "id": str(sid),
                "provider": "mangaupdates",
                "provider_label": "MangaUpdates (BBDD Global)",
                "title": chosen_title,
                "title_spanish": title_es,
                "title_english": title,
                "title_romaji": title,
                "target_lang": target,
                "has_title_in_language": has_title_target,
                "has_synopsis_in_language": has_synopsis_target,
                "synopsis_original": raw_original_synopsis,
                "synopsis_was_translated": synopsis_was_translated,
                "language_status": lang_status,
                "language_notice": lang_notice,
                "synonyms": associated_titles[:8],
                "synopsis_es": chosen_synopsis or "",
                "synopsis_has_es": bool(chosen_synopsis),
                "volumes": vols,
                "chapters": latest_ch,
                "status": status_code,
                "status_es": status_es,
                "year": rec.get("year"),
                "genres": genres[:8],
                "tags": all_tags[:12],
                "authors": authors_list[:4],
                "writer": writer_val,
                "penciller": penciller_val,
                "publisher": original_publisher,
                "imprint": imprint_publisher,
                "community_rating": community_rating,
                "cover_url": cover_url,
                "has_volume_covers": False
            })

    except Exception as e:
        logger.warning(f"Error fetching from MangaUpdates: {e}")

    return results

def clean_series_name(name: str) -> str:
    """Removes volume, chapter, edition, bracket tags, and number suffixes from series titles."""
    if not name:
        return ""
    s = re.sub(r"\[.*?\]|\(.*?\)|<.*?>", " ", name)
    s = re.sub(r"(?i)\s*(?:[-_–—:]\s*)?(?:vol(?:ume)?|tomo|cap(?:[ií]tulo)?|ch(?:apter)?|[cv]|\#)\s*\.?\s*\d+.*$", "", s)
    s = re.sub(r"\s+[-_–—]?\s*\d+(?:\.\d+)?\s*$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or name.strip()

_ONLINE_SUMMARY_CACHE: Dict[str, Dict[str, Any]] = {}
_SUMMARY_CACHE_LOCK = threading.Lock()

def get_series_online_summary(series_name: str, target_lang: str = "es") -> Dict[str, Any]:
    """
    Fetches the definitive online publication status, total official volumes,
    latest chapter count, and rich metadata across MangaUpdates, AniList, and MangaDex.
    Results are thread-safe cached in memory per series and language.
    """
    cleaned = clean_series_name(series_name)
    target = (target_lang or "es").lower()
    cache_key = f"{cleaned.lower()}::{target}"

    with _SUMMARY_CACHE_LOCK:
        if cache_key in _ONLINE_SUMMARY_CACHE:
            return _ONLINE_SUMMARY_CACHE[cache_key]

    summary: Dict[str, Any] = {
        "series_name": series_name,
        "search_query": cleaned,
        "official_title": cleaned,
        "target_lang": target,
        "total_volumes": None,
        "total_chapters": None,
        "status": "UNKNOWN",
        "status_es": "Desconocido",
        "cover_url": None,
        "mangadex_id": None,
        "has_volume_covers": False,
        "source": "None",
        "community_rating": None,
        "publisher": None,
        "imprint": None,
        "writer": None,
        "penciller": None,
        "tags": [],
        "language_status": "missing",
        "language_notice": "Búsqueda en curso..."
    }

    # 1. Primary Source: MangaUpdates (best for volume counts, publisher, rating, author roles)
    try:
        mu_results = search_mangaupdates(cleaned, limit=2, target_lang=target)
        if mu_results:
            top_mu = mu_results[0]
            if compute_item_similarity(cleaned, top_mu) >= 0.40:
                summary["official_title"] = top_mu.get("title") or cleaned
                summary["total_volumes"] = top_mu.get("volumes")
                summary["total_chapters"] = top_mu.get("chapters")
                summary["status"] = top_mu.get("status") or "UNKNOWN"
                summary["status_es"] = top_mu.get("status_es") or "Desconocido"
                summary["cover_url"] = top_mu.get("cover_url")
                summary["community_rating"] = top_mu.get("community_rating")
                summary["publisher"] = top_mu.get("publisher")
                summary["imprint"] = top_mu.get("imprint")
                summary["writer"] = top_mu.get("writer")
                summary["penciller"] = top_mu.get("penciller")
                summary["tags"] = top_mu.get("tags", [])
                summary["language_status"] = top_mu.get("language_status", "missing")
                summary["language_notice"] = top_mu.get("language_notice", "")
                summary["source"] = "MangaUpdates"
    except Exception as e:
        logger.debug(f"MangaUpdates summary error for '{cleaned}': {e}")

    # 2. Secondary Source: AniList (if volumes/chapters/status/cover still missing or to enrich)
    if summary["total_volumes"] is None or summary["status"] == "UNKNOWN" or not summary["cover_url"]:
        try:
            ani_results = search_anilist(cleaned, limit=1, target_lang=target)
            if ani_results:
                ani = ani_results[0]
                if compute_item_similarity(cleaned, ani) >= 0.40:
                    if summary["total_volumes"] is None and ani.get("volumes"):
                        summary["total_volumes"] = ani["volumes"]
                    if summary["total_chapters"] is None and ani.get("chapters"):
                        summary["total_chapters"] = ani["chapters"]
                    if summary["status"] == "UNKNOWN" and ani.get("status"):
                        summary["status"] = ani.get("status", "UNKNOWN")
                        summary["status_es"] = ani.get("status_es", "Desconocido")
                    if not summary["cover_url"] and ani.get("cover_url"):
                        summary["cover_url"] = ani["cover_url"]
                    if not summary["writer"] and ani.get("writer"):
                        summary["writer"] = ani["writer"]
                    if not summary["penciller"] and ani.get("penciller"):
                        summary["penciller"] = ani["penciller"]
                    if summary["source"] == "None":
                        summary["source"] = "AniList"
                        summary["official_title"] = ani.get("title") or cleaned
                        summary["language_status"] = ani.get("language_status", "missing")
                        summary["language_notice"] = ani.get("language_notice", "")
        except Exception as e:
            logger.debug(f"AniList fallback error for '{cleaned}': {e}")

    # 3. MangaDex check: obtain MangaDex ID for volume covers support, Spanish synopsis and alternate titles
    try:
        md_results = search_mangadex(cleaned, limit=1, target_lang=target)
        if md_results:
            md = md_results[0]
            if compute_item_similarity(cleaned, md) >= 0.40:
                summary["mangadex_id"] = md.get("id")
                summary["has_volume_covers"] = True
                if summary["total_volumes"] is None and md.get("volumes"):
                    try:
                        summary["total_volumes"] = int(md["volumes"])
                    except Exception:
                        pass
                if summary["total_chapters"] is None and md.get("chapters"):
                    try:
                        summary["total_chapters"] = int(float(md["chapters"]))
                    except Exception:
                        pass
                if summary["status"] == "UNKNOWN" and md.get("status"):
                    summary["status"] = md.get("status", "UNKNOWN").upper()
                    summary["status_es"] = md.get("status_es", "Desconocido")
                if not summary["cover_url"] and md.get("cover_url"):
                    summary["cover_url"] = md["cover_url"]
                if not summary["writer"] and md.get("writer"):
                    summary["writer"] = md["writer"]
                if not summary["penciller"] and md.get("penciller"):
                    summary["penciller"] = md["penciller"]

                # If user wants Spanish and MangaDex has Spanish title or synopsis, elevate language status!
                if target.startswith("es"):
                    if md.get("has_title_in_language") and md.get("has_synopsis_in_language"):
                        summary["official_title"] = md.get("title")
                        summary["language_status"] = "complete"
                        summary["language_notice"] = "✅ Metadatos completos en Español"
                    elif md.get("has_title_in_language") or md.get("has_synopsis_in_language"):
                        if md.get("has_title_in_language"):
                            summary["official_title"] = md.get("title")
                        if summary["language_status"] == "missing":
                            summary["language_status"] = "partial"
                            summary["language_notice"] = md.get("language_notice")

                if summary["source"] == "None":
                    summary["source"] = "MangaDex"
                    summary["official_title"] = md.get("title") or cleaned
    except Exception as e:
        logger.debug(f"MangaDex fallback error for '{cleaned}': {e}")

    with _SUMMARY_CACHE_LOCK:
        _ONLINE_SUMMARY_CACHE[cache_key] = summary

    return summary

def unified_online_search(query: str, source: str = "auto", target_lang: str = "es") -> List[Dict[str, Any]]:
    """
    Executes a multi-provider search with user-chosen language prioritization (Spanish by default).
    Applies strict relevance filtering to remove unrelated hits and ranks true matches at the top.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    target = (target_lang or "es").lower()
    combined: List[Dict[str, Any]] = []

    def fetch_source(src_name: str) -> List[Dict[str, Any]]:
        try:
            if src_name == "mangaupdates":
                return search_mangaupdates(clean_query, limit=6, target_lang=target)
            elif src_name == "mangadex":
                return search_mangadex(clean_query, limit=6, target_lang=target)
            elif src_name == "anilist":
                return search_anilist(clean_query, limit=6, target_lang=target)
            elif src_name == "openlibrary":
                return search_openlibrary(clean_query, limit=4, target_lang=target)
        except Exception as e:
            logger.warning(f"Error querying {src_name}: {e}")
        return []

    sources_to_run = []
    if source == "auto":
        sources_to_run = ["mangaupdates", "mangadex", "anilist"]
    else:
        sources_to_run = [source]

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=min(4, len(sources_to_run))) as executor:
        futures = [executor.submit(fetch_source, s) for s in sources_to_run]
        for f in futures:
            try:
                combined.extend(f.result())
            except Exception as e:
                logger.warning(f"Future error in unified_online_search: {e}")

    # Fallback to OpenLibrary if auto search produced few results
    if source == "auto" and len(combined) < 3:
        combined.extend(search_openlibrary(clean_query, limit=3, target_lang=target))

    # Calculate similarity score for each hit against clean_query
    for item in combined:
        item["similarity_score"] = round(compute_item_similarity(clean_query, item), 2)

    # Strict relevance filter:
    # 0.40 cutoff removes unrelated books/manga returned by loose tags/descriptions.
    # If no results meet 0.40, relax to 0.25 (to handle slight typos).
    relevant = [item for item in combined if item.get("similarity_score", 0.0) >= 0.40]
    if not relevant and combined:
        relevant = [item for item in combined if item.get("similarity_score", 0.0) >= 0.25]
    if not relevant:
        relevant = combined

    # Scoring and sorting: heavily weight title similarity, then language & metadata
    def rank_result(r: Dict[str, Any]) -> float:
        sim = r.get("similarity_score", 0.0)
        score = sim * 100.0

        if sim >= 0.85:
            score += 30.0

        l_stat = r.get("language_status")
        if l_stat == "complete":
            score += 15.0
        elif l_stat == "partial":
            score += 8.0

        if r.get("has_title_in_language"):
            score += 6.0
        if r.get("has_synopsis_in_language"):
            score += 4.0
        if r.get("volumes") is not None:
            score += 4.0
        if r.get("chapters") is not None:
            score += 3.0
        if r.get("community_rating") is not None:
            score += 2.0
        if r.get("cover_url"):
            score += 3.0
        if r.get("provider") == "mangadex" and r.get("has_volume_covers"):
            score += 2.0
        return score

    relevant.sort(key=rank_result, reverse=True)
    return relevant
