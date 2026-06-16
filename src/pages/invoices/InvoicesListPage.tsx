import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Receipt,
  Search,
  BookOpen,
  Printer,
  ClipboardList,
  CalendarRange,
  TrendingUp,
  Inbox,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  X,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { invoicesApi } from '@/lib/api/invoices';
import { invoiceTypesApi, type InvoiceCategory } from '@/lib/api/invoiceTypes';
import { companySettingsApi } from '@/lib/api/companySettings';
import { auditApi } from '@/lib/api/audit';
import { formatMoney, formatDate } from '@/lib/utils';
import type { SalesInvoiceDto } from '@/types/api';
import { findCategoryRoute, invoiceListPathForCategory, invoiceInventoryReturnQuery } from '@/pages/invoices/invoiceRoutes';
import { StatusBadge } from '@/pages/invoices/components/StatusBadge';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { useLocale } from '@/lib/i18n';
import { printInvoice, printInvoicesList, type InvoicePrintData } from '@/lib/printUtils';

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000] as const;

interface InvoicesListPageProps {
  /** التصنيف الثابت لصفحات الفواتير الأربع. يُتجاهل عند فتح الصفحة بنمط نوع محدد (/invoices/type/:typeId). */
  category?: InvoiceCategory;
}

interface RowMenu {
  invoice: SalesInvoiceDto;
  x: number;
  y: number;
}

function buildInvoicePrintData(inv: SalesInvoiceDto, typeName: string): InvoicePrintData {
  return {
    invoiceTypeName: typeName,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    partyName: inv.customerName ?? '',
    currency: inv.currency ?? 'IQD',
    lines: inv.lines.map(l => ({
      itemName: l.itemName,
      itemCode: '',
      unitName: l.unitName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineDiscount: l.lineDiscount,
      isGift: false,
    })),
    discountPct: inv.discountPercentage ?? 0,
    effectiveDiscount: inv.discountAmount,
    additionPct: 0,
    additionAmt: inv.additionAmount ?? 0,
    taxRate: inv.taxRate ?? 0,
    taxAmount: inv.taxAmount,
    subTotal: inv.subTotal,
    total: inv.totalAmount,
    expenseLines: inv.expenses?.map(e => ({
      debitAmount: e.debitAmount,
      creditAmount: e.creditAmount,
      accountName: e.accountName,
      accountCode: e.accountCode,
      description: e.description ?? '',
    })),
    isCash: inv.settlementType === 1,
    notes: inv.notes,
  };
}

