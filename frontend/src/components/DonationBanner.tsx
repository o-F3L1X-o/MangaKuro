import React, { useState } from 'react';
import { ShieldCheck, ExternalLink, Sparkles, Heart, X } from 'lucide-react';
import { APP_VERSION, LICENSE_NAME, LICENSE_URL, PAYPAL_BASE_URL } from '../version';
import { useTranslation } from '../i18n';

interface DonationBannerProps {
  onOpenDonationModal?: () => void;
  donationUrl?: string;
  isDismissed?: boolean;
  onToggleDismiss?: (dismissed: boolean) => void;
}

const STORAGE_KEY = 'mangajutsu_hide_donation_banner';
const LEGACY_KEY = 'mangajutsu_donation_banner_dismissed';

export const DonationBanner: React.FC<DonationBannerProps> = ({ 
  isDismissed: controlledDismissed,
  onToggleDismiss
}) => {
  const { t } = useTranslation();
  // Banner can be dismissed during the current session, but re-appears on page reload
  const [internalDismissed, setInternalDismissed] = useState<boolean>(false);

  React.useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
  }, []);

  const isDismissed = controlledDismissed !== undefined ? controlledDismissed : internalDismissed;

  const handleDismiss = () => {
    setInternalDismissed(true);
    onToggleDismiss?.(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <footer 
      aria-label="Barra de estado del sistema y soporte"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-comic-950/95 backdrop-blur-md border-t border-slate-200 dark:border-comic-800/80 shadow-md text-slate-600 dark:text-slate-400 px-4 py-1.5 text-xs select-none transition-all"
    >
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: System Status, Version & GPLv3 License */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold">
            <Sparkles className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />
            <span>{APP_VERSION}</span>
          </span>

          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline font-semibold text-[11px] transition"
            title={t('common.licenseLinkTitle')}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('common.gplLicense')}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </a>
        </div>

        {/* Right: Direct PayPal Support Link & Dismiss Button */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={PAYPAL_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition cursor-pointer"
            title={t('footer.supportProject')}
          >
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
            <span className="hidden sm:inline">{t('footer.supportProject')}</span>
            <span className="sm:hidden">{t('footer.supportShort')}</span>
          </a>

          {/* Close / Dismiss Button (X) */}
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-white dark:hover:bg-comic-800 transition cursor-pointer"
            title={t('footer.closeBanner')}
            aria-label={t('footer.closeBanner')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
};
