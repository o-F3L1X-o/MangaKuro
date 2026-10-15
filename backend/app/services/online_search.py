import json
import logging
import re
import threading
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional

logger = logging.getLogger("online_search")

HEADERS = {
    "User-Agent": "MangaKuro/1.0 (https://github.com/o-F3L1X-o/MangaKuro)",
    "Accept": "application/json"
}

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
ITALIAN_EXCLUSIONS = {"sono", "reincarnato", "nella", "nello", "degli", "delle", "della"}
SPANISH_KEYWORDS = {"el", "la", "los", "las", "un", "una", "del", "que", "por", "para", "con", "en", "como", "vez", "aquella", "mundo", "vida", "reencarnado", "reencarné", "reencarnación", "tiempo", "cuando", "hombre", "otra", "otro"}

def is_likely_spanish_title(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    words = set(re.findall(r"\b[a-záéíóúñü]+\b", lower))
    if words & FRENCH_EXCLUSIONS or words & GERMAN_EXCLUSIONS or words & ITALIAN_EXCLUSIONS:
        return False
    if any(c in lower for c in "áéíóúñ"):
        return True
    if words & SPANISH_KEYWORDS and not (words & {"the", "of", "and", "is", "that", "this", "to", "for"}):
        return True
    return False

def search_mangadex(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    """
    Searches MangaDex for manga titles, extracting Spanish synopsis, alternate titles,
    status, volume and chapter counts, and high-quality cover art.
    """
    results = []
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
                    if val and val not in synonyms_list:
                        synonyms_list.append(val)

            # 2. Description in Spanish, fallback English
            desc_map = attrs.get("description", {})
            desc_es = desc_map.get("es") or desc_map.get("es-la")
            desc_en = desc_map.get("en", "")
            
            # Clean markdown/HTML links in description
            final_synopsis = desc_es if desc_es else desc_en
            if final_synopsis:
                final_synopsis = re.sub(r"\[.*?\]\(.*?\)", "", final_synopsis)
                final_synopsis = re.sub(r"[*_~`]", "", final_synopsis).strip()

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

            # 5. Authors
            authors = []
            for rel in item.get("relationships", []):
                if rel.get("type") in ("author", "artist"):
                    name = rel.get("attributes", {}).get("name")
                    if name and name not in authors:
                        authors.append(name)

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
                "title": title_es or title_main,
                "title_spanish": title_es,
                "title_english": title_en,
                "title_romaji": title_ja or title_main,
                "synonyms": synonyms_list[:8],
                "synopsis_es": final_synopsis or "",
                "synopsis_has_es": bool(desc_es),
                "volumes": last_vol if last_vol and last_vol.strip() else None,
                "chapters": last_ch if last_ch and last_ch.strip() else None,
                "status": raw_status,
                "status_es": status_es,
                "year": attrs.get("year"),
                "genres": tags[:8],
                "authors": authors,
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

def search_anilist(query: str, limit: int = 6) -> List[Dict[str, Any]]:
    """
    Searches AniList GraphQL API for exact volume counts, chapter counts,
    and ultra high-resolution official cover art.
    """
    results = []
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
          staff(perPage: 3) {
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

            authors = []
            for edge in item.get("staff", {}).get("edges", []):
                aname = edge.get("node", {}).get("name", {}).get("full")
                if aname and aname not in authors:
                    authors.append(aname)

            genres = [translate_genre(g) for g in item.get("genres", [])]

            cover = item.get("coverImage", {}).get("extraLarge") or item.get("coverImage", {}).get("large")

            synonyms = item.get("synonyms", [])
            # Detect potential Spanish title from synonyms using linguistic markers
            title_es = next((s for s in synonyms if is_likely_spanish_title(s)), None)

            results.append({
                "id": str(item.get("id")),
                "provider": "anilist",
                "provider_label": "AniList (Oficial)",
                "title": title_es or english or romaji or user_pref,
                "title_spanish": title_es,
                "title_english": english,
                "title_romaji": romaji,
                "synonyms": synonyms[:8],
                "synopsis_es": raw_desc or "",
                "synopsis_has_es": False,
                "volumes": item.get("volumes"),
                "chapters": item.get("chapters"),
                "status": raw_status,
                "status_es": status_es,
                "year": item.get("startDate", {}).get("year"),
                "genres": genres[:8],
                "authors": authors,
                "cover_url": cover,
                "has_volume_covers": False
            })

    except Exception as e:
        logger.warning(f"Error fetching from AniList: {e}")

    return results

def search_openlibrary(query: str, limit: int = 5) -> List[Dict[str, Any]]:
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
                "synonyms": [],
                "synopsis_es": f"Editorial: {publisher}. Año de edición: {publish_year}." if publisher else "",
                "synopsis_has_es": True,
                "volumes": None,
                "chapters": None,
                "status": "published",
                "status_es": "Publicado",
                "year": publish_year,
                "genres": ["Cómic"],
                "authors": authors[:3],
                "cover_url": cover_url,
                "has_volume_covers": False
            })
    except Exception as e:
        logger.warning(f"Error fetching from OpenLibrary: {e}")

    return results

def search_mangaupdates(query: str, limit: int = 6) -> List[Dict[str, Any]]:
    """
    Searches MangaUpdates API for manga metadata, accurate ongoing volume counts,
    and official covers.
    """
    results = []
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

        # Filter out Doujinshis
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
            authors = []

            try:
                det_req = urllib.request.Request(
                    f"https://api.mangaupdates.com/v1/series/{sid}",
                    headers=HEADERS
                )
                with urllib.request.urlopen(det_req, timeout=4) as det_resp:
                    det = json.loads(det_resp.read().decode("utf-8"))
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
                    authors = [a.get("name") for a in det.get("authors", []) if a.get("name")]
            except Exception:
                pass

            if desc:
                desc = re.sub(r"<.*?>", "", desc)
                desc = re.sub(r"\[.*?\]\(.*?\)", "", desc).strip()

            genres = [translate_genre(g.get("genre")) for g in rec.get("genres", []) if g.get("genre")]

            results.append({
                "id": str(sid),
                "provider": "mangaupdates",
                "provider_label": "MangaUpdates (BBDD Global)",
                "title": title,
                "title_spanish": None,
                "title_english": title,
                "title_romaji": title,
                "synonyms": [],
                "synopsis_es": desc or "",
                "synopsis_has_es": False,
                "volumes": vols,
                "chapters": latest_ch,
                "status": status_code,
                "status_es": status_es,
                "year": rec.get("year"),
                "genres": genres[:8],
                "authors": authors[:3],
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

def get_series_online_summary(series_name: str) -> Dict[str, Any]:
    """
    Fetches the definitive online publication status, total official volumes,
    and latest chapter count across MangaUpdates, AniList, and MangaDex.
    Results are thread-safe cached in memory.
    """
    cleaned = clean_series_name(series_name)
    cache_key = cleaned.lower()

    with _SUMMARY_CACHE_LOCK:
        if cache_key in _ONLINE_SUMMARY_CACHE:
            return _ONLINE_SUMMARY_CACHE[cache_key]

    summary: Dict[str, Any] = {
        "series_name": series_name,
        "search_query": cleaned,
        "official_title": cleaned,
        "total_volumes": None,
        "total_chapters": None,
        "status": "UNKNOWN",
        "status_es": "Desconocido",
        "cover_url": None,
        "mangadex_id": None,
        "has_volume_covers": False,
        "source": "None"
    }

    # 1. Primary Source: MangaUpdates (best for accurate ongoing & completed volume counts)
    try:
        mu_url = "https://api.mangaupdates.com/v1/series/search"
        body = json.dumps({"search": cleaned, "stype": "title", "perpage": 5}).encode("utf-8")
        req = urllib.request.Request(
            mu_url,
            data=body,
            headers={**HEADERS, "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            hits = [r["record"] for r in data.get("results", []) if r.get("record", {}).get("type") != "Doujinshi"]

        if hits:
            top_rec = hits[0]
            sid = top_rec.get("series_id")
            det_req = urllib.request.Request(f"https://api.mangaupdates.com/v1/series/{sid}", headers=HEADERS)
            with urllib.request.urlopen(det_req, timeout=5) as det_resp:
                det = json.loads(det_resp.read().decode("utf-8"))

            summary["official_title"] = det.get("title") or top_rec.get("title")
            raw_status = det.get("status") or ""
            vol_match = re.search(r"(\d+)\s+Volume", raw_status, re.IGNORECASE)
            if vol_match:
                summary["total_volumes"] = int(vol_match.group(1))

            if "complete" in raw_status.lower():
                summary["status"] = "FINISHED"
                summary["status_es"] = "Finalizado"
            elif "ongoing" in raw_status.lower():
                summary["status"] = "RELEASING"
                summary["status_es"] = "En emisión"
            elif "hiatus" in raw_status.lower():
                summary["status"] = "HIATUS"
                summary["status_es"] = "En pausa"
            elif "cancel" in raw_status.lower():
                summary["status"] = "CANCELLED"
                summary["status_es"] = "Cancelado"

            if det.get("latest_chapter"):
                summary["total_chapters"] = det.get("latest_chapter")

            img_data = det.get("image") or top_rec.get("image") or {}
            img_url = (img_data.get("url") or {}).get("original")
            if img_url:
                summary["cover_url"] = img_url

            summary["source"] = "MangaUpdates"
    except Exception as e:
        logger.debug(f"MangaUpdates lookup error for '{cleaned}': {e}")

    # 2. Secondary Source: AniList (if volumes/chapters/status still missing, or for higher-res cover)
    if summary["total_volumes"] is None or summary["status"] == "UNKNOWN" or not summary["cover_url"]:
        try:
            anilist_hits = search_anilist(cleaned, limit=1)
            if anilist_hits:
                ani = anilist_hits[0]
                if summary["total_volumes"] is None and ani.get("volumes"):
                    summary["total_volumes"] = ani["volumes"]
                if summary["total_chapters"] is None and ani.get("chapters"):
                    summary["total_chapters"] = ani["chapters"]
                if summary["status"] == "UNKNOWN" and ani.get("status"):
                    summary["status"] = ani.get("status", "UNKNOWN")
                    summary["status_es"] = ani.get("status_es", "Desconocido")
                if not summary["cover_url"] and ani.get("cover_url"):
                    summary["cover_url"] = ani["cover_url"]
                if summary["source"] == "None":
                    summary["source"] = "AniList"
                    summary["official_title"] = ani.get("title")
        except Exception as e:
            logger.debug(f"AniList fallback error for '{cleaned}': {e}")

    # 3. MangaDex check: obtain MangaDex ID for volume covers support and extra verification
    try:
        md_hits = search_mangadex(cleaned, limit=1)
        if md_hits:
            md = md_hits[0]
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
            if summary["source"] == "None":
                summary["source"] = "MangaDex"
                summary["official_title"] = md.get("title")
    except Exception as e:
        logger.debug(f"MangaDex fallback error for '{cleaned}': {e}")

    with _SUMMARY_CACHE_LOCK:
        _ONLINE_SUMMARY_CACHE[cache_key] = summary

    return summary

def unified_online_search(query: str, source: str = "auto") -> List[Dict[str, Any]]:
    """
    Executes a multi-provider search with Spanish prioritization and bilingual matching.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    combined: List[Dict[str, Any]] = []

    if source in ("auto", "mangaupdates"):
        combined.extend(search_mangaupdates(clean_query, limit=5))

    if source in ("auto", "mangadex"):
        combined.extend(search_mangadex(clean_query, limit=6))

    if source in ("auto", "anilist"):
        combined.extend(search_anilist(clean_query, limit=6))

    if source in ("auto", "openlibrary") and len(combined) < 4:
        combined.extend(search_openlibrary(clean_query, limit=3))

    # Sort results: prioritize results with Spanish synopsis or Spanish title, then those with volume/chapter counts
    def score_result(r: Dict[str, Any]) -> int:
        score = 0
        if r.get("title_spanish"):
            score += 4
        if r.get("synopsis_has_es"):
            score += 3
        if r.get("volumes") is not None:
            score += 3
        if r.get("chapters") is not None:
            score += 2
        if r.get("cover_url"):
            score += 2
        if r.get("provider") == "mangadex" and r.get("has_volume_covers"):
            score += 1
        return score

    combined.sort(key=score_result, reverse=True)
    return combined