export function InvoicesListPage({ category }: InvoicesListPageProps) {
  const { t, i18n } = useTranslation();
  const { locale, isRtl } = useLocale();
  const navigate = useNavigate();
  const params = useParams();
  const { can } = usePermissions();
  const canEdit = can(PERMS.Sales.Invoices.Update);

  const typeIdParam = params.typeId ? Number(params.typeId) : undefined;
  const byType = typeIdParam != null && !Number.isNaN(typeIdParam);

  const typesQuery = useQuery({
    queryKey: ['invoice-types', 'enabled'],
    queryFn: () => invoiceTypesApi.list(true),
  });

  const selectedType = byType
    ? (typesQuery.data ?? []).find(tp => tp.id === typeIdParam)
    : undefined;

  const effectiveCategory: InvoiceCategory = byType
    ? (selectedType?.category ?? category ?? 1)
    : (category ?? 1);

  const routeCfg = findCategoryRoute(effectiveCategory);
  const isSupplierSide = effectiveCategory === 2 || effectiveCategory === 3;
  const partyColLabel = isSupplierSide ? 'المورد' : t('invoices.list.colCustomer');

  const { defaultFromDate, defaultToDate, datesReady } = useActiveFiscalYear();
  const userTouchedDatesRef = useRef(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userTouchedDatesRef.current) return;
    if (!datesReady || !defaultFromDate) return;
    if (!fromDate && !toDate) {
      setFromDate(defaultFromDate);
      setToDate(defaultToDate);
    }
  }, [datesReady, defaultFromDate, defaultToDate, fromDate, toDate]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const invoiceListPath = byType
    ? `/invoices/type/${typeIdParam}`
    : invoiceListPathForCategory(effectiveCategory);
  const invoiceReturnLabel = t(`routes.${routeCfg.routeKey}.title`);
  const inventoryReturnQuery = invoiceInventoryReturnQuery(invoiceListPath, invoiceReturnLabel);

  const openRowMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>, invoice: SalesInvoiceDto) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    // ‎فتح القائمة باتجاه الجدول (داخلياً): RTL → يمين، LTR → يسار
    let x = isRtl ? rect.left : rect.right - menuWidth;
    if (x + menuWidth > window.innerWidth - 8) x = window.innerWidth - menuWidth - 8;
    if (x < 8) x = 8;
    setRowMenu({ invoice, x, y: rect.bottom + 4 });
  }, [isRtl]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['invoices', byType ? `type:${typeIdParam}` : `cat:${effectiveCategory}`, search, status, fromDate, toDate, pageNumber, pageSize],
    queryFn: () => invoicesApi.list({
      category: byType ? undefined : effectiveCategory,
      invoiceTypeId: byType ? typeIdParam : undefined,
      search: search || undefined,
      status: status || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      pageNumber,
      pageSize,
    }),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const defaultType = useMemo(() => {
    if (byType) return selectedType;
    const types = (typesQuery.data ?? []).filter(tp => tp.category === effectiveCategory);
    return types.find(tp => tp.code === routeCfg.systemCode) ?? types[0];
  }, [byType, selectedType, typesQuery.data, effectiveCategory, routeCfg.systemCode]);

  const newInvoiceUrl = defaultType
    ? `/invoices/new?typeId=${defaultType.id}`
    : '/invoices/new';

  const isArabic = (i18n.language || 'ar').startsWith('ar');
  const categoryFallback: Record<number, { ar: string; en: string }> = {
    1: { ar: 'مبيعات', en: 'sales' },
    2: { ar: 'شراء', en: 'purchase' },
    3: { ar: 'مردود شراء', en: 'purchase return' },
    4: { ar: 'مردود مبيع', en: 'sales return' },
  };
  const typeName = defaultType
    ? (isArabic ? defaultType.nameAr : (defaultType.nameEn || defaultType.nameAr))
    : (isArabic ? categoryFallback[effectiveCategory]?.ar : categoryFallback[effectiveCategory]?.en) ?? '';

  const listPrintTitle = defaultType
    ? (locale === 'en' ? (defaultType.nameEn || defaultType.nameAr) : defaultType.nameAr)
    : typeName;

  const openJournalEntry = (inv: SalesInvoiceDto) => {
    if (!inv.journalEntryId) return;
    navigate(`/accounting/journal/${inv.journalEntryId}/view`, {
      state: { returnTo: invoiceListPath, returnLabel: typeName },
    });
  };

  const handlePrintInvoice = async (inv: SalesInvoiceDto) => {
    setRowMenu(null);
    try {
      const full = inv.lines?.length ? inv : await invoicesApi.getById(inv.id);
      printInvoice(buildInvoicePrintData(full, listPrintTitle), company ?? null, locale);
      void auditApi.logPrint({
        entityType: 'SalesInvoice',
        entityId: inv.id,
        summary: `${t('invoices.list.printInvoice')} ${inv.invoiceNumber}`,
        details: { invoiceNumber: inv.invoiceNumber, totalAmount: inv.totalAmount },
      });
    } catch {
      toast.error(t('invoices.list.printFailed'));
    }
  };

  const handlePrintList = async () => {
    try {
      const all = await invoicesApi.list({
        category: byType ? undefined : effectiveCategory,
        invoiceTypeId: byType ? typeIdParam : undefined,
        search: search || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        pageNumber: 1,
        pageSize: 5000,
      });
      printInvoicesList(
        all.items,
        {
          title: listPrintTitle,
          partyColumnLabel: partyColLabel,
          filters: {
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            status: status || undefined,
            search: search || undefined,
          },
        },
        company ?? null,
        locale,
      );
      void auditApi.logPrint({
        entityType: 'SalesInvoicesList',
        entityId: '*',
        summary: `${t('invoices.list.print')} (${all.items.length})`,
        details: {
          category: byType ? null : effectiveCategory,
          invoiceTypeId: byType ? typeIdParam : null,
          search: search || null,
          status: status || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          count: all.items.length,
        },
      });
    } catch {
      toast.error(t('invoices.list.printFailed'));
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setFromDate('');
    setToDate('');
    userTouchedDatesRef.current = false;
    setPageNumber(1);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / pageSize)) : 1;

  if (isLoading) return <LoadingSpinner text={t('invoices.list.loading')} />;
  if (isError) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('invoices.list.loadError')}
        description={t('common.serverConnectionError')}
      />
    );
  }

  const invoices = data?.items ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('invoices.list.searchPlaceholder')}
                className="h-9 pr-10 text-sm"
                value={search}
                onChange={e => { setSearch(e.target.value); setPageNumber(1); }}
              />
            </div>

            <select
              className="h-9 rounded-md border border-input bg-secondary/40 px-3 text-sm"
              value={status}
              onChange={e => { setStatus(e.target.value); setPageNumber(1); }}
            >
              <option value="">{t('invoices.list.allStatuses')}</option>
              <option value="Paid">{t('invoices.status.paid')}</option>
              <option value="PartiallyPaid">{t('invoices.status.partiallyPaid')}</option>
              <option value="Issued">{t('invoices.status.issued')}</option>
              <option value="Draft">{t('invoices.status.draft')}</option>
              <option value="Cancelled">{t('invoices.status.cancelled')}</option>
            </select>

            <div className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2">
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t('journalEntries.filters.from')}</span>
              <Input
                type="date"
                className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
                value={fromDate}
                onChange={e => {
                  userTouchedDatesRef.current = true;
                  setFromDate(e.target.value);
                  setPageNumber(1);
                }}
              />
              <span className="text-xs text-muted-foreground">{t('journalEntries.filters.to')}</span>
              <Input
                type="date"
                className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
                value={toDate}
                onChange={e => {
                  userTouchedDatesRef.current = true;
                  setToDate(e.target.value);
                  setPageNumber(1);
                }}
              />
            </div>

            {(search || status || fromDate || toDate) && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1">
                <X className="h-3.5 w-3.5" />
                {t('journalEntries.filters.clear')}
              </Button>
            )}

            <div className="relative" ref={presetsRef}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 shrink-0 px-0"
                title={t('dateRange.quickRanges')}
                onClick={() => setShowPresets(o => !o)}
              >
                <CalendarRange className="h-4 w-4" />
              </Button>
              {showPresets && (
                <div className="absolute end-0 z-30 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-md border bg-popover p-2 shadow-lg">
                  <DateRangePresets
                    from={fromDate}
                    to={toDate}
                    onChange={(f, td) => {
                      userTouchedDatesRef.current = true;
                      setFromDate(f);
                      setToDate(td);
                      setPageNumber(1);
                    }}
                    showFiscalYearBadge={false}
                    showLabel={false}
                  />
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={handlePrintList}
              disabled={!data || data.totalCount === 0}
              title={t('invoices.list.print')}
            >
              <Printer className="h-4 w-4" />
              {t('invoices.list.print')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => navigate(`/inventory/stock-count?${inventoryReturnQuery}`)}
              title={t('invoices.list.stockCount')}
            >
              <ClipboardList className="h-4 w-4" />
              {t('invoices.list.stockCount')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => navigate(`/inventory/movements?${inventoryReturnQuery}`)}
              title={t('invoices.list.itemMovements')}
            >
              <TrendingUp className="h-4 w-4" />
              {t('invoices.list.itemMovements')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => navigate('/orders')}
              title={t('invoices.list.ordersLink')}
            >
              <Inbox className="h-4 w-4" />
              {t('invoices.list.ordersLink')}
            </Button>

            <Link to={newInvoiceUrl} className="ms-auto">
              <Button size="sm" className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                {t('invoices.list.newInvoice')}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('invoices.list.emptyTitle')}
          description={t('invoices.list.emptyDescription', { type: typeName })}
          action={
            <Link to={newInvoiceUrl}>
              <Button><Plus className="h-4 w-4" />{t('invoices.list.newInvoice')}</Button>
            </Link>
          }
        />
      ) : (
        <Card className="invoice-document overflow-hidden border-0 shadow-md">
          <div className="invoice-document-accent" />
          <CardContent className="p-0">
            <div className="table-scroll">
              <table className="invoice-lines-table">
                <thead>
                  <tr>
                    <th>{t('invoices.list.colNumber')}</th>
                    <th>{t('invoices.list.colDate')}</th>
                    <th>{partyColLabel}</th>
                    <th>{t('common.currency')}</th>
                    <th className="text-left">{t('invoices.list.colTotal')}</th>
                    <th className="text-left">{t('invoices.list.colPaid')}</th>
                    <th className="text-left">{t('invoices.list.colRemaining')}</th>
                    <th>{t('common.status')}</th>
                    <th className="text-center w-16">{t('invoices.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const cur = inv.currency ?? 'IQD';
                    return (
                      <tr
                        key={inv.id}
                        className={canEdit && inv.status !== 'Cancelled' ? 'cursor-pointer' : ''}
                        onClick={() => {
                          if (!canEdit || inv.status === 'Cancelled') return;
                          navigate(`/invoices/${inv.id}/edit`);
                        }}
                      >
                        <td>
                          <span className="num-display text-xs font-semibold">{inv.invoiceNumber}</span>
                        </td>
                        <td className="text-sm text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                        <td className="font-medium">{inv.customerName ?? '—'}</td>
                        <td className="num-display text-xs text-muted-foreground">{cur}</td>
                        <td className="text-left num-display font-medium">{formatMoney(inv.totalAmount, cur)}</td>
                        <td className="text-left num-display text-success">{formatMoney(inv.paidAmount, cur)}</td>
                        <td className="text-left num-display text-muted-foreground">
                          {formatMoney(inv.remainingAmount, cur)}
                        </td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              title={t('invoices.list.actions')}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                              onClick={e => openRowMenu(e, inv)}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.totalCount > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t('journalEntries.pagination.show')}</span>
              <select
                className="h-8 rounded-md border border-input bg-secondary/40 px-2 text-xs"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPageNumber(1); }}
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-muted-foreground">{t('journalEntries.pagination.perPage')}</span>
            </div>

            <div className="text-xs text-muted-foreground">
              {t('journalEntries.pagination.totalLabel')}{' '}
              <span className="font-semibold text-foreground">{data.totalCount.toLocaleString('en-US')}</span>{' '}
              {t('invoices.list.totalCountSuffix')}
              {isFetching && <span className="ms-2 text-amber-400">⟳</span>}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageNumber(1)}
                disabled={pageNumber === 1}
                className="h-8 px-2"
              >
                {isRtl ? '»' : '«'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                disabled={pageNumber === 1}
                className="h-8 gap-1"
              >
                {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                {t('journalEntries.pagination.previous')}
              </Button>
              <span className="px-3 text-xs">
                <span className="font-semibold text-foreground">{pageNumber}</span>
                <span className="text-muted-foreground"> / {totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
                disabled={pageNumber >= totalPages}
                className="h-8 gap-1"
              >
                {t('journalEntries.pagination.next')}
                {isRtl ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageNumber(totalPages)}
                disabled={pageNumber >= totalPages}
                className="h-8 px-2"
              >
                {isRtl ? '«' : '»'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rowMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div
            className="fixed z-50 w-[200px] overflow-hidden rounded-lg border bg-popover py-1 shadow-xl"
            style={{ left: rowMenu.x, top: rowMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
              onClick={() => void handlePrintInvoice(rowMenu.invoice)}
            >
              <Printer className="h-4 w-4 text-primary" />
              {t('invoices.list.printInvoice')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent disabled:opacity-40"
              disabled={!rowMenu.invoice.journalEntryId}
              onClick={() => {
                openJournalEntry(rowMenu.invoice);
                setRowMenu(null);
              }}
            >
              <BookOpen className="h-4 w-4 text-primary" />
              {t('invoices.list.viewEntry')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent disabled:opacity-40"
              disabled={!canEdit || rowMenu.invoice.status === 'Cancelled'}
              onClick={() => {
                navigate(`/invoices/${rowMenu.invoice.id}/edit`);
                setRowMenu(null);
              }}
            >
              <Pencil className="h-4 w-4 text-primary" />
              {t('invoices.list.editInvoice')}
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
