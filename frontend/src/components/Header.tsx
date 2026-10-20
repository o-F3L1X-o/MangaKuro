import React from 'react';
import { 
  BookOpen, 
  Bookmark,
  Edit3,
  UploadCloud, 
  FileText, 
  Eye, 
  Download, 
  Settings as SettingsIcon,
  CheckCircle2,
  RefreshCw,
  PanelLeft,
  FolderClosed,
  FolderPlus,
  Sparkles,
  Activity,
  PlusCircle,
  Sliders,
  Sun,
  Moon,
  Layers,
  Library,
  Undo2
} from 'lucide-react';
import { SessionManifest } from '../types';
import { APP_VERSION, APP_NAME } from '../version';
import { useTranslation, Language } from '../i18n';
import { useTheme } from '../theme';

interface HeaderProps {
  session: SessionManifest | null;
  isSaving: boolean;
  isSidebarOpen: boolean;
  sessionsCount: number;
  onToggleSidebar: () => void;
  onCloseCurrent: () => void;
  onOpenUpload: (defaultSeries?: string | null) => void;
  onOpenMetadata: () => void;
  onOpenViewer: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onOpenQuickRename?: () => void;
  onTransferActiveToTomo?: () => void;
  onCleanupOrphaned?: () => void;
  isCleaningOrphans?: boolean;
  isMonitorOpen?: boolean;
  onToggleMonitor?: () => void;
  onOpenDonation?: () => void;
  onOpenImageAnalysis?: () => void;
  onOpenOnlineSearch?: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  isSaving,
  isSidebarOpen,
  sessionsCount,
  onToggleSidebar,
  onCloseCurrent,
  onOpenUpload,
  onOpenMetadata,
  onOpenViewer,
  onOpenExport,
  onOpenSettings,
  onOpenQuickRename,
  onTransferActiveToTomo,
  onCleanupOrphaned,
  isCleaningOrphans = false,
  isMonitorOpen = false,
  onToggleMonitor,
  onOpenDonation,
  onOpenImageAnalysis,
  onOpenOnlineSearch,
  canUndo = false,
  onUndo
}) => {
  const { t, language, setLanguage } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const readingDirectionLabel = () => {
    if (!session) return null;
    const dir = session.metadata.ReadingDirection || 'ltr';
    if (dir === 'vertical') {
      return (
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-semibold flex items-center gap-1 shrink-0">
          ⬇️ {t('common.webtoon')}
        </span>
      );
    }
    if (dir === 'rtl') {
      return (
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-50 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 font-semibold flex items-center gap-1 shrink-0">
          ◀️ {t('common.manga')}
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 font-semibold flex items-center gap-1 shrink-0">
        ▶️ {t('common.comic')}
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-40 h-14 sm:h-16 flex items-center bg-white dark:bg-comic-950 border-b border-slate-200 dark:border-comic-800 px-3 sm:px-6 transition-colors shadow-sm dark:shadow-xl w-full select-none">
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        {/* Left Column: Sidebar Toggle + Active Session Context */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 justify-start">
          {/* Sidebar Toggle Button */}
          <button
            onClick={onToggleSidebar}
            className={`p-2 rounded-xl border transition flex items-center gap-1.5 shrink-0 ${
              isSidebarOpen
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/60 dark:border-indigo-700 dark:text-indigo-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 dark:bg-comic-800/80 dark:hover:bg-comic-700 dark:text-slate-300 dark:border-comic-700/60'
            }`}
            title={isSidebarOpen ? t('header.hideSidebar') : t('header.showSidebar')}
          >
            <PanelLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            {sessionsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[10px] font-bold">
                {sessionsCount}
              </span>
            )}
          </button>

          {/* Active Session Context Details */}
          {session ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={onOpenQuickRename}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 transition active:scale-95 shrink-0 ${
                  session.item_type === 'capitulo'
                    ? 'bg-amber-100 dark:bg-amber-950/90 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                    : 'bg-indigo-100 dark:bg-indigo-950/90 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60'
                }`}
                title={t('header.toggleItemTypeOrRename')}
              >
                {session.item_type === 'capitulo' ? (
                  <>
                    <Bookmark className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                    <span className="hidden sm:inline">{t('common.chapter')}</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="hidden sm:inline">{t('common.tomo')}</span>
                  </>
                )}
                <Edit3 className="w-2 h-2 opacity-60 ml-0.5" />
              </button>

              <div className="shrink-0 hidden md:block">
                {readingDirectionLabel()}
              </div>

              {session.merged_source_files && session.merged_source_files.length > 0 && (
                <div 
                  className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 font-semibold flex items-center gap-1 shrink-0"
                  title={`${session.merged_source_files.length} capítulos compilados: ${session.merged_chapter_names?.join(', ') || ''}`}
                >
                  <Layers className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400" />
                  <span>{session.merged_source_files.length} caps</span>
                </div>
              )}

              <div 
                className="flex items-center gap-1 group/rename cursor-pointer min-w-0" 
                onClick={onOpenQuickRename} 
                title={t('header.renameSeriesOrTomo')}
              >
                <p className="text-xs text-slate-800 dark:text-slate-300 group-hover/rename:text-indigo-600 dark:group-hover/rename:text-indigo-300 transition truncate max-w-[100px] sm:max-w-[160px] md:max-w-[220px] font-semibold">
                  {session.metadata.Series 
                    ? `${session.metadata.Series} ${session.metadata.Number ? `#${session.metadata.Number}` : ''} (${session.pages.length} ${t('common.pages')})`
                    : `${session.original_filename} (${session.pages.length} ${t('common.pages')})`}
                </p>
                <Edit3 className="w-2.5 h-2.5 text-slate-400 group-hover/rename:text-indigo-500 opacity-0 group-hover/rename:opacity-100 transition shrink-0" />
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              {t('header.readyToOrganize')}
            </p>
          )}
        </div>

        {/* Center Column: Prominent App Logo & 2-Line Title */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 px-2 shrink-0">
          <img
            src="/logo-icon.png?v=2"
            alt={APP_NAME}
            className="h-9 sm:h-11 w-auto object-contain drop-shadow-md shrink-0 select-none"
          />
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-start justify-center leading-none">
              <span className="font-black tracking-tight text-base sm:text-xl lg:text-2xl drop-shadow-sm leading-none">
                <span className="text-slate-900 dark:text-white">Manga</span>
                <span className="text-indigo-600 dark:text-[#786eff]">Kuro</span>
              </span>
              <span className="text-[7px] sm:text-[8.5px] font-bold tracking-[0.14em] uppercase text-slate-600 dark:text-[#8ea4c8] mt-1 leading-none whitespace-nowrap">
                ULTIMATE COMIC &amp; MANGA SUITE
              </span>
            </div>

            {/* Live Saving Indicator (Subtle and only active during in-flight saves) */}
            {session && isSaving && (
              <div className="shrink-0 flex items-center">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-600/60 text-[10px] font-bold text-amber-700 dark:text-amber-300 animate-pulse">
                  <RefreshCw className="w-3 h-3 text-amber-500 dark:text-amber-400 animate-spin" />
                  <span className="hidden sm:inline">{t('common.saving')}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Actions, Utilities, Theme & Flag Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 justify-end shrink-0">
          {session ? (
            <>
              {/* Primary Comic Actions with Uniform Sizing */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {session.item_type === 'capitulo' && onTransferActiveToTomo && (
                  <button
                    onClick={onTransferActiveToTomo}
                    className="h-8 px-2.5 sm:px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                    title={t('header.incorporateToTomoTitle', { name: session.metadata.Series || session.original_filename })}
                  >
                    <PlusCircle className="w-4 h-4 text-slate-950 shrink-0" />
                    <span className="hidden sm:inline">{t('header.incorporateToTomo')}</span>
                    <span className="sm:hidden">{t('header.incorporateToTomoShort')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenViewer}
                  className="h-8 px-2.5 sm:px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-slate-200 dark:border-comic-700 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                  title={t('header.viewerTitle')}
                >
                  <Eye className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                  <span className="hidden md:inline">{t('header.viewer')}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenMetadata}
                  className="h-8 px-2.5 sm:px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-slate-200 dark:border-comic-700 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                  title={t('header.comicInfoTitle')}
                >
                  <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                  <span className="hidden md:inline">{t('header.comicInfo')}</span>
                </button>

                {/* Undo Button (Always Visible in Header) */}
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo || !onUndo}
                  className={`h-8 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                    canUndo && onUndo
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-slate-200 dark:border-comic-700 cursor-pointer shadow-xs'
                      : 'opacity-40 cursor-not-allowed bg-slate-100/50 text-slate-400 border-slate-200 dark:bg-comic-900/50 dark:text-slate-600 dark:border-comic-800/50'
                  }`}
                  title={canUndo ? t('common.undo') : 'Deshacer (Ctrl+Z) - Sin cambios para deshacer'}
                  aria-label={t('common.undo')}
                >
                  <Undo2 className={`w-4 h-4 shrink-0 ${canUndo ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'}`} />
                  <span className="hidden md:inline">{t('common.undoShort') || 'Deshacer'}</span>
                </button>

                {onOpenOnlineSearch && (
                  <button
                    type="button"
                    onClick={onOpenOnlineSearch}
                    className="h-8 px-2.5 sm:px-3 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 dark:bg-purple-950/80 dark:hover:bg-purple-900/80 dark:text-purple-300 dark:border-purple-700/80 text-xs font-bold transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer shadow-xs"
                    title="Buscar tomos, capítulos y portadas oficiales online"
                  >
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span className="hidden lg:inline">Buscar Online</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenExport}
                  className="h-8 px-2.5 sm:px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                  title={t('header.exportTitle')}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>{t('header.export')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenUpload(null)}
                  className="h-8 px-2.5 sm:px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-indigo-600 border border-slate-300 dark:bg-comic-800 dark:hover:bg-comic-700 dark:text-slate-300 dark:hover:text-indigo-300 dark:border-comic-700 text-xs font-semibold transition active:scale-95 shadow-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                  title={t('header.uploadNewGroupTitle')}
                >
                  <FolderPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="hidden xl:inline">{t('header.uploadNewGroup')}</span>
                </button>
              </div>

              {/* Staging Close Control */}
              <div className="h-5 w-px bg-slate-200 dark:bg-comic-800 mx-0.5 hidden sm:block" />

              <button
                type="button"
                onClick={onCloseCurrent}
                className="h-8 px-2.5 sm:px-3 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-700/80 text-xs font-bold transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer shadow-xs"
                title="Volver al índice general de cómics cargados"
              >
                <Library className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>← Índice General</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpenUpload(null)}
              className="h-9 px-3.5 sm:px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
              title={t('header.uploadComicTitle')}
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>{t('header.uploadComic')}</span>
            </button>
          )}

          {/* System & Tool Utilities */}
          <div className="h-5 w-px bg-slate-300 dark:bg-comic-800 mx-0.5 hidden md:block" />

          <div className="flex items-center gap-1">
            {onCleanupOrphaned && (
              <button
                onClick={onCleanupOrphaned}
                disabled={isCleaningOrphans}
                className={`w-8 h-8 rounded-lg border transition active:scale-95 flex items-center justify-center shrink-0 p-0 cursor-pointer ${
                  isCleaningOrphans
                    ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/60 dark:border-amber-700/60 dark:text-amber-400 cursor-wait'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 dark:bg-comic-800/80 dark:hover:bg-comic-700 dark:text-slate-300 dark:hover:text-amber-300 dark:border-comic-700/60'
                }`}
                title={t('header.cleanOrphans')}
              >
                <Sparkles className={`w-4 h-4 text-amber-500 dark:text-amber-400 ${isCleaningOrphans ? 'animate-spin' : ''}`} />
              </button>
            )}

            {onToggleMonitor && (
              <button
                onClick={onToggleMonitor}
                className={`w-8 h-8 rounded-lg border transition active:scale-95 flex items-center justify-center shrink-0 p-0 cursor-pointer ${
                  isMonitorOpen
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/80 dark:border-emerald-600/80 dark:text-emerald-300 shadow-sm shadow-emerald-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300 dark:bg-comic-800/80 dark:hover:bg-comic-700 dark:text-slate-400 dark:hover:text-slate-200 dark:border-comic-700/60'
                }`}
                title={t('header.performanceMonitor')}
              >
                <Activity className={`w-4 h-4 ${isMonitorOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
              </button>
            )}

            {session && onOpenImageAnalysis && (
              <button
                type="button"
                onClick={onOpenImageAnalysis}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 dark:bg-comic-800/80 dark:hover:bg-comic-700 dark:text-slate-400 dark:hover:text-slate-200 dark:border-comic-700/60 transition active:scale-95 flex items-center justify-center shrink-0 p-0 cursor-pointer"
                title={t('header.imageDiagnostics')}
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-comic-800/80 dark:hover:bg-comic-700 dark:text-slate-300 dark:border-comic-700/60 transition active:scale-95 flex items-center justify-center shrink-0 p-0 cursor-pointer"
              title={t('header.settings')}
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {/* Separator between action utilities and Theme / Language controls */}
            <div className="h-5 w-px bg-slate-300 dark:bg-comic-700/70 mx-1 sm:mx-1.5 ml-2 pl-0.5" />

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-comic-800/80 dark:hover:bg-comic-700 dark:text-slate-300 dark:border-comic-700/60 transition active:scale-95 flex items-center justify-center shrink-0 p-0 cursor-pointer"
              title={theme === 'dark' ? t('header.themeDark') : t('header.themeLight')}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600 transition-transform duration-200 hover:-rotate-12" />
              )}
            </button>

            {/* Language Switcher Flag Buttons: 🇪🇸 (Spanish) & 🇺🇸 (English - American flag) */}
            <div className="h-8 flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-comic-900/90 rounded-lg border border-slate-300 dark:border-comic-700/60 ml-0.5">
              <button
                type="button"
                onClick={() => setLanguage('es')}
                className={`h-7 px-1.5 rounded text-xs transition flex items-center justify-center cursor-pointer ${
                  language === 'es'
                    ? 'bg-indigo-100 dark:bg-indigo-600/30 border border-indigo-400 dark:border-indigo-500/80 shadow-xs font-bold scale-105'
                    : 'opacity-65 hover:opacity-100 hover:bg-slate-200 dark:hover:bg-comic-800/60'
                }`}
                title={t('header.langSpanish')}
                aria-label={t('header.langSpanish')}
              >
                <span className="text-sm leading-none" role="img" aria-label="Español">🇪🇸</span>
              </button>

              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`h-7 px-1.5 rounded text-xs transition flex items-center justify-center cursor-pointer ${
                  language === 'en'
                    ? 'bg-indigo-100 dark:bg-indigo-600/30 border border-indigo-400 dark:border-indigo-500/80 shadow-xs font-bold scale-105'
                    : 'opacity-65 hover:opacity-100 hover:bg-slate-200 dark:hover:bg-comic-800/60'
                }`}
                title={t('header.langEnglish')}
                aria-label={t('header.langEnglish')}
              >
                <span className="text-sm leading-none" role="img" aria-label="English">🇺🇸</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
