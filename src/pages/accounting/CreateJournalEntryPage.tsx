import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Save, Search, Trash2, ArrowRight,
  AlertTriangle, BookOpen, X, CheckCircle2, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  accountingApi,
  type JournalEntryType,
  type PostJournalEntryPayload,
  type UpdateJournalEntryPayload,
} from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { currenciesApi } from '@/lib/api/currencies';
import { journalVoucherTypesApi, type JournalVoucherTypeDto } from '@/lib/api/journalVoucherTypes';
import { printSingleJournalEntry } from '@/lib/printUtils';
import { formatAmount, cn, extractApiError } from '@/lib/utils';
import type { AccountDto } from '@/types/api';

interface FormLine {
  uid: string;
  accountId: number | null;
  accountCode?: string;
  accountName?: string;
  isDebit: boolean;
  amount: number;
  description: string;
}

/** قائمة احتياطية لتُعرض حتى ينتهي تحميل العملات من الإعدادات */
const FALLBACK_CURRENCIES = [
  { code: 'IQD', label: 'دينار عراقي' },
  { code: 'USD', label: 'دولار أمريكي' },
  { code: 'EUR', label: 'يورو' },
  { code: 'SAR', label: 'ريال سعودي' },
  { code: 'AED', label: 'درهم إماراتي' },
];

const ENTRY_TYPES: Array<{ value: JournalEntryType; label: string; hint: string }> = [
  { value: 1, label: 'طبيعي', hint: 'قيد محاسبي عادي' },
  { value: 2, label: 'افتتاحي', hint: 'قيد افتتاح الفترة' },
];

function newLine(isDebit = true): FormLine {
  return {
    uid: Math.random().toString(36).slice(2, 10),
    accountId: null,
    isDebit,
    amount: 0,
    description: '',
  };
}

// ── Flatten الشجرة إلى قائمة الحسابات الفرعية (Leaf فقط — التي تقبل قيوداً)
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

interface CreateJournalEntryPageProps {
  /** عند true: عرض القيد فقط بدون أزرار/إمكانية الحفظ والتعديل */
  viewOnly?: boolean;
}

