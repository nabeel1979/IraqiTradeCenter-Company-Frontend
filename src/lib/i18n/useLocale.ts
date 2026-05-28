import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppLocale,
  LOCALE_STORAGE_KEY,
  localeDirection,
} from './config';

/** يطبّق اللغة على الـ <html> (lang + dir) ويُزامن body class. */
export function applyLocaleToDocument(locale: AppLocale) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('lang', locale);
  root.setAttribute('dir', localeDirection(locale));
  document.body?.classList.remove('locale-ar', 'locale-en');
  document.body?.classList.add(`locale-${locale}`);
}

function normalizeLocale(lng: string | undefined): AppLocale {
  return lng?.startsWith('en') ? 'en' : 'ar';
}

/**
 * Hook موحَّد لإدارة لغة الواجهة.
 * مصدر الحقيقة الوحيد: i18next — لا state محلي منفصل لكل مكوّن
 * (كان يسبب إعادة اللغة للعربية عند التبديل من TopBar).
 */
export function useLocale() {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.language);

  // مزامنة document عند أي تغيير لغة (من هذا التبويب أو i18n مباشرة).
  useEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  // تبويب آخر غيّر localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCALE_STORAGE_KEY) return;
      const next: AppLocale = e.newValue === 'en' ? 'en' : 'ar';
      if (normalizeLocale(i18n.language) !== next) {
        void i18n.changeLanguage(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [i18n]);

  const setLocale = useCallback(
    (next: AppLocale) => {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // تجاهل (Private mode / storage معطَّل).
      }
      void i18n.changeLanguage(next);
      applyLocaleToDocument(next);
    },
    [i18n],
  );

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }, [locale, setLocale]);

  return {
    locale,
    setLocale,
    toggleLocale,
    direction: localeDirection(locale),
    isRtl: locale === 'ar',
  };
}
