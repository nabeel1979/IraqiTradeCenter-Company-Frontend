import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Search, ShoppingCart, Trash2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { storeParentApi } from '@/lib/api/storeParent';
import { formatIQD } from '@/lib/utils';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

export function StoreCartsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canClear = can(PERMS.Parent.Subscribers.Update);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [confirmUser, setConfirmUser] = useState<{ id: string; name: string; code: string } | null>(null);
  const [flushOpen, setFlushOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parent-store-carts', page, query],
    queryFn: () => storeParentApi.activeCarts({ pageNumber: page, pageSize: 25, search: query || undefined }),
  });

  const flushMut = useMutation({
    mutationFn: () => storeParentApi.flushCartCache(),
    onSuccess: (res) => {
      toast.success(res.message ?? t('storeParent.flushCacheSuccess'));
      setFlushOpen(false);
      qc.invalidateQueries({ queryKey: ['parent-store-carts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? t('common.error'));
    },
  });

  const clearMut = useMutation({
    mutationFn: (userId: string) => storeParentApi.clearCart({ userId }),
    onSuccess: (res) => {
      toast.success(res.message ?? t('storeParent.clearCartSuccess'));
      setConfirmUser(null);
      qc.invalidateQueries({ queryKey: ['parent-store-carts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? t('common.error'));
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {t('storeParent.cartsTitle')}
          </CardTitle>
          <CardDescription>{t('storeParent.cartsDesc')}</CardDescription>
          {canClear && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-1 text-destructive hover:text-destructive"
              onClick={() => setFlushOpen(true)}
            >
              <RefreshCw className="h-4 w-4" />
              {t('storeParent.flushAllCache')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('storeParent.cartsSearchPlaceholder')}
              className="max-w-md"
            />
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {isLoading && (
            <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
          )}
          {isError && <p className="text-sm text-destructive">{t('common.error')}</p>}

          {!isLoading && !isError && (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.trader')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.userCode')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.cartItems')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.amount')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.date')}</th>
                      {canClear && <th className="px-3 py-2 text-start">{t('storeParent.col.action')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.length === 0 && (
                      <tr>
                        <td colSpan={canClear ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground">
                          {t('storeParent.noCarts')}
                        </td>
                      </tr>
                    )}
                    {data?.items.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.fullName}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">{row.phone}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">{row.userCode}</td>
                        <td className="px-3 py-2 num-display">{row.itemCount}</td>
                        <td className="px-3 py-2 num-display">{formatIQD(row.totalAmount)}</td>
                        <td className="px-3 py-2 text-xs" dir="ltr">
                          {new Date(row.updatedAt).toLocaleString()}
                        </td>
                        {canClear && (
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive hover:text-destructive"
                              onClick={() => setConfirmUser({ id: row.id, name: row.fullName, code: row.userCode })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t('storeParent.clearCart')}
                            </Button>
                          </td>
                        )}
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

      <SoftDeleteConfirmDialog
        open={flushOpen}
        title={t('storeParent.flushCacheConfirmTitle')}
        label={t('storeParent.flushCacheConfirmDesc')}
        note={t('storeParent.flushCacheConfirmNote')}
        onClose={() => setFlushOpen(false)}
        onConfirm={() => flushMut.mutate()}
        loading={flushMut.isPending}
      />

      <SoftDeleteConfirmDialog
        open={confirmUser != null}
        title={t('storeParent.clearCartConfirmTitle')}
        label={t('storeParent.clearCartConfirmDesc', {
          name: confirmUser?.name ?? '',
          code: confirmUser?.code ?? '',
        })}
        note={t('storeParent.clearCartConfirmNote')}
        onClose={() => setConfirmUser(null)}
        onConfirm={() => confirmUser && clearMut.mutate(confirmUser.id)}
        loading={clearMut.isPending}
      />
    </div>
  );
}
