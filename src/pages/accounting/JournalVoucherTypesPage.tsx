import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Circle,
  Lock,
  X,
  Save,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { cn, extractApiError } from '@/lib/utils';
import { accountingApi } from '@/lib/api/accounting';
import {
  journalVoucherTypesApi,
  type JournalVoucherTypeDto,
  type UpsertJournalVoucherTypePayload,
  type VoucherNature,
} from '@/lib/api/journalVoucherTypes';
import type { AccountDto } from '@/types/api';

function flattenLeafAccounts(tree: AccountDto[]): AccountDto[] {
  const out: AccountDto[] = [];
  const walk = (nodes: AccountDto[]) => {
    for (const n of nodes) {
      if (n.isLeaf) out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

export function JournalVoucherTypesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'enabled'>('all');
  const [editing, setEditing] = useState<JournalVoucherTypeDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['voucher-types', 'all'],
    queryFn: () => journalVoucherTypesApi.getAll(false),
  });

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });
  const leafAccounts = useMemo(
    () => (treeQuery.data ? flattenLeafAccounts(treeQuery.data) : []),
    [treeQuery.data]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return types.filter(t => {
      if (showOnly === 'enabled' && !t.isEnabled) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.nameAr.toLowerCase().includes(q) ||
        (t.nameEn ?? '').toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [types, search, showOnly]);

  const toggleM = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) =>
      journalVoucherTypesApi.toggle(id, isEnabled),
    onSuccess: (_d, vars) => {
      toast.success(vars.isEnabled ? t('voucherTypes.toast.enabled') : t('voucherTypes.toast.disabled'));
      qc.invalidateQueries({ queryKey: ['voucher-types'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, t('voucherTypes.toast.toggleFailed'))),
  });

  const moveM = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      journalVoucherTypesApi.move(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voucher-types'] }),
    onError: (e: any) => toast.error(extractApiError(e, t('voucherTypes.toast.moveFailed'))),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => journalVoucherTypesApi.delete(id),
    onSuccess: () => {
      toast.success(t('voucherTypes.toast.deleted'));
      qc.invalidateQueries({ queryKey: ['voucher-types'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, t('voucherTypes.toast.deleteFailed'))),
  });

  const enabledCount = types.filter(t => t.isEnabled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" />
            {t('voucherTypes.title')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('voucherTypes.subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreatingNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t('voucherTypes.addNew')}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('voucherTypes.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pr-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1 rounded-md border border-input bg-secondary/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setShowOnly('all')}
                className={cn(
                  'rounded px-2 py-1 transition-colors',
                  showOnly === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                )}
              >
                {t('common.all')} ({types.length})
              </button>
              <button
                type="button"
                onClick={() => setShowOnly('enabled')}
                className={cn(
                  'rounded px-2 py-1 transition-colors',
                  showOnly === 'enabled' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                )}
              >
                {t('voucherTypes.enabledFilter')} ({enabledCount})
              </button>
            </div>
            <CardTitle className="ms-auto text-xs text-muted-foreground">
              {t('voucherTypes.showingCount', { shown: filtered.length, total: types.length })}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('voucherTypes.noResults')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 p-2 text-center">#</th>
                    <th className="w-24 p-2 text-right">{t('voucherTypes.col.code')}</th>
                    <th className="p-2 text-right">{t('voucherTypes.col.name')}</th>
                    <th className="p-2 text-right">{t('voucherTypes.col.defaultDebit')}</th>
                    <th className="p-2 text-right">{t('voucherTypes.col.defaultCredit')}</th>
                    <th className="w-24 p-2 text-center">{t('common.status')}</th>
                    <th className="w-32 p-2 text-center">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((vt, idx) => (
                    <tr
                      key={vt.id}
                      className={cn(
                        'border-t border-border/40 transition-colors hover:bg-secondary/20',
                        !vt.isEnabled && 'opacity-60'
                      )}
                    >
                      <td className="p-2 text-center text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="p-2 text-right">
                        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                          {vt.code}
                        </code>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{vt.nameAr}</span>
                          {vt.isSystem && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300" title={t('voucherTypes.systemType')}>
                              <Lock className="h-2.5 w-2.5" />
                              {t('common.system')}
                            </span>
                          )}
                          {vt.nature === 'Debit' && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300" title={t('voucherTypes.natureDebitTip')}>
                              {t('voucherTypes.natureDebit')}
                            </span>
                          )}
                          {vt.nature === 'Credit' && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title={t('voucherTypes.natureCreditTip')}>
                              {t('voucherTypes.natureCredit')}
                            </span>
                          )}
                          {vt.showInSidebar && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary" title={t('voucherTypes.inSidebarTip')}>
                              {t('voucherTypes.inSidebar')}
                            </span>
                          )}
                        </div>
                        {vt.description && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{vt.description}</p>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {vt.defaultDebitAccountId ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <ArrowDownLeft className="h-3 w-3" />
                            <span className="num-display">{vt.defaultDebitAccountCode}</span>
                            <span className="text-muted-foreground">- {vt.defaultDebitAccountName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {vt.defaultCreditAccountId ? (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <ArrowUpRight className="h-3 w-3" />
                            <span className="num-display">{vt.defaultCreditAccountCode}</span>
                            <span className="text-muted-foreground">- {vt.defaultCreditAccountName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleM.mutate({ id: vt.id, isEnabled: !vt.isEnabled })}
                          disabled={toggleM.isPending}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                            vt.isEnabled
                              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border border-muted-foreground/20 bg-muted-foreground/5 text-muted-foreground hover:bg-muted-foreground/10'
                          )}
                        >
                          {vt.isEnabled ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {vt.isEnabled ? t('voucherTypes.enabled') : t('voucherTypes.disabled')}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveM.mutate({ id: vt.id, direction: 'up' })}
                            disabled={moveM.isPending || idx === 0}
                            title={t('voucherTypes.moveUp')}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveM.mutate({ id: vt.id, direction: 'down' })}
                            disabled={moveM.isPending || idx === filtered.length - 1}
                            title={t('voucherTypes.moveDown')}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(vt)}
                            title={t('common.edit')}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (vt.isSystem) {
                                toast.error(t('voucherTypes.cannotDeleteSystem'));
                                return;
                              }
                              if (window.confirm(t('voucherTypes.confirmDelete', { name: vt.nameAr }))) {
                                deleteM.mutate(vt.id);
                              }
                            }}
                            disabled={vt.isSystem}
                            title={vt.isSystem ? t('voucherTypes.systemCannotDelete') : t('common.delete')}
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded',
                              vt.isSystem
                                ? 'cursor-not-allowed text-muted-foreground/30'
                                : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {(creatingNew || editing) && (
        <VoucherTypeDialog
          existing={editing}
          existingCodes={types.map(vt => vt.code)}
          accounts={leafAccounts}
          onClose={() => {
            setEditing(null);
            setCreatingNew(false);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['voucher-types'] });
            setEditing(null);
            setCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dialog: تعديل/إضافة نوع
// ─────────────────────────────────────────────────────────────────────
function VoucherTypeDialog({
  existing,
  existingCodes,
  accounts,
  onClose,
  onSaved,
}: {
  existing: JournalVoucherTypeDto | null;
  existingCodes: string[];
  accounts: AccountDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isNew = existing == null;
  const isSystemRow = existing != null && existing.isSystem;
  const [code, setCode] = useState(existing?.code ?? '');
  const [nameAr, setNameAr] = useState(existing?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(existing?.nameEn ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [debitAccountId, setDebitAccountId] = useState<number | null>(existing?.defaultDebitAccountId ?? null);
  const [creditAccountId, setCreditAccountId] = useState<number | null>(existing?.defaultCreditAccountId ?? null);
  const [isEnabled, setIsEnabled] = useState(existing?.isEnabled ?? true);
  const [displayOrder, setDisplayOrder] = useState(existing?.displayOrder ?? 100);
  const [nature, setNature] = useState<VoucherNature>(existing?.nature ?? 'Mixed');
  const [showInSidebar, setShowInSidebar] = useState<boolean>(existing?.showInSidebar ?? false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const codeError = (() => {
    if (!isNew) return null;
    const c = code.trim().toUpperCase();
    if (!c) return t('voucherTypes.dialog.codeRequired');
    if (c.length > 20) return t('voucherTypes.dialog.codeTooLong');
    if (existingCodes.map(x => x.toUpperCase()).includes(c)) return t('voucherTypes.dialog.codeDuplicate');
    return null;
  })();

  const sameAccountError =
    debitAccountId && creditAccountId && debitAccountId === creditAccountId
      ? t('voucherTypes.dialog.sameAccountError')
      : null;

  const saveM = useMutation({
    mutationFn: () => {
      const payload: UpsertJournalVoucherTypePayload = {
        code: code.trim().toUpperCase(),
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
        description: description.trim() || null,
        defaultDebitAccountId: debitAccountId,
        defaultCreditAccountId: creditAccountId,
        isEnabled,
        displayOrder,
        nature,
        showInSidebar,
      };
      return isNew
        ? journalVoucherTypesApi.create(payload)
        : journalVoucherTypesApi.update(existing!.id, payload).then(() => ({ id: existing!.id }));
    },
    onSuccess: () => {
      toast.success(isNew ? t('voucherTypes.toast.created') : t('voucherTypes.toast.updated'));
      onSaved();
    },
    onError: (e: any) => toast.error(extractApiError(e, t('voucherTypes.toast.saveFailed'))),
  });

  const canSave = !saveM.isPending && !codeError && !sameAccountError && nameAr.trim().length > 0;

  const debitAccount = accounts.find(a => a.id === debitAccountId);
  const creditAccount = accounts.find(a => a.id === creditAccountId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl" dir="rtl">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {isNew ? <Plus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />}
            {isNew ? t('voucherTypes.dialog.titleAdd') : t('voucherTypes.dialog.titleEdit', { name: existing?.nameAr })}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t('voucherTypes.dialog.code')}
              </label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 20))}
                disabled={!isNew || isSystemRow}
                placeholder="RV"
                className={cn('h-9 text-sm', codeError && 'border-destructive')}
              />
              {codeError && <p className="mt-0.5 text-[10px] text-destructive">{codeError}</p>}
              {!isNew && <p className="mt-0.5 text-[10px] text-muted-foreground">{t('voucherTypes.dialog.codeReadOnly')}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t('voucherTypes.dialog.nameAr')}
              </label>
              <Input
                value={nameAr}
                onChange={e => setNameAr(e.target.value.slice(0, 150))}
                placeholder={t('voucherTypes.dialog.nameArPlaceholder')}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t('voucherTypes.dialog.nameEn')}
              </label>
              <Input
                value={nameEn ?? ''}
                onChange={e => setNameEn(e.target.value.slice(0, 150))}
                placeholder="Receipt Voucher"
                className="h-9 text-sm"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t('voucherTypes.dialog.displayOrder')}
              </label>
              <Input
                type="number"
                value={displayOrder}
                onChange={e => setDisplayOrder(Math.max(0, Math.min(9999, Number(e.target.value) || 0)))}
                className="h-9 text-sm num-display"
              />
            </div>
          </div>

          <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t('voucherTypes.dialog.description')}
              </label>
              <Input
                value={description ?? ''}
                onChange={e => setDescription(e.target.value.slice(0, 500))}
                placeholder={t('voucherTypes.dialog.descriptionPlaceholder')}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold text-primary">{t('voucherTypes.dialog.defaultAccounts')}</div>
            <p className="text-[10px] text-muted-foreground">
              {t('voucherTypes.dialog.defaultAccountsHint')}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] text-emerald-300">
                  <ArrowDownLeft className="h-3 w-3" />
                  {t('voucherTypes.dialog.defaultDebitAccount')}
                </label>
                <AccountPicker
                  accounts={accounts}
                  value={debitAccountId}
                  initialLabel={
                    debitAccount ? `${debitAccount.code} - ${debitAccount.nameAr}` : undefined
                  }
                  onChange={id => setDebitAccountId(id)}
                  allowClear
                  placeholder={t('voucherTypes.dialog.accountPlaceholder')}
                  inputHeight={9}
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] text-amber-300">
                  <ArrowUpRight className="h-3 w-3" />
                  {t('voucherTypes.dialog.defaultCreditAccount')}
                </label>
                <AccountPicker
                  accounts={accounts}
                  value={creditAccountId}
                  initialLabel={
                    creditAccount ? `${creditAccount.code} - ${creditAccount.nameAr}` : undefined
                  }
                  onChange={id => setCreditAccountId(id)}
                  allowClear
                  placeholder={t('voucherTypes.dialog.accountPlaceholder')}
                  inputHeight={9}
                />
              </div>
            </div>

            {sameAccountError && (
              <p className="text-[10px] text-destructive">{sameAccountError}</p>
            )}
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold text-primary">{t('voucherTypes.dialog.natureSection')}</div>
            <p className="text-[10px] text-muted-foreground">
              {t('voucherTypes.dialog.natureSectionHint')}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">{t('voucherTypes.dialog.nature')}</label>
                <select
                  value={nature}
                  onChange={e => setNature(e.target.value as VoucherNature)}
                  className="h-9 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm"
                >
                  <option value="Mixed">{t('voucherTypes.nature.mixed')}</option>
                  <option value="Debit">{t('voucherTypes.nature.debit')}</option>
                  <option value="Credit">{t('voucherTypes.nature.credit')}</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex w-full items-center gap-2 rounded-md border border-input bg-secondary/30 p-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showInSidebar}
                    onChange={e => setShowInSidebar(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="flex-1">
                    {t('voucherTypes.dialog.showInSidebar')}
                    {nature === 'Mixed' && (
                      <span className="block text-[10px] text-muted-foreground">
                        {t('voucherTypes.dialog.showInSidebarMixedNote')}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-md border border-input bg-secondary/30 p-2 text-xs">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={e => setIsEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>{t('voucherTypes.dialog.isEnabled')}</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            size="sm"
            onClick={() => saveM.mutate()}
            disabled={!canSave}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saveM.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
