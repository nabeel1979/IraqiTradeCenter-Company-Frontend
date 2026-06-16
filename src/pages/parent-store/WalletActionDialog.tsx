import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { storeWalletsApi, type WalletListItem } from '@/lib/api/storeWallets';
import { extractApiError } from '@/lib/utils';
import { formatMoney } from '@/pages/parent-store/WalletsPage';

export type WalletActionMode = 'topup' | 'withdraw' | 'transfer';

interface Props {
  wallet: WalletListItem;
  mode: WalletActionMode;
  wallets: WalletListItem[];
  onClose: (changed: boolean) => void;
}

export function WalletActionDialog({ wallet, mode, wallets, onClose }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [fundingCode, setFundingCode] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const needsFunding = mode === 'topup' || mode === 'withdraw';

  const { data: fundingAccounts } = useQuery({
    queryKey: ['wallet-funding-accounts'],
    queryFn: () => storeWalletsApi.fundingAccounts(),
    enabled: needsFunding,
  });

  const transferTargets = wallets.filter((w) => w.id !== wallet.id && w.isActive);

  const title = mode === 'topup' ? t('wallets.topup')
    : mode === 'withdraw' ? t('wallets.withdraw')
    : t('wallets.transfer');

  const Icon = mode === 'topup' ? ArrowDownCircle
    : mode === 'withdraw' ? ArrowUpCircle
    : ArrowLeftRight;

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(t('wallets.invalidAmount'));
      return;
    }
    if (needsFunding && !fundingCode) {
      toast.error(t('wallets.selectFunding'));
      return;
    }
    if (mode === 'transfer' && !toWalletId) {
      toast.error(t('wallets.selectTarget'));
      return;
    }

    setSubmitting(true);
    try {
      const body = { amount: value, description: description.trim() || null };
      let res;
      if (mode === 'topup') res = await storeWalletsApi.topup(wallet.id, { ...body, fundingAccountCode: fundingCode });
      else if (mode === 'withdraw') res = await storeWalletsApi.withdraw(wallet.id, { ...body, fundingAccountCode: fundingCode });
      else res = await storeWalletsApi.transfer(wallet.id, { ...body, toWalletId });

      if (res && (res as { success: boolean }).success === false) {
        toast.error((res as { message?: string }).message ?? t('common.error'));
        return;
      }
      toast.success(t('wallets.opDone'));
      onClose(true);
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose(false)}>
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-xs text-muted-foreground">{wallet.userName}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('wallets.currentBalance')}: </span>
            <span className="font-semibold tabular-nums" dir="ltr">{formatMoney(wallet.balance)} {wallet.currency}</span>
          </div>

          <Labeled label={t('wallets.amount')}>
            <Input
              type="number"
              min="0"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
              placeholder="0"
            />
          </Labeled>

          {needsFunding && (
            <Labeled label={mode === 'topup' ? t('wallets.fundingSource') : t('wallets.withdrawTo')}>
              <select
                value={fundingCode}
                onChange={(e) => setFundingCode(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('wallets.selectAccount')}</option>
                {fundingAccounts?.map((a) => (
                  <option key={a.code} value={a.code}>{a.nameAr} ({a.code})</option>
                ))}
              </select>
            </Labeled>
          )}

          {mode === 'transfer' && (
            <Labeled label={t('wallets.targetWallet')}>
              <select
                value={toWalletId}
                onChange={(e) => setToWalletId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('wallets.selectTarget')}</option>
                {transferTargets.map((w) => (
                  <option key={w.id} value={w.id}>{w.userName} — {w.userCode}</option>
                ))}
              </select>
            </Labeled>
          )}

          <Labeled label={t('wallets.note')}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('wallets.notePlaceholder')} />
          </Labeled>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onClose(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {t('wallets.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
