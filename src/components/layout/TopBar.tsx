import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Bell, Calendar, RefreshCw, ArrowDownLeft, ArrowUpRight, BookOpen,
  Menu, Sun, Moon, X, Languages, CheckCheck, ExternalLink,
  Cloud, CloudOff, CloudUpload, AlertCircle,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { notificationsApi, type NotificationDto } from '@/lib/api/notifications';
import { attachmentSettingsApi } from '@/lib/api/attachmentSettings';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useLocale, localizedName } from '@/lib/i18n';
import { LicenseBadge } from '@/components/license/LicenseBadge';

/**
 * المسارات المُعرَّفة في النظام كمفاتيح ترجمة. أنماط ديناميكية مثل
 * /accounting/journal/:id/edit تُترجَم عبر دوال match أدناه.
 */
const STATIC_ROUTE_KEYS: string[] = [
  '/',
  '/invoices', '/invoices/new',
  '/customers',
  '/sales-reps',
  '/inventory', '/inventory/movements',
  '/orders',
  '/accounting/accounts', '/accounting/accounts/trash',
  '/system/trash',
  '/accounting/journal', '/accounting/journal/new',
  '/accounting/trial-balance',
  '/accounting/account-statement',
  '/accounting/account-balances',
  '/accounting/fiscal-years',
  '/accounting/currency-rates',
  '/accounting/cash-box-balances',
  '/accounting/cash-box-transfers',
  '/financial-management',
  '/financial-management/suppliers',
  '/financial-management/customers',
  '/financial-management/banks',
  '/financial-management/cash-boxes',
  '/financial-management/payment-companies',
  '/financial-management/account-settlements',
  '/accounting/voucher-types',
  '/settings', '/settings/menu', '/settings/users', '/settings/roles',
];

function useRouteMeta(pathname: string): { title: string; description?: string } {
  const { t, i18n } = useTranslation();

  // ‎مساعد لقراءة عنصر من JSON بطريقة آمنة (i18next.getResource).
  const getMeta = (key: string): { title?: string; description?: string } | null => {
    const node = i18n.getResource(i18n.language, 'translation', `routes.${key}`);
    return (node && typeof node === 'object') ? node as { title?: string; description?: string } : null;
  };

  if (STATIC_ROUTE_KEYS.includes(pathname)) {
    const meta = getMeta(pathname);
    if (meta?.title) return { title: meta.title, description: meta.description };
  }
  if (/^\/accounting\/journal\/\d+\/edit$/.test(pathname)) {
    const meta = getMeta('/accounting/journal/edit');
    if (meta?.title) return { title: meta.title, description: meta.description };
  }
  if (/^\/accounting\/journal\/\d+\/view$/.test(pathname)) {
    const meta = getMeta('/accounting/journal/view');
    if (meta?.title) return { title: meta.title };
  }
  if (/^\/accounting\/vouchers\/[^/]+\/new$/.test(pathname)) {
    const meta = getMeta('/accounting/vouchers/new');
    if (meta?.title) return { title: meta.title };
  }
  if (/^\/accounting\/vouchers\/[^/]+\/\d+\/edit$/.test(pathname)) {
    const meta = getMeta('/accounting/vouchers/edit');
    if (meta?.title) return { title: meta.title };
  }
  if (/^\/invoices\/\d+/.test(pathname)) {
    const meta = getMeta('/invoices/details');
    if (meta?.title) return { title: meta.title };
  }
  return { title: t('common.page') };
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

// ── مكوّن قائمة الإشعارات المنسدلة ────────────────────────────────────────

function timeAgo(dateStr: string, locale: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return locale === 'ar' ? 'الآن' : 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return locale === 'ar' ? `${mins} د` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale === 'ar' ? `${hrs} س` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return locale === 'ar' ? `${days} ي` : `${days}d`;
}

interface NotificationDropdownProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  isRtl: boolean;
  locale: string;
  navigate: (path: string) => void;
}

