import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeParentApi } from '@/lib/api/storeParent';
import { formatIQD } from '@/lib/utils';

const STATUS_KEYS: Record<string, string> = {
  Pending: 'storeParent.status.pending',
  Received: 'storeParent.status.received',
  InProcessing: 'storeParent.status.inProcessing',
  InvoiceIssued: 'storeParent.status.invoiceIssued',
  Shipping: 'storeParent.status.shipping',
  Delivered: 'storeParent.status.delivered',
  Rejected: 'storeParent.status.rejected',
};

export function StoreTraderSalesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parent-store-trader-sales', page, query],
    queryFn: () => storeParentApi.traderSales({ pageNumber: page, pageSize: 25, search: query || undefined }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            {t('storeParent.traderSalesTitle')}
          </CardTitle>
          <CardDescription>{t('storeParent.traderSalesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('storeParent.searchPlaceholder')}
              className="max-w-md"
            />
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {isLoading && (
            <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
          )}
          {isError && (
            <p className="text-sm text-destructive">{t('common.error')}</p>
          )}
          {!isLoading && !isError && (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.orderNo')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.trader')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.company')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.amount')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.status')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                          {t('storeParent.noSales')}
                        </td>
                      </tr>
                    )}
                    {data?.items.map((row) => (
                      <tr key={`${row.companyCode}-${row.id}`} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">{row.orderNumber}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.traderName ?? row.customerName}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {row.traderPhone ?? '—'}
                            {row.traderCode ? ` · ${row.traderCode}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{row.companyName}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">{row.companyCode}</div>
                        </td>
                        <td className="px-3 py-2 num-display">{formatIQD(row.totalAmount)}</td>
                        <td className="px-3 py-2">
                          {t(STATUS_KEYS[row.status] ?? 'storeParent.status.unknown')}
                        </td>
                        <td className="px-3 py-2 text-xs" dir="ltr">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data && data.totalCount > data.pageSize && (
                <div className="flex items-center justify-between text-sm">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {t('common.previous')}
                  </Button>
                  <span>{t('storeParent.pageOf', { current: page, total: totalPages })}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    {t('common.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