export function CreateJournalEntryPage({ viewOnly = false }: CreateJournalEntryPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id: idParam } = useParams<{ id: string }>();
  const editId = idParam ? Number(idParam) : null;
  const isEdit = editId !== null && !Number.isNaN(editId);
  const isView = viewOnly && isEdit;

  /**
   * عند فتح الصفحة من زر "أصل القيد" في كشف الحساب، يصل state يحتوي
   * مسار الرجوع المخصص. نستخدمه لإظهار زر "رجوع لكشف الحساب" بدل
   * الرجوع الافتراضي لقائمة القيود، ولاستئناف نفس النتائج بعد الحفظ.
   */
  const returnState = (location.state as
    | { returnTo?: string; returnLabel?: string }
    | null) ?? null;
  const backHref = returnState?.returnTo || '/accounting/journal';
  const backLabel = returnState?.returnLabel
    ? `رجوع إلى ${returnState.returnLabel}`
    : 'رجوع';
  const backShort = returnState?.returnLabel || 'رجوع';

  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('IQD');
  const [entryType, setEntryType] = useState<JournalEntryType>(1);
  const [voucherTypeId, setVoucherTypeId] = useState<number | null>(null);
  const [postImmediately, setPostImmediately] = useState(true);
  const [lines, setLines] = useState<FormLine[]>([newLine(true), newLine(false)]);
  const [error, setError] = useState<string | null>(null);
  const voucherTypeAppliedRef = useRef<number | null>(null);

  // ── جلب الحسابات
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });

  const leafAccounts = useMemo(
    () => (treeQuery.data ? flattenLeafAccounts(treeQuery.data) : []),
    [treeQuery.data]
  );

  // ── جلب العملات المُفعَّلة بترتيبها من الإعدادات
  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 60_000,
  });
  const CURRENCIES = useMemo(() => {
    const list = currenciesQuery.data ?? [];
    if (list.length === 0) return FALLBACK_CURRENCIES;
    return list.map(c => ({ code: c.code, label: c.nameAr || c.code }));
  }, [currenciesQuery.data]);

  // ── جلب أنواع السندات المفعّلة
  const voucherTypesQuery = useQuery({
    queryKey: ['journal-voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });
  const voucherTypes = voucherTypesQuery.data ?? [];
  const selectedVoucherType: JournalVoucherTypeDto | null = useMemo(
    () => (voucherTypeId ? voucherTypes.find(v => v.id === voucherTypeId) ?? null : null),
    [voucherTypeId, voucherTypes]
  );

  // ── إذا تعديل، اجلب القيد
  const editQuery = useQuery({
    queryKey: ['journal-entry', editId],
    queryFn: () => accountingApi.getJournalEntryById(editId!),
    enabled: isEdit,
  });

  // ── إعدادات الشركة (للطباعة)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isEdit || !editQuery.data) return;
    const e = editQuery.data;
    setEntryDate(e.entryDate.slice(0, 10));
    setDescription(e.description);
    setCurrency(e.currency || 'IQD');
    setEntryType(e.entryType === 'Opening' ? 2 : 1);
    setVoucherTypeId(e.voucherTypeId ?? null);
    voucherTypeAppliedRef.current = e.voucherTypeId ?? null; // تجنّب إعادة ملء الأسطر للمحفوظ
    setPostImmediately(e.status !== 'Draft' ? true : true);
    setLines(
      e.lines.map(l => ({
        uid: Math.random().toString(36).slice(2, 10),
        accountId: l.accountId,
        accountName: l.accountName ?? undefined,
        isDebit: l.isDebit,
        amount: l.amount,
        description: l.description ?? '',
      }))
    );
  }, [isEdit, editQuery.data]);

  const totalDebit = useMemo(
    () => lines.filter(l => l.isDebit).reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines]
  );
  const totalCredit = useMemo(
    () => lines.filter(l => !l.isDebit).reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines]
  );
  const isBalanced = useMemo(
    () => Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0,
    [totalDebit, totalCredit]
  );

  const updateLine = (uid: string, patch: Partial<FormLine>) => {
    setLines(prev => prev.map(l => (l.uid === uid ? { ...l, ...patch } : l)));
  };

  /**
   * عند اختيار نوع السند: نملأ الحسابين الافتراضيين (مدين/دائن) في أوّل سطرين فارغين.
   * لا نلمس الأسطر التي يدوياً تم اختيار حساب فيها أو التي تحوي مبلغًا.
   * نستخدم ref لتجنّب إعادة الملء عند كل re-render، فقط عند تغيير قيمة النوع فعليًا.
   */
  useEffect(() => {
    if (isView) return;
    if (voucherTypeAppliedRef.current === voucherTypeId) return;
    voucherTypeAppliedRef.current = voucherTypeId;
    if (!selectedVoucherType) return;
    setLines(prev => {
      const next = [...prev];
      const tryFill = (
        accountId: number | null | undefined,
        accountName: string | null | undefined,
        accountCode: string | null | undefined,
        wantDebit: boolean,
      ) => {
        if (!accountId) return;
        const idx = next.findIndex(
          l => l.isDebit === wantDebit && !l.accountId && (!l.amount || l.amount <= 0),
        );
        if (idx === -1) return;
        const label = accountCode && accountName
          ? `${accountCode} - ${accountName}`
          : (accountName || accountCode || '');
        next[idx] = {
          ...next[idx],
          accountId,
          accountName: label,
          accountCode: accountCode ?? undefined,
        };
      };
      tryFill(
        selectedVoucherType.defaultDebitAccountId ?? null,
        selectedVoucherType.defaultDebitAccountName ?? null,
        selectedVoucherType.defaultDebitAccountCode ?? null,
        true,
      );
      tryFill(
        selectedVoucherType.defaultCreditAccountId ?? null,
        selectedVoucherType.defaultCreditAccountName ?? null,
        selectedVoucherType.defaultCreditAccountCode ?? null,
        false,
      );
      return next;
    });
  }, [voucherTypeId, selectedVoucherType, isView]);

  const removeLine = (uid: string) => {
    setLines(prev => (prev.length <= 2 ? prev : prev.filter(l => l.uid !== uid)));
  };

  const addLine = (isDebit: boolean) => {
    setLines(prev => [...prev, newLine(isDebit)]);
  };

  // ── الحفظ
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: PostJournalEntryPayload | UpdateJournalEntryPayload = {
        entryDate: new Date(entryDate).toISOString(),
        description: description.trim(),
        entryType,
        currency,
        postImmediately,
        voucherTypeId: voucherTypeId ?? null,
        lines: lines.map(l => ({
          accountId: l.accountId!,
          isDebit: l.isDebit,
          amount: Number(l.amount),
          description: l.description?.trim() || null,
        })),
      };
      if (isEdit) {
        return accountingApi.updateJournalEntry(editId!, payload as UpdateJournalEntryPayload);
      }
      return accountingApi.postJournalEntry(payload as PostJournalEntryPayload);
    },
    onSuccess: res => {
      if (!res.success) {
        const msg = extractApiError(res, 'تعذّر حفظ القيد');
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(isEdit ? 'تم تعديل القيد' : 'تم حفظ القيد');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      navigate(backHref);
    },
    onError: (err: any) => {
      const msg = extractApiError(err, 'فشل حفظ القيد');
      setError(msg);
      toast.error(msg);
    },
  });

  const validate = (): string | null => {
    if (lines.length < 2) return 'القيد لازم سطرين على الأقل';
    for (const l of lines) {
      if (!l.accountId) return 'بعض الأسطر بدون حساب';
      if (!l.amount || l.amount <= 0) return 'كل سطر لازم يحوي مبلغ أكبر من صفر';
    }
    if (!isBalanced) return 'القيد غير متوازن، لازم مجموع المدين = مجموع الدائن';
    return null;
  };

  const handleSave = () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      toast.error(v);
      return;
    }
    saveMutation.mutate();
  };

  const handlePrint = async () => {
    if (!isEdit || !editId) return;
    try {
      const fresh = await accountingApi.getJournalEntryById(editId);
      printSingleJournalEntry(fresh, companyQuery.data ?? null);
    } catch {
      if (editQuery.data) {
        printSingleJournalEntry(editQuery.data, companyQuery.data ?? null);
      } else {
        toast.error('تعذّر تحميل القيد للطباعة');
      }
    }
  };

  if (treeQuery.isLoading || (isEdit && editQuery.isLoading)) {
    return <LoadingSpinner text="تحميل البيانات..." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* شريط أدوات علوي مدمج */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={returnState?.returnTo ? 'default' : 'outline'}
            size="sm"
            onClick={() => navigate(backHref)}
            className={cn(
              'h-8 gap-1 px-2',
              returnState?.returnTo && 'gap-1.5 bg-primary/90 hover:bg-primary'
            )}
            title={backLabel}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>{backShort}</span>
          </Button>
          <h1 className="flex items-center gap-1.5 text-base font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            {isView ? 'عرض القيد' : (isEdit ? 'تعديل قيد' : 'إنشاء قيد')}
            {isEdit && editQuery.data?.entryNumber && (
              <span className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                {editQuery.data.entryNumber}
              </span>
            )}
            {isView && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                للقراءة فقط
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              title="طباعة القيد"
              className="h-8 gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة
            </Button>
          )}
          {isView && editId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/accounting/journal/${editId}/edit`)}
              className="h-8 gap-1.5"
              title="فتح القيد للتعديل"
            >
              <BookOpen className="h-3.5 w-3.5" />
              تعديل
            </Button>
          )}
          {!isView && (
            <label className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={postImmediately}
                onChange={e => setPostImmediately(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>ترحيل فوري</span>
            </label>
          )}
          {!isView && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || !isBalanced}
              className="h-8 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ القيد'}
            </Button>
          )}
        </div>
      </div>

      {/* رأس القيد - سطر واحد */}
      <div className={cn(
        'grid gap-2 rounded-md border border-border bg-card/50 p-2 md:grid-cols-12',
        isView && 'opacity-95'
      )}>
        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">التاريخ</Label>
          <Input
            type="date"
            value={entryDate}
            onChange={e => setEntryDate(e.target.value)}
            className="h-8 text-xs"
            readOnly={isView}
            disabled={isView}
          />
        </div>

        <div className="md:col-span-3">
          <Label className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>نوع السند</span>
            {selectedVoucherType?.code && (
              <span className="num-display rounded bg-primary/15 px-1 py-0.5 text-[9px] text-primary">
                {selectedVoucherType.code}
              </span>
            )}
          </Label>
          <select
            value={voucherTypeId ?? ''}
            onChange={e => {
              const v = e.target.value;
              setVoucherTypeId(v === '' ? null : Number(v));
            }}
            disabled={isView}
            className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-90"
            title={selectedVoucherType?.description ?? undefined}
          >
            <option value="">— بدون نوع سند —</option>
            {voucherTypes.map(v => (
              <option key={v.id} value={v.id}>{v.nameAr}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">العملة</Label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            disabled={isView}
            className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-90"
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">نوع القيد</Label>
          <select
            value={entryType}
            onChange={e => setEntryType(Number(e.target.value) as JournalEntryType)}
            disabled={isView}
            className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-90"
          >
            {ENTRY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <Label className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>البيان (اختياري)</span>
            <span className="num-display">{description.length}/200</span>
          </Label>
          <Input
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 200))}
            maxLength={200}
            placeholder="بيان القيد العام..."
            className="h-8 text-xs"
            readOnly={isView}
            disabled={isView}
          />
        </div>
      </div>

      {/* البنود - يأخذ كامل المساحة المتبقية */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span>بنود القيد</span>
            <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {lines.length} بند
            </span>
          </div>
          {!isView && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => addLine(true)} className="h-7 gap-1 px-2 text-xs">
                <Plus className="h-3 w-3" />
                إضافة سطر
              </Button>
            </div>
          )}
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto',
            isView && 'pointer-events-none select-none opacity-95'
          )}
          aria-disabled={isView || undefined}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-secondary/60 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="w-10 p-1.5 text-center">#</th>
                <th className="p-1.5 text-right">الحساب</th>
                <th className="p-1.5 text-right">البيان</th>
                <th className="w-28 p-1.5 text-left">مدين</th>
                <th className="w-28 p-1.5 text-left">دائن</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <LineRow
                  key={line.uid}
                  index={idx + 1}
                  line={line}
                  accounts={leafAccounts}
                  onChange={patch => updateLine(line.uid, patch)}
                  onRemove={() => removeLine(line.uid)}
                  canRemove={!isView && lines.length > 2}
                  currency={currency}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* شريط المجاميع */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">المدين:</span>
              <span className="num-display font-semibold text-emerald-400">
                {formatAmount(totalDebit)} {currency}
              </span>
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">الدائن:</span>
              <span className="num-display font-semibold text-rose-400">
                {formatAmount(totalCredit)} {currency}
              </span>
            </span>
            <span className="h-3.5 w-px bg-border" />
            {isBalanced ? (
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                متوازن
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                فرق: <span className="num-display">{formatAmount(Math.abs(totalDebit - totalCredit))}</span>
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-destructive/20">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// صف بند مع AccountPicker
// ─────────────────────────────────────────
function LineRow({
  index, line, accounts, onChange, onRemove, canRemove,
}: {
  index: number;
  line: FormLine;
  accounts: AccountDto[];
  onChange: (patch: Partial<FormLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
  currency?: string;
}) {
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/20">
      <td className="p-1 text-center text-xs text-muted-foreground">{index}</td>
      <td className="p-1 align-top">
        <AccountPicker
          accounts={accounts}
          value={line.accountId}
          initialLabel={
            line.accountName ||
            (line.accountId
              ? accounts.find(a => a.id === line.accountId)?.code +
                ' - ' +
                accounts.find(a => a.id === line.accountId)?.nameAr
              : '')
          }
          onChange={(id, label) => onChange({ accountId: id, accountName: label })}
        />
      </td>
      <td className="p-1 align-top">
        <Input
          value={line.description}
          onChange={e => onChange({ description: e.target.value.slice(0, 150) })}
          maxLength={150}
          placeholder="بيان البند (اختياري)"
          className="h-8 text-xs"
          title={line.description}
        />
      </td>
      <td className="p-1 align-top">
        <AmountInput
          value={line.isDebit ? line.amount : 0}
          active={line.isDebit}
          onChange={n => onChange({ isDebit: true, amount: n })}
          onFocus={() => !line.isDebit && onChange({ isDebit: true, amount: 0 })}
          className={cn('border-emerald-500/50', !line.isDebit && 'opacity-50')}
        />
      </td>
      <td className="p-1 align-top">
        <AmountInput
          value={!line.isDebit ? line.amount : 0}
          active={!line.isDebit}
          onChange={n => onChange({ isDebit: false, amount: n })}
          onFocus={() => line.isDebit && onChange({ isDebit: false, amount: 0 })}
          className={cn('border-rose-500/50', line.isDebit && 'opacity-50')}
        />
      </td>
      <td className="p-1 align-top">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
          title="حذف البند"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────
// AmountInput — يدعم 0.5 و 0.05 وكل القيم العشرية بحرية
// يحتفظ بنص العرض داخلياً ولا يُحوِّله إلى رقم إلا عند الحاجة
// ─────────────────────────────────────────
function AmountInput({
  value,
  active,
  onChange,
  onFocus,
  className,
}: {
  value: number;
  active: boolean;
  onChange: (n: number) => void;
  onFocus?: () => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(value > 0 ? String(value) : '');
  const editingRef = useRef(false);

  // مزامنة عند تغيير value من الخارج (مثلاً عند تحميل قيد للتعديل أو تبديل مدين/دائن)
  useEffect(() => {
    if (editingRef.current) return;
    const cur = parseFloat(text) || 0;
    if (Math.abs(cur - value) > 0.0000001) {
      setText(value > 0 ? String(value) : '');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // إذا غير-active نظِّف النص (للسطر الجانب الآخر)
  useEffect(() => {
    if (!active) setText('');
  }, [active]);

  const handleChange = (raw: string) => {
    // اسمح بـ: فارغ | رقم | نقطة | كسر عشري بأي عدد منازل
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      editingRef.current = true;
      setText(raw);
      const n = raw === '' || raw === '.' ? 0 : parseFloat(raw);
      onChange(Number.isNaN(n) ? 0 : n);
    }
  };

  const handleBlur = () => {
    editingRef.current = false;
    // طبِّع: أزل النقاط الزائدة في النهاية
    if (text.endsWith('.')) {
      setText(text.slice(0, -1));
    }
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={active ? text : ''}
      onChange={e => handleChange(e.target.value)}
      onFocus={onFocus}
      onBlur={handleBlur}
      placeholder="—"
      className={cn('h-8 text-left num-display text-xs', className)}
    />
  );
}

// ─────────────────────────────────────────
// AccountPicker — Combobox: input مباشر + بحث فوري
// ─────────────────────────────────────────
function AccountPicker({
  accounts,
  value,
  initialLabel,
  onChange,
}: {
  accounts: AccountDto[];
  value: number | null;
  initialLabel?: string;
  onChange: (id: number, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // النص الافتراضي عند عدم التركيز (الحساب المختار حالياً)
  const selectedLabel = useMemo(() => {
    if (initialLabel) return initialLabel;
    if (value) {
      const a = accounts.find(x => x.id === value);
      return a ? `${a.code} - ${a.nameAr}` : '';
    }
    return '';
  }, [value, accounts, initialLabel]);

  // النتائج المرتّبة: تطابق تام → بدء الكود → بدء الاسم → احتواء
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 60);

    const exact: AccountDto[] = [];
    const startsCode: AccountDto[] = [];
    const startsName: AccountDto[] = [];
    const contains: AccountDto[] = [];

    for (const a of accounts) {
      const code = (a.code ?? '').toLowerCase();
      const name = (a.nameAr ?? '').toLowerCase();
      if (code === q) exact.push(a);
      else if (code.startsWith(q)) startsCode.push(a);
      else if (name.startsWith(q)) startsName.push(a);
      else if (code.includes(q) || name.includes(q)) contains.push(a);
    }
    return [...exact, ...startsCode, ...startsName, ...contains].slice(0, 60);
  }, [accounts, query]);

  // إغلاق عند النقر خارج الحقل
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // إعادة تعيين highlight عند تغيير النتائج
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const select = (a: AccountDto) => {
    onChange(a.id, `${a.code} - ${a.nameAr}`);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = filtered[highlight];
      if (a) select(a);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={open ? query : selectedLabel}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKey}
          placeholder={selectedLabel || 'ابحث برقم أو اسم الحساب...'}
          className={cn('h-8 pr-7 pl-2 text-xs', !value && !open && 'text-muted-foreground')}
        />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[280px] overflow-hidden rounded-md border border-border bg-card shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                لا توجد نتائج لـ "{query}"
              </div>
            ) : (
              filtered.map((a, idx) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    select(a);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-right text-sm transition-colors',
                    idx === highlight ? 'bg-primary/15' : 'hover:bg-secondary/60',
                    a.id === value && 'font-semibold'
                  )}
                >
                  <span className="num-display text-xs text-muted-foreground shrink-0 min-w-[60px]">
                    {a.code}
                  </span>
                  <span className="flex-1 truncate">{a.nameAr}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            {filtered.length} نتيجة • ↑↓ للتنقل • Enter للاختيار
          </div>
        </div>
      )}
    </div>
  );
}