function NotificationDropdown({ anchorEl, onClose, isRtl, locale, navigate }: NotificationDropdownProps) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: notificationsApi.list,
    refetchInterval: 30_000,
  });

  const markOne = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  // ── حساب موضع القائمة بناءً على موقع الزر ─────────────────────────────
  const style = useMemo<React.CSSProperties>(() => {
    if (!anchorEl) return { display: 'none' };
    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const dropW = Math.min(360, vw - 16);
    let left = isRtl
      ? Math.max(8, rect.left + rect.width - dropW)
      : Math.max(8, Math.min(rect.left, vw - dropW - 8));
    return {
      position: 'fixed',
      top: rect.bottom + 6,
      left,
      width: dropW,
      zIndex: 9999,
    };
  }, [anchorEl, isRtl]);

  // ── إغلاق عند ضغط خارج القائمة ────────────────────────────────────────
  useEffect(() => {
    const down = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && anchorEl && !anchorEl.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('touchstart', down);
    };
  }, [anchorEl, onClose]);

  const handleItem = (item: NotificationDto) => {
    if (!item.isRead) markOne.mutate(item.id);
    if (item.link) {
      navigate(item.link);
      onClose();
    }
  };

  const unread = items.filter(n => !n.isRead).length;

  return createPortal(
    <div
      ref={ref}
      style={style}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-2xl',
        'flex flex-col',
      )}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* رأس */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{locale === 'ar' ? 'الإشعارات' : 'Notifications'}</span>
          {unread > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAll.mutate()}
            title={locale === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read'}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{locale === 'ar' ? 'الكل مقروء' : 'All read'}</span>
          </button>
        )}
      </div>

      {/* قائمة الإشعارات */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            {locale === 'ar' ? 'جاري التحميل…' : 'Loading…'}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Bell className="h-8 w-8 opacity-25" />
            <span className="text-sm">{locale === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</span>
          </div>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItem(item)}
              className={cn(
                'flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-start',
                'transition-colors hover:bg-secondary/50',
                !item.isRead && 'bg-primary/5',
              )}
            >
              {/* نقطة الغير مقروء */}
              <span className={cn(
                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                item.isRead ? 'bg-transparent' : 'bg-primary',
              )} />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm', !item.isRead && 'font-semibold')}>{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt, locale)}</span>
                {item.link && <ExternalLink className="h-3 w-3 text-muted-foreground/50" />}
              </div>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── TopBar المكوّن الرئيسي ─────────────────────────────────────────────────

export function TopBar({ onOpenSidebar }: TopBarProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { locale, toggleLocale, isRtl } = useLocale();
  const meta = useRouteMeta(location.pathname);
  const voucherCode = matchVoucherReportCode(location.pathname);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isHome = location.pathname === '/';
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  // ── عدد الإشعارات الغير مقروءة — يُحدَّث كل 30 ثانية
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
  });

  // ── ساعة رقمية تتحدث كل ثانية — تعرض دائماً توقيت بغداد (UTC+3)
  const formatTime = useCallback(() => {
    const now = new Date();
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Baghdad',
    }).format(now);
  }, []);
  const [clock, setClock] = useState(formatTime);
  useEffect(() => {
    const id = setInterval(() => setClock(formatTime()), 1000);
    return () => clearInterval(id);
  }, [formatTime]);

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

  // ‎اسم نوع السند بحسب اللغة (ngعتمد nameAr إن لم يتوفّر nameEn).
  const voucherTypeName = useMemo(() => {
    if (!voucherType) return '';
    const anyType = voucherType as { nameEn?: string | null; nameAr?: string | null; name?: string | null };
    return localizedName(locale, anyType.nameAr ?? anyType.name, anyType.nameEn);
  }, [voucherType, locale]);

  /**
   * إعادة تحميل كاملة للصفحة (مثل F5/Ctrl+R في المتصفح).
   */
  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setTimeout(() => {
      try { window.location.reload(); }
      catch { setIsRefreshing(false); }
    }, 120);
  };

  // اختصار F5 / Ctrl+R: إعادة تحميل كاملة
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

  // استقبال أمر التحديث من التطبيق المكتبي
  useEffect(() => {
    const onAppRefresh = () => handleRefresh();
    window.addEventListener('itc:refresh', onAppRefresh);
    return () => window.removeEventListener('itc:refresh', onAppRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحديث عنوان التبويب بناءً على اللغة الحالية
  useEffect(() => {
    document.title = t('app.title');
  }, [t, locale]);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-card/90 shadow-sm shadow-black/5 backdrop-blur-xl dark:shadow-black/20 sm:h-20">
      <div className="flex h-full items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Hamburger — يظهر فقط على الشاشات الأصغر من lg */}
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label={t('topbar.openMenu')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Title */}
        {voucherType ? (
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
                  {voucherTypeName}
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
                  {t('topbar.voucher.natureLabel')} {
                    voucherType.nature === 'Debit' ? t('topbar.voucher.debit')
                      : voucherType.nature === 'Credit' ? t('topbar.voucher.credit')
                      : t('topbar.voucher.mixed')
                  }
                </span>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">{t('topbar.voucher.subtitle')}</p>
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
          {/* زر الإغلاق / العودة للرئيسية — يظهر في جميع الصفحات ما عدا الرئيسية */}
          {!isHome && (
            <button
              type="button"
              onClick={() => navigate('/')}
              title={t('topbar.backHome')}
              aria-label={t('topbar.backHome')}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* ‎شارة ترخيص النظام */}
          <LicenseBadge />

          {/* ساعة رقمية */}
          <div
            className="hidden h-10 items-center rounded-md border px-3 md:flex"
            style={theme === 'dark' ? {
              background: 'rgba(0,255,60,0.10)',
              borderColor: 'rgba(57,255,20,0.55)',
              boxShadow: '0 0 14px rgba(57,255,20,0.35), inset 0 0 10px rgba(57,255,20,0.10)',
            } : {
              background: 'hsl(var(--secondary) / 0.4)',
              borderColor: 'hsl(var(--border))',
              boxShadow: 'none',
            }}
          >
            <span
              className="tnum select-none font-mono font-black tracking-widest"
              style={{
                fontSize: '1.05rem',
                letterSpacing: '0.18em',
                fontVariantNumeric: 'tabular-nums',
                WebkitFontSmoothing: 'antialiased',
                ...(theme === 'dark' ? {
                  color: '#00ff41',
                  textShadow: '0 0 4px #00ff41, 0 0 10px #00ff41, 0 0 22px rgba(0,255,65,0.8), 0 0 40px rgba(0,255,65,0.4)',
                } : {
                  color: 'hsl(var(--primary))',
                  textShadow: 'none',
                }),
              }}
            >
              {clock}
            </span>
          </div>

          {/* التاريخ */}
          <button className="hidden h-10 items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex">
            <Calendar className="h-4 w-4" />
            <span className="tnum">
              {new Intl.DateTimeFormat(
                isRtl ? 'ar-IQ-u-nu-latn' : 'en-GB',
                {
                  weekday: 'long', day: 'numeric', month: 'long',
                  ...(isRtl ? { numberingSystem: 'latn' } : {}),
                  timeZone: 'Asia/Baghdad',
                },
              ).format(new Date())}
            </span>
          </button>

          {/* ‎زر تبديل اللغة */}
          <button
            onClick={toggleLocale}
            title={locale === 'ar' ? t('topbar.switchToEnglish') : t('topbar.switchToArabic')}
            aria-label={locale === 'ar' ? t('topbar.switchToEnglish') : t('topbar.switchToArabic')}
            className="flex h-10 items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
          >
            <Languages className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {locale === 'ar' ? 'EN' : 'ع'}
            </span>
          </button>

          {/* ‎تبديل الوضع: ليلي/نهاري */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
            aria-label={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-amber-400"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title={t('topbar.refreshPage')}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>

          {/* أيقونة مزامنة المرفقات بين الخادم و R2 */}
          <SyncIndicator isRtl={isRtl} />

          <button
            ref={bellRef}
            onClick={() => setNotifOpen(v => !v)}
            title={locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            aria-label={locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            className={cn(
              'relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
              notifOpen && 'bg-secondary text-foreground',
            )}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className={cn(
                'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground ring-2 ring-background',
                isRtl ? 'left-1 top-1' : 'right-1 top-1',
              )}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <NotificationDropdown
              anchorEl={bellRef.current}
              onClose={() => setNotifOpen(false)}
              isRtl={isRtl}
              locale={locale}
              navigate={navigate}
            />
          )}
        </div>
      </div>
    </header>
  );
}

// ── أيقونة مزامنة المرفقات ──────────────────────────────────────────────────
/**
 * تعرض حالة طابور المزامنة بين القرص المحلي و Cloudflare R2:
 *   • سحابة + سهم (CloudUpload) عند وجود ملفات قيد الرفع.
 *   • سحابة عادية (Cloud) عند الاستقرار (لا شيء معلَّق).
 *   • سحابة مع تحذير (CloudOff) عند خطأ في الإعدادات أو فشل متراكم.
 *
 * تحدّث كل 15 ثانية، ويظهر badge صغير عند تجاوز عدد المعلَّق صفراً.
 * عند المرور بالماوس يظهر tooltip تفصيلي بآخر دورة + الأعداد.
 */
function SyncIndicator({ isRtl }: { isRtl: boolean }) {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['attachment-sync-status'],
    queryFn: attachmentSettingsApi.getSyncStatus,
    refetchInterval: 15_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const pending = (data?.pendingUploads ?? 0) + (data?.pendingDeletes ?? 0);
  const failed = data?.failedCount ?? 0;
  const hasWarning = !!data?.lastWarning;
  const hasError = !!data?.lastError && failed > 0;

  // ‎اختيار الأيقونة + اللون بحسب الحالة (الأهمّ يفوز).
  let Icon = Cloud;
  let colorClass = 'text-emerald-500';
  let stateLabel = t('topbar.sync.idle');
  if (hasError) {
    Icon = CloudOff;
    colorClass = 'text-destructive';
    stateLabel = t('topbar.sync.error');
  } else if (hasWarning) {
    Icon = AlertCircle;
    colorClass = 'text-amber-500';
    stateLabel = t('topbar.sync.warning');
  } else if (pending > 0) {
    Icon = CloudUpload;
    colorClass = 'text-primary animate-pulse';
    stateLabel = t('topbar.sync.syncing', { count: pending });
  }

  // ‎آخر دورة بصيغة محلية للقراءة في التولتيب.
  const lastTickLabel = (() => {
    if (!data?.lastTickAtUtc) return t('topbar.sync.neverRan');
    try {
      const dt = new Date(data.lastTickAtUtc);
      return new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        timeZone: 'Asia/Baghdad',
      }).format(dt);
    } catch { return data.lastTickAtUtc ?? ''; }
  })();

  // ‎بناء tooltip متعدّد الأسطر — المتصفح يعرض \n كأسطر منفصلة في الـ title.
  const lines: string[] = [
    `${t('topbar.sync.title')}: ${stateLabel}`,
    `${t('topbar.sync.lastTick')}: ${lastTickLabel}`,
    `${t('topbar.sync.pendingUploads')}: ${data?.pendingUploads ?? 0}`,
    `${t('topbar.sync.pendingDeletes')}: ${data?.pendingDeletes ?? 0}`,
    `${t('topbar.sync.pendingPurge')}: ${data?.pendingLocalPurge ?? 0}`,
  ];
  if (failed > 0) lines.push(`${t('topbar.sync.failed')}: ${failed}`);
  if (hasWarning && data?.lastWarning) lines.push(`! ${data.lastWarning}`);
  if (hasError && data?.lastError) lines.push(`× ${data.lastError}`);
  const tooltip = lines.join('\n');

  return (
    <div className="relative">
      <button
        type="button"
        title={tooltip}
        aria-label={stateLabel}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Icon className={cn('h-4 w-4', colorClass)} />
        {pending > 0 && (
          <span className={cn(
            'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground ring-2 ring-background',
            isRtl ? 'left-1 top-1' : 'right-1 top-1',
          )}>
            {pending > 99 ? '99+' : pending}
          </span>
        )}
        {hasError && pending === 0 && (
          <span className={cn(
            'absolute h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background',
            isRtl ? 'left-1 top-1' : 'right-1 top-1',
          )} />
        )}
      </button>
    </div>
  );
}
