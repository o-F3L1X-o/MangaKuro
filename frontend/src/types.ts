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
}

export interface SessionManifest {
  session_id: string;
  original_filename: string;
  created_at: number;
  updated_at: number;
  pages: PageItem[];
  metadata: ComicInfo;
  item_type?: 'tomo' | 'capitulo';
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
  created_at: number;
  updated_at: number;
}

export interface AppSettings {
  export_directory: string;
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

