import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * Layout متجاوب يدعم الجوال:
 * - على الشاشات ≥ lg (≥1024px): الـ Sidebar ثابت على اليمين بعرض 18rem والمحتوى بـ margin-right.
 * - على الشاشات الأصغر: الـ Sidebar يصبح Drawer ينزلق من اليمين فوق المحتوى مع overlay.
 *   - يفتح بزر hamburger في الـ TopBar.
 *   - يُغلق تلقائياً عند الانتقال لمسار آخر، أو ضغط Esc، أو النقر خارجه.
 *   - يمنع scroll الخلفية أثناء فتحه.
 */
export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // أغلق الـ Drawer تلقائياً عند الانتقال لصفحة جديدة (تجربة طبيعية على الموبايل).
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Esc لإغلاق الدراور
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // امنع scroll body أثناء فتح الدراور على الجوال
  useEffect(() => {
    if (sidebarOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [sidebarOpen]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      {/* Overlay للجوال — يظهر فقط عند فتح الدراور */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex h-[100dvh] flex-col lg:mr-72">
        <TopBar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 min-h-0 overflow-hidden px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 animate-fade-in">
          <div className="h-full overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
