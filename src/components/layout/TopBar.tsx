import { useEffect, useMemo, useState } from 'react';
import { Bell, Calendar, RefreshCw, ArrowDownLeft, ArrowUpRight, BookOpen, Menu, Sun, Moon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { LicenseBadge } from '@/components/license/LicenseBadge';

const routeTitles: Record<string, { title: string; description?: string }> = {
  '/': { title: 'لوحة القيادة', description: 'نظرة عامة على أعمال الشركة' },
  '/invoices': { title: 'فواتير المبيعات', description: 'إدارة وعرض جميع الفواتير' },
  '/invoices/new': { title: 'فاتورة مبيعات جديدة', description: 'إنشاء فاتورة جديدة' },
  '/customers': { title: 'العملاء', description: 'إدارة عملاء الشركة' },
  '/sales-reps': { title: 'مندوبو المبيعات', description: 'إدارة المندوبين والعمولات' },
  '/inventory': { title: 'المخزون', description: 'إدارة المواد والكميات' },
  '/inventory/movements': { title: 'حركات المخزون', description: 'سجل دخول وخروج المواد' },
  '/orders': { title: 'الطلبيات الواردة', description: 'طلبيات من تجار المنصة' },
  '/accounting/accounts': { title: 'شجرة الحسابات', description: 'الهيكل المحاسبي الكامل' },
  '/accounting/accounts/trash': { title: 'سلة المهملات — الحسابات', description: 'الحسابات المحذوفة مؤقتاً — قابلة للاستعادة' },
  '/system/trash': { title: 'سلة المهملات', description: 'كل المحذوفات في النظام — قابلة للاستعادة أو الحذف النهائي' },
  '/accounting/journal': { title: 'القيود المحاسبية', description: 'القيود اليومية المرحّلة' },
  '/accounting/journal/new': { title: 'قيد محاسبي جديد', description: 'إنشاء قيد محاسبي' },
  '/accounting/trial-balance': { title: 'ميزان المراجعة', description: 'الأرصدة المدينة والدائنة' },
  '/accounting/account-statement': { title: 'كشف الحساب' },
  '/accounting/fiscal-years': { title: 'الفترات المحاسبية', description: 'إدارة السنوات والفترات المحاسبية' },
  '/accounting/currency-rates': { title: 'نشرات أسعار العملات', description: 'إدارة نشرات أسعار صرف العملات الأجنبية' },
  '/settings': { title: 'الإعدادات', description: 'إعدادات النظام والحساب' },
  '/settings/menu': { title: 'إعدادات القائمة', description: 'تخصيص قائمة التنقل' },
};

/** يطابق المسارات الديناميكية مثل /accounting/journal/:id/edit */
function matchTitle(pathname: string): { title: string; description?: string } {
  if (routeTitles[pathname]) return routeTitles[pathname];
  // أنماط ديناميكية معروفة
  if (/^\/accounting\/journal\/\d+\/edit$/.test(pathname)) {
    return { title: 'تعديل قيد محاسبي', description: 'تعديل قيد محاسبي قائم' };
  }
  return { title: 'صفحة' };
}

/** ‎يطابق مسار تقرير سند مخصّص: /accounting/vouchers/:code */
function matchVoucherReportCode(pathname: string): string | null {
  const m = /^\/accounting\/vouchers\/([^/]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]).toUpperCase() : null;
}

interface TopBarProps {
  /** يفتح الـ Sidebar Drawer على الجوال — يُمرَّر من Layout. */
  onOpenSidebar?: () => void;
}

