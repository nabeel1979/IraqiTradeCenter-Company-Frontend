import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

export type AppLocale = 'ar' | 'en';
export const SUPPORTED_LOCALES: AppLocale[] = ['ar', 'en'];
export const DEFAULT_LOCALE: AppLocale = 'ar';
export const LOCALE_STORAGE_KEY = 'itc-locale';

/**
 * يقرأ اللغة المخزَّنة في localStorage مع fallback إلى العربية.
 * متطابق مع الـ inline script في index.html لتفادي ومضة بصرية بين أوّل
 * render والـ html dir/lang التي يضبطها المتصفّح قبل تشغيل React.
 */
export function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'ar' || raw === 'en') return raw;
    // fallback: لغة المتصفّح إذا كانت إنجليزية، وإلّا عربية.
    const browser = (navigator.language || '').toLowerCase();
    if (browser.startsWith('en')) return 'en';
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function localeDirection(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: readStoredLocale(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });

// مزامنة dir/lang على <html> عند كل تغيير لغة (حتى خارج React).
i18n.on('languageChanged', (lng) => {
  const locale: AppLocale = lng.startsWith('en') ? 'en' : 'ar';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', localeDirection(locale));
    document.body?.classList.remove('locale-ar', 'locale-en');
    document.body?.classList.add(`locale-${locale}`);
  }
});

export default i18n;
