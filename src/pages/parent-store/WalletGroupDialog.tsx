import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Link2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { accountingApi } from '@/lib/api/accounting';
import { storeWalletsApi, type WalletGroup } from '@/lib/api/storeWallets';
import { extractApiError } from '@/lib/utils';
import type { AccountDto } from '@/types/api';

interface Props {
  /** المحفظة قيد التعديل، أو null لإنشاء محفظة جديدة. */
  group: WalletGroup | null;
  onClose: (changed: boolean) => void;
}

function flattenAccounts(nodes: AccountDto[]): AccountDto[] {
  const out: AccountDto[] = [];
  const walk = (ns: AccountDto[]) => {
    for (const n of ns) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function WalletGroupDialog({ group, onClose }: Props) {
  const { t } = useTranslation();
  const isEdit = !!group;
  const structureLocked = isEdit && !!group?.isLocked;

  const [name, setName] = useState(group?.name ?? '');
  const [grandparentCode, setGrandparentCode] = useState(group?.grandparentAccountCode ?? '');
  const [topupCode, setTopupCode] = useState(group?.defaultTopupAccountCode ?? '');
  const [withdrawCode, setWithdrawCode] = useState(group?.defaultWithdrawAccountCode ?? '');
  const [submitting, setSubmitting] = useState(false);

  const { data: tree, isLoading: loadingTree } = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });

  const allAccounts = useMemo(() => (tree ? flattenAccounts(tree) : []), [tree]);
  const leafAccounts = useMemo(() => allAccounts.filter((a) => a.isLeaf), [allAccounts]);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setGrandparentCode(group.grandparentAccountCode ?? '');
      setTopupCode(group.defaultTopupAccountCode ?? '');
      setWithdrawCode(group.defaultWithdrawAccountCode ?? '');
    }
  }, [group]);

  const idByCode = (code: string): number | null =>
    allAccounts.find((a) => a.code === code)?.id ?? null;
  const codeById = (id: number | null): string =>
    (id ? allAccounts.find((a) => a.id === id)?.code : '') ?? '';

  const grandparentInList = useMemo(
    () => leafAccounts.some((a) => a.code === grandparentCode),
    [leafAccounts, grandparentCode],
  );
  const grandparentOptions = useMemo(() => {
    if (grandparentCode && !grandparentInList) {
      const cur = allAccounts.find((a) => a.code === grandparentCode);
      return cur ? [cur, ...leafAccounts] : leafAccounts;
    }
    return leafAccounts;
  }, [leafAccounts, allAccounts, grandparentCode, grandparentInList]);

  const selectedGrandparent = allAccounts.find((a) => a.code === grandparentCode);
  const isLeafSelected = selectedGrandparent?.isLeaf === true;

  const submit = async () => {
    if (!structureLocked && !name.trim()) { toast.error(t('wallets.groups.nameRequired')); return; }
    if (!structureLocked && !grandparentCode) { toast.error(t('wallets.settings.selectParentError')); return; }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        parentAccountCode: grandparentCode,
        defaultTopupAccountCode: topupCode || null,
        defaultWithdrawAccountCode: withdrawCode || null,
      };
      const res = isEdit
        ? await storeWalletsApi.groups.update(group!.id, body)
        : await storeWalletsApi.groups.create(body);
      if (res && (res as { success: boolean }).success === false) {
        toast.error((res as { message?: string }).message ?? t('common.error'));
        return;
      }
      toast.success(isEdit ? t('wallets.groups.updated') : t('wallets.groups.created'));
      onClose(true);
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const groupDisplay = name.trim() || t('wallets.settings.groupNameDefault');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose(false)}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">
                {isEdit ? t('wallets.groups.editTitle') : t('wallets.groups.createTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('wallets.settings.desc')}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingTree ? (
          <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
        ) : (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <p className="font-medium">{t('wallets.settings.structureTitle')}</p>
              <div className="mt-1.5 space-y-0.5 font-mono" dir="ltr">
                <p>▸ {grandparentCode || t('wallets.settings.yourChoice')} <span className="text-blue-500">← {t('wallets.settings.notTouched')}</span></p>
                <p className="ps-4">▸ {groupDisplay} (.9) <span className="text-blue-500">← {t('wallets.settings.autoCreated')}</span></p>
                <p className="ps-8">▸ {t('wallets.groups.members')} .1 / .2 / .3 ...</p>
              </div>
            </div>

            {structureLocked && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>{t('wallets.groups.structureLocked')}</p>
              </div>
            )}

            <Labeled label={t('wallets.groups.nameLabel')} hint={t('wallets.settings.groupNameHint')}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('wallets.groups.namePlaceholder')}
                maxLength={120}
                disabled={structureLocked}
              />
            </Labeled>

            {isLeafSelected && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>{t('wallets.settings.leafWarning')}</p>
              </div>
            )}

            <Labeled label={t('wallets.settings.grandparentAccount')}>
              {structureLocked ? (
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground" dir="ltr">
                  {group?.grandparentAccountCode
                    ? `${group.grandparentAccountCode} - ${group.grandparentAccountName ?? ''}`
                    : `2.9 - ${t('wallets.settings.groupNameDefault')}`}
                </div>
              ) : (
                <AccountPicker
                  accounts={grandparentOptions}
                  value={idByCode(grandparentCode)}
                  initialLabel={
                    selectedGrandparent
                      ? `${selectedGrandparent.code} - ${selectedGrandparent.nameAr}`
                      : group?.grandparentAccountCode
                        ? `${group.grandparentAccountCode} - ${group.grandparentAccountName ?? ''}`
                        : ''
                  }
                  onChange={(id) => setGrandparentCode(codeById(id))}
                  placeholder={t('wallets.settings.searchAccount')}
                />
              )}
            </Labeled>

            <Labeled label={t('wallets.settings.defaultTopup')} hint={t('wallets.settings.optional')}>
              <AccountPicker
                accounts={leafAccounts}
                value={idByCode(topupCode)}
                initialLabel={
                  group?.defaultTopupAccountCode
                    ? `${group.defaultTopupAccountCode} - ${group.defaultTopupAccountName ?? ''}`
                    : ''
                }
                onChange={(id) => setTopupCode(codeById(id))}
                allowClear
                placeholder={t('wallets.settings.searchAccount')}
              />
            </Labeled>

            <Labeled label={t('wallets.settings.defaultWithdraw')} hint={t('wallets.settings.optional')}>
              <AccountPicker
                accounts={leafAccounts}
                value={idByCode(withdrawCode)}
                initialLabel={
                  group?.defaultWithdrawAccountCode
                    ? `${group.defaultWithdrawAccountCode} - ${group.defaultWithdrawAccountName ?? ''}`
                    : ''
                }
                onChange={(id) => setWithdrawCode(codeById(id))}
                allowClear
                placeholder={t('wallets.settings.searchAccount')}
              />
            </Labeled>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onClose(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || loadingTree}
            variant={isLeafSelected ? 'destructive' : 'default'}
          >
            {isLeafSelected ? t('wallets.settings.saveAndConvert') : t('common.save')}
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
