import { NavLink, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Receipt, Package, Users, UserCog, Inbox,
  BookOpen, Settings, LogOut, Sparkles, TrendingUp, ChevronDown,
  Calculator, ShoppingCart, Warehouse, FolderTree, Scale,
  ChevronsDown, ChevronsUp, FileText, CalendarRange, Coins, Tag,
  Wallet, ArrowDownLeft, ArrowUpRight, X, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Separator } from '@/components/ui/separator';
import { useSidebarPrefs } from '@/lib/sidebarPreferences';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /** صلاحية القراءة المطلوبة لإظهار هذا الرابط (اختيارية — لو غابت يُظهر للجميع). */
  permission?: string;
  /**
   * بديل لـ <see cref="permission"/> عندما تكون الصفحة تحوي عدّة موارد منفصلة
   * (كصفحة "الصناديق" بتبويبات: الصناديق/الأرصدة/المناقلات). يظهر الرابط لو
   * المستخدم يملك صلاحية قراءة <i>واحدة</i> على الأقل من القائمة.
   */
  permissionAny?: string[];
}

export interface NavGroup {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** المجموعة أساسية لا تخفى */
  mandatory?: boolean;
  /** عرض كرابط مباشر بدلاً من مجموعة قابلة للطي */
  direct?: boolean;
  /** المسار في حالة direct = true */
  to?: string;
  items: NavItem[];
}

/** ترتيب المجموعات: الرئيسية → المحاسبة → الفواتير → المستودعات → النظام */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'dashboard',
    title: 'الرئيسية',
    icon: LayoutDashboard,
    mandatory: true,
    direct: true,
    to: '/',
    items: [],
  },
  {
    key: 'accounting',
    title: 'المحاسبة',
    icon: Calculator,
    mandatory: true,
    items: [
      { to: '/accounting/accounts', label: 'شجرة الحسابات', icon: FolderTree, permission: PERMS.Accounting.Accounts.Read },
      { to: '/accounting/journal', label: 'القيود اليومية', icon: BookOpen, permission: PERMS.Accounting.JournalEntries.Read },
      { to: '/accounting/account-statement', label: 'كشف الحساب', icon: FileText, permission: PERMS.Accounting.AccountStatement.Read },
      { to: '/accounting/trial-balance', label: 'ميزان المراجعة', icon: Scale, permission: PERMS.Accounting.TrialBalance.Read },
      { to: '/accounting/fiscal-years', label: 'الفترات المحاسبية', icon: CalendarRange, permission: PERMS.Accounting.FiscalYears.Read },
      { to: '/accounting/currency-rates', label: 'نشرات أسعار العملات', icon: Coins, permission: PERMS.Accounting.CurrencyRates.Read },
      { to: '/accounting/voucher-types', label: 'أنواع السندات', icon: Tag, permission: PERMS.Accounting.VoucherTypes.Read },
      {
        to: '/accounting/cash-boxes',
        label: 'الصناديق',
        icon: Wallet,
        // ‎الصفحة فيها 3 تبويبات بصلاحيات مستقلة — أيٌّ منها كافية لإظهار الرابط.
        permissionAny: [
          PERMS.Accounting.CashBoxes.Read,
          PERMS.Accounting.CashBoxBalances.Read,
          PERMS.Accounting.CashBoxTransfers.Read,
        ],
      },
    ],
  },
  {
    key: 'invoices',
    title: 'الفواتير',
    icon: ShoppingCart,
    items: [
      { to: '/invoices', label: 'الفواتير', icon: Receipt, permission: PERMS.Sales.Invoices.Read },
      { to: '/invoices/new', label: 'فاتورة جديدة', icon: Sparkles, permission: PERMS.Sales.Invoices.Create },
      { to: '/orders', label: 'الطلبيات الواردة', icon: Inbox, permission: PERMS.Sales.Orders.Read },
      { to: '/customers', label: 'العملاء', icon: Users, permission: PERMS.Sales.Customers.Read },
      { to: '/sales-reps', label: 'المندوبون', icon: UserCog, permission: PERMS.Sales.SalesReps.Read },
    ],
  },
  {
    key: 'inventory',
    title: 'المستودعات',
    icon: Warehouse,
    items: [
      { to: '/inventory', label: 'المواد', icon: Package, permission: PERMS.Inventory.Items.Read },
      { to: '/inventory/movements', label: 'حركات المخزون', icon: TrendingUp, permission: PERMS.Inventory.Movements.Read },
    ],
  },
  {
    key: 'system',
    title: 'النظام',
    icon: Settings,
    mandatory: true,
    items: [
      { to: '/settings', label: 'إعدادات الشركة', icon: Settings, permission: PERMS.System.CompanySettings.Read },
      { to: '/system/trash', label: 'سلة المهملات', icon: Trash2, permission: PERMS.System.Trash.Read },
      // ‎"المستخدمون" و"إعدادات المنيو" يُوصَل لهما من داخل صفحة "إعدادات الشركة"
      // ‎(بطاقات NavTile)، فلا حاجة لتكرارهما في الشريط الجانبي.
    ],
  },
];

