import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Wallet, Plus, Pencil, Trash2, ChevronUp, ChevronDown, CheckCircle2, Circle,
  X, Save, Search, Banknote, ArrowLeftRight, Scale,
  Lock, Clock, ShieldCheck, RotateCcw, Ban, Printer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { CashBoxTransferDialog } from '@/components/accounting/CashBoxTransferDialog';
import { cn, extractApiError, formatAmount } from '@/lib/utils';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { currenciesApi, type CurrencyDto } from '@/lib/api/currencies';
import { printCashBoxBalances, printCashBoxTransfer } from '@/lib/printUtils';
import {
  cashBoxesApi,
  type CashBoxDto,
  type CashBoxBalanceDto,
  type CashBoxTransferDto,
  type UpsertCashBoxPayload,
  type UpsertCashBoxCurrencyPayload,
} from '@/lib/api/cashBoxes';
import type { AccountDto } from '@/types/api';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale, localizedName, localizedAccountName } from '@/lib/i18n';

type CashBoxTab = 'boxes' | 'balances' | 'transfers';

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

export function CashBoxesPage() {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermissions();

  // ‎صلاحيات تبويبات الصفحة الثلاث — مفصولة لأن المستخدم قد يطّلع على الأرصدة
  // ‎فقط، أو يستلم مناقلات دون أن يُعدِّل الصناديق نفسها.
  const canReadBoxes      = can(PERMS.Accounting.CashBoxes.Read);
  const canCreateBox      = can(PERMS.Accounting.CashBoxes.Create);
  const canUpdateBox      = can(PERMS.Accounting.CashBoxes.Update);
  const canDeleteBox      = can(PERMS.Accounting.CashBoxes.Delete);
  const canReadBalances   = can(PERMS.Accounting.CashBoxBalances.Read);
  const canPrintBalances  = can(PERMS.Accounting.CashBoxBalances.Print);
  const canReadTransfers  = can(PERMS.Accounting.CashBoxTransfers.Read);
  const canCreateTransfer = can(PERMS.Accounting.CashBoxTransfers.Create);
  const canUpdateTransfer = can(PERMS.Accounting.CashBoxTransfers.Update);
  const canDeleteTransfer = can(PERMS.Accounting.CashBoxTransfers.Delete);
  const canReceiveTransfer= can(PERMS.Accounting.CashBoxTransfers.Receive);
  const canCancelTransfer = can(PERMS.Accounting.CashBoxTransfers.Cancel);
  const canPrintTransfers = can(PERMS.Accounting.CashBoxTransfers.Print);

  // ‎التبويب الابتدائي من ?tab=transfers (يُستخدم عند العودة من نافذة عرض القيد)؛
  // ‎مع احترام الصلاحيات: لا نبدأ بتبويب غير مسموح.
  const initialTab: CashBoxTab = (() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam === 'balances' && canReadBalances) return 'balances';
    if (tabParam === 'transfers' && canReadTransfers) return 'transfers';
    if (canReadBoxes) return 'boxes';
    if (canReadBalances) return 'balances';
    if (canReadTransfers) return 'transfers';
    return 'boxes';
  })();
  const [tab, setTab] = useState<CashBoxTab>(initialTab);
  const [search, setSearch] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'active'>('all');
  const [editing, setEditing] = useState<CashBoxDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDefaults, setTransferDefaults] = useState<{
    fromBoxId?: number | null;
    toBoxId?: number | null;
    currency?: string | null;
  } | null>(null);
  /** المناقلة قيد التعديل من نفس النافذة الكبرى (PendingReceive فقط). */
  const [editingTransfer, setEditingTransfer] = useState<CashBoxTransferDto | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    mode: CompactDialogMode;
    transfer: CashBoxTransferDto;
  } | null>(null);
  /** مناقلة ملغاة بانتظار تأكيد الحذف النهائي (يحذف القيود معها). */
  const [deletingTransfer, setDeletingTransfer] = useState<CashBoxTransferDto | null>(null);

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['cash-boxes', 'all'],
    queryFn: () => cashBoxesApi.getAll(false),
    enabled: canReadBoxes || canReadBalances || canReadTransfers,
  });

  const balancesQuery = useQuery({
    queryKey: ['cash-box-balances'],
    queryFn: () => cashBoxesApi.getBalances(),
    enabled: canReadBalances,
  });

  const transfersQuery = useQuery({
    queryKey: ['cash-box-transfers'],
    queryFn: () => cashBoxesApi.getTransfers({ take: 200 }),
    enabled: canReadTransfers,
  });

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });
  const leafAccounts = useMemo(
    () => (treeQuery.data ? flattenLeafAccounts(treeQuery.data) : []),
    [treeQuery.data]
  );

  const accountById = useMemo(() => {
    const m = new Map<number, AccountDto>();
    const walk = (nodes: AccountDto[]) => {
      for (const n of nodes) {
        m.set(n.id, n);
        if (n.children?.length) walk(n.children);
      }
    };
    if (treeQuery.data) walk(treeQuery.data);
    return m;
  }, [treeQuery.data]);

  const boxById = useMemo(() => new Map(boxes.map(b => [b.id, b])), [boxes]);

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 60_000,
  });
  const enabledCurrencies = currenciesQuery.data ?? [];

  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });
  const company = companyQuery.data ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boxes.filter(b => {
      if (showOnly === 'active' && !b.isActive) return false;
      if (!q) return true;
      return (
        b.code.toLowerCase().includes(q) ||
        b.nameAr.toLowerCase().includes(q) ||
        (b.nameEn ?? '').toLowerCase().includes(q) ||
        (b.accountCode ?? '').toLowerCase().includes(q) ||
        (b.accountName ?? '').toLowerCase().includes(q)
      );
    });
  }, [boxes, search, showOnly]);

  const toggleM = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      cashBoxesApi.toggle(id, isActive),
    onSuccess: (_d, vars) => {
      toast.success(vars.isActive ? t('cashBoxes.toast.activated') : t('cashBoxes.toast.deactivated'));
      qc.invalidateQueries({ queryKey: ['cash-boxes'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.toast.toggleFailed'))),
  });

  const moveM = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      cashBoxesApi.move(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-boxes'] }),
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.toast.moveFailed'))),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => cashBoxesApi.delete(id),
    onSuccess: () => {
      toast.success(t('cashBoxes.toast.deleted'));
      qc.invalidateQueries({ queryKey: ['cash-boxes'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.toast.deleteFailed'))),
  });

  const activeCount = boxes.filter(b => b.isActive).length;
  const balances = balancesQuery.data ?? [];
  const transfers = transfersQuery.data ?? [];

  const openTransferFor = (defaults?: typeof transferDefaults) => {
    setTransferDefaults(defaults ?? null);
    setTransferOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCreateTransfer && (
          <Button
            onClick={() => openTransferFor()}
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={activeCount < 2}
            title={activeCount < 2 ? t('cashBoxes.newTransferNeedTwo') : undefined}
          >
            <ArrowLeftRight className="h-4 w-4" />
            {t('cashBoxes.newTransfer')}
          </Button>
        )}
        {canCreateBox && (
          <Button onClick={() => setCreatingNew(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('cashBoxes.newBox')}
          </Button>
        )}
      </div>

      {/* تبويبات: الصناديق / الأرصدة / المناقلات — تُخفى التبويبات الممنوعة */}
      <div className="flex flex-wrap gap-1 rounded-md border border-input bg-secondary/30 p-1 text-xs">
        {canReadBoxes && (
          <TabButton active={tab === 'boxes'} onClick={() => setTab('boxes')} icon={Wallet}>
            {t('cashBoxes.tabs.boxes')} ({boxes.length})
          </TabButton>
        )}
        {canReadBalances && (
          <TabButton active={tab === 'balances'} onClick={() => setTab('balances')} icon={Scale}>
            {t('cashBoxes.tabs.balances')} ({balances.length})
          </TabButton>
        )}
        {canReadTransfers && (
          <TabButton active={tab === 'transfers'} onClick={() => setTab('transfers')} icon={ArrowLeftRight}>
            {t('cashBoxes.tabs.transfers')} ({transfers.length})
          </TabButton>
        )}
      </div>

      {tab === 'balances' && canReadBalances && (
        <BalancesTab
          balances={balances}
          boxById={boxById}
          accountById={accountById}
          isLoading={balancesQuery.isLoading}
          onTransfer={(boxId, currency) =>
            openTransferFor({ fromBoxId: boxId, currency })
          }
          onPrint={() => {
            const enrichedBalances = balances.map(b => {
              const box = boxById.get(b.cashBoxId);
              const acc = accountById.get(b.accountId);
              return {
                ...b,
                nameEn: box?.nameEn ?? null,
                accountNameEn: acc?.nameEn ?? null,
              };
            });
            printCashBoxBalances(enrichedBalances, company);
          }}
          canPrint={canPrintBalances}
          canCreateTransfer={canCreateTransfer}
        />
      )}

      {tab === 'transfers' && canReadTransfers && (
        <TransfersTab
          transfers={transfers}
          boxById={boxById}
          accountById={accountById}
          isLoading={transfersQuery.isLoading}
          canPrint={canPrintTransfers}
          canUpdate={canUpdateTransfer}
          canDelete={canDeleteTransfer}
          canReceive={canReceiveTransfer}
          canCancel={canCancelTransfer}
          onOpenEntry={entryId =>
            navigate(`/accounting/journal/${entryId}/view`, {
              state: {
                returnTo: '/accounting/cash-boxes?tab=transfers',
                returnLabel: t('cashBoxes.returnLabel'),
              },
            })
          }
          onPrint={transfer => {
            const fromBox = boxById.get(transfer.fromCashBoxId);
            const toBox = boxById.get(transfer.toCashBoxId);
            const transitAcc = accountById.get(transfer.transitAccountId);
            printCashBoxTransfer(transfer, company, undefined, {
              fromCashBoxNameEn: fromBox?.nameEn ?? null,
              toCashBoxNameEn: toBox?.nameEn ?? null,
              transitAccountNameEn: transitAcc?.nameEn ?? null,
            });
          }}
          onAction={(mode, transfer) => {
            // ‎تعديل/إلغاء PendingReceive: من النافذة الكبرى لتركيز التحكم
            // ‎بقيد المناقلة في مكان واحد. باقي الإجراءات (استلام/تراجع) تستخدم
            // ‎الحوار المضغوط لأنها أبسط (تاريخ + ملاحظة).
            if (mode === 'edit' || mode === 'cancel') {
              setEditingTransfer(transfer);
              return;
            }
            if (mode === 'delete') {
              setDeletingTransfer(transfer);
              return;
            }
            setActionDialog({ mode: mode as CompactDialogMode, transfer });
          }}
        />
      )}

      {actionDialog && (
        <TransferActionDialog
          mode={actionDialog.mode}
          transfer={actionDialog.transfer}
          onClose={() => setActionDialog(null)}
          onDone={() => {
            setActionDialog(null);
            qc.invalidateQueries({ queryKey: ['cash-box-balances'] });
            qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
          }}
        />
      )}

      {deletingTransfer && (
        <TransferDeleteDialog
          transfer={deletingTransfer}
          onClose={() => setDeletingTransfer(null)}
          onDone={() => {
            setDeletingTransfer(null);
            qc.invalidateQueries({ queryKey: ['cash-box-balances'] });
            qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
          }}
        />
      )}

      {tab === 'boxes' && canReadBoxes && (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-2' : 'left-2')} />
              <Input
                placeholder={t('cashBoxes.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={cn('h-8 text-xs', isRtl ? 'pr-7' : 'pl-7')}
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
                {t('cashBoxes.filterAll')} ({boxes.length})
              </button>
              <button
                type="button"
                onClick={() => setShowOnly('active')}
                className={cn(
                  'rounded px-2 py-1 transition-colors',
                  showOnly === 'active' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                )}
              >
                {t('cashBoxes.filterActive')} ({activeCount})
              </button>
            </div>
            <CardTitle className="ms-auto text-xs text-muted-foreground">
              {t('cashBoxes.showing', { shown: filtered.length, total: boxes.length })}
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
              {t('cashBoxes.noMatch')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 p-2 text-center">#</th>
                    <th className="w-28 p-2 text-right">{t('cashBoxes.table.code')}</th>
                    <th className="p-2 text-right">{t('cashBoxes.table.name')}</th>
                    <th className="p-2 text-right">{t('cashBoxes.table.linkedAccount')}</th>
                    <th className="p-2 text-center">{t('cashBoxes.table.currencies')}</th>
                    <th className="w-24 p-2 text-center">{t('cashBoxes.table.status')}</th>
                    <th className="w-32 p-2 text-center">{t('cashBoxes.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, idx) => (
                    <tr
                      key={b.id}
                      className={cn(
                        'border-t border-border/40 transition-colors hover:bg-secondary/20',
                        !b.isActive && 'opacity-60'
                      )}
                    >
                      <td className="p-2 text-center text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="p-2 text-right">
                        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                          {b.code}
                        </code>
                      </td>
                      <td className="p-2 text-right">
                        <span className="text-sm font-medium">{localizedName(locale, b.nameAr, b.nameEn)}</span>
                        {b.description && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{b.description}</p>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {b.accountId ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="num-display text-primary">{b.accountCode}</span>
                            <span className="text-muted-foreground">
                              -{' '}
                              {localizedAccountName(
                                locale,
                                accountById.get(b.accountId)?.nameAr ?? b.accountName ?? '',
                                accountById.get(b.accountId)?.nameEn
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {b.currencies.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground/50">—</span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-300"
                            title={
                              b.currencies.length > 0
                                ? t('cashBoxes.currenciesLinked', {
                                    list: b.currencies.map(c => c.currency).join(' · '),
                                  })
                                : ''
                            }
                          >
                            <Banknote className="h-3 w-3" />
                            <span className="num-display font-bold">{b.currencies.length}</span>
                            <span className="opacity-80">{t('cashBoxes.currencyCount')}</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            canUpdateBox && toggleM.mutate({ id: b.id, isActive: !b.isActive })
                          }
                          disabled={toggleM.isPending || !canUpdateBox}
                          title={!canUpdateBox ? t('cashBoxes.noEditPerm') : undefined}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                            b.isActive
                              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border border-muted-foreground/20 bg-muted-foreground/5 text-muted-foreground hover:bg-muted-foreground/10',
                            !canUpdateBox && 'cursor-not-allowed opacity-60 hover:bg-transparent'
                          )}
                        >
                          {b.isActive ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {b.isActive ? t('cashBoxes.statusActive') : t('cashBoxes.statusInactive')}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          {canUpdateBox && (
                            <>
                              <button
                                type="button"
                                onClick={() => moveM.mutate({ id: b.id, direction: 'up' })}
                                disabled={moveM.isPending || idx === 0}
                                title={t('cashBoxes.moveUp')}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveM.mutate({ id: b.id, direction: 'down' })}
                                disabled={moveM.isPending || idx === filtered.length - 1}
                                title={t('cashBoxes.moveDown')}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditing(b)}
                                title={t('cashBoxes.edit')}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {/* ‎زر الحذف يُخفى إذا كان للصندوق حركات (الحساب المرتبط له سطور قيود).
                               ‎الحماية مكرَّرة على الخادم — هذا فقط لتحسين تجربة المستخدم. */}
                          {canDeleteBox && !b.hasMovements && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    t('cashBoxes.deleteConfirm', {
                                      name: localizedName(locale, b.nameAr, b.nameEn),
                                    })
                                  )
                                ) {
                                  deleteM.mutate(b.id);
                                }
                              }}
                              title={t('cashBoxes.delete')}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
      )}

      {transferOpen && (
        <CashBoxTransferDialog
          boxes={boxes}
          balances={balances}
          initialFromBoxId={transferDefaults?.fromBoxId ?? null}
          initialToBoxId={transferDefaults?.toBoxId ?? null}
          initialCurrency={transferDefaults?.currency ?? null}
          onClose={() => {
            setTransferOpen(false);
            setTransferDefaults(null);
          }}
          onSaved={() => {
            setTransferOpen(false);
            setTransferDefaults(null);
            qc.invalidateQueries({ queryKey: ['cash-box-balances'] });
            qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
            // ‎الانتقال إلى تبويب المناقلات لإظهار العنصر الجديد
            setTab('transfers');
          }}
        />
      )}

      {editingTransfer && (
        <CashBoxTransferDialog
          boxes={boxes}
          balances={balances}
          editTransfer={editingTransfer}
          onClose={() => setEditingTransfer(null)}
          onSaved={() => {
            setEditingTransfer(null);
            qc.invalidateQueries({ queryKey: ['cash-box-balances'] });
            qc.invalidateQueries({ queryKey: ['cash-box-transfers'] });
            qc.invalidateQueries({ queryKey: ['journal-entries'] });
          }}
        />
      )}

      {(creatingNew || editing) && (
        <CashBoxDialog
          existing={editing}
          existingCodes={boxes.map(b => b.code)}
          accounts={leafAccounts}
          enabledCurrencies={enabledCurrencies}
          onClose={() => {
            setEditing(null);
            setCreatingNew(false);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cash-boxes'] });
            setEditing(null);
            setCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dialog: تعديل/إضافة صندوق
// ─────────────────────────────────────────────────────────────────────

interface CurrencyRow {
  uid: string;
  currency: string;
  debitLimit: string;
  creditLimit: string;
  isActive: boolean;
}

function CashBoxDialog({
  existing,
  existingCodes,
  accounts,
  enabledCurrencies,
  onClose,
  onSaved,
}: {
  existing: CashBoxDto | null;
  existingCodes: string[];
  accounts: AccountDto[];
  enabledCurrencies: CurrencyDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { locale, direction } = useLocale();
  const isNew = existing == null;
  const [code, setCode] = useState(existing?.code ?? '');
  const [nameAr, setNameAr] = useState(existing?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(existing?.nameEn ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [accountId, setAccountId] = useState<number | null>(existing?.accountId ?? null);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = useState(existing?.displayOrder ?? 100);
  const [rows, setRows] = useState<CurrencyRow[]>(
    () =>
      existing?.currencies.map(c => ({
        uid: Math.random().toString(36).slice(2, 9),
        currency: c.currency,
        debitLimit: c.debitLimit != null ? String(c.debitLimit) : '',
        creditLimit: c.creditLimit != null ? String(c.creditLimit) : '',
        isActive: c.isActive,
      })) ?? []
  );

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const codeError = (() => {
    if (!isNew) return null;
    const c = code.trim().toUpperCase();
    if (!c) return t('cashBoxes.dialog.codeRequired');
    if (c.length > 30) return t('cashBoxes.dialog.codeTooLong');
    if (existingCodes.map(x => x.toUpperCase()).includes(c)) return t('cashBoxes.dialog.codeUsed');
    return null;
  })();

  const dupCurrencies = (() => {
    const codes = rows.map(r => r.currency.trim().toUpperCase()).filter(Boolean);
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const c of codes) {
      if (seen.has(c)) dups.push(c);
      else seen.add(c);
    }
    return Array.from(new Set(dups));
  })();

  const addRow = () => {
    setRows(prev => [
      ...prev,
      {
        uid: Math.random().toString(36).slice(2, 9),
        currency: '',
        debitLimit: '',
        creditLimit: '',
        isActive: true,
      },
    ]);
  };

  const updateRow = (uid: string, patch: Partial<CurrencyRow>) =>
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeRow = (uid: string) => setRows(prev => prev.filter(r => r.uid !== uid));

  const saveM = useMutation({
    mutationFn: () => {
      const currencies: UpsertCashBoxCurrencyPayload[] = rows
        .map(r => ({
          currency: r.currency.trim().toUpperCase(),
          debitLimit: r.debitLimit.trim() === '' ? null : Number(r.debitLimit) || 0,
          creditLimit: r.creditLimit.trim() === '' ? null : Number(r.creditLimit) || 0,
          isActive: r.isActive,
        }))
        .filter(c => c.currency.length > 0);

      const payload: UpsertCashBoxPayload = {
        code: code.trim().toUpperCase(),
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
        description: description.trim() || null,
        accountId: accountId!,
        isActive,
        displayOrder,
        currencies,
      };
      return isNew
        ? cashBoxesApi.create(payload)
        : cashBoxesApi.update(existing!.id, payload).then(() => ({ id: existing!.id }));
    },
    onSuccess: () => {
      toast.success(isNew ? t('cashBoxes.toast.created') : t('cashBoxes.toast.updated'));
      onSaved();
    },
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.toast.saveFailed'))),
  });

  const canSave =
    !saveM.isPending &&
    !codeError &&
    nameAr.trim().length > 0 &&
    accountId != null &&
    dupCurrencies.length === 0;

  const account = accounts.find(a => a.id === accountId);

  // العملات المُتاحة في كل صف (تُخفي العملات المختارة في صفوف أخرى)
  const usedCurrencies = (excludeUid: string) =>
    rows
      .filter(r => r.uid !== excludeUid)
      .map(r => r.currency.trim().toUpperCase())
      .filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl" dir={direction}>
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {isNew ? <Plus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />}
            {isNew
              ? t('cashBoxes.dialog.addTitle')
              : t('cashBoxes.dialog.editTitle', {
                  name: localizedName(locale, existing?.nameAr, existing?.nameEn),
                })}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[80vh] space-y-3 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.dialog.code')} *</label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 30))}
                disabled={!isNew}
                placeholder="CB-MAIN"
                className={cn('h-9 text-sm', codeError && 'border-destructive')}
              />
              {codeError && <p className="mt-0.5 text-[10px] text-destructive">{codeError}</p>}
              {!isNew && <p className="mt-0.5 text-[10px] text-muted-foreground">{t('cashBoxes.dialog.codeLocked')}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.dialog.nameAr')} *</label>
              <Input
                value={nameAr}
                onChange={e => setNameAr(e.target.value.slice(0, 150))}
                placeholder={t('cashBoxes.dialog.nameArPlaceholder')}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.dialog.nameEn')}</label>
              <Input
                value={nameEn ?? ''}
                onChange={e => setNameEn(e.target.value.slice(0, 150))}
                placeholder={t('cashBoxes.dialog.nameEnPlaceholder')}
                className="h-9 text-sm"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.dialog.displayOrder')}</label>
              <Input
                type="number"
                value={displayOrder}
                onChange={e => setDisplayOrder(Math.max(0, Math.min(9999, Number(e.target.value) || 0)))}
                className="h-9 text-sm num-display"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">{t('cashBoxes.dialog.description')}</label>
            <Input
              value={description ?? ''}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder={t('cashBoxes.dialog.descriptionPlaceholder')}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold text-primary">{t('cashBoxes.dialog.accountSection')} *</div>
            <p className="text-[10px] text-muted-foreground">
              {t('cashBoxes.dialog.accountHint')}
            </p>
            <AccountPicker
              accounts={accounts}
              value={accountId}
              initialLabel={account ? `${account.code} - ${localizedAccountName(locale, account.nameAr, account.nameEn)}` : undefined}
              onChange={id => setAccountId(id)}
              allowClear
              placeholder={t('cashBoxes.dialog.accountPlaceholder')}
              inputHeight={9}
            />
          </div>

          <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-primary">{t('cashBoxes.dialog.currenciesSection')}</div>
                <p className="text-[10px] text-muted-foreground">
                  {t('cashBoxes.dialog.currenciesHint')}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addRow} className="h-7 gap-1 text-xs">
                <Plus className="h-3 w-3" />
                {t('cashBoxes.dialog.addCurrency')}
              </Button>
            </div>

            {dupCurrencies.length > 0 && (
              <p className="text-[10px] text-destructive">
                {t('cashBoxes.dialog.dupCurrencies', { list: dupCurrencies.join(', ') })}
              </p>
            )}

            {rows.length === 0 ? (
              <p className="rounded border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
                {t('cashBoxes.dialog.noCurrencies')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-1 text-right">{t('cashBoxes.dialog.currencyCol')}</th>
                      <th className="p-1 text-left">{t('cashBoxes.dialog.debitLimit')}</th>
                      <th className="p-1 text-left">{t('cashBoxes.dialog.creditLimit')}</th>
                      <th className="w-16 p-1 text-center">{t('cashBoxes.dialog.activeCol')}</th>
                      <th className="w-10 p-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const used = usedCurrencies(r.uid);
                      return (
                        <tr key={r.uid} className="border-t border-border/40">
                          <td className="p-1">
                            <select
                              value={r.currency}
                              onChange={e => updateRow(r.uid, { currency: e.target.value })}
                              className="h-8 w-full rounded border border-input bg-secondary/40 px-2 text-xs"
                            >
                              <option value="">{t('cashBoxes.dialog.selectCurrency')}</option>
                              {enabledCurrencies
                                .filter(c => !used.includes(c.code) || c.code === r.currency)
                                .map(c => (
                                  <option key={c.code} value={c.code}>
                                    {c.code} — {c.nameAr || c.code}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={r.debitLimit}
                              onChange={e => updateRow(r.uid, { debitLimit: e.target.value })}
                              placeholder={t('cashBoxes.dialog.noLimit')}
                              className="h-8 num-display text-left text-xs"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={r.creditLimit}
                              onChange={e => updateRow(r.uid, { creditLimit: e.target.value })}
                              placeholder={t('cashBoxes.dialog.noLimit')}
                              className="h-8 num-display text-left text-xs"
                            />
                          </td>
                          <td className="p-1 text-center">
                            <input
                              type="checkbox"
                              checked={r.isActive}
                              onChange={e => updateRow(r.uid, { isActive: e.target.checked })}
                              className="h-4 w-4 accent-primary"
                            />
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => removeRow(r.uid)}
                              title={t('cashBoxes.delete')}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 rounded-md border border-input bg-secondary/30 p-2 text-xs">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>{t('cashBoxes.dialog.boxActive')}</span>
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
            {saveM.isPending ? t('cashBoxes.dialog.saving') : t('cashBoxes.dialog.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// مكوّنات مساعدة: التبويبات + جدول الأرصدة + جدول المناقلات
// ─────────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{children}</span>
    </button>
  );
}

function BalancesTab({
  balances,
  boxById,
  accountById,
  isLoading,
  onTransfer,
  onPrint,
  canPrint,
  canCreateTransfer,
}: {
  balances: CashBoxBalanceDto[];
  boxById: Map<number, CashBoxDto>;
  accountById: Map<number, AccountDto>;
  isLoading: boolean;
  onTransfer: (cashBoxId: number, currency: string) => void;
  onPrint: () => void;
  canPrint: boolean;
  canCreateTransfer: boolean;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  // ‎تجميع الأرصدة حسب الصندوق لإظهار صندوق واحد بصفّ + عدّة عملات بداخله
  const grouped = useMemo(() => {
    const map = new Map<number, { box: CashBoxBalanceDto; rows: CashBoxBalanceDto[] }>();
    for (const r of balances) {
      const existing = map.get(r.cashBoxId);
      if (existing) existing.rows.push(r);
      else map.set(r.cashBoxId, { box: r, rows: [r] });
    }
    return Array.from(map.values());
  }, [balances]);

  // ‎الإجماليات حسب العملة عبر كل الصناديق — رصيد + مدين + دائن + عدد الصناديق
  const totalsByCurrency = useMemo(() => {
    const map = new Map<
      string,
      { currency: string; balance: number; debit: number; credit: number; boxCount: number }
    >();
    for (const r of balances) {
      const cur = (r.currency || 'IQD').toUpperCase();
      const t = map.get(cur);
      if (t) {
        t.balance += r.balance;
        t.debit += r.debit;
        t.credit += r.credit;
        t.boxCount += 1;
      } else {
        map.set(cur, {
          currency: cur,
          balance: r.balance,
          debit: r.debit,
          credit: r.credit,
          boxCount: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency));
  }, [balances]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{t('cashBoxes.balances.title')}</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {t('cashBoxes.balances.hint')}
            </p>
          </div>
          {canPrint && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPrint}
              disabled={balances.length === 0 || isLoading}
              className="gap-1.5"
              title={t('cashBoxes.balances.printTooltip')}
            >
              <Printer className="h-3.5 w-3.5" />
              {t('cashBoxes.balances.print')}
            </Button>
          )}
        </div>
      </CardHeader>

      {totalsByCurrency.length > 0 && !isLoading && (
        <div className="border-y border-border/40 bg-secondary/20 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Scale className="h-3.5 w-3.5" />
            <span>{t('cashBoxes.balances.totalByCurrency')}</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {t('cashBoxes.balances.totalHint')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {totalsByCurrency.map(cur => (
              <div
                key={cur.currency}
                className={cn(
                  'group flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors',
                  cur.balance > 0
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : cur.balance < 0
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-border bg-card'
                )}
              >
                <span className="num-display rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {cur.currency}
                </span>
                <div className="flex flex-col leading-tight">
                  <span
                    className={cn(
                      'num-display text-sm font-bold',
                      cur.balance > 0
                        ? 'text-emerald-500'
                        : cur.balance < 0
                        ? 'text-rose-500'
                        : 'text-muted-foreground'
                    )}
                  >
                    {formatAmount(cur.balance)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {t('cashBoxes.balances.boxCount', { count: cur.boxCount })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : grouped.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('cashBoxes.balances.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">{t('cashBoxes.balances.box')}</th>
                  <th className="p-2 text-right">{t('cashBoxes.balances.account')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.balances.currency')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.balances.balance')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.balances.limits')}</th>
                  <th className="w-24 p-2 text-center">{t('cashBoxes.balances.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ box, rows }, gi) =>
                  rows.map((r, i) => {
                    const exceedsDebit = r.debitLimit != null && r.balance > r.debitLimit;
                    const exceedsCredit = r.creditLimit != null && r.balance < -r.creditLimit;
                    const warn = exceedsDebit || exceedsCredit;
                    // ‎فاصل ذهبي بارز بين الصناديق (مطابق لفاصل صفّ المجموع في tfoot)،
                    // ‎وفاصل خفيف بين عملات الصندوق نفسه.
                    const isBoxStart = i === 0;
                    const boxDivider =
                      isBoxStart && gi > 0
                        ? 'border-t-2 border-primary/40'
                        : 'border-t border-border/40';
                    return (
                      <tr
                        key={`${r.cashBoxId}-${r.currency}`}
                        className={cn(boxDivider, 'hover:bg-secondary/20')}
                      >
                        {i === 0 ? (
                          <td className="p-2 text-right" rowSpan={rows.length}>
                            <div className="font-medium">
                              {localizedName(
                                locale,
                                box.nameAr,
                                boxById.get(box.cashBoxId)?.nameEn
                              )}
                            </div>
                            <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              {box.code}
                            </code>
                          </td>
                        ) : null}
                        {i === 0 ? (
                          <td className="p-2 text-right text-xs" rowSpan={rows.length}>
                            <span className="num-display text-primary">{box.accountCode}</span>
                            <span className="ms-1 text-muted-foreground">
                              -{' '}
                              {localizedAccountName(
                                locale,
                                accountById.get(box.accountId)?.nameAr ?? box.accountName ?? '',
                                accountById.get(box.accountId)?.nameEn
                              )}
                            </span>
                          </td>
                        ) : null}
                        <td className="p-2 text-center num-display text-xs font-bold">
                          {r.currency}
                        </td>
                        <td
                          className={cn(
                            'p-2 text-center num-display text-sm font-bold',
                            warn
                              ? 'text-destructive'
                              : r.balance > 0
                              ? 'text-emerald-500'
                              : r.balance < 0
                              ? 'text-rose-500'
                              : 'text-muted-foreground'
                          )}
                        >
                          {formatAmount(r.balance)}
                        </td>
                        <td className="p-2 text-center text-[10px]">
                          {r.debitLimit == null && r.creditLimit == null ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <div className="flex flex-col gap-0.5 num-display">
                              {r.debitLimit != null && (
                                <span
                                  className={
                                    exceedsDebit ? 'text-destructive' : 'text-emerald-300'
                                  }
                                >
                                  {t('cashBoxes.balances.debitLimit', { amount: formatAmount(r.debitLimit) })}
                                </span>
                              )}
                              {r.creditLimit != null && (
                                <span
                                  className={
                                    exceedsCredit ? 'text-destructive' : 'text-amber-300'
                                  }
                                >
                                  {t('cashBoxes.balances.creditLimit', { amount: formatAmount(r.creditLimit) })}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {canCreateTransfer ? (
                            <button
                              type="button"
                              onClick={() => onTransfer(r.cashBoxId, r.currency)}
                              title={t('cashBoxes.balances.transferFrom')}
                              className="inline-flex h-6 items-center gap-1 rounded bg-primary/10 px-2 text-[10px] text-primary hover:bg-primary/20"
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                              {t('cashBoxes.transfer')}
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {totalsByCurrency.length > 0 && (
                <tfoot className="border-t-2 border-primary/40 bg-secondary/40">
                  {totalsByCurrency.map((cur, idx) => (
                    <tr key={cur.currency} className={idx > 0 ? 'border-t border-border/40' : ''}>
                      <td
                        className="p-2 text-right text-[11px] font-semibold text-primary"
                        colSpan={2}
                      >
                        {idx === 0 ? t('cashBoxes.balances.totalByCurrency') : ''}
                      </td>
                      <td className="p-2 text-center num-display text-xs font-bold text-primary">
                        {cur.currency}
                      </td>
                      <td
                        className={cn(
                          'p-2 text-center num-display text-sm font-bold',
                          cur.balance > 0
                            ? 'text-emerald-500'
                            : cur.balance < 0
                            ? 'text-rose-500'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatAmount(cur.balance)}
                      </td>
                      <td className="p-2 text-center text-[10px] text-muted-foreground" colSpan={2}>
                        {t('cashBoxes.balances.boxCount', { count: cur.boxCount })}
                      </td>
                    </tr>
                  ))}
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Baghdad timezone helpers — Asia/Baghdad ثابت على UTC+03:00 بلا تغيير
// صيفي/شتوي. نستخدم Intl لتفادي اختلاف توقيت متصفِّح المستخدم، ثم نُحوِّل
// إدخال الـ datetime-local إلى ISO صحيحة عند الإرسال للـ API.
// ─────────────────────────────────────────────────────────────────────

function _baghdadParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  // ‎بعض المتصفِّحات تُعيد `24` للساعة بدلاً من `00` في منتصف الليل.
  if (o.hour === '24') o.hour = '00';
  return o;
}

/** الآن بتوقيت بغداد بصيغة `YYYY-MM-DDTHH:mm` للحقل datetime-local. */
function nowBaghdadInput(): string {
  const o = _baghdadParts(new Date());
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

/** يقرأ قيمة datetime-local على أنها توقيت بغداد ويرجِّعها كـ ISO UTC. */
function baghdadInputToIso(local: string): string {
  // ‎`local` بصيغة YYYY-MM-DDTHH:mm — نلصقها بـ +03:00 لأن بغداد لا تُطبِّق DST.
  const v = local.length === 16 ? local + ':00' : local;
  return new Date(v + '+03:00').toISOString();
}

/**
 * يستخرج مكوّنات الوقت بتوقيت بغداد من نصّ ISO قادم من الـ API.
 *
 * ‎الباك-إند يُخزِّن SendDate/ReceiveDate كـ DateTime بـ Kind=Unspecified
 * ‎(داتاتايم2 على SQL Server)، فيتسلسل كـ JSON بصيغة "2026-05-22T21:41:00"
 * ‎بدون لاحقة Z أو إزاحة. لو مرّرناه إلى `new Date(...)` فالمتصفّح يفسِّره
 * ‎كتوقيت محلي للجهاز — وهذا يُعطي ساعة خاطئة لأي مستخدم خارج توقيت بغداد.
 *
 * ‎الحل: إذا كان النصّ بدون Z/+/-، نُفسِّره مباشرة كأنه توقيت بغداد (لأن
 * ‎الإدخال أصلاً مُسجَّل بتوقيت بغداد عبر `baghdadInputToIso`). إن كان مع
 * ‎علامة منطقة، نمر بـ Date ثم نُسقطه إلى منطقة بغداد عبر Intl.
 */
function _isoToBaghdadParts(iso: string):
  | { year: string; month: string; day: string; hour: string; minute: string }
  | null {
  // ‎نمط ISO بدون منطقة: YYYY-MM-DDTHH:mm[:ss[.fff]]
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(iso);
  if (local) {
    return { year: local[1], month: local[2], day: local[3], hour: local[4], minute: local[5] };
  }
  // ‎فيه علامة منطقة (Z أو ±HH:mm): استخدم Intl لعرض القيمة بتوقيت بغداد.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const o = _baghdadParts(d);
  return { year: o.year, month: o.month, day: o.day, hour: o.hour, minute: o.minute };
}

/** يحوِّل تاريخ من الـ API إلى عرض "DD/MM/YYYY" بتوقيت بغداد. */
function formatBaghdadDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const o = _isoToBaghdadParts(iso);
  if (!o) return '—';
  return `${o.day}/${o.month}/${o.year}`;
}

/** يحوِّل تاريخ من الـ API إلى عرض ساعة "HH:mm" بتوقيت بغداد (24h). */
function formatBaghdadTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const o = _isoToBaghdadParts(iso);
  if (!o) return '';
  return `${o.hour}:${o.minute}`;
}

/** هل تاريخان (من الـ API) يقعان في نفس اليوم بحسب توقيت بغداد؟ */
function sameBaghdadDay(isoA: string | null | undefined, isoB: string | null | undefined): boolean {
  if (!isoA || !isoB) return false;
  const a = _isoToBaghdadParts(isoA), b = _isoToBaghdadParts(isoB);
  if (!a || !b) return false;
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function TransferStatusBadge({ status }: { status: CashBoxTransferDto['status'] }) {
  const { t } = useTranslation();
  if (status === 'PendingReceive') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
        <Clock className="h-3 w-3" />
        {t('cashBoxes.transfers.statusPending')}
      </span>
    );
  }
  if (status === 'Received') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
        <ShieldCheck className="h-3 w-3" />
        {t('cashBoxes.transfers.statusReceived')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500">
      <Ban className="h-3 w-3" />
      {t('cashBoxes.transfers.statusCancelled')}
    </span>
  );
}

type TransferDialogMode = 'receive' | 'cancel' | 'unreceive' | 'edit' | 'delete';

/** أوضاع الحوار المضغوط: لا يحوي 'edit' (يفتح في النافذة الكبرى مباشرةً). */
type CompactDialogMode = Exclude<TransferDialogMode, 'edit' | 'cancel' | 'delete'>;

function TransferActionDialog({
  mode,
  transfer,
  onClose,
  onDone,
}: {
  mode: CompactDialogMode;
  transfer: CashBoxTransferDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const titleMap: Record<CompactDialogMode, string> = {
    receive: t('cashBoxes.actionDialog.receiveTitle'),
    unreceive: t('cashBoxes.actionDialog.unreceiveTitle'),
  };
  const subtitleMap: Record<CompactDialogMode, string> = {
    receive: t('cashBoxes.actionDialog.receiveSubtitle'),
    unreceive: t('cashBoxes.actionDialog.unreceiveSubtitle'),
  };
  const actionLabelMap: Record<CompactDialogMode, string> = {
    receive: t('cashBoxes.actionDialog.confirmReceive'),
    unreceive: t('cashBoxes.actionDialog.confirmUnreceive'),
  };
  const colorClassMap: Record<CompactDialogMode, string> = {
    receive: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    unreceive: 'bg-amber-500 hover:bg-amber-600 text-white',
  };

  // ‎الافتراضي: الآن بتوقيت بغداد (UTC+3 ثابت). للاستلام يمكن تعديل اللحظة
  // ‎الفعلية عند التأكيد، فلا نعتمد على receiveDate المخطَّط مسبقاً.
  const [actionDate, setActionDate] = useState(() => nowBaghdadInput());
  const [reason, setReason] = useState('');
  const [postImmediately, setPostImmediately] = useState(true);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const m = useMutation({
    mutationFn: () => {
      // ‎نُفسِّر إدخال المستخدم كتوقيت بغداد ثم نحوِّله إلى UTC للحفاظ على
      // ‎الدقة بصرف النظر عن منطقة المتصفِّح.
      const isoDate = baghdadInputToIso(actionDate);
      if (mode === 'receive')
        return cashBoxesApi.receiveTransfer(transfer.id, {
          actualReceiveDate: isoDate,
          notes: reason.trim() || null,
          postImmediately,
        });
      return cashBoxesApi.unreceiveTransfer(transfer.id, {
        reversalDate: isoDate,
        reason: reason.trim() || null,
        postImmediately,
      });
    },
    onSuccess: () => {
      toast.success(
        mode === 'receive'
          ? t('cashBoxes.actionDialog.receiveSuccess')
          : t('cashBoxes.actionDialog.unreceiveSuccess')
      );
      onDone();
    },
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.actionDialog.actionFailed'))),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl" dir={direction}>
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="text-sm font-bold">{titleMap[mode]}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-md border border-border bg-secondary/20 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5">
              <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {transfer.transferNumber}
              </code>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-medium">{transfer.fromCashBoxName}</span>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{transfer.toCashBoxName}</span>
              <span className="ms-auto num-display font-bold text-primary">
                {formatAmount(transfer.amount)} {transfer.currency}
              </span>
            </div>
          </div>

          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-600">
            {subtitleMap[mode]}
          </p>

          <div>
            <label className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {mode === 'receive'
                  ? t('cashBoxes.actionDialog.receiveDateLabel')
                  : t('cashBoxes.actionDialog.reversalDateLabel')}
              </span>
              <span className="text-[10px] text-primary/80">{t('cashBoxes.actionDialog.baghdadTz')}</span>
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                type="datetime-local"
                value={actionDate}
                onChange={e => setActionDate(e.target.value)}
                className="h-9 num-display text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 whitespace-nowrap text-[10px]"
                onClick={() => setActionDate(nowBaghdadInput())}
                title={t('cashBoxes.actionDialog.nowTooltip')}
              >
                {t('cashBoxes.actionDialog.now')}
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              {mode === 'receive'
                ? t('cashBoxes.actionDialog.receiveNotes')
                : t('cashBoxes.actionDialog.reasonNotes')}
            </label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              placeholder={
                mode === 'receive'
                  ? t('cashBoxes.actionDialog.receiveNotesPlaceholder')
                  : t('cashBoxes.actionDialog.reasonPlaceholder')
              }
              className="h-9 text-xs"
            />
          </div>

          <label className="flex items-center gap-2 rounded-md border border-input bg-secondary/30 p-2 text-xs">
            <input
              type="checkbox"
              checked={postImmediately}
              onChange={e => setPostImmediately(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>{t('cashBoxes.actionDialog.postImmediately')}</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={m.isPending}>
            {t('cashBoxes.actionDialog.back')}
          </Button>
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className={cn('gap-1.5', colorClassMap[mode])}
          >
            {mode === 'receive' && <ShieldCheck className="h-3.5 w-3.5" />}
            {mode === 'unreceive' && <RotateCcw className="h-3.5 w-3.5" />}
            {m.isPending ? t('cashBoxes.actionDialog.processing') : actionLabelMap[mode]}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * نافذة تأكيد حذف مناقلة ملغاة نهائياً مع جميع قيودها المحاسبية. تتطلَّب
 * من المستخدم كتابة رقم المناقلة لتجنُّب الحذف العَرَضي، نظراً لطبيعة
 * العملية التي لا رجعة فيها (حذف ناعم لكنه يُخفي القيود من جميع التقارير).
 */
function TransferDeleteDialog({
  transfer,
  onClose,
  onDone,
}: {
  transfer: CashBoxTransferDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText.trim() === transfer.transferNumber;

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const m = useMutation({
    mutationFn: () => cashBoxesApi.deleteTransfer(transfer.id, null),
    onSuccess: () => {
      toast.success(t('cashBoxes.deleteDialog.success'));
      onDone();
    },
    onError: (e: any) => toast.error(extractApiError(e, t('cashBoxes.deleteDialog.failed'))),
  });

  // ‎جمع أرقام القيود التي ستُحذَف لعرضها للمستخدم قبل التأكيد.
  const entries: Array<{ label: string; number?: string | null }> = [];
  if (transfer.sendEntryNumber || transfer.sendJournalEntryId) {
    entries.push({ label: t('cashBoxes.deleteDialog.sendEntry'), number: transfer.sendEntryNumber });
  }
  if (transfer.receiveEntryNumber || transfer.receiveJournalEntryId) {
    entries.push({ label: t('cashBoxes.deleteDialog.receiveEntry'), number: transfer.receiveEntryNumber });
  }
  if (transfer.reversalEntryNumber || transfer.reversalJournalEntryId) {
    entries.push({ label: t('cashBoxes.deleteDialog.reversalEntry'), number: transfer.reversalEntryNumber });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-rose-500/40 bg-card shadow-2xl" dir={direction}>
        <div className="flex items-center justify-between border-b border-rose-500/30 bg-rose-500/10 px-4 py-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-rose-500">
            <Trash2 className="h-4 w-4" />
            {t('cashBoxes.deleteDialog.title')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-md border border-border bg-secondary/20 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5">
              <code className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-500">
                {transfer.transferNumber}
              </code>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-medium">{transfer.fromCashBoxName}</span>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{transfer.toCashBoxName}</span>
              <span className="ms-auto num-display font-bold text-primary">
                {formatAmount(transfer.amount)} {transfer.currency}
              </span>
            </div>
            {transfer.cancellationReason && (
              <div className="mt-1.5 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
                {t('cashBoxes.deleteDialog.cancelReason', { reason: transfer.cancellationReason })}
              </div>
            )}
          </div>

          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] leading-relaxed text-rose-600">
            <div className="mb-1.5 font-bold">{t('cashBoxes.deleteDialog.willDelete')}</div>
            <ul className="space-y-1">
              <li>• {t('cashBoxes.deleteDialog.transferRecord')} <code className="num-display rounded bg-rose-500/10 px-1 text-[10px]">{transfer.transferNumber}</code></li>
              {entries.map((e, i) => (
                <li key={i}>
                  • {e.label}
                  {e.number && (
                    <code className="num-display ms-1 rounded bg-rose-500/10 px-1 text-[10px]">#{e.number}</code>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[10px] text-rose-500/80">
              {t('cashBoxes.deleteDialog.warning')}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              {t('cashBoxes.deleteDialog.confirmLabel')}{' '}
              <code className="num-display rounded bg-secondary px-1 text-[10px] text-foreground">
                {transfer.transferNumber}
              </code>
            </label>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={transfer.transferNumber}
              className="h-9 text-xs"
              autoFocus
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={m.isPending}>
            {t('cashBoxes.actionDialog.back')}
          </Button>
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={!canConfirm || m.isPending}
            className="gap-1.5 bg-rose-500 text-white hover:bg-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {m.isPending ? t('cashBoxes.deleteDialog.deleting') : t('cashBoxes.deleteDialog.confirmDelete')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TransfersTab({
  transfers,
  boxById,
  accountById,
  isLoading,
  onOpenEntry,
  onAction,
  onPrint,
  canPrint,
  canUpdate,
  canDelete,
  canReceive,
  canCancel,
}: {
  transfers: CashBoxTransferDto[];
  boxById: Map<number, CashBoxDto>;
  accountById: Map<number, AccountDto>;
  isLoading: boolean;
  onOpenEntry: (entryId: number) => void;
  onAction: (mode: TransferDialogMode, transfer: CashBoxTransferDto) => void;
  onPrint: (transfer: CashBoxTransferDto) => void;
  canPrint: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canReceive: boolean;
  canCancel: boolean;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const boxLabel = (id: number, fallback: string) => {
    const b = boxById.get(id);
    return b ? localizedName(locale, b.nameAr, b.nameEn) : fallback;
  };

  const accountLabel = (id: number, fallback?: string | null) => {
    const a = accountById.get(id);
    return a
      ? localizedAccountName(locale, a.nameAr, a.nameEn)
      : (fallback ?? '—');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('cashBoxes.transfers.title')}</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {t('cashBoxes.transfers.hint')}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : transfers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('cashBoxes.transfers.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.number')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.status')}</th>
                  <th className="p-2 text-right">{t('cashBoxes.transfers.fromTo')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.currency')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.amount')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.sendDate')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.receiveDate')}</th>
                  <th className="p-2 text-right">{t('cashBoxes.transfers.entries')}</th>
                  <th className="p-2 text-center">{t('cashBoxes.transfers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(tr => {
                  // ‎كل العرض بتوقيت بغداد (UTC+3 ثابت) بصرف النظر عن منطقة
                  // ‎متصفِّح المستخدم — حتى تطابق الأرقام تماماً ما اعتمده
                  // ‎أمين الصندوق وما يظهر في القيود المطبوعة.
                  const sameDay = sameBaghdadDay(tr.sendDate, tr.receiveDate);
                  return (
                    <tr
                      key={tr.id}
                      className="border-t border-border/40 hover:bg-secondary/20"
                    >
                      <td className="p-2 text-center">
                        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {tr.transferNumber}
                        </code>
                      </td>
                      <td className="p-2 text-center">
                        <TransferStatusBadge status={tr.status} />
                      </td>
                      <td className="p-2 text-right text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{boxLabel(tr.fromCashBoxId, tr.fromCashBoxName)}</span>
                          <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{boxLabel(tr.toCashBoxId, tr.toCashBoxName)}</span>
                        </div>
                        <div
                          className="mt-0.5 truncate text-[10px] text-muted-foreground"
                          title={`${tr.transitAccountCode ?? ''} - ${accountLabel(tr.transitAccountId, tr.transitAccountName)}`}
                        >
                          {t('cashBoxes.transfers.transit')}&nbsp;
                          <span className="num-display">{tr.transitAccountCode}</span> -{' '}
                          {accountLabel(tr.transitAccountId, tr.transitAccountName)}
                        </div>
                      </td>
                      <td className="p-2 text-center num-display text-xs font-bold">
                        {tr.currency}
                      </td>
                      <td className="p-2 text-center num-display text-sm font-bold">
                        {formatAmount(tr.amount)}
                      </td>
                      <td className="p-2 text-center text-[11px] num-display">
                        {formatBaghdadDate(tr.sendDate)}
                        <div className="text-[10px] text-muted-foreground">
                          {formatBaghdadTime(tr.sendDate)}
                        </div>
                      </td>
                      <td className="p-2 text-center text-[11px] num-display">
                        {formatBaghdadDate(tr.receiveDate)}
                        <div
                          className={cn(
                            'text-[10px]',
                            sameDay ? 'text-muted-foreground' : 'text-amber-500'
                          )}
                        >
                          {formatBaghdadTime(tr.receiveDate)}
                          {!sameDay && ` ${t('cashBoxes.transfers.nextDay')}`}
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => onOpenEntry(tr.sendJournalEntryId)}
                            className="inline-flex items-center gap-1 text-[10px] text-rose-500 hover:underline"
                            title={t('cashBoxes.transfers.openSendEntry')}
                          >
                            <Lock className="h-3 w-3" />
                            {t('cashBoxes.transfers.sendEntry')} {tr.sendEntryNumber ? `#${tr.sendEntryNumber}` : ''}
                          </button>
                          {tr.receiveJournalEntryId ? (
                            <button
                              type="button"
                              onClick={() => onOpenEntry(tr.receiveJournalEntryId!)}
                              className="inline-flex items-center gap-1 text-[10px] text-emerald-500 hover:underline"
                              title={t('cashBoxes.transfers.openReceiveEntry')}
                            >
                              <Lock className="h-3 w-3" />
                              {t('cashBoxes.transfers.receiveEntry')} {tr.receiveEntryNumber ? `#${tr.receiveEntryNumber}` : ''}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-500/70">
                              <Clock className="h-3 w-3" />
                              {t('cashBoxes.transfers.awaitingReceive')}
                            </span>
                          )}
                          {tr.reversalJournalEntryId && (
                            <button
                              type="button"
                              onClick={() => onOpenEntry(tr.reversalJournalEntryId!)}
                              className="inline-flex items-center gap-1 text-[10px] text-amber-500 hover:underline"
                              title={t('cashBoxes.transfers.openReversalEntry')}
                            >
                              <Lock className="h-3 w-3" />
                              {t('cashBoxes.transfers.reversalEntry')} {tr.reversalEntryNumber ? `#${tr.reversalEntryNumber}` : ''}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex flex-col gap-1">
                          {canPrint && (
                            <button
                              type="button"
                              onClick={() => onPrint(tr)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-secondary/60 px-2 py-1 text-[10px] font-bold text-foreground/80 hover:bg-secondary"
                              title={t('cashBoxes.transfers.printTooltip')}
                            >
                              <Printer className="h-3 w-3" />
                              {t('cashBoxes.transfers.print')}
                            </button>
                          )}
                          {tr.status === 'PendingReceive' && (
                            <>
                              {canReceive && (
                                <button
                                  type="button"
                                  onClick={() => onAction('receive', tr)}
                                  className="inline-flex items-center justify-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-500 hover:bg-emerald-500/25"
                                  title={t('cashBoxes.transfers.receiveTooltip')}
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  {t('cashBoxes.transfers.receive')}
                                </button>
                              )}
                              {canUpdate && (
                                <button
                                  type="button"
                                  onClick={() => onAction('edit', tr)}
                                  className="inline-flex items-center justify-center gap-1 rounded bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/25"
                                  title={t('cashBoxes.transfers.editTooltip')}
                                >
                                  <Pencil className="h-3 w-3" />
                                  {t('cashBoxes.transfers.edit')}
                                </button>
                              )}
                              {canCancel && (
                                <button
                                  type="button"
                                  onClick={() => onAction('cancel', tr)}
                                  className="inline-flex items-center justify-center gap-1 rounded bg-rose-500/15 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/25"
                                  title={t('cashBoxes.transfers.cancelTooltip')}
                                >
                                  <Ban className="h-3 w-3" />
                                  {t('cashBoxes.transfers.cancel')}
                                </button>
                              )}
                            </>
                          )}
                          {tr.status === 'Received' && canReceive && (
                            <button
                              type="button"
                              onClick={() => onAction('unreceive', tr)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-500 hover:bg-amber-500/25"
                              title={t('cashBoxes.transfers.unreceiveTooltip')}
                            >
                              <RotateCcw className="h-3 w-3" />
                              {t('cashBoxes.transfers.unreceive')}
                            </button>
                          )}
                          {tr.status === 'Cancelled' && canDelete && (
                            <button
                              type="button"
                              onClick={() => onAction('delete', tr)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-rose-500/15 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/25"
                              title={
                                tr.cancellationReason
                                  ? t('cashBoxes.transfers.deletePermanentTooltipReason', {
                                      reason: tr.cancellationReason,
                                    })
                                  : t('cashBoxes.transfers.deletePermanentTooltip')
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                              {t('cashBoxes.transfers.deletePermanent')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
