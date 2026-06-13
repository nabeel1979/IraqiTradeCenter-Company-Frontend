import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Search, Building2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeParentApi } from '@/lib/api/storeParent';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

export function StoreCompanyRequestsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canApprove = can(PERMS.Parent.Subscribers.Update);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parent-store-company-requests', page, query],
    queryFn: () => storeParentApi.companyRequests({ pageNumber: page, pageSize: 25, search: query || undefined, pendingOnly: true }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => storeParentApi.approveCompanyRequest(id),
    onSuccess: (res) => {
      toast.success(res.message ?? t('storeParent.approveSuccess'));
      qc.invalidateQueries({ queryKey: ['parent-store-company-requests'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {t('storeParent.companyRequestsTitle')}
          </CardTitle>
          <CardDescription>{t('storeParent.companyRequestsDesc')}</CardDescription>
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
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.name')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.contact')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.location')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.status')}</th>
                      <th className="px-3 py-2 text-start">{t('storeParent.col.date')}</th>
                      {canApprove && <th className="px-3 py-2 text-start">{t('storeParent.col.action')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.length === 0 && (
                      <tr>
                        <td colSpan={canApprove ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground">
                          {t('storeParent.noRequests')}
                        </td>
                      </tr>
                    )}
                    {data?.items.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.fullName}</div>
                          <div className="text-xs text-muted-foreground font-mono" dir="ltr">{row.userCode}</div>
                        </td>
                        <td className="px-3 py-2 text-xs" dir="ltr">
                          <div>{row.phone}</div>
                          {row.email && <div>{row.email}</div>}
                          {row.contactPhone && row.contactPhone !== row.phone && (
                            <div className="text-muted-foreground">{row.contactPhone}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {[row.country, row.city, row.address].filter(Boolean).join(' — ') || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {row.isProfileCompleted ? (
                              <Badge variant="success">{t('storeParent.badge.profileDone')}</Badge>
                            ) : (
                              <Badge variant="outline">{t('storeParent.badge.profilePending')}</Badge>
                            )}
                            {row.isVerified && (
                              <Badge variant="muted">{t('storeParent.badge.verified')}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs" dir="ltr">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        {canApprove && (
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={approveMut.isPending}
                              onClick={() => approveMut.mutate(row.id)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {t('storeParent.approve')}
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
    </div>
  );
}
