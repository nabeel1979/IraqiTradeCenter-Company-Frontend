import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Search, Wallet as WalletIcon, RefreshCw, Link2,
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
import { WalletSettingsDialog } from '@/pages/parent-store/WalletSettingsDialog';
import { WalletRowActions } from '@/pages/parent-store/WalletRowActions';
import { WalletCardDialog } from '@/pages/parent-store/WalletCardDialog';

export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function WalletsPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canCreate = can(PERMS.Parent.Wallets.Create);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statement, setStatement] = useState<WalletListItem | null>(null);
  const [card, setCard] = useState<WalletListItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parent-wallets', query],
    queryFn: () => storeWalletsApi.list(query || undefined),
  });

  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await storeWalletsApi.backfill();
      toast.success(t('wallets.backfillDone', { count: res.created }));
      refetch();
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setBackfilling(false);
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
                {t('wallets.title')}
              </CardTitle>
              <CardDescription>{t('wallets.desc')}</CardDescription>
            </div>
            {canCreate && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                  <Link2 className="h-4 w-4" />
                  {t('wallets.settings.button')}
                </Button>
                <Button variant="outline" size="sm" disabled={backfilling} onClick={runBackfill}>
                  <RefreshCw className={backfilling ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  {t('wallets.backfill')}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
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
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('wallets.col.owner')}</th>
                    <th className="px-3 py-2 text-start">{t('wallets.col.type')}</th>
                    <th className="px-3 py-2 text-start">{t('wallets.col.account')}</th>
                    <th className="px-3 py-2 text-end">{t('wallets.col.balance')}</th>
                    <th className="px-3 py-2 text-center">{t('wallets.col.status')}</th>
                    <th className="px-3 py-2 text-center">{t('wallets.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                        {t('wallets.empty')}
                      </td>
                    </tr>
                  )}
                  {data?.map((w) => (
                    <tr key={w.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{w.userName}</div>
                        <div className="font-mono text-xs text-muted-foreground" dir="ltr">{w.userCode}</div>
                      </td>
                      <td className="px-3 py-2">{w.walletTypeName}</td>
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">{w.accountCode}</td>
                      <td className="px-3 py-2 text-end font-semibold tabular-nums" dir="ltr">
                        {formatMoney(w.balance)} {w.currency}
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

      {settingsOpen && (
        <WalletSettingsDialog onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