interface SidebarProps {
  /** هل الـ drawer مفتوح على الجوال؟ (يُتجاهل على الشاشات ≥ lg لأن الـ sidebar ثابت). */
  isOpen?: boolean;
  /** يُستدعى لإغلاق الـ drawer (زر X أو خروج). */
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps = {}) {
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const { can, canAny } = usePermissions();
  const { isCollapsed, isHidden, toggleCollapsed, setAllCollapsed } = useSidebarPrefs();

  // جلب أنواع السندات المعلّمة "إظهار في القائمة"
  const voucherTypesQuery = useQuery({
    queryKey: ['voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });

  // مجموعة "السندات" الديناميكية بناءً على ShowInSidebar (لجميع الطبائع)
  // - Debit/Credit → صفحة سند مبسّطة (صندوق + حساب مقابل)
  // - Mixed → صفحة قيد متعدد البنود (مثل القيود اليومية) مع تثبيت نوع السند
  // - الفلترة بصلاحية القراءة الديناميكية لكل نوع: Accounting.Vouchers.{CODE}.Read
  const dynamicVoucherItems: NavItem[] = useMemo(() => {
    const types = voucherTypesQuery.data ?? [];
    return types
      .filter(t => t.showInSidebar)
      .map(t => ({
        to: `/accounting/vouchers/${t.code}`,
        label: t.nameAr,
        icon: t.nature === 'Debit' ? ArrowDownLeft
          : t.nature === 'Credit' ? ArrowUpRight
          : BookOpen, // ‎مختلط: أيقونة الدفتر اليومي
        permission: PERMS.Accounting.Vouchers.read(t.code),
      }));
  }, [voucherTypesQuery.data]);

  const groupsWithVouchers: NavGroup[] = useMemo(() => {
    if (dynamicVoucherItems.length === 0) return NAV_GROUPS;
    // إدراج مجموعة "السندات" بعد "الرئيسية" مباشرة
    const next: NavGroup[] = [];
    for (const g of NAV_GROUPS) {
      next.push(g);
      if (g.key === 'dashboard') {
        next.push({
          key: 'vouchers',
          title: 'السندات',
          icon: Receipt,
          mandatory: true,
          items: dynamicVoucherItems,
        });
      }
    }
    return next;
  }, [dynamicVoucherItems]);

  // فلترة الـ items داخل كل مجموعة بناءً على صلاحية القراءة، ثم إخفاء المجموعات الفارغة (إلا direct).
  const permissionFiltered: NavGroup[] = useMemo(() => {
    return groupsWithVouchers
      .map(g => ({
        ...g,
        items: g.items.filter(i => {
          if (i.permission && !can(i.permission)) return false;
          if (i.permissionAny && !canAny(...i.permissionAny)) return false;
          return true;
        }),
      }))
      .filter(g => g.direct || g.items.length > 0);
  }, [groupsWithVouchers, can, canAny]);

  const visibleGroups = permissionFiltered.filter(g => g.mandatory || !isHidden(g.key));
  // أقسام قابلة للطي فقط (لا تشمل direct links)
  const collapsibleKeys = visibleGroups.filter(g => !g.direct).map(g => g.key);
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every(k => isCollapsed(k));

  return (
    <aside
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-border/60 bg-card/95 backdrop-blur-xl transition-transform duration-300 ease-out',
        // ‎على الشاشات ≥ lg الـ sidebar مرئي دائماً (ثابت)؛ على الأصغر يتحوّل لدراور
        // ‎ينزلق من اليمين (RTL → translate-x-full = للخارج/يمين الشاشة).
        'lg:translate-x-0 lg:bg-card/30',
        isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'
      )}
      aria-hidden={!isOpen ? undefined : 'false'}
    >
      {/* زر إغلاق الدراور — يظهر فقط على الشاشات الأصغر من lg */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق القائمة"
          className="absolute left-2 top-2 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Brand — clickable, navigates to dashboard */}
      <NavLink
        to="/"
        title="الصفحة الرئيسية"
        onClick={onClose}
        className="group relative flex h-20 items-center gap-3 border-b border-border/60 px-6 transition-colors hover:bg-primary/5"
      >
        <img
          src="/logo.png?v=3"
          alt="مركز التجارة العراقي"
          className="h-12 w-12 object-contain transition-transform group-hover:scale-105"
          draggable={false}
        />
        <div>
          <h1 className="font-display text-base font-semibold leading-none tracking-tight transition-colors group-hover:text-primary">
            مركز التجارة العراقي
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-primary/70">
            Iraqi Trade Center
          </p>
        </div>
      </NavLink>

      {/* شريط أدوات الطي العام */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          القائمة
        </span>
        <button
          type="button"
          onClick={() => setAllCollapsed(collapsibleKeys, !allCollapsed)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          title={allCollapsed ? 'فتح كل الأقسام' : 'طي كل الأقسام'}
        >
          {allCollapsed ? (
            <>
              <ChevronsDown className="h-3 w-3" />
              فتح الكل
            </>
          ) : (
            <>
              <ChevronsUp className="h-3 w-3" />
              طي الكل
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {visibleGroups.map((group) => {
          const Icon = group.icon;

          // عرض مباشر كرابط (مثل الرئيسية)
          if (group.direct && group.to) {
            const isActive = location.pathname === group.to ||
              (group.to !== '/' && location.pathname.startsWith(group.to));
            return (
              <div key={group.key} className="mb-1">
                <NavLink
                  to={group.to}
                  className={cn(
                    'group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  )}
                >
                  {isActive && (
                    <span className="absolute right-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                  <span className="flex-1 text-right">{group.title}</span>
                </NavLink>
              </div>
            );
          }

          // عرض كمجموعة قابلة للطي
          const collapsed = isCollapsed(group.key);
          const groupHasActive = group.items.some(i =>
            location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to))
          );

          return (
            <div key={group.key} className="mb-1">
              <button
                type="button"
                onClick={() => toggleCollapsed(group.key)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                  groupHasActive
                    ? 'text-primary'
                    : 'text-muted-foreground/80 hover:bg-accent/30 hover:text-foreground'
                )}
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform',
                    collapsed && '-rotate-90'
                  )}
                />
                <Icon className={cn('h-4 w-4 shrink-0', groupHasActive && 'text-primary')} />
                <span className="flex-1 text-right">{group.title}</span>
                {group.mandatory && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[8px] font-bold text-primary/80">
                    أساسي
                  </span>
                )}
              </button>

              {!collapsed && (
                <div className="mr-3 mt-1 space-y-0.5 border-r border-border/40 pr-3">
                  {group.items.map(item => {
                    const isActive = location.pathname === item.to ||
                      (item.to !== '/' && location.pathname.startsWith(item.to));
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <span className="absolute right-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                        )}
                        <ItemIcon className={cn(
                          'h-4 w-4 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground/90'
                        )} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User card */}
      <div className="p-4">
        <Separator className="mb-4" />
        <div className="flex items-center gap-3 rounded-lg p-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-sm font-medium text-primary ring-1 ring-primary/20">
            {user?.fullName?.[0] ?? 'م'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.fullName ?? 'المستخدم'}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{user?.phone ?? '—'}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="تسجيل خروج"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
