import { Toaster } from 'sonner';
import { useLocale } from '@/lib/i18n';

/**
 * يلفّ <Toaster> من sonner ويبدّل اتجاه الإشعارات والخطّ ديناميكياً
 * بحسب اللغة الحالية (العربية → IBM Plex Sans Arabic + RTL، الإنجليزية →
 * خط النظام الافتراضي + LTR).
 *
 * ‎الموقع تلقائياً: top-left للعربية (مقابل الـ sidebar اليميني)،
 * ‎top-right للإنجليزية (مقابل الـ sidebar اليساري).
 */
export function LocalizedToaster() {
  const { isRtl } = useLocale();
  return (
    <Toaster
      position={isRtl ? 'top-left' : 'top-right'}
      theme="dark"
      richColors
      closeButton
      dir={isRtl ? 'rtl' : 'ltr'}
      toastOptions={{
        style: {
          fontFamily: isRtl
            ? '"IBM Plex Sans Arabic", sans-serif'
            : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          direction: isRtl ? 'rtl' : 'ltr',
        },
      }}
    />
  );
}
