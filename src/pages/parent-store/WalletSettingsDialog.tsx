import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Link2, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi } from '@/lib/api/storeWallets';
import { extractApiError } from '@/lib/utils';

interface Props {
  onClose: (changed: boolean) => void;
}

export function WalletSettingsDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const [grandparentCode, setGrandparentCode] = useState('');
  const [topupCode, setTopupCode] = useState('');
  const [withdrawCode, setWithdrawCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['wallet-settings'],
    queryFn: () => storeWalletsApi.getSettings(),
  });

  const { data: coa } = useQuery({
    queryKey: ['wallet-coa-accounts'],
    queryFn: () => storeWalletsApi.coaAccounts(),
  });

  const { data: funding } = useQuery({
    queryKey: ['wallet-funding-accounts'],
    queryFn: () => storeWalletsApi.fundingAccounts(),
  });

  useEffect(() => {
    if (settings) {
      setGrandparentCode(settings.grandparentAccountCode ?? '');
      setTopupCode(settings.defaultTopupAccountCode ?? '');
      setWithdrawCode(settings.defaultWithdrawAccountCode ?? '');
    }
  }, [settings]);

  // فقط الحسابات التجميعية (غير الورقية) يمكن اختيارها كجدّ للمحافظ
  const grandparentCandidates = (coa ?? []).filter(
    (a) => !a.isLeaf || a.code === grandparentCode,
  );

  const submit = async () => {
    if (!grandparentCode) {
      toast.error(t('wallets.settings.selectParentError'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await storeWalletsApi.updateSettings({
        parentAccountCode: grandparentCode,
        defaultTopupAccountCode: topupCode || null,
        defaultWithdrawAccountCode: withdrawCode || null,
      });
      if (res && (res as { success: boolean }).success === false) {
        toast.error((res as { message?: string }).message ?? t('common.error'));
        return;
      }
      toast.success(t('wallets.settings.saved'));
      onClose(true);
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const hasIntermediate = !!settings?.intermediateAccountCode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose(false)}>
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">{t('wallets.settings.title')}</h2>
              <p className="text-xs text-muted-foreground">{t('wallets.settings.desc')}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingSettings ? (
          <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
        ) : (
          <div className="space-y-4 p-5">

            {/* شرح الهيكل */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <p className="font-medium">{t('wallets.settings.structureTitle')}</p>
              <div className="mt-1.5 space-y-0.5 font-mono" dir="ltr">
                <p>▸ {grandparentCode || t('wallets.settings.yourChoice')} <span className="text-blue-500">← {t('wallets.settings.notTouched')}</span></p>
                <p className="ps-4">▸ المحافظ الرقمية (.9) <span className="text-blue-500">← {t('wallets.settings.autoCreated')}</span></p>
                <p className="ps-8">▸ محفظة .1 / .2 / .3 ...</p>
              </div>
            </div>

            <Labeled
              label={t('wallets.settings.grandparentAccount')}
              hint={settings?.grandparentIsDefault ? t('wallets.settings.grandparentDefaultHint') : undefined}
            >
              <select
                value={grandparentCode}
                onChange={(e) => setGrandparentCode(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('wallets.settings.selectParent')}</option>
                {grandparentCandidates.map((a) => (
                  <option key={a.id} value={a.code}>
                    {'\u00A0'.repeat(Math.max(0, (a.level - 1) * 2))}{a.nameAr} ({a.code})
                  </option>
                ))}
              </select>
            </Labeled>

            {/* عرض الحساب الوسيط الموجود إن كان قد أُنشئ */}
            {hasIntermediate && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{t('wallets.settings.intermediateLabel')}:</span>
                <span className="font-medium">{settings!.intermediateAccountName}</span>
                <span className="font-mono text-muted-foreground" dir="ltr">({settings!.intermediateAccountCode})</span>
              </div>
            )}

            <Labeled label={t('wallets.settings.defaultTopup')} hint={t('wallets.settings.optional')}>
              <select
                value={topupCode}
                onChange={(e) => setTopupCode(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('wallets.settings.none')}</option>
                {funding?.map((a) => (
                  <option key={a.code} value={a.code}>{a.nameAr} ({a.code})</option>
                ))}
              </select>
            </Labeled>

            <Labeled label={t('wallets.settings.defaultWithdraw')} hint={t('wallets.settings.optional')}>
              <select
                value={withdrawCode}
                onChange={(e) => setWithdrawCode(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('wallets.settings.none')}</option>
                {funding?.map((a) => (
                  <option key={a.code} value={a.code}>{a.nameAr} ({a.code})</option>
                ))}
              </select>
            </Labeled>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onClose(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting || loadingSettings}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
