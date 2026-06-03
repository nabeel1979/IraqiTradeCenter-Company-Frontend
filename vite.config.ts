import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // ‎بصمة بناء فريدة لكل build — تستخدمها main.tsx لإجبار المتصفح على
  // ‎مسح الـ cache والـ SW القديم عند رؤية إصدار مختلف عن آخر زيارة.
  const buildId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    define: {
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    },
    plugins: [
      react(),
      // ════════════════════════════════════════════════════════════════════
      // PWA: يحوّل التطبيق إلى Progressive Web App قابل للتثبيت على الهاتف
      // ════════════════════════════════════════════════════════════════════
      // - registerType: 'autoUpdate' → Service Worker يُحدّث نفسه تلقائياً
      //   عند صدور بناء جديد، فلا حاجة لتدخّل يدوي بعد كل deploy.
      // - manifest عربي/RTL مع display=standalone حتى يبدو التطبيق native
      //   عند تثبيته على الـ home screen (بدون شريط المتصفح).
      // - workbox: nav requests + assets يُخزّنون لـ offline-first تجربة،
      //   مع NetworkFirst لـ /api كي تبقى البيانات دائماً طازجة لكنها تعمل
      //   ولو ضعيفة الشبكة.
      VitePWA({
        registerType: 'autoUpdate',
        // ‎الأصول الثابتة المُضمّنة في الـ precache أيضاً
        includeAssets: ['favicon.svg', 'logo.png'],
        manifest: {
          name: 'مركز التجارة العراقي',
          short_name: 'تجارة العراقي',
          description: 'لوحة الشركة - مركز التجارة العراقي',
          theme_color: '#0F0F11',
          background_color: '#0F0F11',
          display: 'standalone',
          orientation: 'portrait',
          dir: 'rtl',
          lang: 'ar',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          // ‎حد أقصى للملف الواحد في الـ precache: 5 MB (assets vendor كبيرة)
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
          // ‎SPA: أي route غير معروف يُعاد إلى index.html من الـ cache
          navigateFallback: '/index.html',
          // ‎استثنِ:
          //   • /api و /parent-api: طلبات backend لا يجب أن يُغطّيها fallback.
          //   • /kill-sw.html: صفحة طوارئ لتنظيف SW؛ لو لُفَّت بالـ index.html
          //     القديم يستحيل التعافي من كاش معطوب.
          //   • أي ملف بامتداد ظاهر (.html / .json / .js …) — لا يجب أن يُعامل
          //     كـ navigation route ويُرجَع له index.html.
          navigateFallbackDenylist: [
            /^\/api/,
            /^\/parent-api/,
            /^\/kill-sw\.html$/,
            /\.[a-zA-Z0-9]+$/,
          ],
          // ‎ينظّف الـ caches القديمة فور تنشيط الـ SW الجديد — يمنع تقديم
          // ‎JS/CSS قديم بعد الـ deploy
          cleanupOutdatedCaches: true,
          // ‎SW الجديد يتولى الـ fetch فوراً بدلاً من الانتظار حتى تُغلق كل التابات
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              // ‎الخطوط من Google Fonts: cache-first (نادراً ما تتغيّر)
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // ‎API requests: NetworkFirst — نحاول أولاً الشبكة، نسقط على cache عند الفشل.
              // ‎مهم: نقيّدها على نفس الأصل (same-origin) فقط، وإلا يلتقط الـ SW طلبات
              // ‎جسر الماسح الضوئي (http://127.0.0.1:5100/api/health) لأن مسارها يبدأ بـ
              // ‎/api، فيفشل NetworkFirst على الحاسبات بلا سكنر ويُسجّل خطأ no-response.
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && url.pathname.startsWith('/api'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 8,
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5050',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'query-vendor': ['@tanstack/react-query', 'axios'],
            'charts-vendor': ['recharts'],
            'ui-vendor': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select'],
          },
        },
      },
    },
  };
});
