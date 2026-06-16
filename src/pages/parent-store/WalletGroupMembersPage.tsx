import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Search, Wallet as WalletIcon, RefreshCw, Link2, ArrowRight,
  ArrowDownCircle, ArrowUpCircle, Building2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi, type WalletListItem } from '@/lib/api/storeWallets';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { extractApiError } from '@/lib/utils';
import { WalletStatementDialog } from '@/pages/parent-store/WalletStatementDialog';
import { WalletGroupDialog } from '@/pages/parent-store/WalletGroupDialog';
import { WalletRowActions } from '@/pages/parent-store/WalletRowActions';
import { WalletCardDialog } from '@/pages/parent-store/WalletCardDialog';
import { formatMoney } from '@/pages/parent-store/WalletsPage';

export function WalletGroupMembersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId = '' } = useParams<{ groupId: string }>();
  const { can } = usePermissions();
  const canCreate = can(PERMS.Parent.Wallets.Create);
  const canTopup = can(PERMS.Parent.Wallets.Topup);
  const canWithdraw = can(PERMS.Parent.Wallets.Withdraw);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statement, setStatement] = useState<WalletListItem | null>(null);
  const [card, setCard] = useState<WalletListItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillingCompanies, setBackfillingCompanies] = useState(false);

  const { data: group, refetch: refetchGroup } = useQuery({
    queryKey: ['wallet-group', groupId],
    queryFn: () => storeWalletsApi.groups.get(groupId),
    enabled: !!groupId,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parent-wallets', groupId, query],
    queryFn: () => storeWalletsApi.list({ groupId, search: query || undefined }),
    enabled: !!groupId,
  });

  const groupName = group?.name ?? t('wallets.groups.members');

  const PAGE_SIZE = 25;
  const totalPages = data ? Math.max(1, Math.ceil(data.length / PAGE_SIZE)) : 1;
  const pageItems = data ? data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await storeWalletsApi.groups.backfill(groupId);
      if (res && res.success === false) { toast.error(res.message ?? t('common.error')); return; }
      toast.success(t('wallets.backfillDone', { count: res.created }));
      refetch();
      refetchGroup();
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setBackfilling(false);
    }
  };

  const runBackfillCompanies = async () => {
    setBackfillingCompanies(true);
    try {
      const res = await storeWalletsApi.groups.backfillCompanies(groupId);
      if (res && res.success === false) { toast.error(res.message ?? t('common.error')); return; }
      toast.success(t('wallets.backfillCompaniesDone', { count: res.created }));
      refetch();
      refetchGroup();
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setBackfillingCompanies(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <button
                onClick={() => navigate('/parent/wallets')}
                className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {t('wallets.groups.backMembers')}
              </button>
              <CardTitle className="flex items-center gap-2">
                <WalletIcon className="h-5 w-5 text-primary" />
                {groupName}
              </CardTitle>
              <CardDescription>{t('wallets.groups.membersDesc')}</CardDescription>
            </div>
          </div>

          {/* شريط الأزرار: ربط شجرة الحسابات، ثم دفع/سحب باسم المحفظة الديناميكي */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {canCreate && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Link2 className="h-4 w-4" />
                {t('wallets.settings.button')}
              </Button>
            )}
            {canTopup && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/parent/wallets/${groupId}/pay`)}>
                <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                {t('walletPosting.payTitleNamed', { name: groupName })}
              </Button>
            )}
            {canWithdraw && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/parent/wallets/${groupId}/withdraw`)}>
                <ArrowUpCircle className="h-4 w-4 text-amber-600" />
                {t('walletPosting.withdrawTitleNamed', { name: groupName })}
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" size="sm" disabled={backfilling} onClick={runBackfill}>
                <RefreshCw className={backfilling ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                {t('wallets.groups.addMembers')}
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" size="sm" disabled={backfillingCompanies} onClick={runBackfillCompanies}>
                <Building2 className={backfillingCompanies ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                {t('wallets.groups.addCompanies')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('wallets.searchPlaceholder')}
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
                <table className="w-full min-w-[880px] border-collapse text-sm [&_td]:border [&_td]:border-border/60 [&_th]:border [&_th]:border-border/60">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('wallets.col.owner')}</th>
                      <th className="px-3 py-2 text-start">{t('wallets.col.type')}</th>
                      <th className="px-3 py-2 text-start">{t('wallets.col.account')}</th>
                      <th className="px-3 py-2 text-end">{t('wallets.col.balance')}</th>
                      <th className="px-3 py-2 text-center">{t('wallets.col.currency')}</th>
                      <th className="px-3 py-2 text-center">{t('wallets.col.status')}</th>
                      <th className="px-3 py-2 text-center">{t('wallets.col.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                          {t('wallets.empty')}
                        </td>
                      </tr>
                    )}
                    {pageItems.map((w) => (
                      <tr key={w.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-medium">{w.userName}</div>
                          <div className="font-mono text-xs text-muted-foreground" dir="ltr">{w.userCode}</div>
                        </td>
                        <td className="px-3 py-2">{w.walletTypeName}</td>
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">{w.accountCode}</td>
                        <td className="px-3 py-2 text-end font-semibold tabular-nums" dir="ltr">
                          {formatMoney(w.balance)}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-muted-foreground" dir="ltr">
                          {w.currency}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={w.isActive ? 'success' : 'destructive'}>
                            {w.isActive ? t('wallets.active') : t('wallets.inactive')}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <WalletRowActions
                            onStatement={() => setStatement(w)}
                            onOpenCard={() => setCard(w)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data && data.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{t('wallets.groups.totalMembers', { count: data.length })}</span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        {t('common.previous')}
                      </Button>
                      <span>{t('storeParent.pageOf', { current: page, total: totalPages })}</span>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        {t('common.next')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {statement && (
        <WalletStatementDialog wallet={statement} onClose={() => setStatement(null)} />
      )}

      {card && (
        <WalletCardDialog
          walletId={card.id}
          onClose={(changed) => {
            setCard(null);
            if (changed) refetch();
          }}
        />
      )}

      {editOpen && group && (
        <WalletGroupDialog
          group={group}
          onClose={(changed) => {
            setEditOpen(false);
            if (changed) { refetch(); refetchGroup(); }
          }}
        />
      )}
    </div>
  );
}
