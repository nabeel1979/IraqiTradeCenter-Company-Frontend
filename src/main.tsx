import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './globals.css';
import { registerSW } from 'virtual:pwa-register';
// ‎تهيئة i18next قبل أي مكوّن يستخدم الترجمة (side-effect import).
import './lib/i18n/config';
import { LocalizedToaster } from './components/layout/LocalizedToaster';
import { toast } from 'sonner';
import i18n from './lib/i18n/config';

// ════════════════════════════════════════════════════════════════════
// PWA Service Worker registration + Aggressive update strategy
// ════════════════════════════════════════════════════════════════════
// - يُحدّث نفسه تلقائياً (registerType: 'autoUpdate' في vite.config).
// - عند توفّر بناء جديد نُعرض Toast بسيط ثم نُعيد التحميل تلقائياً.
// - نسأل الـ SW يدوياً عن التحديثات كل دقيقتين كي يلتقط النشر بسرعة دون
//   انتظار أحداث navigation فقط.
// - عند التحميل الأول: إن وُجد SW قديم ولا يطابق إصدار build الحالي،
//   نُلغي تسجيله ونعيد التحميل مرّة واحدة كي لا يبقى المستخدم على
//   إصدار مُخبَّأ بعد كل deploy.
if (typeof window !== 'undefined') {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast.info(i18n.t('topbar.newRefresh'), {
        description: i18n.t('topbar.refreshLoading'),
        duration: 4000,
      });
      setTimeout(() => updateSW(true), 1500);
    },
    onOfflineReady() {
      toast.success(i18n.t('topbar.offlineReady'), { duration: 3000 });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // ‎فحص دوري للتحديثات: كل دقيقتين يطلب من SW البحث عن نسخة جديدة
      setInterval(() => registration.update().catch(() => {}), 120_000);
    },
  });

  // ‎بصمة الإصدار من Vite — تتغيّر مع كل build وتُكتب في window
  // ‎كي يقرأها أي script آخر ويُنبِّه المستخدم إن كانت قديمة.
  const BUILD_ID = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev';
  (window as unknown as { __APP_BUILD__: string }).__APP_BUILD__ = BUILD_ID;

  // ‎مفتاح localStorage لتذكُّر الإصدار الذي رآه المستخدم آخر مرة
  const STORAGE_KEY = '__last_seen_build__';
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (last && last !== BUILD_ID) {
      // ‎نسخة جديدة: نُنظّف caches و SW القديم ثم نُعيد التحميل مرّة واحدة
      // ‎لكي يلتقط المستخدم index.html و assets الجديدة فوراً.
      const ALREADY_RELOADED = '__build_reload_done__';
      if (!sessionStorage.getItem(ALREADY_RELOADED)) {
        sessionStorage.setItem(ALREADY_RELOADED, '1');
        localStorage.setItem(STORAGE_KEY, BUILD_ID);
        Promise.all([
          'caches' in window
            ? caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
            : Promise.resolve(),
          navigator.serviceWorker
            ? navigator.serviceWorker
                .getRegistrations()
                .then(regs => Promise.all(regs.map(r => r.unregister())))
            : Promise.resolve(),
        ])
          .catch(() => {})
          .finally(() => window.location.reload());
      }
    } else if (!last) {
      localStorage.setItem(STORAGE_KEY, BUILD_ID);
    }
  } catch {
    // ‎تجاهل أخطاء storage (وضع الخصوصية مثلاً)
  }
}

import { isCompanyHost } from './lib/platform';

// ════════════════════════════════════════════════════════════════════
// Company Theme: بني/ذهبي — iraqitradecenter_company.gcc.iq أو subdomain شركة
// ════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined' && isCompanyHost()) {
  document.documentElement.classList.add('theme-company');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <LocalizedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
