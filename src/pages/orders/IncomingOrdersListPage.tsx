import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Inbox,
  FileText,
  RefreshCw,
  Truck,
  PackageCheck,
  Ban,
  PlayCircle,
  Search,
  CalendarRange,
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { ordersApi } from '@/lib/api/orders';
import { formatMoney, formatDateTime, extractApiError, cn } from '@/lib/utils';
import type { IncomingOrderDto } from '@/types/api';
import { OrderStatusBadge } from '@/pages/orders/components/OrderStatusBadge';
import { CustomerStoreLinkSection } from '@/pages/orders/components/CustomerStoreLinkSection';
import {
  INVOICE_LOCKED_STATUSES,
  ORDER_STATUS_API_VALUE,
  ORDER_STATUS_TABS,
  type OrderProcessingStatus,
} from '@/pages/orders/orderStatus';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { useLocale } from '@/lib/i18n';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function StatusTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold num-display',
            active
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-foreground/10 text-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function IncomingOrdersListPage() {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canCreateInvoice = can(PERMS.Sales.Invoices.Create);

  const { defaultFromDate, defaultToDate, datesReady } = useActiveFiscalYear();
  const userTouchedDatesRef = useRef(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  const [searchParams] = useSearchParams();
  const paramStatus = searchParams.get('status') as OrderProcessingStatus | null;
  const paramOrderId = searchParams.get('orderId');

  const [statusTab, setStatusTab] = useState<OrderProcessingStatus>(
    paramStatus && ORDER_STATUS_TABS.includes(paramStatus) ? paramStatus : 'Pending',
  );
  const [selectedId, setSelectedId] = useState<number | null>(
    paramOrderId ? Number(paramOrderId) : null,
  );
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [showPresets, setShowPresets] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

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

  const listQuery = useQuery({
    queryKey: ['incoming-orders', statusTab, search, fromDate, toDate, pageNumber, pageSize],
    queryFn: () => ordersApi.getPending({
      status: statusTab,
      search: search || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      pageNumber,
      pageSize,
    }),
    refetchOnWindowFocus: true,
  });

  const countsQuery = useQuery({
    queryKey: ['incoming-order-status-counts', search, fromDate, toDate],
    queryFn: () => ordersApi.getStatusCounts({
      search: search || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    refetchOnWindowFocus: true,
  });
  const statusCounts = countsQuery.data ?? {};

  const detailQuery = useQuery({
    queryKey: ['incoming-order', selectedId],
    queryFn: () => ordersApi.getById(selectedId!),
    enabled: selectedId != null,
    refetchOnWindowFocus: true,
  });

  const invalidateOrderQueries = (orderId?: number) => {
    qc.invalidateQueries({ queryKey: ['incoming-orders'] });
    qc.invalidateQueries({ queryKey: ['incoming-order-status-counts'] });
    if (orderId != null) {
      qc.invalidateQueries({ queryKey: ['incoming-order', orderId] });
    }
  };

  const openMut = useMutation({
    mutationFn: (id: number) => ordersApi.open(id),
    onSuccess: (data) => {
      qc.setQueryData(['incoming-order', data.id], data);
      invalidateOrderQueries(data.id);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: OrderProcessingStatus; reason?: string }) =>
      ordersApi.updateStatus(id, status, reason),
    onSuccess: (data) => {
      qc.setQueryData(['incoming-order', data.id], data);
      invalidateOrderQueries(data.id);
      toast.success(t('orders.statusUpdated'));
    },
    onError: (err) => toast.error(extractApiError(err, t('common.error'))),
  });

  const invoiceMut = useMutation({
    mutationFn: (id: number) => ordersApi.prepareInvoice(id),
    onSuccess: (invoice) => {
      toast.success(t('orders.invoicePrepared'));
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      invalidateOrderQueries(selectedId ?? undefined);
      navigate(`/invoices/${invoice.id}/edit`);
    },
    onError: (err) => toast.error(extractApiError(err, t('common.error'))),
  });

  const handleTabChange = (tab: OrderProcessingStatus) => {
    setStatusTab(tab);
    setSelectedId(null);
    setPageNumber(1);
  };

  const handleSelect = async (order: IncomingOrderDto) => {
    setSelectedId(order.id);
    if (order.status === 'Pending') {
      try {
        await openMut.mutateAsync(order.id);
      } catch (err) {
        toast.error(extractApiError(err, t('common.error')));
      }
    }
  };

  const resetFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    userTouchedDatesRef.current = false;
    setPageNumber(1);
  };

  const order = detailQuery.data;
  const customerInactive = order?.customerIsActive === false;
  const hasDraftInvoice = order?.createdInvoiceId != null;
  const invoiceLocked =
    order != null
    && INVOICE_LOCKED_STATUSES.includes(order.status as OrderProcessingStatus)
    && !hasDraftInvoice;

  const handleInvoiceAction = () => {
    if (!order) return;
    if (hasDraftInvoice) {
      navigate(`/invoices/${order.createdInvoiceId}/edit`);
      return;
    }
    invoiceMut.mutate(order.id);
  };

  const advanceStatus = (target: OrderProcessingStatus) => {
    if (!order) return;
    statusMut.mutate({ id: order.id, status: target });
  };

  const confirmReject = () => {
    if (!order) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    statusMut.mutate(
      { id: order.id, status: 'Rejected', reason },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setRejectReason('');
        },
      },
    );
  };

  const totalCount = listQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = !!(search || (userTouchedDatesRef.current && (fromDate || toDate)));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('orders.searchPlaceholder')}
                className="h-9 pr-10 text-sm"
                value={search}
                onChange={e => { setSearch(e.target.value); setPageNumber(1); }}
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2">
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t('journalEntries.filters.from')}</span>
              <Input
                type="date"
                className="h-7 w-28 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
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
                className="h-7 w-28 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
                value={toDate}
                onChange={e => {
                  userTouchedDatesRef.current = true;
                  setToDate(e.target.value);
                  setPageNumber(1);
                }}
              />
            </div>

            {hasFilters && (
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
              className="h-9 w-9 shrink-0 px-0"
              onClick={() => { listQuery.refetch(); countsQuery.refetch(); }}
              disabled={listQuery.isFetching}
              title={t('common.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', listQuery.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ORDER_STATUS_TABS.map((tab) => (
          <StatusTab
            key={tab}
            active={statusTab === tab}
            onClick={() => handleTabChange(tab)}
            label={t(`orders.tabs.${tab}`)}
            count={statusCounts[tab] ?? 0}
          />
        ))}
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => navigate('/invoices/sales')}
            title={t('orders.salesInvoicesLink')}
          >
            <Receipt className="h-4 w-4" />
            {t('orders.salesInvoicesLink')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <Card className="flex h-fit flex-col lg:max-h-[calc(100vh-18rem)]">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{t('orders.listTitle')}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {totalCount.toLocaleString('en-US')} {t('orders.countSuffix')}
                {listQuery.isFetching && <span className="ms-1 text-amber-400">⟳</span>}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-y-auto p-3 pt-0">
            {listQuery.isLoading && (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            )}
            {listQuery.isError && (
              <p className="text-sm text-destructive">{extractApiError(listQuery.error, t('common.error'))}</p>
            )}
            {listQuery.data?.items.length === 0 && !listQuery.isLoading && (
              <EmptyState icon={Inbox} title={t('orders.empty')} />
            )}
            {listQuery.data?.items.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => handleSelect(row)}
                className={cn(
                  'w-full rounded-xl border p-3 text-start transition-colors',
                  selectedId === row.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/40',
                  row.customerIsActive === false && 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-bold" dir="ltr">{row.platformOrderNumber}</span>
                  <OrderStatusBadge status={row.status} />
                </div>
                <p className={cn(
                  'mt-1 truncate text-sm font-medium',
                  row.customerIsActive === false && !row.customerLinkedToFinancialParty && 'text-red-600 dark:text-red-400',
                )}>
                  {row.customerLinkedToFinancialParty && row.financialPartyName
                    ? row.financialPartyName
                    : (row.customerName ?? '—')}
                </p>
                {row.customerLinkedToFinancialParty && row.financialAccountCode && (
                  <p className="mt-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-400" dir="ltr">
                    {row.financialAccountCode}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.receivedAt)}</p>
                <p className="mt-1 text-sm font-semibold num-display">{formatMoney(row.totalAmount)}</p>
              </button>
            ))}
          </CardContent>
          {totalCount > 0 && (
            <div className="shrink-0 space-y-2 border-t p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
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
                </div>
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{pageNumber}</span> / {totalPages}
                </span>
              </div>
              <div className="flex items-center justify-center gap-1">
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
            </div>
          )}
        </Card>

        <Card>
          {!selectedId && (
            <CardContent className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Inbox className="mb-3 h-10 w-10 opacity-40" />
              <p>{t('orders.selectHint')}</p>
            </CardContent>
          )}
          {selectedId && detailQuery.isLoading && (
            <CardContent className="flex justify-center py-20"><LoadingSpinner /></CardContent>
          )}
          {order && (
            <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-mono text-lg" dir="ltr">{order.platformOrderNumber}</CardTitle>
                    <CardDescription>{formatDateTime(order.receivedAt)}</CardDescription>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="mt-4 space-y-3">
                  <CustomerStoreLinkSection
                    order={order}
                    onLinked={() => invalidateOrderQueries(order.id)}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    {order.status === 'Received' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={statusMut.isPending}
                        onClick={() => advanceStatus('InProcessing')}
                      >
                        <PlayCircle className="h-4 w-4" />
                        {t('orders.actions.startProcessing')}
                      </Button>
                    )}
                    {order.status === 'InvoiceIssued' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={statusMut.isPending}
                        onClick={() => advanceStatus('Shipping')}
                      >
                        <Truck className="h-4 w-4" />
                        {t('orders.actions.markShipping')}
                      </Button>
                    )}
                    {order.status === 'Shipping' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={statusMut.isPending}
                        onClick={() => advanceStatus('Delivered')}
                      >
                        <PackageCheck className="h-4 w-4" />
                        {t('orders.actions.markDelivered')}
                      </Button>
                    )}
                    {ORDER_STATUS_API_VALUE[order.status as OrderProcessingStatus]
                      < ORDER_STATUS_API_VALUE.InvoiceIssued && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={statusMut.isPending}
                        onClick={() => {
                          setRejectReason('');
                          setRejectOpen(true);
                        }}
                      >
                        <Ban className="h-4 w-4" />
                        {t('orders.actions.reject')}
                      </Button>
                    )}
                    {canCreateInvoice && (
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={customerInactive || invoiceMut.isPending || invoiceLocked}
                        onClick={handleInvoiceAction}
                      >
                        <FileText className="h-4 w-4" />
                        {hasDraftInvoice ? t('orders.openInvoice') : t('orders.generateInvoice')}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-start">#</th>
                        <th className="px-4 py-2 text-start">{t('orders.colItem')}</th>
                        <th className="px-4 py-2 text-start">{t('orders.colUnit')}</th>
                        <th className="px-4 py-2 text-start">{t('orders.colQty')}</th>
                        <th className="px-4 py-2 text-start">{t('orders.colPrice')}</th>
                        <th className="px-4 py-2 text-start">{t('orders.colTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((line, idx) => (
                        <tr key={line.id} className="border-t">
                          <td className="px-4 py-2 num-display">{idx + 1}</td>
                          <td className="px-4 py-2">{line.itemName}</td>
                          <td className="px-4 py-2">{line.unitName || '—'}</td>
                          <td className="px-4 py-2 num-display">{line.quantity}</td>
                          <td className="px-4 py-2 num-display">{formatMoney(line.unitPrice)}</td>
                          <td className="px-4 py-2 num-display font-medium">{formatMoney(line.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 font-semibold">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-end">{t('orders.total')}</td>
                        <td className="px-4 py-3 num-display">{formatMoney(order.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {order.createdInvoiceId && (
                  <div className="border-t px-4 py-3">
                    <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/invoices/${order.createdInvoiceId}/edit`)}>
                      {t('orders.openInvoice')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {rejectOpen && order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (!statusMut.isPending) setRejectOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t('orders.rejectDialog.title')}</h3>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (!statusMut.isPending) setRejectOpen(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              {t('orders.rejectDialog.description', { order: order.platformOrderNumber })}
            </p>
            <textarea
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('orders.rejectDialog.placeholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={statusMut.isPending}
                onClick={() => setRejectOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                disabled={statusMut.isPending || !rejectReason.trim()}
                onClick={confirmReject}
              >
                <Ban className="h-4 w-4" />
                {t('orders.actions.reject')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
