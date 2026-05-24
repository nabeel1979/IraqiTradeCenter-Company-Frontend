import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'itc-theme';

/**
 * يُعيد القيمة المخزَّنة في localStorage أو 'dark' كافتراضي.
 * يطابق المنطق المُضمَّن في index.html لتفادي اختلاف بين أوّل render
 * والـ script الذي يعمل قبل تركيب React.
 */
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  // ‎تحديث ميتا الألوان لشريط الحالة على الجوال (PWA / Safari iOS)
  const themeColor = document.getElementById('itc-theme-color');
  if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#0F0F11' : '#F7F2EA');
  const colorScheme = document.getElementById('itc-color-scheme');
  if (colorScheme) colorScheme.setAttribute('content', theme);
}

/**
 * Hook لإدارة وضع الألوان (ليلي/نهاري) عبر التطبيق.
 * يحفظ التفضيل في localStorage ويُزامن بين تبويبات المتصفح.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  // ‎مزامنة عند تغيُّر القيمة من تبويب آخر
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next: Theme = e.newValue === 'light' ? 'light' : 'dark';
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // تجاهل أخطاء تخزين (Private mode مثلاً)
    }
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
