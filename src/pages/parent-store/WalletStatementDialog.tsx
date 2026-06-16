import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi, type WalletListItem } from '@/lib/api/storeWallets';
import { formatMoney } from '@/pages/parent-store/WalletsPage';

interface Props {
  wallet: WalletListItem;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  { value: '', key: 'wallets.filter.all' },
  { value: '1', key: 'wallets.txType.topup' },
  { value: '2', key: 'wallets.txType.withdraw' },
  { value: '3', key: 'wallets.txType.transferIn' },
  { value: '4', key: 'wallets.txType.transferOut' },
];

export function WalletStatementDialog({ wallet, onClose }: Props) {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wallet-statement', wallet.id, from, to, type],
    queryFn: () => storeWalletsApi.statement(wallet.id, {
      from: from || undefined,
      to: to || undefined,
      type: type ? Number(type) : undefined,
    }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">{t('wallets.statement')}</h2>
              <p className="text-xs text-muted-foreground">
                {wallet.userName} · <span className="tabular-nums" dir="ltr">{formatMoney(wallet.balance)} {wallet.currency}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('wallets.from')}</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" dir="ltr" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('wallets.to')}</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" dir="ltr" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('wallets.col.type')}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-10 w-44 rounded-md border border-input bg-background px-3 text-sm"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.key)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>}
          {isError && <p className="text-sm text-destructive">{t('common.error')}</p>}
          {!isLoading && !isError && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('wallets.col.date')}</th>
                    <th className="px-3 py-2 text-start">{t('wallets.col.type')}</th>
                    <th className="px-3 py-2 text-start">{t('wallets.col.detail')}</th>
                    <th className="px-3 py-2 text-end">{t('wallets.col.amount')}</th>
                    <th className="px-3 py-2 text-end">{t('wallets.col.balanceAfter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t('wallets.noTx')}</td>
                    </tr>
                  )}
                  {data?.map((tx) => (
                    <tr key={tx.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap text-xs" dir="ltr">
                        {new Date(tx.createdAt).toLocaleString('en-GB')}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={tx.isCredit ? 'success' : 'outline'}>{tx.typeName}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {tx.counterpartyName ?? tx.counterAccountName ?? tx.description ?? '—'}
                      </td>
                      <td className={`px-3 py-2 text-end font-semibold tabular-nums ${tx.isCredit ? 'text-emerald-600' : 'text-amber-600'}`} dir="ltr">
                        {tx.isCredit ? '+' : '−'}{formatMoney(tx.amount)}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{formatMoney(tx.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
