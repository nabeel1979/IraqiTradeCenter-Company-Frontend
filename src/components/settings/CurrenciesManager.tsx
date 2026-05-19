import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Coins,
  Search,
  Star,
  StarOff,
  Lock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Pencil,
  Plus,
  X,
  Save,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { currenciesApi, type CurrencyDto, type UpsertCurrencyPayload } from '@/lib/api/currencies';

/**
 * إدارة العملات الموحّدة:
 *  - عرض كل العملات من قاعدة البيانات
 *  - تفعيل/تعطيل أي عملة (toggle)
 *  - اختيار العملة الرئيسية (radio)
 *  - رفض تغيير الرئيسية لو كانت مستخدمة في قيود (يأتي الرفض من الـ Backend)
 */
export function CurrenciesManager() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'enabled'>('all');
  const [editing, setEditing] = useState<CurrencyDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const { data: currencies = [], isLoading } = useQuery({
    queryKey: ['currencies', 'all'],
    queryFn: () => currenciesApi.getAll(false),
  });

  const baseCurrency = currencies.find(c => c.isBase) ?? null;
  const enabledCount = currencies.filter(c => c.isEnabled).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return currencies.filter(c => {
      if (showOnly === 'enabled' && !c.isEnabled) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        (c.numericCode ?? '').includes(q) ||
        c.nameAr.toLowerCase().includes(q) ||
        (c.nameEn ?? '').toLowerCase().includes(q)
      );
    });
  }, [currencies, search, showOnly]);

  const toggleM = useMutation({
    mutationFn: ({ code, isEnabled }: { code: string; isEnabled: boolean }) =>
      currenciesApi.toggle(code, isEnabled),
    onSuccess: (_d, vars) => {
      toast.success(vars.isEnabled ? `تم تفعيل ${vars.code}` : `تم تعطيل ${vars.code}`);
      qc.invalidateQueries({ queryKey: ['currencies'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'تعذّر تحديث حالة العملة');
    },
  });

  const setBaseM = useMutation({
    mutationFn: (code: string) => currenciesApi.setBase(code),
    onSuccess: (_d, code) => {
      toast.success(`تم تعيين ${code} كعملة رئيسية`);
      qc.invalidateQueries({ queryKey: ['currencies'] });
      qc.invalidateQueries({ queryKey: ['company-settings'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'تعذّر تغيير العملة الرئيسية');
    },
  });

  const moveM = useMutation({
    mutationFn: ({ code, direction }: { code: string; direction: 'up' | 'down' }) =>
      currenciesApi.move(code, direction),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currencies'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'تعذّر تحريك العملة');
    },
  });

  return (
    <div className="space-y-3">
      {/* شريط الحالة */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs">
          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
          <span className="text-muted-foreground">العملة الرئيسية:</span>
          <span className="font-bold text-primary">
            {baseCurrency ? `${baseCurrency.code} — ${baseCurrency.nameAr}` : 'غير محددة'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span>المُفعّلة: <span className="font-bold">{enabledCount}</span> / {currencies.length}</span>
        </div>
      </div>

      {/* بحث + فلتر + زر إضافة */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بكود أو رقم أو اسم العملة..."
            className="h-8 pr-8 text-xs"
          />
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-input">
          <button
            type="button"
            onClick={() => setShowOnly('all')}
            className={cn(
              'px-3 py-1 text-xs transition-colors',
              showOnly === 'all'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:bg-secondary/50'
            )}
          >
            الكل ({currencies.length})
          </button>
          <button
            type="button"
            onClick={() => setShowOnly('enabled')}
            className={cn(
              'px-3 py-1 text-xs transition-colors',
              showOnly === 'enabled'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:bg-secondary/50'
            )}
          >
            المُفعّلة ({enabledCount})
          </button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCreatingNew(true)}
          className="h-8 gap-1.5 text-xs"
          title="إضافة عملة جديدة (غير مدرجة)"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة عملة
        </Button>
      </div>

      {/* القائمة */}
      <div className="overflow-hidden rounded-md border border-border">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            لا توجد نتائج {search && `لـ "${search}"`}
          </div>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border/60 overflow-y-auto">
            {filtered.map(c => {
              // استخدم القائمة الكاملة لتحديد الحدود (أول/آخر) لا المفلترة
              const idxAll = currencies.findIndex(x => x.code === c.code);
              const canMoveUp = idxAll > 0;
              const canMoveDown = idxAll >= 0 && idxAll < currencies.length - 1;
              return (
                <CurrencyRow
                  key={c.code}
                  currency={c}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onToggle={isEnabled => toggleM.mutate({ code: c.code, isEnabled })}
                  onSetBase={() => {
                    if (c.isBase) return;
                    if (!c.isEnabled) {
                      toast.info('سيتم تفعيل العملة تلقائياً قبل تعيينها كرئيسية');
                    }
                    setBaseM.mutate(c.code);
                  }}
                  onMove={dir => moveM.mutate({ code: c.code, direction: dir })}
                  onEdit={() => setEditing(c)}
                  disabled={toggleM.isPending || setBaseM.isPending || moveM.isPending}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="text-muted-foreground">
          ملاحظة: لا يمكن تعطيل عملة مرتبطة بقيود محاسبية أو تغيير العملة الرئيسية إذا كانت مستخدمة في قيود.
          عليك أولاً حذف/تفريغ تلك القيود ثم إعادة المحاولة.
        </span>
      </div>

      {(editing || creatingNew) && (
        <CurrencyEditDialog
          currency={editing}
          existingCodes={currencies.map(c => c.code)}
          onClose={() => {
            setEditing(null);
            setCreatingNew(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreatingNew(false);
            qc.invalidateQueries({ queryKey: ['currencies'] });
          }}
        />
      )}
    </div>
  );
}

function CurrencyRow({
  currency,
  canMoveUp,
  canMoveDown,
  onToggle,
  onSetBase,
  onMove,
  onEdit,
  disabled,
}: {
  currency: CurrencyDto;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (isEnabled: boolean) => void;
  onSetBase: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onEdit: () => void;
  disabled: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 px-3 py-2 transition-colors',
        currency.isBase && 'bg-primary/5',
        !currency.isEnabled && 'opacity-60'
      )}
    >
      {/* Toggle Enabled */}
      <button
        type="button"
        onClick={() => onToggle(!currency.isEnabled)}
        disabled={disabled || currency.isBase}
        title={
          currency.isBase
            ? 'لا يمكن تعطيل العملة الرئيسية'
            : currency.isEnabled
              ? 'تعطيل'
              : 'تفعيل'
        }
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors',
          currency.isEnabled
            ? 'border-success/40 bg-success/10 text-success hover:bg-success/20'
            : 'border-input bg-secondary/40 text-muted-foreground hover:bg-secondary',
          (disabled || currency.isBase) && 'cursor-not-allowed opacity-50'
        )}
      >
        {currency.isEnabled ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      </button>

      {/* Code (alpha) + numeric ISO + Symbol */}
      <div className="flex items-center gap-1.5 w-[170px] shrink-0">
        <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[11px] font-bold tnum">{currency.code}</span>
        {currency.numericCode ? (
          <span
            className="rounded border border-border/60 bg-background px-1 py-0.5 text-[10px] tnum text-muted-foreground"
            title="الرقم العالمي ISO 4217"
          >
            {currency.numericCode}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/50" title="الرقم العالمي غير محدد">—</span>
        )}
        {currency.symbol && (
          <span className="text-xs text-muted-foreground">{currency.symbol}</span>
        )}
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {currency.nameAr}
          <span className="ms-2 text-[10px] text-muted-foreground">
            ({currency.decimalPlaces} عشري{currency.decimalPlaces === 1 ? '' : 'ة'})
          </span>
        </div>
        {currency.nameEn && (
          <div className="truncate text-[10.5px] text-muted-foreground" dir="ltr">
            {currency.nameEn}
          </div>
        )}
      </div>

      {/* Reorder up/down */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => canMoveUp && onMove('up')}
          disabled={disabled || !canMoveUp}
          title="تقديم في الترتيب"
          aria-label={`تقديم ${currency.code}`}
          className={cn(
            'grid h-3.5 w-7 place-items-center rounded border transition-colors',
            canMoveUp && !disabled
              ? 'border-input text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'
              : 'border-input opacity-30'
          )}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => canMoveDown && onMove('down')}
          disabled={disabled || !canMoveDown}
          title="تأخير في الترتيب"
          aria-label={`تأخير ${currency.code}`}
          className={cn(
            'grid h-3.5 w-7 place-items-center rounded border transition-colors',
            canMoveDown && !disabled
              ? 'border-input text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'
              : 'border-input opacity-30'
          )}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Edit */}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        title="تعديل بيانات العملة"
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors',
          'border-input text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* Base button */}
      <button
        type="button"
        onClick={onSetBase}
        disabled={disabled || currency.isBase}
        title={
          currency.isBase
            ? 'هذه العملة الرئيسية حالياً'
            : 'تعيين كعملة رئيسية'
        }
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
          currency.isBase
            ? 'cursor-default border-primary/40 bg-primary/15 text-primary'
            : disabled
              ? 'cursor-not-allowed border-input opacity-50'
              : 'border-input text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
        )}
      >
        {currency.isBase ? (
          <>
            <Star className="h-3 w-3 fill-primary" />
            <span>الرئيسية</span>
            <Lock className="h-2.5 w-2.5 ms-0.5" />
          </>
        ) : (
          <>
            <StarOff className="h-3 w-3" />
            <span>تعيين كرئيسية</span>
          </>
        )}
      </button>
    </li>
  );
}

// ─────────────────────────────────────────
// Dialog: تعديل/إضافة عملة
// ─────────────────────────────────────────
function CurrencyEditDialog({
  currency,
  existingCodes,
  onClose,
  onSaved,
}: {
  currency: CurrencyDto | null;
  existingCodes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !currency;
  const [code, setCode] = useState(currency?.code ?? '');
  const [numericCode, setNumericCode] = useState(currency?.numericCode ?? '');
  const [nameAr, setNameAr] = useState(currency?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(currency?.nameEn ?? '');
  const [symbol, setSymbol] = useState(currency?.symbol ?? '');
  const [decimalPlaces, setDecimalPlaces] = useState(currency?.decimalPlaces ?? 2);
  const [isEnabled, setIsEnabled] = useState(currency?.isEnabled ?? true);
  const [displayOrder, setDisplayOrder] = useState(currency?.displayOrder ?? 100);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const saveM = useMutation({
    mutationFn: () => {
      const finalCode = code.trim().toUpperCase();
      const payload: UpsertCurrencyPayload = {
        numericCode: numericCode.trim() ? numericCode.trim() : null,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
        symbol: symbol.trim() || null,
        decimalPlaces,
        isEnabled,
        displayOrder,
      };
      return currenciesApi.upsert(finalCode, payload);
    },
    onSuccess: () => {
      toast.success(isNew ? 'تم إضافة العملة' : 'تم تحديث بيانات العملة');
      onSaved();
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'تعذّر حفظ العملة');
    },
  });

  const codeError = (() => {
    if (!isNew) return null;
    const c = code.trim().toUpperCase();
    if (!c) return 'كود العملة مطلوب';
    if (c.length > 10) return 'الكود طويل (1–10 أحرف)';
    if (existingCodes.map(x => x.toUpperCase()).includes(c)) return 'هذا الكود مستخدم بالفعل';
    return null;
  })();

  const numericError = (() => {
    const n = numericCode.trim();
    if (!n) return null;
    if (n.length > 3 || !/^\d{1,3}$/.test(n)) return 'يجب أن يكون 1–3 أرقام فقط';
    return null;
  })();

  const canSave =
    !saveM.isPending &&
    !codeError &&
    !numericError &&
    nameAr.trim().length > 0 &&
    decimalPlaces >= 0 &&
    decimalPlaces <= 6;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl" dir="rtl">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {isNew ? <Plus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />}
            {isNew ? 'إضافة عملة جديدة' : `تعديل عملة: ${currency?.code}`}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                الكود الحرفي (ISO 4217) *
              </label>
              <Input
                value={code}
                onChange={e => isNew && setCode(e.target.value.toUpperCase().slice(0, 10))}
                disabled={!isNew}
                placeholder="مثل: USD"
                className={cn('h-8 text-xs uppercase', codeError && 'border-destructive')}
                dir="ltr"
              />
              {codeError && <p className="mt-0.5 text-[10px] text-destructive">{codeError}</p>}
              {!isNew && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">لا يمكن تغيير الكود لعملة قائمة</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                الرقم العالمي (ISO 4217 Numeric)
              </label>
              <Input
                value={numericCode}
                onChange={e => setNumericCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="مثل: 840"
                className={cn('h-8 text-xs tnum', numericError && 'border-destructive')}
                dir="ltr"
                maxLength={3}
              />
              {numericError && <p className="mt-0.5 text-[10px] text-destructive">{numericError}</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">الاسم بالعربية *</label>
              <Input
                value={nameAr}
                onChange={e => setNameAr(e.target.value.slice(0, 100))}
                placeholder="الدولار الأمريكي"
                className="h-8 text-xs"
                maxLength={100}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">الاسم بالإنجليزية</label>
              <Input
                value={nameEn}
                onChange={e => setNameEn(e.target.value.slice(0, 100))}
                placeholder="US Dollar"
                className="h-8 text-xs"
                dir="ltr"
                maxLength={100}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">الرمز</label>
              <Input
                value={symbol}
                onChange={e => setSymbol(e.target.value.slice(0, 10))}
                placeholder="$"
                className="h-8 text-center text-xs"
                maxLength={10}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                المراتب العشرية
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={decimalPlaces}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) setDecimalPlaces(Math.max(0, Math.min(6, n)));
                  }}
                  className="h-8 text-center text-xs tnum"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">0–6 (مثلاً 0 لـ IQD، 3 لـ KWD)</p>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">ترتيب العرض</label>
              <Input
                type="number"
                value={displayOrder}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n)) setDisplayOrder(n);
                }}
                className="h-8 text-center text-xs tnum"
              />
            </div>
          </div>

          {isNew && (
            <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-2 text-xs">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={e => setIsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>تفعيل العملة فور إنشائها</span>
            </label>
          )}

          {/* معاينة المراتب العشرية */}
          <div className="rounded-md border border-border/60 bg-secondary/20 p-2.5">
            <div className="text-[10.5px] text-muted-foreground">معاينة الأرقام:</div>
            <div className="mt-1 flex items-center gap-3 text-sm tnum">
              <span>{(1234.5678).toLocaleString('en-US', {
                minimumFractionDigits: decimalPlaces,
                maximumFractionDigits: decimalPlaces,
              })}</span>
              {symbol && <span className="text-muted-foreground">{symbol}</span>}
              {(code.trim() || currency?.code) && (
                <span className="text-[10px] text-muted-foreground">{code.trim() || currency?.code}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/10 px-4 py-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>إلغاء</Button>
          <Button
            type="button"
            size="sm"
            onClick={() => saveM.mutate()}
            disabled={!canSave}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saveM.isPending ? 'جارٍ الحفظ...' : (isNew ? 'إضافة' : 'حفظ التعديلات')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Coins };
