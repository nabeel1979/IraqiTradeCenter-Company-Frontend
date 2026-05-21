import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      toast.success(vars.isEnabled ? 'تم التفعيل' : 'تم التعطيل');
      qc.invalidateQueries({ queryKey: ['voucher-types'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر تحديث الحالة')),
  });

  const moveM = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      journalVoucherTypesApi.move(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voucher-types'] }),
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر تحريك النوع')),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => journalVoucherTypesApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف النوع');
      qc.invalidateQueries({ queryKey: ['voucher-types'] });
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر حذف النوع')),
  });

  const enabledCount = types.filter(t => t.isEnabled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-primary" />
            أنواع السندات / القيود
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            إنشاء أنواع قيود قابلة للتخصيص (سند قبض، سند دفع، سند تسوية، …) مع ربطها بحسابات افتراضية من الدليل المحاسبي.
          </p>
        </div>
        <Button onClick={() => setCreatingNew(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          نوع جديد
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالكود أو الاسم..."
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
                الكل ({types.length})
              </button>
              <button
                type="button"
                onClick={() => setShowOnly('enabled')}
                className={cn(
                  'rounded px-2 py-1 transition-colors',
                  showOnly === 'enabled' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                )}
              >
                المفعّلة ({enabledCount})
              </button>
            </div>
            <CardTitle className="ms-auto text-xs text-muted-foreground">
              عرض {filtered.length} من {types.length}
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
              لا توجد أنواع مطابقة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 p-2 text-center">#</th>
                    <th className="w-24 p-2 text-right">الكود</th>
                    <th className="p-2 text-right">الاسم</th>
                    <th className="p-2 text-right">المدين الافتراضي</th>
                    <th className="p-2 text-right">الدائن الافتراضي</th>
                    <th className="w-24 p-2 text-center">الحالة</th>
                    <th className="w-32 p-2 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, idx) => (
                    <tr
                      key={t.id}
                      className={cn(
                        'border-t border-border/40 transition-colors hover:bg-secondary/20',
                        !t.isEnabled && 'opacity-60'
                      )}
                    >
                      <td className="p-2 text-center text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="p-2 text-right">
                        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                          {t.code}
                        </code>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{t.nameAr}</span>
                          {t.isSystem && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300" title="نوع مدمج بالنظام">
                              <Lock className="h-2.5 w-2.5" />
                              نظام
                            </span>
                          )}
                          {t.nature === 'Debit' && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300" title="طبيعة السند: مدين">
                              مدين
                            </span>
                          )}
                          {t.nature === 'Credit' && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300" title="طبيعة السند: دائن">
                              دائن
                            </span>
                          )}
                          {t.showInSidebar && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary" title="يظهر كصفحة مستقلة">
                              في القائمة
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{t.description}</p>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {t.defaultDebitAccountId ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <ArrowDownLeft className="h-3 w-3" />
                            <span className="num-display">{t.defaultDebitAccountCode}</span>
                            <span className="text-muted-foreground">- {t.defaultDebitAccountName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {t.defaultCreditAccountId ? (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <ArrowUpRight className="h-3 w-3" />
                            <span className="num-display">{t.defaultCreditAccountCode}</span>
                            <span className="text-muted-foreground">- {t.defaultCreditAccountName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleM.mutate({ id: t.id, isEnabled: !t.isEnabled })}
                          disabled={toggleM.isPending}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                            t.isEnabled
                              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border border-muted-foreground/20 bg-muted-foreground/5 text-muted-foreground hover:bg-muted-foreground/10'
                          )}
                        >
                          {t.isEnabled ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {t.isEnabled ? 'مفعّل' : 'معطّل'}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveM.mutate({ id: t.id, direction: 'up' })}
                            disabled={moveM.isPending || idx === 0}
                            title="نقل لأعلى"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveM.mutate({ id: t.id, direction: 'down' })}
                            disabled={moveM.isPending || idx === filtered.length - 1}
                            title="نقل لأسفل"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(t)}
                            title="تعديل"
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (t.isSystem) {
                                toast.error('لا يمكن حذف نوع مدمج بالنظام');
                                return;
                              }
                              if (window.confirm(`هل أنت متأكد من حذف "${t.nameAr}" ؟`)) {
                                deleteM.mutate(t.id);
                              }
                            }}
                            disabled={t.isSystem}
                            title={t.isSystem ? 'نوع نظام (لا يحذف)' : 'حذف'}
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded',
                              t.isSystem
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
          existingCodes={types.map(t => t.code)}
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
    if (!c) return 'الكود مطلوب';
    if (c.length > 20) return 'الكود طويل (1–20 حرف)';
    if (existingCodes.map(x => x.toUpperCase()).includes(c)) return 'هذا الكود مستخدم';
    return null;
  })();

  const sameAccountError =
    debitAccountId && creditAccountId && debitAccountId === creditAccountId
      ? 'لا يجوز أن يكون حساب المدين والدائن متطابقين'
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
      toast.success(isNew ? 'تم إنشاء النوع' : 'تم تحديث النوع');
      onSaved();
    },
    onError: (e: any) => toast.error(extractApiError(e, 'تعذّر حفظ النوع')),
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
            {isNew ? 'إضافة نوع سند' : `تعديل: ${existing?.nameAr}`}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                الكود *
              </label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 20))}
                disabled={!isNew || isSystemRow}
                placeholder="RV"
                className={cn('h-9 text-sm', codeError && 'border-destructive')}
              />
              {codeError && <p className="mt-0.5 text-[10px] text-destructive">{codeError}</p>}
              {!isNew && <p className="mt-0.5 text-[10px] text-muted-foreground">لا يمكن تغيير الكود بعد الإنشاء</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">
                الاسم العربي *
              </label>
              <Input
                value={nameAr}
                onChange={e => setNameAr(e.target.value.slice(0, 150))}
                placeholder="سند قبض"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] text-muted-foreground">
                الاسم الإنجليزي
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
                ترتيب العرض
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
              الوصف
            </label>
            <Input
              value={description ?? ''}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder="استلام نقدي من العملاء أو الإيرادات"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold text-primary">الحسابات الافتراضية (اختياري)</div>
            <p className="text-[10px] text-muted-foreground">
              عند إنشاء قيد بهذا النوع، تُملأ الحسابات تلقائياً من هذه الإعدادات.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] text-emerald-300">
                  <ArrowDownLeft className="h-3 w-3" />
                  حساب المدين الافتراضي
                </label>
                <AccountPicker
                  accounts={accounts}
                  value={debitAccountId}
                  initialLabel={
                    debitAccount ? `${debitAccount.code} - ${debitAccount.nameAr}` : undefined
                  }
                  onChange={id => setDebitAccountId(id)}
                  allowClear
                  placeholder="اختر حساباً..."
                  inputHeight={9}
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] text-amber-300">
                  <ArrowUpRight className="h-3 w-3" />
                  حساب الدائن الافتراضي
                </label>
                <AccountPicker
                  accounts={accounts}
                  value={creditAccountId}
                  initialLabel={
                    creditAccount ? `${creditAccount.code} - ${creditAccount.nameAr}` : undefined
                  }
                  onChange={id => setCreditAccountId(id)}
                  allowClear
                  placeholder="اختر حساباً..."
                  inputHeight={9}
                />
              </div>
            </div>

            {sameAccountError && (
              <p className="text-[10px] text-destructive">{sameAccountError}</p>
            )}
          </div>

          <div className="space-y-1.5 rounded-md border border-border bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold text-primary">طبيعة وعرض السند</div>
            <p className="text-[10px] text-muted-foreground">
              طبيعة السند تحدّد سلوك صفحة "السند المستقل": أيّ طرف يكون مديناً وأيّ يكون دائناً.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">طبيعة السند</label>
                <select
                  value={nature}
                  onChange={e => setNature(e.target.value as VoucherNature)}
                  className="h-9 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm"
                >
                  <option value="Mixed">مختلط (يدوي بالكامل)</option>
                  <option value="Debit">مدين (مثل سند قبض)</option>
                  <option value="Credit">دائن (مثل سند دفع)</option>
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
                    إظهار كصفحة مستقلة في القائمة الجانبية
                    {nature === 'Mixed' && (
                      <span className="block text-[10px] text-muted-foreground">
                        نوع مختلط: ستفتح بتصميم القيود اليومية (متعدد البنود)
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
            <span>متاح للاستخدام في القيود الجديدة</span>
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
