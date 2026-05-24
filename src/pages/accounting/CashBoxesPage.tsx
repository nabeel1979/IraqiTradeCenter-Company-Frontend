import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
    const t = new URLSearchParams(location.search).get('tab');
    if (t === 'balances' && canReadBalances) return 'balances';
    if (t === 'transfers' && canReadTransfers) return 'transfers';
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
      toast.success(vars.isActive ? 'تم التفعيل' : 'تم التعطيل');
      qc.invalidateQueries({ queryKey: ['cash-boxes'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر تحديث الحالة')),
  });

  const moveM = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      cashBoxesApi.move(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-boxes'] }),
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر تحريك الصندوق')),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => cashBoxesApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف الصندوق');
      qc.invalidateQueries({ queryKey: ['cash-boxes'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر حذف الصندوق')),
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5 text-primary" />
            الصناديق (الخزائن)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            إدارة صناديق الشركة النقدية: ربط كل صندوق بحساب محاسبي مع متابعة الأرصدة
            والمناقلات بين الصناديق (تُولِّد قيدَين متلازمَين بحساب وسيط).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateTransfer && (
            <Button
              onClick={() => openTransferFor()}
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={activeCount < 2}
              title={activeCount < 2 ? 'تحتاج إلى صندوقَين مفعَّلَين على الأقل' : undefined}
            >
              <ArrowLeftRight className="h-4 w-4" />
              مناقلة جديدة
            </Button>
          )}
          {canCreateBox && (
            <Button onClick={() => setCreatingNew(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              صندوق جديد
            </Button>
          )}
        </div>
      </div>

      {/* تبويبات: الصناديق / الأرصدة / المناقلات — تُخفى التبويبات الممنوعة */}
      <div className="flex flex-wrap gap-1 rounded-md border border-input bg-secondary/30 p-1 text-xs">
        {canReadBoxes && (
          <TabButton active={tab === 'boxes'} onClick={() => setTab('boxes')} icon={Wallet}>
            الصناديق ({boxes.length})
          </TabButton>
        )}
        {canReadBalances && (
          <TabButton active={tab === 'balances'} onClick={() => setTab('balances')} icon={Scale}>
            الأرصدة ({balances.length})
          </TabButton>
        )}
        {canReadTransfers && (
          <TabButton active={tab === 'transfers'} onClick={() => setTab('transfers')} icon={ArrowLeftRight}>
            المناقلات ({transfers.length})
          </TabButton>
        )}
      </div>

      {tab === 'balances' && canReadBalances && (
        <BalancesTab
          balances={balances}
          isLoading={balancesQuery.isLoading}
          onTransfer={(boxId, currency) =>
            openTransferFor({ fromBoxId: boxId, currency })
          }
          onPrint={() => printCashBoxBalances(balances, company)}
          canPrint={canPrintBalances}
          canCreateTransfer={canCreateTransfer}
        />
      )}

      {tab === 'transfers' && canReadTransfers && (
        <TransfersTab
          transfers={transfers}
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
                returnLabel: 'الصناديق',
              },
            })
          }
          onPrint={transfer => printCashBoxTransfer(transfer, company)}
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
              <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالكود أو الاسم أو الحساب..."
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
                الكل ({boxes.length})
              </button>
              <button
                type="button"
                onClick={() => setShowOnly('active')}
                className={cn(
                  'rounded px-2 py-1 transition-colors',
                  showOnly === 'active' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                )}
              >
                النشطة ({activeCount})
              </button>
            </div>
            <CardTitle className="ms-auto text-xs text-muted-foreground">
              عرض {filtered.length} من {boxes.length}
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
              لا توجد صناديق مطابقة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 p-2 text-center">#</th>
                    <th className="w-28 p-2 text-right">الكود</th>
                    <th className="p-2 text-right">الاسم</th>
                    <th className="p-2 text-right">الحساب المربوط</th>
                    <th className="p-2 text-center">العملات</th>
                    <th className="w-24 p-2 text-center">الحالة</th>
                    <th className="w-32 p-2 text-center">الإجراءات</th>
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
                        <span className="text-sm font-medium">{b.nameAr}</span>
                        {b.description && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{b.description}</p>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {b.accountId ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="num-display text-primary">{b.accountCode}</span>
                            <span className="text-muted-foreground">- {b.accountName}</span>
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
                                ? `العملات المرتبطة: ${b.currencies.map(c => c.currency).join(' · ')}`
                                : ''
                            }
                          >
                            <Banknote className="h-3 w-3" />
                            <span className="num-display font-bold">{b.currencies.length}</span>
                            <span className="opacity-80">عملة</span>
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
                          title={!canUpdateBox ? 'لا تملك صلاحية التعديل' : undefined}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                            b.isActive
                              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border border-muted-foreground/20 bg-muted-foreground/5 text-muted-foreground hover:bg-muted-foreground/10',
                            !canUpdateBox && 'cursor-not-allowed opacity-60 hover:bg-transparent'
                          )}
                        >
                          {b.isActive ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {b.isActive ? 'نشط' : 'معطّل'}
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
                                title="نقل لأعلى"
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveM.mutate({ id: b.id, direction: 'down' })}
                                disabled={moveM.isPending || idx === filtered.length - 1}
                                title="نقل لأسفل"
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditing(b)}
                                title="تعديل"
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
                                if (window.confirm(`هل أنت متأكد من حذف "${b.nameAr}" ؟`)) {
                                  deleteM.mutate(b.id);
                                }
                              }}
                              title="حذف"
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
    if (!c) return 'الكود مطلوب';
    if (c.length > 30) return 'الكود طويل (1–30 حرف)';
    if (existingCodes.map(x => x.toUpperCase()).includes(c)) return 'هذا الكود مستخدم';
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
      toast.success(isNew ? 'تم إنشاء الصندوق' : 'تم تحديث الصندوق');
      onSaved();
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر حفظ الصندوق')),
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
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl" dir="rtl">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {isNew ? <Plus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />}
            {isNew ? 'إضافة صندوق' : `تعديل: ${existing?.nameAr}`}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[80vh] space-y-3 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">الكود *</label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 30))}
                disabled={!isNew}
                placeholder="CB-MAIN"
                className={cn('h-9 text-sm', codeError && 'border-destructive')}
              />
              {codeError && <p className="mt-0.5 text-[10px] text-destructive">{codeError}</p>}
              {!isNew && <p className="mt-0.5 text-[10px] text-muted-foreground">لا يمكن تغيير الكود بعد الإنشاء</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">الاسم العربي *</label>
              <Input
                value={nameAr}
                onChange={e => setNameAr(e.target.value.slice(0, 150))}
                placeholder="الصندوق الرئيسي"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">الاسم الإنجليزي</label>
              <Input
                value={nameEn ?? ''}
                onChange={e => setNameEn(e.target.value.slice(0, 150))}
                placeholder="Main Cash Box"
                className="h-9 text-sm"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">ترتيب العرض</label>
              <Input
                type="number"
                value={displayOrder}
                onChange={e => setDisplayOrder(Math.max(0, Math.min(9999, Number(e.target.value) || 0)))}
                className="h-9 text-sm num-display"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">الوصف</label>
            <Input
              value={description ?? ''}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder="وصف الصندوق (اختياري)"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold text-primary">حساب الصندوق *</div>
            <p className="text-[10px] text-muted-foreground">
              الحساب المرتبط في الدليل المحاسبي (يستلم القيود الناتجة عن السندات).
            </p>
            <AccountPicker
              accounts={accounts}
              value={accountId}
              initialLabel={account ? `${account.code} - ${account.nameAr}` : undefined}
              onChange={id => setAccountId(id)}
              allowClear
              placeholder="اختر حساب الصندوق..."
              inputHeight={9}
            />
          </div>

          <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-primary">عملات الصندوق وسقوفها</div>
                <p className="text-[10px] text-muted-foreground">
                  حدّد العملات التي يقبلها الصندوق، مع سقف مدين/دائن اختياري لكل عملة.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addRow} className="h-7 gap-1 text-xs">
                <Plus className="h-3 w-3" />
                إضافة عملة
              </Button>
            </div>

            {dupCurrencies.length > 0 && (
              <p className="text-[10px] text-destructive">
                عملات مكرّرة: {dupCurrencies.join(', ')}
              </p>
            )}

            {rows.length === 0 ? (
              <p className="rounded border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
                لا توجد عملات — استخدم زر "إضافة عملة" أعلاه.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-1 text-right">العملة</th>
                      <th className="p-1 text-left">سقف مدين</th>
                      <th className="p-1 text-left">سقف دائن</th>
                      <th className="w-16 p-1 text-center">نشط</th>
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
                              <option value="">— اختر —</option>
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
                              placeholder="بلا سقف"
                              className="h-8 num-display text-left text-xs"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={r.creditLimit}
                              onChange={e => updateRow(r.uid, { creditLimit: e.target.value })}
                              placeholder="بلا سقف"
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
                              title="حذف"
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
            <span>الصندوق نشط (متاح للسندات والصلاحيات)</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>إلغاء</Button>
          <Button
            size="sm"
            onClick={() => saveM.mutate()}
            disabled={!canSave}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saveM.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
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
  isLoading,
  onTransfer,
  onPrint,
  canPrint,
  canCreateTransfer,
}: {
  balances: CashBoxBalanceDto[];
  isLoading: boolean;
  onTransfer: (cashBoxId: number, currency: string) => void;
  onPrint: () => void;
  canPrint: boolean;
  canCreateTransfer: boolean;
}) {
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
            <CardTitle className="text-sm">أرصدة الصناديق</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              محسوبة من سطور القيود المرحَّلة فقط — السقوف الحمراء تعني تجاوز السقف
              المعرَّف للصندوق.
            </p>
          </div>
          {canPrint && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPrint}
              disabled={balances.length === 0 || isLoading}
              className="gap-1.5"
              title="طباعة تقرير أرصدة الصناديق"
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة
            </Button>
          )}
        </div>
      </CardHeader>

      {totalsByCurrency.length > 0 && !isLoading && (
        <div className="border-y border-border/40 bg-secondary/20 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Scale className="h-3.5 w-3.5" />
            <span>الإجمالي حسب العملة</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              (مجموع أرصدة جميع الصناديق لكل عملة)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {totalsByCurrency.map(t => (
              <div
                key={t.currency}
                className={cn(
                  'group flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors',
                  t.balance > 0
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : t.balance < 0
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-border bg-card'
                )}
              >
                <span className="num-display rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {t.currency}
                </span>
                <div className="flex flex-col leading-tight">
                  <span
                    className={cn(
                      'num-display text-sm font-bold',
                      t.balance > 0
                        ? 'text-emerald-500'
                        : t.balance < 0
                        ? 'text-rose-500'
                        : 'text-muted-foreground'
                    )}
                  >
                    {formatAmount(t.balance)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {t.boxCount} صندوق
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
            لا توجد أرصدة بعد — أنشئ صناديق أو أضف حركات.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">الصندوق</th>
                  <th className="p-2 text-right">الحساب المحاسبي</th>
                  <th className="p-2 text-center">العملة</th>
                  <th className="p-2 text-center">الرصيد</th>
                  <th className="p-2 text-center">السقوف</th>
                  <th className="w-24 p-2 text-center">إجراءات</th>
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
                            <div className="font-medium">{box.nameAr}</div>
                            <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              {box.code}
                            </code>
                          </td>
                        ) : null}
                        {i === 0 ? (
                          <td className="p-2 text-right text-xs" rowSpan={rows.length}>
                            <span className="num-display text-primary">{box.accountCode}</span>
                            <span className="ms-1 text-muted-foreground">- {box.accountName}</span>
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
                                  مدين ≤ {formatAmount(r.debitLimit)}
                                </span>
                              )}
                              {r.creditLimit != null && (
                                <span
                                  className={
                                    exceedsCredit ? 'text-destructive' : 'text-amber-300'
                                  }
                                >
                                  دائن ≤ {formatAmount(r.creditLimit)}
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
                              title="مناقلة من هذا الصندوق"
                              className="inline-flex h-6 items-center gap-1 rounded bg-primary/10 px-2 text-[10px] text-primary hover:bg-primary/20"
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                              مناقلة
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
                  {totalsByCurrency.map((t, idx) => (
                    <tr key={t.currency} className={idx > 0 ? 'border-t border-border/40' : ''}>
                      <td
                        className="p-2 text-right text-[11px] font-semibold text-primary"
                        colSpan={2}
                      >
                        {idx === 0 ? 'الإجمالي حسب العملة' : ''}
                      </td>
                      <td className="p-2 text-center num-display text-xs font-bold text-primary">
                        {t.currency}
                      </td>
                      <td
                        className={cn(
                          'p-2 text-center num-display text-sm font-bold',
                          t.balance > 0
                            ? 'text-emerald-500'
                            : t.balance < 0
                            ? 'text-rose-500'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatAmount(t.balance)}
                      </td>
                      <td className="p-2 text-center text-[10px] text-muted-foreground" colSpan={2}>
                        {t.boxCount} صندوق
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
  if (status === 'PendingReceive') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
        <Clock className="h-3 w-3" />
        بانتظار الاستلام
      </span>
    );
  }
  if (status === 'Received') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
        <ShieldCheck className="h-3 w-3" />
        مستلَمة
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500">
      <Ban className="h-3 w-3" />
      ملغاة
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
  const titleMap: Record<CompactDialogMode, string> = {
    receive: 'تأكيد استلام المناقلة',
    unreceive: 'التراجع عن استلام المناقلة',
  };
  const subtitleMap: Record<CompactDialogMode, string> = {
    receive:
      'بمجرد التأكيد سيُولَّد قيد استلام بالتاريخ والوقت أدناه ويُضاف المبلغ إلى الصندوق المستلم.',
    unreceive:
      'سيُولَّد قيد عكس يُخصَم من الصندوق المستلم ويُعيد المبلغ إلى الحساب الوسيط — يتطلب توفّر الرصيد. بعدها يمكن للمُرسِل تعديل المناقلة أو إلغاءها.',
  };
  const actionLabelMap: Record<CompactDialogMode, string> = {
    receive: 'تأكيد الاستلام',
    unreceive: 'تراجع عن الاستلام',
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
      toast.success(mode === 'receive' ? 'تم تأكيد الاستلام' : 'تم التراجع عن الاستلام');
      onDone();
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذَّر تنفيذ الإجراء')),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl" dir="rtl">
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
                {mode === 'receive' ? 'تاريخ ووقت الاستلام الفعلي' : 'تاريخ ووقت العكس'}
              </span>
              <span className="text-[10px] text-primary/80">توقيت بغداد (UTC+3)</span>
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
                title="استخدم الآن بتوقيت بغداد"
              >
                الآن
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              {mode === 'receive' ? 'ملاحظات الاستلام (اختياري)' : 'سبب الإجراء (اختياري)'}
            </label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              placeholder={
                mode === 'receive'
                  ? 'مثلاً: استُلم نقداً من المرسل'
                  : 'مثلاً: تعديل قيمة المناقلة'
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
            <span>ترحيل القيد المتولَّد فوراً</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={m.isPending}>
            تراجع
          </Button>
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className={cn('gap-1.5', colorClassMap[mode])}
          >
            {mode === 'receive' && <ShieldCheck className="h-3.5 w-3.5" />}
            {mode === 'unreceive' && <RotateCcw className="h-3.5 w-3.5" />}
            {m.isPending ? 'جارٍ التنفيذ...' : actionLabelMap[mode]}
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
      toast.success('تم حذف المناقلة وجميع قيودها المحاسبية');
      onDone();
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذَّر حذف المناقلة')),
  });

  // ‎جمع أرقام القيود التي ستُحذَف لعرضها للمستخدم قبل التأكيد.
  const entries: Array<{ label: string; number?: string | null }> = [];
  if (transfer.sendEntryNumber || transfer.sendJournalEntryId) {
    entries.push({ label: 'قيد الإرسال', number: transfer.sendEntryNumber });
  }
  if (transfer.receiveEntryNumber || transfer.receiveJournalEntryId) {
    entries.push({ label: 'قيد الاستلام', number: transfer.receiveEntryNumber });
  }
  if (transfer.reversalEntryNumber || transfer.reversalJournalEntryId) {
    entries.push({ label: 'قيد عكس الإلغاء', number: transfer.reversalEntryNumber });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-rose-500/40 bg-card shadow-2xl" dir="rtl">
        <div className="flex items-center justify-between border-b border-rose-500/30 bg-rose-500/10 px-4 py-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-rose-500">
            <Trash2 className="h-4 w-4" />
            حذف نهائي للمناقلة
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
                سبب الإلغاء: {transfer.cancellationReason}
              </div>
            )}
          </div>

          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] leading-relaxed text-rose-600">
            <div className="mb-1.5 font-bold">سيتم حذف العناصر التالية نهائياً:</div>
            <ul className="space-y-1">
              <li>• سجل المناقلة <code className="num-display rounded bg-rose-500/10 px-1 text-[10px]">{transfer.transferNumber}</code></li>
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
              هذه العملية لا رجعة فيها — قيود المناقلة (الإرسال + عكس الإلغاء) تَلغي
              أثرها بعضها بعضاً، فحذفها مجتمعة يُبقي على تكامل دفتر الأستاذ.
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              للتأكيد، اكتب رقم المناقلة{' '}
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
            تراجع
          </Button>
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={!canConfirm || m.isPending}
            className="gap-1.5 bg-rose-500 text-white hover:bg-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {m.isPending ? 'جارٍ الحذف...' : 'حذف نهائي'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TransfersTab({
  transfers,
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">سجل المناقلات بين الصناديق</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          آلية موافقة بمرحلتَين: قيد <b>الإرسال</b> يُولَّد فوراً، أما قيد <b>الاستلام</b> فلا
          يُولَّد إلا بعد تأكيد أمين الصندوق المستلم. لتعديل مناقلة مستلَمة، يجب
          أولاً التراجع عن الاستلام (مع توفّر الرصيد) ثم إلغاؤها وإعادة الإرسال.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : transfers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            لا توجد مناقلات بعد — استخدم زر "مناقلة جديدة" أعلاه.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-center">رقم</th>
                  <th className="p-2 text-center">الحالة</th>
                  <th className="p-2 text-right">من / إلى</th>
                  <th className="p-2 text-center">العملة</th>
                  <th className="p-2 text-center">المبلغ</th>
                  <th className="p-2 text-center">تاريخ الإرسال</th>
                  <th className="p-2 text-center">تاريخ الاستلام</th>
                  <th className="p-2 text-right">القيود</th>
                  <th className="p-2 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => {
                  // ‎كل العرض بتوقيت بغداد (UTC+3 ثابت) بصرف النظر عن منطقة
                  // ‎متصفِّح المستخدم — حتى تطابق الأرقام تماماً ما اعتمده
                  // ‎أمين الصندوق وما يظهر في القيود المطبوعة.
                  const sameDay = sameBaghdadDay(t.sendDate, t.receiveDate);
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-border/40 hover:bg-secondary/20"
                    >
                      <td className="p-2 text-center">
                        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {t.transferNumber}
                        </code>
                      </td>
                      <td className="p-2 text-center">
                        <TransferStatusBadge status={t.status} />
                      </td>
                      <td className="p-2 text-right text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{t.fromCashBoxName}</span>
                          <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{t.toCashBoxName}</span>
                        </div>
                        <div
                          className="mt-0.5 truncate text-[10px] text-muted-foreground"
                          title={`${t.transitAccountCode ?? ''} - ${t.transitAccountName ?? ''}`}
                        >
                          الوسيط:&nbsp;
                          <span className="num-display">{t.transitAccountCode}</span> -{' '}
                          {t.transitAccountName}
                        </div>
                      </td>
                      <td className="p-2 text-center num-display text-xs font-bold">
                        {t.currency}
                      </td>
                      <td className="p-2 text-center num-display text-sm font-bold">
                        {formatAmount(t.amount)}
                      </td>
                      <td className="p-2 text-center text-[11px] num-display">
                        {formatBaghdadDate(t.sendDate)}
                        <div className="text-[10px] text-muted-foreground">
                          {formatBaghdadTime(t.sendDate)}
                        </div>
                      </td>
                      <td className="p-2 text-center text-[11px] num-display">
                        {formatBaghdadDate(t.receiveDate)}
                        <div
                          className={cn(
                            'text-[10px]',
                            sameDay ? 'text-muted-foreground' : 'text-amber-500'
                          )}
                        >
                          {formatBaghdadTime(t.receiveDate)}
                          {!sameDay && ' (يوم لاحق)'}
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => onOpenEntry(t.sendJournalEntryId)}
                            className="inline-flex items-center gap-1 text-[10px] text-rose-500 hover:underline"
                            title="فتح قيد الإرسال (مقفول للتعديل)"
                          >
                            <Lock className="h-3 w-3" />
                            إرسال {t.sendEntryNumber ? `#${t.sendEntryNumber}` : ''}
                          </button>
                          {t.receiveJournalEntryId ? (
                            <button
                              type="button"
                              onClick={() => onOpenEntry(t.receiveJournalEntryId!)}
                              className="inline-flex items-center gap-1 text-[10px] text-emerald-500 hover:underline"
                              title="فتح قيد الاستلام (مقفول للتعديل)"
                            >
                              <Lock className="h-3 w-3" />
                              استلام {t.receiveEntryNumber ? `#${t.receiveEntryNumber}` : ''}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-500/70">
                              <Clock className="h-3 w-3" />
                              ينتظر الاستلام
                            </span>
                          )}
                          {t.reversalJournalEntryId && (
                            <button
                              type="button"
                              onClick={() => onOpenEntry(t.reversalJournalEntryId!)}
                              className="inline-flex items-center gap-1 text-[10px] text-amber-500 hover:underline"
                              title="فتح قيد العكس"
                            >
                              <Lock className="h-3 w-3" />
                              عكس {t.reversalEntryNumber ? `#${t.reversalEntryNumber}` : ''}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex flex-col gap-1">
                          {canPrint && (
                            <button
                              type="button"
                              onClick={() => onPrint(t)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-secondary/60 px-2 py-1 text-[10px] font-bold text-foreground/80 hover:bg-secondary"
                              title="طباعة سند المناقلة (الإرسال + الاستلام)"
                            >
                              <Printer className="h-3 w-3" />
                              طباعة
                            </button>
                          )}
                          {t.status === 'PendingReceive' && (
                            <>
                              {canReceive && (
                                <button
                                  type="button"
                                  onClick={() => onAction('receive', t)}
                                  className="inline-flex items-center justify-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-500 hover:bg-emerald-500/25"
                                  title="تأكيد الاستلام (موافقة الصندوق المستلم)"
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  استلام
                                </button>
                              )}
                              {canUpdate && (
                                <button
                                  type="button"
                                  onClick={() => onAction('edit', t)}
                                  className="inline-flex items-center justify-center gap-1 rounded bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/25"
                                  title="تعديل المناقلة (المبلغ/التاريخ/الحساب الوسيط)"
                                >
                                  <Pencil className="h-3 w-3" />
                                  تعديل
                                </button>
                              )}
                              {canCancel && (
                                <button
                                  type="button"
                                  onClick={() => onAction('cancel', t)}
                                  className="inline-flex items-center justify-center gap-1 rounded bg-rose-500/15 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/25"
                                  title="إلغاء المناقلة (يعكس قيد الإرسال)"
                                >
                                  <Ban className="h-3 w-3" />
                                  إلغاء
                                </button>
                              )}
                            </>
                          )}
                          {t.status === 'Received' && canReceive && (
                            <button
                              type="button"
                              onClick={() => onAction('unreceive', t)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-500 hover:bg-amber-500/25"
                              title="التراجع عن الاستلام (يتطلب توفّر الرصيد)"
                            >
                              <RotateCcw className="h-3 w-3" />
                              تراجع عن الاستلام
                            </button>
                          )}
                          {t.status === 'Cancelled' && canDelete && (
                            <button
                              type="button"
                              onClick={() => onAction('delete', t)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-rose-500/15 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/25"
                              title={
                                t.cancellationReason
                                  ? `حذف نهائي للمناقلة وقيودها — سبب الإلغاء: ${t.cancellationReason}`
                                  : 'حذف نهائي للمناقلة وقيودها المحاسبية'
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                              حذف نهائي
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
