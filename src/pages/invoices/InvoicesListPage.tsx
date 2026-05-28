import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Search, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { invoicesApi } from '@/lib/api/invoices';
import { formatIQD, formatDate } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { labelKey: string; variant: any }> = {
    Paid: { labelKey: 'invoices.status.paid', variant: 'success' },
    PartiallyPaid: { labelKey: 'invoices.status.partiallyPaid', variant: 'warning' },
    Issued: { labelKey: 'invoices.status.issued', variant: 'default' },
    Draft: { labelKey: 'invoices.status.draft', variant: 'muted' },
    Cancelled: { labelKey: 'invoices.status.cancelled', variant: 'destructive' },
  };
  const cfg = map[status];
  return <Badge variant={cfg?.variant ?? 'muted'}>{cfg ? t(cfg.labelKey) : status}</Badge>;
}

export function InvoicesListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', search, status],
    queryFn: () => invoicesApi.list({ search: search || undefined, status: status || undefined, pageSize: 50 }),
  });

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
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('invoices.list.searchPlaceholder')}
              className="pr-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-secondary/40 px-3 text-sm"
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
          <Link to="/invoices/new" className="mr-auto">
            <Button>
              <Plus className="h-4 w-4" />
              {t('invoices.list.newInvoice')}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('invoices.list.emptyTitle')}
          description={t('invoices.list.emptyDescription')}
          action={
            <Link to="/invoices/new">
              <Button><Plus className="h-4 w-4" />{t('invoices.list.newInvoice')}</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('invoices.list.colNumber')}</th>
                  <th>{t('invoices.list.colDate')}</th>
                  <th>{t('invoices.list.colCustomer')}</th>
                  <th className="text-left">{t('invoices.list.colTotal')}</th>
                  <th className="text-left">{t('invoices.list.colPaid')}</th>
                  <th className="text-left">{t('invoices.list.colRemaining')}</th>
                  <th>{t('common.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <span className="num-display text-xs">{inv.invoiceNumber}</span>
                    </td>
                    <td className="text-sm text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                    <td className="font-medium">{inv.customerName ?? '—'}</td>
                    <td className="text-left num-display">{formatIQD(inv.totalAmount)}</td>
                    <td className="text-left num-display text-success">{formatIQD(inv.paidAmount)}</td>
                    <td className="text-left num-display text-muted-foreground">
                      {formatIQD(inv.remainingAmount)}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>
                      <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <FileText className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {data && data.totalCount > 0 && (
        <div className="text-center text-xs text-muted-foreground">
          {t('invoices.list.totalCount', { count: data.totalCount })}
        </div>
      )}
    </div>
  );
}
