import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Download, 
  FolderCheck, 
  HardDrive, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  FileArchive,
  RefreshCw,
  FileText,
  BookOpen,
  Tablet,
  Package,
  AlertTriangle,
  Coffee,
  Heart
} from 'lucide-react';
import { SessionManifest, ExportResult, AppSettings } from '../types';
import { exportComic, ExportProgressInfo } from '../api';
import { formatDonationUrl } from '../version';
import { useTranslation } from '../i18n';

interface ExportModalProps {
  session: SessionManifest;
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onOpenImageAnalysis?: () => void;
  onStartBackgroundExport?: (params: {
    sessionId: string;
    comicTitle: string;
    filename: string;
    options: {
      compression: string;
      quality: number;
      save_to_library: boolean;
      custom_filename: string;
      custom_export_dir?: string;
      export_format: ExportFormatType;
      auto_downscale_oversized?: boolean;
    };
  }) => void;
}

export type ExportFormatType = 'cbz' | 'zip' | 'pdf' | 'cbr' | 'epub';

export const ExportModal: React.FC<ExportModalProps> = ({
  session,
  settings,
  isOpen,
  onClose,
  onOpenImageAnalysis,
  onStartBackgroundExport
}) => {
  const { t } = useTranslation();
  const [exportFormat, setExportFormat] = useState<ExportFormatType>('cbz');

  const computeDefaultBaseName = useCallback((s: SessionManifest) => {
    const meta = s.metadata;
    const parts: string[] = [];
    if (meta.Series && meta.Series.trim()) parts.push(meta.Series.trim());
    if (meta.Volume !== null && meta.Volume !== undefined && String(meta.Volume).trim() !== '') {
      parts.push(`v${String(meta.Volume).padStart(2, '0')}`);
    }
    if (meta.Number && meta.Number.trim()) parts.push(`#${meta.Number.trim()}`);
    if (meta.Title && meta.Title.trim()) parts.push(meta.Title.trim());
    return parts.length > 0 ? parts.join(' - ') : s.original_filename.replace(/\.[^/.]+$/, '');
  }, []);

  const [filename, setFilename] = useState(() => `${computeDefaultBaseName(session)}.cbz`);
  const [compression, setCompression] = useState<string>(settings.default_compression || 'original');
  const [quality, setQuality] = useState<number>(settings.default_quality || 80);
  const [customExportDir, setCustomExportDir] = useState(settings.export_directory || '');
  const [autoDownscaleOversized, setAutoDownscaleOversized] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState(false);
  const [progressInfo, setProgressInfo] = useState<ExportProgressInfo>({
    percent: 0,
    current: 0,
    total: session.pages.length,
    message: ''
  });
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const oversizedPages = session.pages.filter(
    (p) => p.width > 16383 || p.height > 16383
  );

  // Sync state whenever modal opens or session/metadata changes
  useEffect(() => {
    if (isOpen && session) {
      const base = computeDefaultBaseName(session);
      setFilename(`${base}.${exportFormat}`);
      setExportResult(null);
      setError(null);
      setIsExporting(false);
      setProgressInfo({
        percent: 0,
        current: 0,
        total: session.pages.length,
        message: ''
      });
    }
  }, [isOpen, session.session_id, session.metadata, session.original_filename, computeDefaultBaseName]);

  if (!isOpen) return null;

  const handleFormatChange = (newFormat: ExportFormatType) => {
    setExportFormat(newFormat);
    setFilename((prev) => {
      const base = prev.replace(/\.[^/.]+$/, '');
      return `${base}.${newFormat}`;
    });
    // For EPUB, suggest JPG if WebP is not desired for legacy readers
    if (newFormat === 'epub' && compression === 'webp') {
      // keep webp or user can choose jpg
    }
  };

  const handleExport = async (saveToLibrary: boolean) => {
    if (onStartBackgroundExport) {
      onStartBackgroundExport({
        sessionId: session.session_id,
        comicTitle: session.metadata.Series || session.original_filename,
        filename: filename,
        options: {
          compression,
          quality,
          save_to_library: saveToLibrary,
          custom_filename: filename,
          custom_export_dir: customExportDir.trim() || undefined,
          export_format: exportFormat,
          auto_downscale_oversized: autoDownscaleOversized
        }
      });
      onClose();
      return;
    }

    setIsExporting(true);
    setError(null);
    setExportResult(null);
    setProgressInfo({
      percent: 0,
      current: 0,
      total: session.pages.length,
      message: `Iniciando empaquetado en formato ${exportFormat.toUpperCase()}...`
    });

    try {
      const res = await exportComic(
        session.session_id,
        {
          compression,
          quality,
          save_to_library: saveToLibrary,
          custom_filename: filename,
          custom_export_dir: customExportDir.trim() || undefined,
          export_format: exportFormat,
          auto_downscale_oversized: autoDownscaleOversized
        },
        (info) => {
          setProgressInfo(info);
        }
      );
      setExportResult(res);

      if (!saveToLibrary) {
        window.open(res.download_url, '_blank');
      }
    } catch (err: any) {
      setError(err.message || t('exportModal.errorTitle'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-comic-900 border border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-comic-950/80 border-b border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">{t('exportModal.title')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-comic-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-200">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                <span>{t('exportModal.errorTitle')}</span>
              </div>
              <p className="pl-7 text-xs text-rose-300/90 leading-relaxed font-mono">
                {error}
              </p>
              <div className="pl-7 pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExport(true)}
                  className="px-3 py-1.5 rounded-lg bg-rose-900 hover:bg-rose-800 text-white font-semibold transition text-xs"
                >
                  {t('exportModal.retry')}
                </button>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="px-3 py-1.5 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-300 font-semibold transition text-xs"
                >
                  {t('exportModal.dismiss')}
                </button>
              </div>
            </div>
          )}

          {exportResult ? (
            <div className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">{t('exportModal.successTitle')}</h4>
                <p className="text-xs text-slate-300 mt-1 font-mono break-all">
                  {exportResult.filename} ({exportResult.size_mb} MB)
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  {t('exportModal.savedIn')} <span className="text-emerald-300 font-mono">{exportResult.filepath}</span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <a
                  href={exportResult.download_url}
                  download={exportResult.filename}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('exportModal.downloadBrowser')}</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-comic-800 hover:bg-comic-700 text-slate-300 text-xs font-semibold"
                >
                  {t('exportModal.doneClose')}
                </button>
              </div>

              {/* Subtle Support Callout */}
              <div className="pt-3 border-t border-emerald-800/40 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
                <a
                  href={formatDonationUrl(settings.donation_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 hover:text-white font-bold text-xs transition active:scale-95 shadow-xs cursor-pointer"
                  title={t('footer.supportProject')}
                >
                  <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400/20" />
                  <span>{t('footer.supportProject')}</span>
                </a>
              </div>
            </div>
          ) : isExporting ? (
            /* Active Progress Box */
            <div className="p-8 rounded-2xl bg-comic-950/80 border border-comic-800 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-inner relative">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">
                  {t('exportModal.packagingIn', { format: exportFormat.toUpperCase(), compression: compression.toUpperCase() })}
                </h4>
                <p className="text-xs text-slate-400 font-mono">
                  {progressInfo.total > 0
                    ? t('exportModal.pageOfProgress', { current: progressInfo.current, total: progressInfo.total, pct: progressInfo.percent })
                    : progressInfo.message || t('exportModal.processingPages')}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md space-y-2">
                <div className="w-full h-3 rounded-full bg-comic-800 overflow-hidden p-0.5 border border-comic-700/60">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300 rounded-full shadow-lg"
                    style={{
                      width: `${Math.max(5, progressInfo.percent)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>{progressInfo.message || t('common.processing')}</span>
                  <span className="font-bold text-slate-300">{progressInfo.percent}%</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Formato de Exportación (Tabs / Selector) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  {t('exportModal.selectFormat')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {/* CBZ */}
                  <button
                    type="button"
                    onClick={() => handleFormatChange('cbz')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      exportFormat === 'cbz'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-md'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      <span>CBZ</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">{t('exportModal.cbzSub')}</span>
                    <span className="text-[9px] text-slate-400">{t('exportModal.cbzBadge')}</span>
                  </button>

                  {/* PDF */}
                  <button
                    type="button"
                    onClick={() => handleFormatChange('pdf')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      exportFormat === 'pdf'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-md'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <FileText className="w-3.5 h-3.5 text-rose-400" />
                      <span>PDF</span>
                    </div>
                    <span className="text-[10px] text-sky-400 font-semibold">{t('exportModal.pdfSub')}</span>
                    <span className="text-[9px] text-slate-400">{t('exportModal.pdfBadge')}</span>
                  </button>

                  {/* EPUB */}
                  <button
                    type="button"
                    onClick={() => handleFormatChange('epub')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      exportFormat === 'epub'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-md'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Tablet className="w-3.5 h-3.5 text-amber-400" />
                      <span>EPUB 3</span>
                    </div>
                    <span className="text-[10px] text-amber-300 font-semibold">{t('exportModal.epubSub')}</span>
                    <span className="text-[9px] text-slate-400">{t('exportModal.epubBadge')}</span>
                  </button>

                  {/* ZIP */}
                  <button
                    type="button"
                    onClick={() => handleFormatChange('zip')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      exportFormat === 'zip'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-md'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Package className="w-3.5 h-3.5 text-purple-400" />
                      <span>ZIP</span>
                    </div>
                    <span className="text-[10px] text-slate-300 font-semibold">{t('exportModal.zipSub')}</span>
                    <span className="text-[9px] text-slate-400">{t('exportModal.zipBadge')}</span>
                  </button>

                  {/* CBR */}
                  <button
                    type="button"
                    onClick={() => handleFormatChange('cbr')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      exportFormat === 'cbr'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-md'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <FileArchive className="w-3.5 h-3.5 text-blue-400" />
                      <span>CBR</span>
                    </div>
                    <span className="text-[10px] text-slate-300 font-semibold">{t('exportModal.cbrSub')}</span>
                    <span className="text-[9px] text-slate-400">{t('exportModal.cbrBadge')}</span>
                  </button>
                </div>

                {/* Format description banner */}
                <div className="mt-2 p-2.5 rounded-lg bg-comic-950/60 border border-comic-800 text-[11px] text-slate-300">
                  {exportFormat === 'cbz' && (
                    <p>
                      <strong>CBZ:</strong> {t('exportModal.cbzDesc')}
                    </p>
                  )}
                  {exportFormat === 'pdf' && (
                    <p>
                      <strong>PDF:</strong> {t('exportModal.pdfDesc')}
                    </p>
                  )}
                  {exportFormat === 'epub' && (
                    <p>
                      <strong>EPUB 3:</strong> {t('exportModal.epubDesc')}
                    </p>
                  )}
                  {exportFormat === 'zip' && (
                    <p>
                      <strong>ZIP:</strong> {t('exportModal.zipDesc')}
                    </p>
                  )}
                  {exportFormat === 'cbr' && (
                    <p>
                      <strong>CBR:</strong> {t('exportModal.cbrDesc')}
                    </p>
                  )}
                </div>
              </div>

              {/* Filename */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    {t('exportModal.filenameLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const base = computeDefaultBaseName(session);
                      setFilename(`${base}.${exportFormat}`);
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 font-medium"
                    title={t('exportModal.restoreAutoNameTitle')}
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{t('exportModal.restoreAutoName')}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-comic-950 border border-comic-700/80 text-white text-sm font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Compression & Format */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                  {t('exportModal.compressionLabel')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Original */}
                  <button
                    type="button"
                    onClick={() => setCompression('original')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      compression === 'original'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-xs">{t('exportModal.optOriginal')}</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[9px] font-bold">
                        {t('exportModal.optOriginalBadge')}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">{t('exportModal.optOriginalTitle')}</span>
                    <span className="text-[10px] text-slate-400">{t('exportModal.optOriginalSub')}</span>
                  </button>

                  {/* WebP */}
                  <button
                    type="button"
                    onClick={() => setCompression('webp')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      compression === 'webp'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-bold text-xs">{t('exportModal.optWebp')}</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">{t('exportModal.optWebpSub')}</span>
                    <span className="text-[10px] text-slate-400">{t('exportModal.optWebpDesc')}</span>
                  </button>

                  {/* JPG */}
                  <button
                    type="button"
                    onClick={() => setCompression('jpg')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      compression === 'jpg'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                        : 'bg-comic-950/40 border-comic-800 text-slate-400 hover:border-comic-700'
                    }`}
                  >
                    <span className="font-bold text-xs">{t('exportModal.optJpg')}</span>
                    <span className="text-[10px] text-slate-300 font-semibold">{t('exportModal.optJpgSub')}</span>
                    <span className="text-[10px] text-slate-400">{t('exportModal.optJpgDesc')}</span>
                  </button>
                </div>

                {/* Banner de modo Original */}
                {compression === 'original' && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-[11px] text-emerald-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {t('exportModal.optOriginalNotice')}
                    </p>
                  </div>
                )}

                {/* Controles de Calidad al re-comprimir a WebP o JPG */}
                {compression !== 'original' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-comic-950/70 border border-comic-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">
                        {t('exportModal.qualityLevel', { compression: compression.toUpperCase() })}
                      </span>
                      <span className="font-mono font-bold text-indigo-400 text-sm">
                        {quality}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={65}
                        max={95}
                        step={1}
                        value={quality}
                        onChange={(e) => setQuality(parseInt(e.target.value) || 80)}
                        className="w-full accent-indigo-500 h-1.5 bg-comic-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Presets rápidos */}
                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setQuality(75)}
                        className={`py-1 px-2 rounded-lg text-[10px] font-semibold border transition ${
                          quality === 75
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                            : 'bg-comic-900 border-comic-700/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        {t('exportModal.presetSaveMax')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuality(80)}
                        className={`py-1 px-2 rounded-lg text-[10px] font-semibold border transition ${
                          quality === 80
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                            : 'bg-comic-900 border-comic-700/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        {t('exportModal.presetRecommended')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuality(85)}
                        className={`py-1 px-2 rounded-lg text-[10px] font-semibold border transition ${
                          quality === 85
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                            : 'bg-comic-900 border-comic-700/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        {t('exportModal.presetHighFidelity')}
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed pt-0.5">
                      💡 <strong>{t('exportModal.qualityHintTitle')}</strong> {t('exportModal.qualityHint')}
                    </p>
                  </div>
                )}

                {/* Oversized WebP Warning Banner */}
                {compression === 'webp' && oversizedPages.length > 0 && (
                  <div className="mt-3 p-3.5 rounded-xl bg-amber-950/70 border border-amber-600/80 text-amber-200 text-xs space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-amber-100">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          {t('exportModal.webpLimitWarning', { count: oversizedPages.length })}
                        </span>
                      </div>
                      {onOpenImageAnalysis && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenImageAnalysis();
                          }}
                          className="text-amber-300 hover:text-white underline font-semibold transition text-[11px] shrink-0"
                        >
                          {t('exportModal.analyzeAndCut')}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      {t('exportModal.webpLimitDesc')}
                    </p>
                    <div className="text-[11px] text-amber-200/90 space-y-1 bg-amber-950/60 p-2.5 rounded-lg border border-amber-800/60">
                      <div>
                        👉 {t('exportModal.optJpgAlt')}
                      </div>
                      <div>
                        👉 {t('exportModal.optCutAlt')}
                      </div>
                      <div>
                        👉 {t('exportModal.optDownscaleAlt')}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pt-0.5 select-none">
                      <input
                        type="checkbox"
                        checked={autoDownscaleOversized}
                        onChange={(e) => setAutoDownscaleOversized(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 bg-comic-950 border-comic-700 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-semibold text-white">
                        {t('exportModal.autoDownscaleWebp')}
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Destination Directory */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('exportModal.serverDestFolder')}
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <HardDrive className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customExportDir}
                      onChange={(e) => setCustomExportDir(e.target.value)}
                      placeholder={t('exportModal.serverDestFolderPlaceholder')}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-comic-950 border border-comic-700/80 text-white text-xs font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {t('exportModal.serverDestFolderDesc')}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!exportResult && (
          <div className="px-6 py-4 bg-comic-950/80 border-t border-comic-800 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-comic-700 text-slate-300 hover:bg-comic-800 text-xs font-semibold transition disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleExport(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-comic-800 hover:bg-comic-700 text-slate-200 text-xs font-semibold border border-comic-700 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-slate-400" />
                <span>{t('exportModal.onlyDownload', { format: exportFormat.toUpperCase() })}</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleExport(true)}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 active:scale-95"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('exportModal.packagingProgress', { pct: progressInfo.percent })}</span>
                  </>
                ) : (
                  <>
                    <FolderCheck className="w-4 h-4" />
                    <span>{t('exportModal.saveToLibrary')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
