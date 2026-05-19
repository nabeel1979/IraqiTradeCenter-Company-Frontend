import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Wallet, Plus, Pencil, Trash2, ChevronUp, ChevronDown, CheckCircle2, Circle,
  X, Save, Search, Banknote,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { cn, extractApiError, formatAmount } from '@/lib/utils';
import { accountingApi } from '@/lib/api/accounting';
import { currenciesApi, type CurrencyDto } from '@/lib/api/currencies';
import {
  cashBoxesApi,
  type CashBoxDto,
  type UpsertCashBoxPayload,
  type UpsertCashBoxCurrencyPayload,
} from '@/lib/api/cashBoxes';
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

export function CashBoxesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'active'>('all');
  const [editing, setEditing] = useState<CashBoxDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['cash-boxes', 'all'],
    queryFn: () => cashBoxesApi.getAll(false),
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5 text-primary" />
            الصناديق (الخزائن)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            إدارة صناديق الشركة النقدية: ربط كل صندوق بحساب من الدليل المحاسبي،
            مع تحديد العملات المسموحة وحدود (سقف) دائنة/مدينة لكل عملة.
          </p>
        </div>
        <Button onClick={() => setCreatingNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          صندوق جديد
        </Button>
      </div>

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
                    <th className="p-2 text-right">العملات والسقوف</th>
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
                      <td className="p-2 text-right">
                        {b.currencies.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground/50">— لا توجد عملات —</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {b.currencies.map(c => (
                              <span
                                key={c.id}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                                  c.isActive
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : 'border-muted-foreground/20 bg-muted-foreground/5 text-muted-foreground'
                                )}
                                title={
                                  [
                                    c.debitLimit != null ? `سقف مدين: ${formatAmount(c.debitLimit)}` : null,
                                    c.creditLimit != null ? `سقف دائن: ${formatAmount(c.creditLimit)}` : null,
                                  ].filter(Boolean).join(' • ') || 'بلا سقوف'
                                }
                              >
                                <Banknote className="h-2.5 w-2.5" />
                                <span className="num-display font-bold">{c.currency}</span>
                                {(c.debitLimit != null || c.creditLimit != null) && (
                                  <span className="opacity-70">·</span>
                                )}
                                {c.debitLimit != null && (
                                  <span className="num-display text-emerald-200">د:{formatAmount(c.debitLimit)}</span>
                                )}
                                {c.creditLimit != null && (
                                  <span className="num-display text-amber-200">ك:{formatAmount(c.creditLimit)}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleM.mutate({ id: b.id, isActive: !b.isActive })}
                          disabled={toggleM.isPending}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                            b.isActive
                              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border border-muted-foreground/20 bg-muted-foreground/5 text-muted-foreground hover:bg-muted-foreground/10'
                          )}
                        >
                          {b.isActive ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {b.isActive ? 'نشط' : 'معطّل'}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-0.5">
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
