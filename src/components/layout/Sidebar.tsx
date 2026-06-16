import { NavLink, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Receipt, Package, Users, UserCog, Inbox,
  BookOpen, Settings, LogOut, TrendingUp, ChevronDown,
  Calculator, ShoppingCart, Warehouse, FolderTree, Scale, Store as StoreIcon,
  ChevronsDown, ChevronsUp, FileText, CalendarRange, Coins, Tag,
  Wallet, ArrowDownLeft, ArrowUpRight, X, Trash2, Activity,
  Landmark, Building2, CreditCard, ArrowLeftRight,
  Settings2, ClipboardList, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth/auth-store';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Separator } from '@/components/ui/separator';
import { useSidebarPrefs } from '@/lib/sidebarPreferences';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { invoiceTypesApi } from '@/lib/api/invoiceTypes';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale, localizedVoucherTypeName } from '@/lib/i18n';
import { isParentHost } from '@/lib/platform';
import { SidebarBrand } from '@/components/layout/SidebarBrand';
import { INVOICE_CATEGORY_ROUTES } from '@/pages/invoices/invoiceRoutes';

interface NavItem {
  to: string;
  /** مفتاح الترجمة للعنوان (مثال: "sidebar.items.accountsTree"). */
  labelKey: string;
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
  /** يظهر فقط على واجهة الشركات (وليس الشركة الأم). */
  companyOnly?: boolean;
  /** مطابقة مسار حرفية (لصفحات الفواتير المتجاورة مثل sales / sales-return). */
  exact?: boolean;
}

