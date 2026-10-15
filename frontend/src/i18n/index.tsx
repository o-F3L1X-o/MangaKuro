import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider, useTranslation as useI18nRaw } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

export type Language = 'es' | 'en';
export type TranslationKey = string;

const STORAGE_KEY = 'mangajutsu_language';

const getSavedLanguage = (): Language => {
  try {
    const saved =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem('mangamic_language') ||
      localStorage.getItem('cbz_language');
    if (saved === 'es' || saved === 'en') return saved;
  } catch {}
  return 'es'; // Spanish default
};

const initialLang = getSavedLanguage();

if (!i18n.isInitialized) {
  i18n
    .use(HttpBackend)
    .use(initReactI18next)
    .init({
      lng: initialLang,
      fallbackLng: 'es',
      supportedLngs: ['es', 'en'],
      backend: {
        loadPath: '/locales/{{lng}}/translation.json?v=14',
      },
      interpolation: {
        escapeValue: false, // React already escapes values
        prefix: '{',
        suffix: '}',
      },
      react: {
        useSuspense: false,
      },
    });
}

const resolveTranslation = (
  rawT: (key: string, params?: Record<string, any>) => any,
  key: string,
  params?: Record<string, any>
): string => {
  const direct = rawT(key, params);
  if (typeof direct === 'string' && direct !== key) {
    return direct;
  }

  // Fallback: if a flat key without namespace was passed, search all top-level namespaces
  if (!key.includes('.')) {
    const lang = i18n.language || 'es';
    const bundle = i18n.getResourceBundle(lang, 'translation') || i18n.getResourceBundle('es', 'translation');
    if (bundle && typeof bundle === 'object') {
      for (const ns of Object.keys(bundle)) {
        const section = bundle[ns];
        if (section && typeof section === 'object' && key in section) {
          const namespacedRes = rawT(`${ns}.${key}`, params);
          if (typeof namespacedRes === 'string') {
            return namespacedRes;
          }
        }
      }
    }
  }

  return typeof direct === 'string' ? direct : key;
};

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, any>) => string;
  i18n: typeof i18n;
}

const I18nCustomContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentLang, setCurrentLang] = useState<Language>(initialLang);

  const setLanguage = useCallback((lang: Language) => {
    setCurrentLang(lang);
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
    const handleLanguageChanged = (lng: string) => {
      if (lng === 'es' || lng === 'en') {
        setCurrentLang(lng);
      }
    };
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [currentLang]);

  const { t: rawT } = useI18nRaw();

  const t = useCallback(
    (key: string, params?: Record<string, any>): string => {
      return resolveTranslation(rawT, key, params);
    },
    [rawT]
  );

  const value = useMemo(
    () => ({
      language: currentLang,
      setLanguage,
      t,
      i18n,
    }),
    [currentLang, setLanguage, t]
  );

  return (
    <I18nextProvider i18n={i18n}>
      <I18nCustomContext.Provider value={value}>
        {children}
      </I18nCustomContext.Provider>
    </I18nextProvider>
  );
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nCustomContext);
  if (!context) {
    const { t } = useI18nRaw();
    return {
      language: (i18n.language as Language) || 'es',
      setLanguage: (lang: Language) => {
        i18n.changeLanguage(lang);
        try {
          localStorage.setItem(STORAGE_KEY, lang);
        } catch {}
      },
      t: (key: string, params?: Record<string, any>) => {
        return resolveTranslation(t, key, params);
      },
      i18n,
    };
  }
  return context;
};

export const useI18n = useTranslation;
export default i18n;
