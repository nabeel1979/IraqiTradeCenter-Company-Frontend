import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Wallet as WalletIcon, Plus, Link2, Trash2, ChevronLeft, Users, Star,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi, type WalletGroup } from '@/lib/api/storeWallets';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { extractApiError } from '@/lib/utils';
import { WalletGroupDialog } from '@/pages/parent-store/WalletGroupDialog';

export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function WalletsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCreate = can(PERMS.Parent.Wallets.Create);

  const [dialog, setDialog] = useState<{ open: boolean; group: WalletGroup | null }>({ open: false, group: null });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wallet-groups'],
    queryFn: () => storeWalletsApi.groups.list(),
  });

  const makeDefault = async (g: WalletGroup) => {
    setSettingDefault(g.id);
    try {
      const res = await storeWalletsApi.groups.setDefault(g.id);
      if (res && res.success === false) { toast.error(res.message ?? t('common.error')); return; }
      toast.success(t('wallets.groups.defaultSet', { name: g.name }));
      refetch();
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSettingDefault(null);
    }
  };

  const removeGroup = async (g: WalletGroup) => {
    if (!window.confirm(t('wallets.groups.confirmDelete', { name: g.name }))) return;
    setDeleting(g.id);
    try {
      const res = await storeWalletsApi.groups.remove(g.id);
      if (res && res.success === false) { toast.error(res.message ?? t('common.error')); return; }
      toast.success(t('wallets.groups.deleted'));
      refetch();
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WalletIcon className="h-5 w-5 text-primary" />
                {t('wallets.groups.title')}
              </CardTitle>
              <CardDescription>{t('wallets.groups.desc')}</CardDescription>
            </div>
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ open: true, group: null })}>
                <Plus className="h-4 w-4" />
                {t('wallets.groups.add')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
          )}
          {isError && <p className="text-sm text-destructive">{t('common.error')}</p>}
          {!isLoading && !isError && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('wallets.groups.colName')}</th>
                    <th className="px-3 py-2 text-start">{t('wallets.groups.colParent')}</th>
                    <th className="px-3 py-2 text-center">{t('wallets.groups.colMembers')}</th>
                    <th className="px-3 py-2 text-end">{t('wallets.groups.colBalance')}</th>
                    <th className="px-3 py-2 text-center">{t('wallets.col.status')}</th>
                    <th className="px-3 py-2 text-center">{t('wallets.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                        {t('wallets.groups.empty')}
                      </td>
                    </tr>
                  )}
                  {data?.map((g) => (
                    <tr
                      key={g.id}
                      className="cursor-pointer border-t hover:bg-muted/30"
                      onClick={() => navigate(`/parent/wallets/${g.id}`)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          <WalletIcon className="h-4 w-4 text-primary" />
                          {g.name}
                          {g.isDefault && (
                            <Badge variant="warning" className="gap-1">
                              <Star className="h-3 w-3 fill-current" />
                              {t('wallets.groups.default')}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {g.grandparentAccountName ? (
                          <div>
                            <div>{g.grandparentAccountName}</div>
                            <div className="font-mono text-xs text-muted-foreground" dir="ltr">{g.grandparentAccountCode}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">2.9 — {t('wallets.settings.groupNameDefault')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {g.memberCount}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-end font-semibold tabular-nums" dir="ltr">
                        {formatMoney(g.totalBalance)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={g.isActive ? 'success' : 'destructive'}>
                          {g.isActive ? t('wallets.active') : t('wallets.inactive')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/parent/wallets/${g.id}`)} title={t('wallets.groups.open')}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          {canCreate && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={g.isDefault || settingDefault === g.id}
                                onClick={() => makeDefault(g)}
                                title={g.isDefault ? t('wallets.groups.default') : t('wallets.groups.makeDefault')}
                                className={g.isDefault ? 'text-amber-500' : ''}
                              >
                                <Star className={g.isDefault ? 'h-4 w-4 fill-current' : 'h-4 w-4'} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, group: g })} title={t('wallets.groups.edit')}>
                                <Link2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={deleting === g.id || g.memberCount > 0}
                                onClick={() => removeGroup(g)}
                                title={t('wallets.groups.delete')}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialog.open && (
        <WalletGroupDialog
          group={dialog.group}
          onClose={(changed) => {
            setDialog({ open: false, group: null });
            if (changed) refetch();
          }}
        />
      )}
    </div>
  );
}