export interface NavGroup {
  key: string;
  /** مفتاح الترجمة لاسم المجموعة (مثال: "sidebar.groups.accounting"). */
  titleKey: string;
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
    titleKey: 'sidebar.groups.dashboard',
    icon: LayoutDashboard,
    mandatory: true,
    direct: true,
    to: '/',
    items: [],
  },
  {
    key: 'accounting',
    titleKey: 'sidebar.groups.accounting',
    icon: Calculator,
    mandatory: true,
    items: [
      { to: '/accounting/accounts', labelKey: 'sidebar.items.accountsTree', icon: FolderTree, permission: PERMS.Accounting.Accounts.Read },
      { to: '/accounting/journal', labelKey: 'sidebar.items.journal', icon: BookOpen, permission: PERMS.Accounting.JournalEntries.Read },
      { to: '/accounting/account-statement', labelKey: 'sidebar.items.accountStatement', icon: FileText, permission: PERMS.Accounting.AccountStatement.Read },
      { to: '/accounting/account-balances', labelKey: 'sidebar.items.accountBalances', icon: Wallet, permission: PERMS.Accounting.AccountBalances.Read },
      { to: '/accounting/trial-balance', labelKey: 'sidebar.items.trialBalance', icon: Scale, permission: PERMS.Accounting.TrialBalance.Read },
      { to: '/accounting/fiscal-years', labelKey: 'sidebar.items.fiscalYears', icon: CalendarRange, permission: PERMS.Accounting.FiscalYears.Read },
      { to: '/accounting/currency-rates', labelKey: 'sidebar.items.currencyRates', icon: Coins, permission: PERMS.Accounting.CurrencyRates.Read },
    ],
  },
  {
    key: 'parent',
    titleKey: 'sidebar.groups.parent',
    icon: Building2,
    items: [
      { to: '/subscribers', labelKey: 'sidebar.items.subscribers', icon: Building2, permission: PERMS.Parent.Subscribers.Read },
      { to: '/parent/wallets', labelKey: 'sidebar.items.digitalWallets', icon: Wallet, permission: PERMS.Parent.Wallets.Read },
      { to: '/parent/wallets/pay', labelKey: 'sidebar.items.walletPay', icon: ArrowDownCircle, permission: PERMS.Parent.Wallets.Topup },
      { to: '/parent/wallets/withdraw', labelKey: 'sidebar.items.walletWithdraw', icon: ArrowUpCircle, permission: PERMS.Parent.Wallets.Withdraw },
      { to: '/parent/store/users', labelKey: 'sidebar.items.storeUsers', icon: Users, permission: PERMS.Parent.Subscribers.Read },
      { to: '/parent/store/trader-sales', labelKey: 'sidebar.items.traderSales', icon: StoreIcon, permission: PERMS.Parent.Subscribers.Read },
      { to: '/parent/store/company-requests', labelKey: 'sidebar.items.companyRequests', icon: ClipboardList, permission: PERMS.Parent.Subscribers.Read },
      { to: '/parent/store/carts', labelKey: 'sidebar.items.storeCarts', icon: ShoppingCart, permission: PERMS.Parent.Subscribers.Read },
    ],
  },
  {
    key: 'invoices',
    titleKey: 'sidebar.groups.invoices',
    icon: ShoppingCart,
    items: [
      ...INVOICE_CATEGORY_ROUTES.map(r => ({
        to: `/invoices/${r.path}`,
        labelKey: r.sidebarKey,
        icon: Receipt as React.ComponentType<{ className?: string }>,
        permission: PERMS.Sales.Invoices.Read,
        exact: true,
      })),
      { to: '/invoices/constants', labelKey: 'sidebar.items.invoiceSettings', icon: Settings2, permission: PERMS.Sales.Invoices.Read, exact: true },
      { to: '/orders', labelKey: 'sidebar.items.incomingOrders', icon: Inbox, permission: PERMS.Sales.Orders.Read },
      { to: '/customers', labelKey: 'sidebar.items.customers', icon: Users, permission: PERMS.Sales.Customers.Read },
      { to: '/sales-reps', labelKey: 'sidebar.items.salesReps', icon: UserCog, permission: PERMS.Sales.SalesReps.Read },
    ],
  },
  {
    key: 'inventory',
    titleKey: 'sidebar.groups.inventory',
    icon: Warehouse,
    items: [
      { to: '/inventory', labelKey: 'sidebar.items.items', icon: Package, permission: PERMS.Inventory.Items.Read },
      { to: '/inventory/constants', labelKey: 'sidebar.items.itemConstants', icon: Settings2, permission: PERMS.Inventory.Items.Read },
      { to: '/inventory/movements', labelKey: 'sidebar.items.stockMovements', icon: TrendingUp, permission: PERMS.Inventory.Movements.Read, exact: true },
      { to: '/inventory/stock-count', labelKey: 'sidebar.items.stockCount', icon: ClipboardList, permission: PERMS.Inventory.Items.Read, exact: true },
    ],
  },
  {
    key: 'financial-management',
    titleKey: 'sidebar.groups.financialManagement',
    icon: Landmark,
    items: [
      {
        to: '/financial-management/suppliers',
        labelKey: 'financialManagement.kinds.Supplier',
        icon: Building2,
        permissionAny: [
          PERMS.FinancialManagement.Categories.Read,
          PERMS.FinancialManagement.Parties.Read,
        ],
      },
      {
        to: '/financial-management/customers',
        labelKey: 'financialManagement.kinds.Customer',
        icon: Users,
        permissionAny: [
          PERMS.FinancialManagement.Categories.Read,
          PERMS.FinancialManagement.Parties.Read,
        ],
      },
      {
        to: '/financial-management/banks',
        labelKey: 'financialManagement.kinds.Bank',
        icon: Landmark,
        permissionAny: [
          PERMS.FinancialManagement.Categories.Read,
          PERMS.FinancialManagement.Parties.Read,
        ],
      },
      {
        to: '/financial-management/cash-boxes',
        labelKey: 'financialManagement.kinds.CashBox',
        icon: Wallet,
        permissionAny: [
          PERMS.Accounting.CashBoxes.Read,
          PERMS.Accounting.CashBoxBalances.Read,
          PERMS.Accounting.CashBoxTransfers.Read,
        ],
      },
      {
        to: '/financial-management/payment-companies',
        labelKey: 'financialManagement.kinds.PaymentCompany',
        icon: CreditCard,
        permissionAny: [
          PERMS.FinancialManagement.Categories.Read,
          PERMS.FinancialManagement.Parties.Read,
        ],
      },
      {
        to: '/financial-management/account-settlements',
        labelKey: 'sidebar.items.accountSettlements',
        icon: ArrowLeftRight,
        permission: PERMS.FinancialManagement.AccountSettlements.Read,
      },
    ],
  },
  {
    key: 'system',
    titleKey: 'sidebar.groups.system',
    icon: Settings,
    mandatory: true,
    items: [
      { to: '/settings', labelKey: 'sidebar.items.companySettings', icon: Settings, permission: PERMS.System.CompanySettings.Read },
      {
        to: '/settings/constants',
        labelKey: 'sidebar.items.systemConstants',
        icon: Settings2,
        companyOnly: true,
        permissionAny: [PERMS.Branches.Branches.Read, PERMS.System.CompanySettings.Read],
      },
      { to: '/system/audit', labelKey: 'sidebar.items.audit', icon: Activity, permission: PERMS.System.Audit.Read },
      { to: '/system/trash', labelKey: 'sidebar.items.trash', icon: Trash2, permission: PERMS.System.Trash.Read },
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
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
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

  // جلب أنواع الفواتير المفعّلة لعرضها ديناميكياً ضمن مجموعة "الفواتير"
  const invoiceTypesQuery = useQuery({
    queryKey: ['invoice-types', 'enabled'],
    queryFn: () => invoiceTypesApi.list(true),
    staleTime: 60_000,
    enabled: can(PERMS.Sales.Invoices.Read),
  });

  // مجموعة "السندات" الديناميكية بناءً على ShowInSidebar (لجميع الطبائع)
  // - Debit/Credit → صفحة سند مبسّطة (صندوق + حساب مقابل)
  // - Mixed → صفحة قيد متعدد البنود (مثل القيود اليومية) مع تثبيت نوع السند
  // - الفلترة بصلاحية القراءة الديناميكية لكل نوع: Accounting.Vouchers.{CODE}.Read
  // ‎عناصر السندات الديناميكية — تحمل label ديناميكي (اسم النوع) بدل labelKey.
  type DynamicNavItem = NavItem & { dynamicLabel?: string };

  const dynamicVoucherItems: DynamicNavItem[] = useMemo(() => {
    const types = voucherTypesQuery.data ?? [];
    return types
      .filter(vt => vt.showInSidebar)
      .map(vt => ({
        to: `/accounting/vouchers/${vt.code}`,
        labelKey: '',
        dynamicLabel: localizedVoucherTypeName(locale, vt.nameAr, vt.nameEn),
        icon: vt.nature === 'Debit' ? ArrowDownLeft
          : vt.nature === 'Credit' ? ArrowUpRight
          : BookOpen,
        permission: PERMS.Accounting.Vouchers.read(vt.code),
      }));
  }, [voucherTypesQuery.data, locale]);

  // ‎عناصر الفواتير الديناميكية — عنصر لكل نوع فاتورة مفعّل، يحمل اسم النوع كـ label.
  const dynamicInvoiceItems: DynamicNavItem[] = useMemo(() => {
    const types = invoiceTypesQuery.data ?? [];
    return types.map(it => ({
      to: `/invoices/type/${it.id}`,
      labelKey: '',
      dynamicLabel: locale === 'en' ? (it.nameEn || it.nameAr) : it.nameAr,
      icon: Receipt as React.ComponentType<{ className?: string }>,
      permission: PERMS.Sales.Invoices.Read,
      exact: true,
    }));
  }, [invoiceTypesQuery.data, locale]);

  // مسارات التصنيفات الأربعة الثابتة — تُستبدل بعناصر الأنواع الديناميكية
  const categoryPaths = useMemo(
    () => new Set(INVOICE_CATEGORY_ROUTES.map(r => `/invoices/${r.path}`)),
    [],
  );

  const groupsWithVouchers: NavGroup[] = useMemo(() => {
    // ‎صفحة "أنواع السندات" (إعدادات) تُعرض الآن ضمن مجموعة "السندات" بدل المحاسبة.
    const voucherTypesItem: NavItem = {
      to: '/accounting/voucher-types',
      labelKey: 'sidebar.items.voucherTypes',
      icon: Tag,
      permission: PERMS.Accounting.VoucherTypes.Read,
    };
    const voucherItems: NavItem[] = [...dynamicVoucherItems, voucherTypesItem];
    const next: NavGroup[] = [];
    for (const g of NAV_GROUPS) {
      next.push(g);
      if (g.key === 'dashboard') {
        next.push({
          key: 'vouchers',
          titleKey: 'sidebar.groups.vouchers',
          icon: Receipt,
          mandatory: true,
          items: voucherItems,
        });
      }
    }
    return next;
  }, [dynamicVoucherItems]);

  // ‎حقن عناصر أنواع الفواتير الديناميكية مكان مسارات التصنيفات الأربعة الثابتة.
  const groupsWithDynamic: NavGroup[] = useMemo(() => {
    return groupsWithVouchers.map(g => {
      if (g.key !== 'invoices') return g;
      const rest = g.items.filter(i => !categoryPaths.has(i.to));
      return { ...g, items: [...dynamicInvoiceItems, ...rest] };
    });
  }, [groupsWithVouchers, dynamicInvoiceItems, categoryPaths]);

  // فلترة الـ items داخل كل مجموعة بناءً على صلاحية القراءة، ثم إخفاء المجموعات الفارغة (إلا direct).
  const permissionFiltered: NavGroup[] = useMemo(() => {
    return groupsWithDynamic
      .filter(g => g.key !== 'parent' || isParentHost())
      .map(g => ({
        ...g,
        items: g.items.filter(i => {
          if (i.companyOnly && isParentHost()) return false;
          if (i.permission && !can(i.permission)) return false;
          if (i.permissionAny && !canAny(...i.permissionAny)) return false;
          return true;
        }),
      }))
      .filter(g => g.direct || g.items.length > 0);
  }, [groupsWithDynamic, can, canAny]);

  const visibleGroups = permissionFiltered.filter(g => g.mandatory || !isHidden(g.key));
  // أقسام قابلة للطي فقط (لا تشمل direct links)
  const collapsibleKeys = visibleGroups.filter(g => !g.direct).map(g => g.key);
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every(k => isCollapsed(k));

  return (
    <aside
      className={cn(
        'surface-sidebar fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col backdrop-blur-xl transition-transform duration-300 ease-out',
        // ‎start-0 + border-e يتبعان dir على <html> (يمين في RTL، يسار في LTR).
        'start-0 border-e',
        'lg:translate-x-0',
        isOpen
          ? 'translate-x-0 shadow-2xl'
          : isRtl
            ? 'translate-x-full lg:translate-x-0'
            : '-translate-x-full lg:translate-x-0'
      )}
      aria-hidden={!isOpen ? undefined : 'false'}
    >
      {/* زر إغلاق الدراور — يظهر فقط على الشاشات الأصغر من lg */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('topbar.closeMenu')}
          className={cn(
            'absolute top-2 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground lg:hidden',
            isRtl ? 'left-2' : 'right-2',
          )}
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Brand — شركة على واجهة الشركات، مركز التجارة على الشركة الأم */}
      <SidebarBrand onClose={onClose} />

      {/* شريط أدوات الطي العام */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {t('sidebar.menu')}
        </span>
        <button
          type="button"
          onClick={() => setAllCollapsed(collapsibleKeys, !allCollapsed)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          title={allCollapsed ? t('sidebar.expandAllTitle') : t('sidebar.collapseAllTitle')}
        >
          {allCollapsed ? (
            <>
              <ChevronsDown className="h-3 w-3" />
              {t('sidebar.expandAll')}
            </>
          ) : (
            <>
              <ChevronsUp className="h-3 w-3" />
              {t('sidebar.collapseAll')}
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {visibleGroups.map((group) => {
          const Icon = group.icon;
          const groupTitle = t(group.titleKey);

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
                      ? 'bg-primary/15 text-primary shadow-sm shadow-primary/10'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  {isActive && (
                    <span className={cn(
                      'absolute top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary',
                      isRtl ? 'right-0' : 'left-0',
                    )} />
                  )}
                  <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                  <span className={cn('flex-1', isRtl ? 'text-right' : 'text-left')}>{groupTitle}</span>
                </NavLink>
              </div>
            );
          }

          // عرض كمجموعة قابلة للطي
          const collapsed = isCollapsed(group.key);
          const groupHasActive = group.items.some(i => {
            if (i.exact) return location.pathname === i.to;
            return location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to + '/'));
          });

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
                    collapsed && (isRtl ? '-rotate-90' : 'rotate-90')
                  )}
                />
                <Icon className={cn('h-4 w-4 shrink-0', groupHasActive && 'text-primary')} />
                <span className={cn('flex-1', isRtl ? 'text-right' : 'text-left')}>{groupTitle}</span>
                {group.mandatory && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[8px] font-bold text-primary/80">
                    {t('sidebar.mandatory')}
                  </span>
                )}
              </button>

              {!collapsed && (
                <div className={cn(
                  'mt-1 space-y-0.5',
                  isRtl
                    ? 'mr-3 border-r border-border/40 pr-3'
                    : 'ml-3 border-l border-border/40 pl-3',
                )}>
                  {group.items.map(item => {
                    const isActive = item.exact
                      ? location.pathname === item.to
                      : location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'));
                    const ItemIcon = item.icon;
                    const dynItem = item as NavItem & { dynamicLabel?: string };
                    const label = dynItem.dynamicLabel ?? (item.labelKey ? t(item.labelKey) : '');
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all',
                          isActive
                            ? 'bg-primary/15 text-primary shadow-sm shadow-primary/10'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <span className={cn(
                            'absolute top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary',
                            isRtl ? 'right-0' : 'left-0',
                          )} />
                        )}
                        <ItemIcon className={cn(
                          'h-4 w-4 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground/90'
                        )} />
                        <span className="flex-1">{label}</span>
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
          <UserAvatar
            name={user?.fullName ?? t('sidebar.user')}
            src={user?.avatarBase64}
            size="sm"
            className="h-10 w-10 shrink-0 text-sm"
          />
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.fullName ?? t('sidebar.user')}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{user?.phone ?? '—'}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title={t('sidebar.logout')}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
