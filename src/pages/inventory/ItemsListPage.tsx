import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Package, AlertTriangle, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { inventoryApi } from '@/lib/api/inventory';
import { formatIQD } from '@/lib/utils';

export function ItemsListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['items', search, lowStockOnly],
    queryFn: () => inventoryApi.list({ search, lowStock: lowStockOnly, pageSize: 50 }),
  });

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('items.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
          <Button
            variant={lowStockOnly ? 'default' : 'outline'}
            onClick={() => setLowStockOnly(!lowStockOnly)}
          >
            <AlertTriangle className="h-4 w-4" />
            {t('items.lowStockOnly')}
          </Button>
          <Button variant="outline">
            <Filter className="h-4 w-4" />
            {t('common.filters')}
          </Button>
          <Link to="/inventory/new" className="mr-auto">
            <Button>
              <Plus className="h-4 w-4" />
              {t('items.newItem')}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner text={t('items.loading')} />
      ) : error ? (
        <EmptyState
          icon={Package}
          title={t('items.loadError')}
          description={t('common.serverConnectionError')}
        />
      ) : !data?.items.length ? (
        <EmptyState
          icon={Package}
          title={t('items.emptyTitle')}
          description={t('items.emptyDescription')}
          action={
            <Link to="/inventory/new">
              <Button>
                <Plus className="h-4 w-4" />
                {t('items.addItem')}
              </Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-24">{t('items.colCode')}</th>
                  <th>{t('items.colName')}</th>
                  <th className="text-left">{t('items.colPurchasePrice')}</th>
                  <th className="text-left">{t('items.colSalesPrice')}</th>
                  <th className="text-left">{t('items.colStock')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.id} className="group">
                    <td>
                      <span className="num-display text-xs text-muted-foreground">{item.code}</span>
                    </td>
                    <td>
                      <div>
                        <p className="font-medium">{item.nameAr}</p>
                        <p className="num-display text-xs text-muted-foreground">{item.barcode}</p>
                      </div>
                    </td>
                    <td className="text-left">
                      <span className="num-display text-sm text-muted-foreground">
                        {formatIQD(item.purchasePrice)}
                      </span>
                    </td>
                    <td className="text-left">
                      <span className="num-display font-medium">{formatIQD(item.baseSalesPrice)}</span>
                    </td>
                    <td className="text-left">
                      <span className={
                        'num-display ' + (item.isLowStock ? 'text-warning font-medium' : '')
                      }>
                        {item.stockBaseQuantity.toLocaleString()}
                      </span>
                    </td>
                    <td>
                      {!item.isAvailableForSale ? (
                        <Badge variant="muted">{t('items.statusDisabled')}</Badge>
                      ) : item.isLowStock ? (
                        <Badge variant="warning">{t('items.statusLow')}</Badge>
                      ) : (
                        <Badge variant="success">{t('items.statusAvailable')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/40 px-6 py-3 text-xs text-muted-foreground">
            <span>{t('items.showing', { count: data.items.length, total: data.totalCount })}</span>
            <span>{t('items.page', { page: data.pageNumber, total: data.totalPages })}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
