import type { InvoiceCategory } from '@/lib/api/invoiceTypes';

export interface InvoiceCategoryRoute {
  /** مسار URL تحت /invoices */
  path: string;
  category: InvoiceCategory;
  /** مفتاح ترجمة عنوان الصفحة في routes.* */
  routeKey: string;
  /** مفتاح ترجمة عنصر القائمة الجانبية */
  sidebarKey: string;
  /** رمز النوع النظامي الافتراضي (SAL, PUR, …) */
  systemCode: string;
}

/** صفحات الفواتير الأربع — كل تصنيف له قائمة وتسلسل مستقل */
export const INVOICE_CATEGORY_ROUTES: InvoiceCategoryRoute[] = [
  {
    path: 'purchase',
    category: 2,
    routeKey: '/invoices/purchase',
    sidebarKey: 'sidebar.items.invoicePurchase',
    systemCode: 'PUR',
  },
  {
    path: 'sales',
    category: 1,
    routeKey: '/invoices/sales',
    sidebarKey: 'sidebar.items.invoiceSales',
    systemCode: 'SAL',
  },
  {
    path: 'purchase-return',
    category: 3,
    routeKey: '/invoices/purchase-return',
    sidebarKey: 'sidebar.items.invoicePurchaseReturn',
    systemCode: 'PRR',
  },
  {
    path: 'sales-return',
    category: 4,
    routeKey: '/invoices/sales-return',
    sidebarKey: 'sidebar.items.invoiceSalesReturn',
    systemCode: 'SRR',
  },
];

export function invoiceListPathForCategory(category: InvoiceCategory): string {
  const route = INVOICE_CATEGORY_ROUTES.find(r => r.category === category);
  return route ? `/invoices/${route.path}` : '/invoices/sales';
}

/** معاملات الرجوع من جرد المخزون/حركة المادة إلى قائمة الفواتير. */
export function invoiceInventoryReturnQuery(returnTo: string, returnLabel: string): string {
  return `returnTo=${encodeURIComponent(returnTo)}&returnLabel=${encodeURIComponent(returnLabel)}`;
}

export function appendInvoiceReturnQuery(
  basePath: string,
  searchParams: URLSearchParams,
): string {
  const returnTo = searchParams.get('returnTo');
  const returnLabel = searchParams.get('returnLabel');
  if (!returnTo) return basePath;
  const q = invoiceInventoryReturnQuery(returnTo, returnLabel ?? '');
  const join = basePath.includes('?') ? '&' : '?';
  return `${basePath}${join}${q}`;
}

export function findCategoryRoute(category: InvoiceCategory): InvoiceCategoryRoute {
  return INVOICE_CATEGORY_ROUTES.find(r => r.category === category)
    ?? INVOICE_CATEGORY_ROUTES.find(r => r.category === 1)!;
}
