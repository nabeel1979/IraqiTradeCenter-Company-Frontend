/**
 * ميزان المراجعة (Trial Balance) — احترافي وموسَّع.
 *
 * يدعم:
 *   • الفترات (presets + مدى يدوي) — يأخذ السنة المالية كافتراضي.
 *   • العملات: عرض عملة واحدة بمبالغها الأصلية أو "الكل + التقويم بالعملة الأساسية" (نشرة الأسعار).
 *   • مستويات شجرة الحسابات (1..5) — يُقيّد العمق المعروض.
 *   • "الأبناء فقط" (Leaves only) — يُخفي حسابات المجموعات والأمّهات.
 *   • تبديل سريع لمبالغ مُقوَّمة بالعملة الأساسية (يستخدم نشرة الأسعار المنشورة).
 *
 * الأعمدة:
 *   الكود | الحساب |
 *   مدين الفترة السابقة | دائن الفترة السابقة |
 *   مدين الفترة الحالية | دائن الفترة الحالية |
 *   رصيد مدين | رصيد دائن
 *
 * بطاقة "طريقة احتساب الأرباح" تشرح كيف يُولَّد صافي الربح:
 *   Net Income = Σ(دائن − مدين) لحسابات الإيرادات
 *              − Σ(مدين − دائن) لحسابات المصاريف
 */
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calculator, Download, Layers, Coins, TrendingUp, TrendingDown,
  Info, AlertTriangle, Printer, FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { accountingApi } from '@/lib/api/accounting';
import { currenciesApi } from '@/lib/api/currencies';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { companySettingsApi } from '@/lib/api/companySettings';
import { printTrialBalance } from '@/lib/printUtils';
import { formatAmount, cn } from '@/lib/utils';

const MAX_LEVELS = 5;

/** يحوّل تاريخاً إلى YYYY-MM-DD بالتوقيت المحلي */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ترجمات أنواع الحسابات للعرض */
const TYPE_LABELS: Record<string, string> = {
  Asset: 'أصول',
  Liability: 'خصوم',
  Equity: 'حقوق ملكية',
  Revenue: 'إيرادات',
  Expense: 'مصاريف',
};

