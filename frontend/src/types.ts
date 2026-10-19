export interface PageItem {
  id: string;
  order: number;
  filename: string;
  thumb_filename: string;
  original_name: string;
  width: number;
  height: number;
  rotation: number;
  is_cover: boolean;
}

export interface ComicInfo {
  Title?: string;
  Series?: string;
  Number?: string;
  Count?: number | null;
  Volume?: number | null;
  AlternateSeries?: string;
  AlternateNumber?: string;
  Summary?: string;
  Notes?: string;
  Year?: number | null;
  Month?: number | null;
  Day?: number | null;
  Writer?: string;
  Penciller?: string;
  Inker?: string;
  Colorist?: string;
  Letterer?: string;
  CoverArtist?: string;
  Editor?: string;
  Publisher?: string;
  Imprint?: string;
  Genre?: string;
  Web?: string;
  PageCount?: number;
  LanguageISO?: string;
  Format?: string;
  BlackAndWhite?: string;
  Manga?: string; // "No", "YesAndRightToLeft", "Yes"
  ReadingDirection?: 'ltr' | 'rtl' | 'vertical'; // ltr (comic), rtl (manga), vertical (webtoon)
  AgeRating?: string;
  CommunityRating?: number | null;
  ScanInformation?: string;
  StoryArc?: string;
  SeriesGroup?: string;
  Characters?: string;
  Teams?: string;
  Locations?: string;
  Webtoon?: string;
  Tags?: string;
}

export interface SessionManifest {
  session_id: string;
  original_filename: string;
  created_at: number;
  updated_at: number;
  pages: PageItem[];
  metadata: ComicInfo;
  item_type?: 'tomo' | 'capitulo';
  source_file_path?: string;
  merged_source_files?: string[];
  merged_chapter_names?: string[];
  verification_status?: 'pending_verification' | 'verified_ok' | 'reverted' | null;
  exported_to_path?: string | null;
  last_exported_at?: number | null;
  backup_file_path?: string | null;
}

export interface ComicSessionSummary {
  session_id: string;
  original_filename: string;
  series: string;
  number: string;
  volume?: number | null;
  title: string;
  page_count: number;
  cover_thumb: string;
  item_type?: 'tomo' | 'capitulo';
  source_file_path?: string;
  merged_source_files?: string[];
  merged_chapter_names?: string[];
  verification_status?: 'pending_verification' | 'verified_ok' | 'reverted' | null;
  exported_to_path?: string | null;
  last_exported_at?: number | null;
  backup_file_path?: string | null;
  created_at: number;
  updated_at: number;
}

export interface AppSettings {
  export_directory: string;
  staging_directory?: string;
  app_password?: string;
  default_compression: string;
  default_quality: number;
  komga_server_url: string;
  komga_api_key: string;
  clean_junk_files: boolean;
  split_max_height: number;
  show_system_monitor?: boolean;
  donation_url?: string;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  filepath: string;
  size_bytes: number;
  size_mb: number;
  download_url: string;
  overwrote_source?: boolean;
  deleted_chapters?: string[];
  deleted_chapters_count?: number;
}

export interface SystemStats {
  cpu: {
    system_percent: number;
    process_percent: number;
  };
  memory: {
    system_percent: number;
    system_used_gb: number;
    system_total_gb: number;
    process_rss_mb: number;
  };
  disk: {
    staging_bytes: number;
    staging_mb: number;
    staging_gb: number;
    drive_total_gb: number;
    drive_free_gb: number;
    drive_used_percent: number;
  };
  orphans: {
    count: number;
    bytes: number;
    mb: number;
    gb: number;
  };
  active_sessions: number;
}

export interface ServerFsEntry {
  name: string;
  path: string;
  size_bytes?: number;
  size_mb?: number;
  comic_count?: number;
  extension?: string;
}

export interface QuickRoot {
  name: string;
  path: string;
}

export interface ServerFsBrowseResult {
  current_path: string;
  parent_path: string | null;
  quick_roots: QuickRoot[];
  directories: ServerFsEntry[];
  files: ServerFsEntry[];
}

export interface ServerImportRequest {
  file_paths: string[];
  item_type?: 'auto' | 'tomo' | 'capitulo';
  custom_series?: string;
  custom_number?: string;
}

export interface AuthStatusResult {
  auth_required: boolean;
  authenticated: boolean;
}

export interface OnlineSearchResult {
  id: string;
  provider: 'mangadex' | 'anilist' | 'mangaupdates' | 'openlibrary';
  provider_label: string;
  title: string;
  title_spanish?: string;
  title_english?: string;
  title_romaji?: string;
  target_lang?: string;
  has_title_in_language?: boolean;
  has_synopsis_in_language?: boolean;
  language_status?: 'complete' | 'partial' | 'missing';
  language_notice?: string;
  synonyms: string[];
  synopsis_es: string;
  synopsis_has_es: boolean;
  volumes?: number | string | null;
  chapters?: number | string | null;
  status: string;
  status_es: string;
  year?: number | string | null;
  genres: string[];
  tags?: string[];
  authors: string[];
  writer?: string;
  penciller?: string;
  publisher?: string;
  imprint?: string;
  community_rating?: number | null;
  cover_url?: string;
  has_volume_covers: boolean;
}

export interface VolumeCoverItem {
  volume: string;
  volume_number?: string;
  cover_url: string;
  cover_url_full?: string;
  description?: string;
}

export interface SeriesOnlineSummary {
  series_name: string;
  search_query: string;
  official_title: string;
  target_lang?: string;
  total_volumes: number | null;
  total_chapters: number | null;
  status: 'RELEASING' | 'FINISHED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN' | string;
  status_es: string;
  cover_url: string | null;
  mangadex_id: string | null;
  has_volume_covers: boolean;
  source: string;
  community_rating?: number | null;
  publisher?: string | null;
  imprint?: string | null;
  writer?: string | null;
  penciller?: string | null;
  tags?: string[];
  language_status?: 'complete' | 'partial' | 'missing' | string;
  language_notice?: string;
}

