import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Search, BookOpen, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { invoicesApi } from '@/lib/api/invoices';
import { invoiceTypesApi, type InvoiceCategory } from '@/lib/api/invoiceTypes';
import { formatMoney, formatDate } from '@/lib/utils';
import type { SalesInvoiceDto } from '@/types/api';
import { findCategoryRoute } from '@/pages/invoices/invoiceRoutes';
import { InvoiceViewDialog } from '@/pages/invoices/components/InvoiceViewDialog';
import { StatusBadge } from '@/pages/invoices/components/StatusBadge';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

interface InvoicesListPageProps {
  category: InvoiceCategory;
}

export function InvoicesListPage({ category }: InvoicesListPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canEdit = can(PERMS.Sales.Invoices.Update);
  const routeCfg = findCategoryRoute(category);
  const isSupplierSide = category === 2 || category === 3;
  const partyColLabel = isSupplierSide ? 'المورد' : t('invoices.list.colCustomer');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<SalesInvoiceDto | null>(null);

  const openJournalEntry = (inv: SalesInvoiceDto) => {
    if (!inv.journalEntryId) return;
    navigate(`/accounting/journal/${inv.journalEntryId}/view`);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', category, search, status],
    queryFn: () => invoicesApi.list({
      category,
      search: search || undefined,
      status: status || undefined,
      pageSize: 50,
    }),
  });

  const typesQuery = useQuery({
    queryKey: ['invoice-types', 'enabled'],
    queryFn: () => invoiceTypesApi.list(true),
  });

  const defaultType = useMemo(() => {
    const types = (typesQuery.data ?? []).filter(tp => tp.category === category);
    return types.find(tp => tp.code === routeCfg.systemCode) ?? types[0];
  }, [typesQuery.data, category, routeCfg.systemCode]);

  const newInvoiceUrl = defaultType
    ? `/invoices/new?typeId=${defaultType.id}`
    : '/invoices/new';

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
      <div className="invoice-toolbar !relative !top-auto">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('invoices.list.searchPlaceholder')}
            className="h-8 pr-10 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="invoice-select w-auto min-w-[140px]"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">{t('invoices.list.allStatuses')}</option>
          <option value="Paid">{t('invoices.status.paid')}</option>
          <option value="PartiallyPaid">{t('invoices.status.partiallyPaid')}</option>
          <option value="Issued">{t('invoices.status.issued')}</option>
          <option value="Draft">{t('invoices.status.draft')}</option>
          <option value="Cancelled">{t('invoices.status.cancelled')}</option>
        </select>
        <Link to={newInvoiceUrl} className="mr-auto">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            {t('invoices.list.newInvoice')}
          </Button>
        </Link>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('invoices.list.emptyTitle')}
          description={t('invoices.list.emptyDescription')}
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
                    <th>العملة</th>
                    <th className="text-left">{t('invoices.list.colTotal')}</th>
                    <th className="text-left">{t('invoices.list.colPaid')}</th>
                    <th className="text-left">{t('invoices.list.colRemaining')}</th>
                    <th>{t('common.status')}</th>
                    <th className="text-center w-24">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const cur = inv.currency ?? 'IQD';
                    return (
                      <tr key={inv.id} className="cursor-pointer" onClick={() => setDetail(inv)}>
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
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title="عرض الفاتورة"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              onClick={() => setDetail(inv)}
                            >
                              <Receipt className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                title={inv.status === 'Cancelled' ? 'لا يمكن تعديل فاتورة ملغاة' : 'تعديل الفاتورة'}
                                disabled={inv.status === 'Cancelled'}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-primary disabled:opacity-40"
                                onClick={() => navigate(`/invoices/${inv.id}/edit`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              title={inv.journalEntryId ? 'عرض القيد' : 'لا يوجد قيد'}
                              disabled={!inv.journalEntryId}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                              onClick={() => openJournalEntry(inv)}
                            >
                              <BookOpen className="h-4 w-4" />
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
        <div className="text-center text-xs text-muted-foreground">
          {t('invoices.list.totalCount', { count: data.totalCount })}
        </div>
      )}

      {detail && (
        <InvoiceViewDialog
          invoice={detail}
          partyLabel={partyColLabel}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
