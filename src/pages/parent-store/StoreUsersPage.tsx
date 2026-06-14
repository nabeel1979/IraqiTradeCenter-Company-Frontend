import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Store, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeParentApi } from '@/lib/api/storeParent';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { StoreUserDetailDialog } from '@/pages/parent-store/StoreUserDetailDialog';
import { StoreUserRowActions, type StoreUserDialogState } from '@/pages/parent-store/StoreUserRowActions';

export function StoreUsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(PERMS.Parent.Subscribers.Update);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<StoreUserDialogState>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parent-store-users', page, query],
    queryFn: () => storeParentApi.storeUsers({ pageNumber: page, pageSize: 25, search: query || undefined }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  const closeDialog = () => {
    setDialog(null);
    qc.invalidateQueries({ queryKey: ['parent-store-users'] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            {t('storeParent.usersTitle')}
          </CardTitle>
          <CardDescription>{t('storeParent.usersDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('storeParent.usersSearchPlaceholder')}
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
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.name')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.userCode')}</th>
                      <th className="px-3 py-2 text-center">{t('storeParent.col.status')}</th>
                      <th className="px-3 py-2 text-center">{t('storeParent.col.financialLink')}</th>
                      <th className="px-3 py-2 text-center w-12">{t('storeParent.col.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          {t('storeParent.noUsers')}
                        </td>
                      </tr>
                    )}
                    {data?.items.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.fullName}</td>
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">{row.userCode}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={row.isDisabled ? 'destructive' : 'success'}>
                            {row.isDisabled
                              ? t('storeParent.badge.disabled')
                              : t('storeParent.badge.active')}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasFinancialLink ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                              <Check className="h-4 w-4" />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex justify-center">
                            <StoreUserRowActions
                              canManage={canManage}
                              onView={() => setDialog({ user: row, mode: 'view' })}
                              onEdit={() => setDialog({ user: row, mode: 'edit' })}
                            />
                          </div>
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

      {dialog && (
        <StoreUserDetailDialog
          user={dialog.user}
          canManage={canManage}
          initialEdit={dialog.mode === 'edit'}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