const TYPE_COLORS: Record<string, string> = {
  Asset: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  Liability: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Equity: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  Revenue: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Expense: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

/** تنسيق رقم محاسبي: 0 → "—"، السالب بين قوسين */
function fmt(n: number): string {
  if (!n || Math.abs(n) < 0.005) return '—';
  return formatAmount(n, 2);
}

export function TrialBalancePage() {
  // ── العملات (للفلتر) + العملة الأساسية
  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60 * 1000,
  });
  const baseCurrency = useMemo(
    () => currenciesQuery.data?.find(c => c.isBase) ?? null,
    [currenciesQuery.data]
  );
  const enabledCurrencies = currenciesQuery.data ?? [];

  // ── السنة المالية الحالية (لتعيين فترة افتراضية)
  const fiscalQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });
  // ‎الأولوية للسنة النشطة (المُعَلَّمة من قِبل المستخدم)، مع المنطق الاحتياطي
  const currentFY = useMemo(() => {
    const list = fiscalQuery.data ?? [];
    if (list.length === 0) return null;
    const explicit = list.find(fy => fy.isActive);
    if (explicit) return explicit;
    const today = toISODate(new Date());
    const openContainsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e && !fy.isClosed;
    });
    if (openContainsToday) return openContainsToday;
    const newestOpen = [...list]
      .filter(fy => !fy.isClosed)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
    if (newestOpen) return newestOpen;
    const closedContainsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e;
    });
    if (closedContainsToday) return closedContainsToday;
    return [...list].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0] ?? null;
  }, [fiscalQuery.data]);

  // ── الحالة (Filters)
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [currency, setCurrency] = useState<string>(''); // "" = الكل
  // مفعَّل افتراضياً: المستخدمون عادةً يريدون عرضاً موحَّداً بالعملة الأساسية،
  // ويُلغى تلقائياً إذا اختار المستخدم عملة بعينها (لا داعي للتقويم حينها).
  const [valuated, setValuated] = useState<boolean>(true);
  const [maxLevel, setMaxLevel] = useState<number | ''>('');
  const [leavesOnly, setLeavesOnly] = useState<boolean>(true);
  const [includeDraft, setIncludeDraft] = useState<boolean>(false);

  // إعدادات الشركة (للوكو/الترويسة على نافذة الطباعة)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 10 * 60 * 1000,
  });

  // ضبط الفترة الافتراضية على السنة المالية عند تحميلها:
  // ‎البداية = بداية السنة المالية، النهاية = اليوم دائماً (طلب: "لحد اليوم")
  useEffect(() => {
    if (from && to) return;
    const today = toISODate(new Date());
    if (currentFY) {
      const fyStart = (currentFY.startDate ?? '').slice(0, 10);
      if (fyStart) setFrom(prev => prev || fyStart);
      setTo(prev => prev || today);
    } else {
      const yStart = toISODate(new Date(new Date().getFullYear(), 0, 1));
      setFrom(prev => prev || yStart);
      setTo(prev => prev || today);
    }
  }, [currentFY, from, to]);

  // عند فلترة بعملة واحدة، إيقاف التقويم تلقائياً (المبالغ بالعملة الأصلية فقط)
  useEffect(() => {
    if (currency) setValuated(false);
  }, [currency]);

  // ── جلب البيانات
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['trial-balance', from, to, currency, valuated, maxLevel, leavesOnly, includeDraft],
    queryFn: () => accountingApi.getTrialBalance({
      from, to,
      currency: currency || null,
      valuated,
      maxLevel: maxLevel === '' ? null : Number(maxLevel),
      leavesOnly,
      includeDraft,
    }),
    enabled: !!from && !!to,
  });

  // ── حسابات مشتقة
  const isBalanced = data
    ? Math.abs(data.totalClosingDebit - data.totalClosingCredit) < 0.01
    : false;

  // الوحدة المعروضة (للعنوان والإجماليات)
  const displayUnit = useMemo(() => {
    if (currency) return currency;
    if (valuated) return baseCurrency?.code ?? data?.baseCurrency ?? 'IQD';
    return 'متعددة';
  }, [currency, valuated, baseCurrency, data]);

  const exportCsv = () => {
    if (!data?.rows?.length) return;
    const header = [
      'الكود', 'الحساب', 'النوع', 'المستوى',
      'مدين سابق', 'دائن سابق',
      'مدين حالي', 'دائن حالي',
      'رصيد مدين', 'رصيد دائن',
    ];
    const lines = [
      header,
      ...data.rows.map(r => [
        r.accountCode, r.accountName,
        TYPE_LABELS[r.accountType] ?? r.accountType,
        r.level,
        r.openingDebit, r.openingCredit,
        r.periodDebit, r.periodCredit,
        r.closingDebit, r.closingCredit,
      ]),
      ['', 'الإجمالي', '', '',
        data.totalOpeningDebit, data.totalOpeningCredit,
        data.totalPeriodDebit, data.totalPeriodCredit,
        data.totalClosingDebit, data.totalClosingCredit,
      ],
    ];
    const csv = '\uFEFF' + lines.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-${from}_${to}${currency ? `-${currency}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPage = () => {
    if (!data?.rows?.length) return;
    printTrialBalance(data, companyQuery.data ?? null);
  };

  return (
    <div className="space-y-4">
      {/* ════════════════════════════════════════
           شريط الفلاتر — كل الإعدادات في مكان واحد
         ════════════════════════════════════════ */}
      <Card>
        <CardContent className="space-y-3 p-3">
          {/* صف 1: presets للفترات */}
          <DateRangePresets
            from={from}
            to={to}
            onChange={(f, t) => { setFrom(f); setTo(t); }}
          />

          {/* صف 2: التواريخ + الفلاتر الأخرى */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_140px_140px_auto]">
            <div>
              <Label className="mb-1 text-[11px] text-muted-foreground">من تاريخ</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="mb-1 text-[11px] text-muted-foreground">إلى تاريخ</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Coins className="h-3 w-3" /> العملة
              </Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
              >
                <option value="">كل العملات</option>
                {enabledCurrencies.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Layers className="h-3 w-3" /> مستوى الشجرة
                <span className="ms-1 text-[9px] text-muted-foreground/70">
                  ({maxLevel === '' ? 'الكل' : `≤ ${maxLevel}`})
                </span>
              </Label>
              {/* أزرار سريعة بدل dropdown — أكثر وضوحاً وأسرع في الاستخدام */}
              <div
                role="radiogroup"
                aria-label="مستوى عمق الشجرة"
                className="flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-secondary/40 text-xs"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={maxLevel === ''}
                  onClick={() => setMaxLevel('')}
                  title="عرض جميع المستويات بدون تقييد عمق الشجرة"
                  className={cn(
                    'flex flex-1 items-center justify-center px-2 font-medium transition',
                    maxLevel === ''
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  الكل
                </button>
                {Array.from({ length: MAX_LEVELS }, (_, i) => i + 1).map(lv => (
                  <button
                    key={lv}
                    type="button"
                    role="radio"
                    aria-checked={maxLevel === lv}
                    onClick={() => setMaxLevel(lv)}
                    title={`عرض الحسابات حتى المستوى ${lv} (تجميع الحسابات الأعمق ضمن آبائها)`}
                    className={cn(
                      'flex w-7 items-center justify-center border-r border-input/60 font-semibold tabular-nums transition',
                      maxLevel === lv
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="mb-0 text-[11px] text-muted-foreground">خيارات</Label>
              <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2 text-xs">
                <input
                  type="checkbox"
                  checked={leavesOnly}
                  onChange={e => setLeavesOnly(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                الأبناء فقط
              </label>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 gap-1.5" disabled={!data?.rows?.length}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={printPage} className="h-8 gap-1.5" disabled={!data?.rows?.length}>
                <Printer className="h-3.5 w-3.5" /> طباعة
              </Button>
            </div>
          </div>

          {/* صف 3: مفاتيح تبديل (التقويم بالعملة الأساسية + القيود غير المرحَّلة) */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
            <label
              className={cn(
                'flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                valuated && !currency
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary',
                currency && 'cursor-not-allowed opacity-50'
              )}
              title={currency ? 'التقويم متاح فقط مع "كل العملات"' : 'حوّل المبالغ إلى العملة الأساسية باستخدام نشرة الأسعار'}
            >
              <input
                type="checkbox"
                checked={valuated && !currency}
                onChange={e => setValuated(e.target.checked)}
                disabled={!!currency}
                className="h-3.5 w-3.5"
              />
              مبالغ مُقوَّمة بـ {baseCurrency?.code ?? 'IQD'}
            </label>

            <label
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 text-xs text-muted-foreground hover:bg-secondary"
              title="إظهار القيود التي لم تُرحَّل بعد (Draft) ضمن أرصدة الفترة"
            >
              <input
                type="checkbox"
                checked={includeDraft}
                onChange={e => setIncludeDraft(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              تضمين القيود غير المرحَّلة
            </label>

            {data?.fxBulletinName && (
              <span className="ms-auto rounded-md bg-secondary/60 px-2 py-1 text-[10px] text-muted-foreground">
                نشرة الأسعار: <span className="font-semibold text-foreground">{data.fxBulletinName}</span>
                {data.fxBulletinEffectiveAt && (
                  <span className="text-[10px] text-muted-foreground/80"> · {data.fxBulletinEffectiveAt.slice(0, 10)}</span>
                )}
              </span>
            )}
          </div>

          {data?.fxUsedFallback && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>عملة واحدة على الأقل لا تملك سعر صرف في النشرة المنشورة — استُعمل مضاعف 1 لها (قد لا تكون الأرقام دقيقة).</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════
           المحتوى: حالة التحميل/الخطأ/الجدول
         ════════════════════════════════════════ */}
      {isLoading ? (
        <LoadingSpinner text="جاري حساب الميزان..." />
      ) : isError ? (
        <EmptyState
          icon={Calculator}
          title="تعذّر تحميل الميزان"
          description={(error as Error)?.message ?? 'حدث خطأ في الاتصال بالخادم'}
        />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="لا حركات في الفترة المختارة"
          description="جرّب تغيير الفترة أو إلغاء فلاتر العملة/المستوى/الأبناء فقط"
        />
      ) : (
        <>
          {/* ── جدول الميزان */}
          <Card className="print:shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calculator className="h-4 w-4 text-primary" />
                  ميزان المراجعة
                </CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  من <span className="num-display">{from}</span> إلى <span className="num-display">{to}</span>
                  {' · '}
                  <span className="num-display">{data.rows.length}</span> حساب
                  {' · '}
                  العملة: <span className="font-medium text-foreground">{displayUnit}</span>
                  {data.leavesOnly && ' · الأبناء فقط'}
                  {data.maxLevel != null && ` · حتى مستوى ${data.maxLevel}`}
                </p>
              </div>
              <div>
                {isBalanced ? (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    ✓ متوازن
                  </span>
                ) : (
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">
                    × غير متوازن
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="data-table w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-border/60">
                    <th rowSpan={2} className="sticky right-0 z-10 bg-card text-center align-middle">الكود</th>
                    <th rowSpan={2} className="text-right align-middle">الحساب</th>
                    <th rowSpan={2} className="text-center align-middle">النوع</th>
                    <th colSpan={2} className="border-r border-border/40 bg-secondary/30 text-center">
                      الفترة السابقة (الافتتاحي)
                    </th>
                    <th colSpan={2} className="border-r border-border/40 bg-primary/10 text-center">
                      حركة الفترة الحالية
                    </th>
                    <th colSpan={2} className="border-r border-border/40 bg-amber-500/10 text-center">
                      الرصيد النهائي
                    </th>
                  </tr>
                  <tr className="border-b border-border/60 text-[10px] text-muted-foreground">
                    <th className="border-r border-border/40 bg-secondary/30 text-center">مدين</th>
                    <th className="bg-secondary/30 text-center">دائن</th>
                    <th className="border-r border-border/40 bg-primary/10 text-center">مدين</th>
                    <th className="bg-primary/10 text-center">دائن</th>
                    <th className="border-r border-border/40 bg-amber-500/10 text-center">مدين</th>
                    <th className="bg-amber-500/10 text-center">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.accountId} className={cn(
                      !r.isLeaf && 'font-semibold bg-secondary/20',
                    )}>
                      <td className="sticky right-0 z-10 bg-inherit num-display text-xs text-muted-foreground">
                        {r.accountCode}
                      </td>
                      <td>
                        <span style={{ paddingInlineStart: `${(r.level - 1) * 12}px` }}>
                          {r.accountName}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={cn(
                          'inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-medium',
                          TYPE_COLORS[r.accountType] ?? 'text-muted-foreground bg-secondary/40 border-border'
                        )}>
                          {TYPE_LABELS[r.accountType] ?? r.accountType}
                        </span>
                      </td>
                      <td className="border-r border-border/40 num-display text-left">{fmt(r.openingDebit)}</td>
                      <td className="num-display text-left">{fmt(r.openingCredit)}</td>
                      <td className="border-r border-border/40 num-display text-left">{fmt(r.periodDebit)}</td>
                      <td className="num-display text-left">{fmt(r.periodCredit)}</td>
                      <td className="border-r border-border/40 num-display text-left font-semibold text-emerald-300">{fmt(r.closingDebit)}</td>
                      <td className="num-display text-left font-semibold text-amber-300">{fmt(r.closingCredit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-primary/40 bg-secondary/50 text-sm font-bold">
                  <tr>
                    <td colSpan={3} className="sticky right-0 z-10 bg-inherit text-center">الإجمالي</td>
                    <td className="border-r border-border/40 num-display text-left">{fmt(data.totalOpeningDebit)}</td>
                    <td className="num-display text-left">{fmt(data.totalOpeningCredit)}</td>
                    <td className="border-r border-border/40 num-display text-left">{fmt(data.totalPeriodDebit)}</td>
                    <td className="num-display text-left">{fmt(data.totalPeriodCredit)}</td>
                    <td className="border-r border-border/40 num-display text-left text-emerald-300">{fmt(data.totalClosingDebit)}</td>
                    <td className="num-display text-left text-amber-300">{fmt(data.totalClosingCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* ════════════════════════════════════════
               بطاقة: طريقة احتساب الأرباح (نتيجة الفترة)
             ════════════════════════════════════════ */}
          <ProfitCalculationCard
            totalRevenue={data.totalRevenue}
            totalExpense={data.totalExpense}
            netIncome={data.netIncome}
            unit={displayUnit}
          />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// بطاقة "طريقة احتساب الأرباح"
// ═══════════════════════════════════════════════════════════════

function ProfitCalculationCard({
  totalRevenue,
  totalExpense,
  netIncome,
  unit,
}: {
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  unit: string;
}) {
  const isProfit = netIncome >= 0;
  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          طريقة احتساب الأرباح
        </CardTitle>
        <span className="rounded-md bg-secondary/60 px-2 py-1 text-[10px] text-muted-foreground">
          الوحدة: <span className="font-semibold text-foreground">{unit}</span>
        </span>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* تفسير */}
        <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="leading-6">
            <div className="mb-1 font-semibold text-foreground">المعادلة:</div>
            <div className="font-mono text-[11px] text-foreground/90">
              صافي الربح = إجمالي الإيرادات − إجمالي المصاريف
            </div>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-[11px]">
              <li>
                <span className="font-semibold text-emerald-300">إجمالي الإيرادات</span> ـ
                مجموع <span className="font-mono">(دائن − مدين)</span> لحسابات الإيرادات في الفترة الحالية فقط
                (لا يشمل الافتتاحي).
              </li>
              <li>
                <span className="font-semibold text-rose-300">إجمالي المصاريف</span> ـ
                مجموع <span className="font-mono">(مدين − دائن)</span> لحسابات المصاريف في الفترة الحالية فقط.
              </li>
              <li>
                إذا كانت النتيجة موجبة → <span className="font-semibold text-emerald-300">ربح صافٍ</span>،
                وإذا سالبة → <span className="font-semibold text-rose-300">خسارة</span>.
              </li>
              <li>
                هذه النتيجة قبل التسويات والإقفال. لإقفال الفترة وترحيل الربح إلى حقوق الملكية،
                استخدم سند تسوية يأخذ صافي الربح إلى حساب "أرباح محتجزة" (أو الموزَّعة).
              </li>
            </ul>
          </div>
        </div>

        {/* بطاقات الأرقام */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Box
            icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
            label="إجمالي الإيرادات"
            value={totalRevenue}
            unit={unit}
            tone="emerald"
          />
          <Box
            icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
            label="إجمالي المصاريف"
            value={totalExpense}
            unit={unit}
            tone="rose"
          />
          <Box
            icon={<Calculator className={cn('h-5 w-5', isProfit ? 'text-emerald-400' : 'text-rose-400')} />}
            label={isProfit ? 'صافي الربح' : 'صافي الخسارة'}
            value={Math.abs(netIncome)}
            unit={unit}
            tone={isProfit ? 'emerald' : 'rose'}
            big
          />
        </div>

        {/* المعادلة بالأرقام */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-center text-xs">
          <span className="text-emerald-300 num-display">{formatAmount(totalRevenue, 2)}</span>
          <span className="mx-2 text-muted-foreground">−</span>
          <span className="text-rose-300 num-display">{formatAmount(totalExpense, 2)}</span>
          <span className="mx-2 text-muted-foreground">=</span>
          <span className={cn(
            'num-display font-bold',
            isProfit ? 'text-emerald-300' : 'text-rose-300'
          )}>
            {formatAmount(netIncome, 2)}
          </span>
          <span className="ms-2 text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Box({
  icon, label, value, unit, tone, big,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  tone: 'emerald' | 'rose';
  big?: boolean;
}) {
  const toneCls = tone === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/5'
    : 'border-rose-500/30 bg-rose-500/5';
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3', toneCls)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background/60">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={cn(
          'num-display font-semibold',
          big ? 'text-xl' : 'text-base',
          tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300',
        )}>
          {formatAmount(value, 2)}
        </div>
        <div className="text-[10px] text-muted-foreground">{unit}</div>
      </div>
    </div>
  );
}
