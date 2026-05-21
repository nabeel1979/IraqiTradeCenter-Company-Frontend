import { useEffect, useMemo, useState } from 'react';
import { Search, Bell, Calendar, RefreshCw, ArrowDownLeft, ArrowUpRight, BookOpen } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { cn } from '@/lib/utils';

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

export function TopBar() {
  const location = useLocation();
  const meta = matchTitle(location.pathname);
  const voucherCode = matchVoucherReportCode(location.pathname);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    <header className="sticky top-0 z-30 h-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between px-8">
        {/* Title */}
        {voucherType ? (
          // ‎بطاقة نوع السند — تحلّ محل العنوان النصي العام في مسارات تقارير السندات
          <div className="flex items-center gap-2.5">
            {voucherType.nature === 'Debit' ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                <ArrowDownLeft className="h-5 w-5" />
              </span>
            ) : voucherType.nature === 'Credit' ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
            )}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-semibold leading-none tracking-tight">
                  {voucherType.nameAr}
                </h2>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
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
              <p className="text-xs text-muted-foreground">سجلّ السندات وتقريرها</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{meta.title}</h2>
            {meta.description && (
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            )}
          </div>
        )}

        {/* Search + Actions */}
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="بحث سريع..."
              className="w-full rounded-md border border-border bg-secondary/40 py-2 pr-10 pl-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            <kbd className="absolute left-3 top-1/2 hidden -translate-y-1/2 select-none rounded border border-border/50 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
              Ctrl K
            </kbd>
          </div>

          <button className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Calendar className="h-4 w-4" />
            <span className="tnum">
              {new Intl.DateTimeFormat('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
            </span>
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