export function TopBar({ onOpenSidebar }: TopBarProps = {}) {
  const location = useLocation();
  const meta = matchTitle(location.pathname);
  const voucherCode = matchVoucherReportCode(location.pathname);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // ‎جلب أنواع السندات لعرض بطاقة الرأس في تقارير السندات المخصّصة
  const voucherTypesQuery = useQuery({
    queryKey: ['journal-voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
    enabled: voucherCode !== null,
  });
  const voucherType = useMemo(() => {
    if (!voucherCode) return null;
    return (voucherTypesQuery.data ?? []).find(v => v.code.toUpperCase() === voucherCode) ?? null;
  }, [voucherCode, voucherTypesQuery.data]);

  /**
   * إعادة تحميل كاملة للصفحة (مثل F5/Ctrl+R في المتصفح):
   *   • يجلب أحدث index.html والـ assets من السيرفر — يضمن رؤية UI الجديد فوراً
   *     بعد كل deploy بدون الحاجة لإغلاق التطبيق.
   *   • يجدد كل البيانات (لا حاجة لـ invalidateQueries).
   *   • الأنيميشن يدور قبل reload ليعطي feedback بصري للضغط.
   */
  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    // ‎تأخير صغير لظهور دوران الأيقونة قبل الـ reload (تجربة مستخدم أفضل).
    setTimeout(() => {
      try { window.location.reload(); }
      catch { setIsRefreshing(false); }
    }, 120);
  };

  // اختصار F5 / Ctrl+R: إعادة تحميل كاملة (نفس زر التحديث في الـ TopBar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isF5 = e.key === 'F5';
      const isCtrlR = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !e.shiftKey;
      if (isF5 || isCtrlR) {
        e.preventDefault();
        e.stopPropagation();
        handleRefresh();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // استقبال أمر التحديث من التطبيق المكتبي (WPF يرسل CustomEvent عبر CoreWebView2)
  useEffect(() => {
    const onAppRefresh = () => handleRefresh();
    window.addEventListener('itc:refresh', onAppRefresh);
    return () => window.removeEventListener('itc:refresh', onAppRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border/60 bg-background/85 backdrop-blur-xl sm:h-20">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Hamburger — يظهر فقط على الشاشات الأصغر من lg */}
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="فتح القائمة"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Title */}
        {voucherType ? (
          // ‎بطاقة نوع السند — تحلّ محل العنوان النصي العام في مسارات تقارير السندات
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            {voucherType.nature === 'Debit' ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 sm:h-10 sm:w-10">
                <ArrowDownLeft className="h-5 w-5" />
              </span>
            ) : voucherType.nature === 'Credit' ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-400 sm:h-10 sm:w-10">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary sm:h-10 sm:w-10">
                <BookOpen className="h-5 w-5" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate font-display text-base font-semibold leading-none tracking-tight sm:text-xl">
                  {voucherType.nameAr}
                </h2>
                <span
                  className={cn(
                    'hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline',
                    voucherType.nature === 'Debit'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : voucherType.nature === 'Credit'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-primary/15 text-primary'
                  )}
                >
                  طبيعة {
                    voucherType.nature === 'Debit' ? 'مدين'
                      : voucherType.nature === 'Credit' ? 'دائن'
                      : 'مختلطة'
                  }
                </span>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">سجلّ السندات وتقريرها</p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="truncate font-display text-base font-semibold tracking-tight sm:text-2xl">
              {meta.title}
            </h2>
            {meta.description && (
              <p className="hidden text-xs text-muted-foreground sm:block">{meta.description}</p>
            )}
          </div>
        )}

        {/* License Badge + Actions */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* ‎شارة ترخيص النظام — تحلّ محلّ صندوق البحث القديم.
              تُظهر عدّاداً تنازلياً بالأيام المتبقية + تفتح حواراً للتفعيل والشراء. */}
          <LicenseBadge />

          {/* التاريخ: مخفي على الجوال (يأخذ مساحة كبيرة)؛ يظهر من md */}
          <button className="hidden h-10 items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex">
            <Calendar className="h-4 w-4" />
            <span className="tnum">
              {new Intl.DateTimeFormat('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
            </span>
          </button>

          {/* ‎تبديل الوضع: ليلي/نهاري — يحفظ التفضيل في localStorage */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
            aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-amber-400"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="إعادة تحميل الصفحة (F5 / Ctrl+R)"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>

          <button className="relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          </button>
        </div>
      </div>
    </header>
  );
}
