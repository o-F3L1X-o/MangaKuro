import React, { useState } from 'react';
import { X, Save, Settings as SettingsIcon, CheckCircle2, Trash2, Sparkles, ShieldCheck, Heart, LogOut } from 'lucide-react';
import { AppSettings } from '../types';
import { saveSettings, cleanupAllStaging, cleanupOrphanedStaging, logoutAuth } from '../api';
import { APP_VERSION, DEFAULT_DONATION_URL } from '../version';
import { useTranslation } from '../i18n';

interface SettingsModalProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (newSettings: AppSettings) => void;
  onOpenDonationModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onUpdate,
  onOpenDonationModal
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<AppSettings>({ 
    ...settings,
    donation_url: DEFAULT_DONATION_URL 
  });
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCleanupStaging = async () => {
    if (!window.confirm(t('settings.cleanAllConfirm'))) {
      return;
    }
    try {
      const res = await cleanupAllStaging();
      setCleanupMessage(`✓ ${t('settings.cleanSuccess').replace('{count}', String(res.cleaned_sessions))}`);
      setTimeout(() => setCleanupMessage(null), 4000);
    } catch (err: any) {
      setCleanupMessage(t('settings.cleanError'));
    }
  };

  const handleCleanupOrphaned = async () => {
    try {
      const res = await cleanupOrphanedStaging();
      if (res.cleaned_sessions > 0) {
        setCleanupMessage(
          `✓ ${t('settings.cleanOrphansSuccess')
            .replace('{count}', String(res.cleaned_sessions))
            .replace('{freed}', String(res.freed_gb))}`
        );
      } else {
        setCleanupMessage(`✓ ${t('settings.cleanOrphansClean')}`);
      }
      setTimeout(() => setCleanupMessage(null), 5000);
    } catch (err: any) {
      setCleanupMessage(t('settings.cleanOrphansError'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccess(false);
    try {
      const payload: AppSettings = {
        ...formData,
        donation_url: DEFAULT_DONATION_URL
      };
      await saveSettings(payload);
      onUpdate(payload);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl lg:max-w-5xl max-h-[90vh] md:max-h-[85vh] bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-comic-950/90 border-b border-slate-200 dark:border-comic-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('settings.settingsTitle')}
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
              {APP_VERSION}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-comic-800 transition"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
            {success && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 shadow-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{t('settings.settingsSaved')}</span>
              </div>
            )}

            {cleanupMessage && (
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-700/60 text-indigo-800 dark:text-indigo-300 text-xs flex items-center gap-2 shadow-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>{cleanupMessage}</span>
              </div>
            )}

            {/* 2-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Column A: Export & Library */}
              <div className="space-y-4">
                {/* Staging Storage Path */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-1.5 shadow-sm">
                  <label className="block text-xs font-bold text-slate-900 dark:text-slate-200">
                    {t('settings.stagingPath')}
                  </label>
                  <input
                    type="text"
                    value={formData.staging_directory || ''}
                    onChange={(e) => setFormData({ ...formData, staging_directory: e.target.value })}
                    placeholder={t('settings.stagingPathPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition"
                  />
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('settings.stagingPathDesc')}
                  </p>
                </div>

                {/* Komga Library Path */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-1.5 shadow-sm">
                  <label className="block text-xs font-bold text-slate-900 dark:text-slate-200">
                    {t('settings.komgaLibPath')}
                  </label>
                  <input
                    type="text"
                    value={formData.export_directory}
                    onChange={(e) => setFormData({ ...formData, export_directory: e.target.value })}
                    placeholder={t('settings.komgaLibPathPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition"
                  />
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('settings.komgaLibPathDesc')}
                  </p>
                </div>

                {/* Compression & Quality */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-3 shadow-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                      {t('settings.defaultCompression')}
                    </label>
                    <select
                      value={formData.default_compression}
                      onChange={(e) => setFormData({ ...formData, default_compression: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition cursor-pointer font-medium"
                    >
                      <option value="webp">{t('settings.optWebp')}</option>
                      <option value="jpg">{t('settings.optJpg')}</option>
                      <option value="original">{t('settings.optOriginal')}</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-200 mb-1">
                      <span>{t('settings.defaultQuality', { quality: formData.default_quality })}</span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                        {formData.default_quality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="98"
                      value={formData.default_quality}
                      onChange={(e) => setFormData({ ...formData, default_quality: parseInt(e.target.value) })}
                      className="w-full accent-indigo-600 dark:accent-indigo-500 mt-1 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Komga Server Integration */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-2.5 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                    {t('settings.komgaIntegration')}
                  </h4>

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-400 mb-1">
                        {t('settings.komgaServerUrl')}
                      </label>
                      <input
                        type="text"
                        value={formData.komga_server_url}
                        onChange={(e) => setFormData({ ...formData, komga_server_url: e.target.value })}
                        placeholder={t('settings.komgaServerUrlPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-400 mb-1">
                        {t('settings.komgaApiKey')}
                      </label>
                      <input
                        type="password"
                        value={formData.komga_api_key}
                        onChange={(e) => setFormData({ ...formData, komga_api_key: e.target.value })}
                        placeholder={t('settings.komgaApiKeyPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Column B: Performance, Security, Maintenance & Donations */}
              <div className="space-y-4">
                {/* Security & Access Protection */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-2 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>{t('settings.securityTitle') || 'Seguridad y Acceso'}</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-400 mb-1">
                      {t('settings.appPassword') || 'Contraseña de la Aplicación (Opcional)'}
                    </label>
                    <input
                      type="password"
                      value={formData.app_password || ''}
                      onChange={(e) => setFormData({ ...formData, app_password: e.target.value })}
                      placeholder={t('settings.appPasswordPlaceholder') || 'Dejar en blanco para acceso libre sin contraseña'}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-comic-950 border border-slate-300 dark:border-comic-700/80 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition"
                    />
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                      {t('settings.appPasswordDesc') || 'Si defines una contraseña, se solicitará al acceder a la suite. Ideal para exponer MangaKuro tras un Reverse Proxy / NPM.'}
                    </p>
                    {settings.app_password && (
                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(t('settings.logoutConfirm') || '¿Deseas cerrar sesión en este navegador?')) {
                              await logoutAuth();
                              window.location.reload();
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold transition cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>{t('settings.logoutBtn') || 'Cerrar sesión'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Performance Monitor */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-2 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                    {t('settings.perfMonitorTitle')}
                  </h4>
                  <label className="flex items-start gap-3 p-2.5 rounded-lg bg-white dark:bg-comic-950 border border-slate-200 dark:border-comic-800/80 cursor-pointer hover:border-indigo-300 dark:hover:border-comic-700 transition">
                    <input
                      type="checkbox"
                      checked={formData.show_system_monitor ?? true}
                      onChange={(e) => setFormData({ ...formData, show_system_monitor: e.target.checked })}
                      className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-50 dark:bg-comic-900 border-slate-300 dark:border-comic-700"
                    />
                    <div className="text-xs space-y-0.5">
                      <span className="font-bold text-slate-900 dark:text-slate-200 block">
                        {t('settings.perfMonitorCheckbox')}
                      </span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t('settings.perfMonitorDesc')}
                      </p>
                    </div>
                  </label>
                </div>

                {/* Staging Disk Cleanup */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 space-y-2.5 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                    {t('settings.stagingMemoryTitle')}
                  </h4>

                  {/* Clean Orphans */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-comic-950 border border-slate-200 dark:border-comic-800 flex items-center justify-between gap-3">
                    <div className="text-xs min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-200 truncate">
                        {t('settings.cleanOrphansTitle')}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {t('settings.cleanOrphansDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCleanupOrphaned}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 dark:bg-amber-950/80 dark:hover:bg-amber-900 border border-amber-600 dark:border-amber-800 text-white dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t('settings.cleanOrphansBtn')}</span>
                    </button>
                  </div>

                  {/* Purge All */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-comic-950 border border-slate-200 dark:border-comic-800 flex items-center justify-between gap-3">
                    <div className="text-xs min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-200 truncate">
                        {t('settings.cleanAllTitle')}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {t('settings.cleanAllDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCleanupStaging}
                      className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 dark:bg-rose-950/80 dark:hover:bg-rose-900 border border-rose-600 dark:border-rose-800 text-white dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('settings.cleanAllBtn')}</span>
                    </button>
                  </div>
                </div>

                {/* Official Donation Link (Clean Unified Phrase directly to PayPal) */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-comic-950/60 border border-slate-200 dark:border-comic-800 shadow-sm flex items-center justify-center text-center">
                  <a
                    href={DEFAULT_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition cursor-pointer"
                    title={t('footer.supportProject')}
                  >
                    <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="underline decoration-slate-300 dark:decoration-comic-700 underline-offset-4 group-hover:decoration-amber-500">
                      {t('footer.supportProject')}
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-comic-950/90 border-t border-slate-200 dark:border-comic-800 flex items-center justify-between shrink-0">
            {/* Left: License & Version */}
            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t('settings.gplLicense')}</span>
              </span>
              <span className="text-slate-400 dark:text-slate-600">•</span>
              <span className="font-mono text-slate-500 dark:text-slate-400 font-bold">{APP_VERSION}</span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 dark:border-comic-700 dark:text-slate-300 dark:hover:bg-comic-800 text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{t('settings.saveSettings')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
