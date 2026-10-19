import React from 'react';
import { X, Coffee, Heart, ExternalLink, ShieldCheck } from 'lucide-react';
import { APP_VERSION, APP_NAME, LICENSE_NAME, LICENSE_URL, PAYPAL_BASE_URL } from '../version';
import { useTranslation } from '../i18n';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  donationUrl?: string;
}

export const DonationModal: React.FC<DonationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white dark:bg-comic-900 border border-slate-200 dark:border-comic-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/80 dark:via-comic-950 dark:to-comic-900 border-b border-slate-200 dark:border-comic-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('donation.title')}</h3>
                <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800/80">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300/80">{t('donation.subtitle', { name: APP_NAME })}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-comic-800 text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-700 dark:text-slate-300">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-comic-950/80 border border-slate-200 dark:border-comic-800/90 space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
              <Heart className="w-4 h-4 text-rose-500 shrink-0 fill-rose-500/20" />
              <span>{t('donation.projectBadge')}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
              {t('donation.projectDesc', { license: LICENSE_NAME })}
            </p>
          </div>

          {/* Direct PayPal Action Link */}
          <a
            href={PAYPAL_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
          >
            <Coffee className="w-5 h-5 shrink-0" />
            <span>{t('common.buyMeCoffee')} (PayPal)</span>
            <ExternalLink className="w-4 h-4 opacity-75 shrink-0" />
          </a>

          {/* License & Source Info */}
          <div className="pt-2 border-t border-slate-200 dark:border-comic-800 flex items-center justify-between text-[11px] text-slate-500">
            <a 
              href={LICENSE_URL} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
              title={t('common.licenseLinkTitle')}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('donation.licenseFree', { license: LICENSE_NAME })}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
            <span className="font-mono">{APP_VERSION}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
