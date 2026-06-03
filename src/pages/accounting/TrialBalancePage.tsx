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
import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  Calculator, Download, Layers, Coins, TrendingUp, TrendingDown,
  Info, AlertTriangle, Printer, FileText, MoreVertical, SlidersHorizontal,
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
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { companySettingsApi } from '@/lib/api/companySettings';
import { printTrialBalance } from '@/lib/printUtils';
import { readSessionJson, ReportNavKeys, saveStatementSource } from '@/lib/reportReturnState';
import { auditApi } from '@/lib/api/audit';
import { formatAmount, cn } from '@/lib/utils';
import { useLocale, localizedAccountName } from '@/lib/i18n';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import type { TrialBalanceDto, TrialBalanceRowDto } from '@/types/api';

type TrialBalanceRestore = {
  ts?: number;
  from?: string;
  to?: string;
  currency?: string;
  valuated?: boolean;
  maxLevel?: number | '';
  leavesOnly?: boolean;
  includeDraft?: boolean;
  includeOpeningEntries?: boolean;
  hideZero?: boolean;
  showProfitLoss?: boolean;
  showBalanceSheet?: boolean;
  showProfitCalculation?: boolean;
  highlightAccountId?: number;
};

const MAX_LEVELS = 5;

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

const TB_AMT = 'tb-amt border-r border-border/40';
const TB_AMT_END = 'tb-amt';
const TB_PIN_SOLID = 'tb-pin-solid';
const TB_PIN_SOLID_GROUP = 'tb-pin-solid-group';
const TB_PIN_CODE = 'tb-code tb-pin-start-0';
const TB_PIN_ACCOUNT = 'tb-account tb-pin-start-1';
const TB_PIN_TYPE = 'tb-type tb-pin-start-2';
const TB_PIN_ACTIONS = 'tb-pin-end-0';

const PROFIT_LOSS_TYPES = new Set(['Revenue', 'Expense']);
const BALANCE_SHEET_TYPES = new Set(['Asset', 'Liability', 'Equity']);

function isProfitLossRow(r: TrialBalanceRowDto): boolean {
  return PROFIT_LOSS_TYPES.has(r.accountType);
}

function isBalanceSheetRow(r: TrialBalanceRowDto): boolean {
  return BALANCE_SHEET_TYPES.has(r.accountType);
}

function sumTrialBalanceRows(rows: TrialBalanceRowDto[]) {
  return rows.reduce(
    (t, r) => ({
      totalOpeningDebit: t.totalOpeningDebit + (r.openingDebit ?? 0),
      totalOpeningCredit: t.totalOpeningCredit + (r.openingCredit ?? 0),
      totalPeriodDebit: t.totalPeriodDebit + (r.periodDebit ?? 0),
      totalPeriodCredit: t.totalPeriodCredit + (r.periodCredit ?? 0),
      totalClosingDebit: t.totalClosingDebit + (r.closingDebit ?? 0),
      totalClosingCredit: t.totalClosingCredit + (r.closingCredit ?? 0),
    }),
    {
      totalOpeningDebit: 0,
      totalOpeningCredit: 0,
      totalPeriodDebit: 0,
      totalPeriodCredit: 0,
      totalClosingDebit: 0,
      totalClosingCredit: 0,
    },
  );
}

const EMPTY_TOTALS = {
  totalOpeningDebit: 0,
  totalOpeningCredit: 0,
  totalPeriodDebit: 0,
  totalPeriodCredit: 0,
  totalClosingDebit: 0,
  totalClosingCredit: 0,
};

/** إجمالي الميزان — دائماً من الأوراق فقط (بدون تكرار حسابات الآباء). */
function computeTrialBalanceTotals(
  data: TrialBalanceDto,
  showBalanceSheet: boolean,
  showProfitLoss: boolean,
) {
  let leaves = data.rows.filter(r => r.isLeaf);
  if (!showBalanceSheet) leaves = leaves.filter(r => !isBalanceSheetRow(r));
  if (!showProfitLoss) leaves = leaves.filter(r => !isProfitLossRow(r));
  if (showBalanceSheet && showProfitLoss) {
    return {
      totalOpeningDebit: data.totalOpeningDebit,
      totalOpeningCredit: data.totalOpeningCredit,
      totalPeriodDebit: data.totalPeriodDebit,
      totalPeriodCredit: data.totalPeriodCredit,
      totalClosingDebit: data.totalClosingDebit,
      totalClosingCredit: data.totalClosingCredit,
    };
  }
  return sumTrialBalanceRows(leaves);
}

export function TrialBalancePage() {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canOpenStatement = can(PERMS.Accounting.AccountStatement.Read);

  const initialRestore = readSessionJson<TrialBalanceRestore>(ReportNavKeys.trialBalanceRestore);
  const highlightDoneRef = useRef(false);
  const [highlightAccountId, setHighlightAccountId] = useState<number | null>(
    initialRestore?.highlightAccountId ?? null,
  );
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

  const { defaultFromDate, defaultToDate } = useActiveFiscalYear();

  // ── الحالة (Filters)
  const [from, setFrom] = useState<string>(initialRestore?.from ?? '');
  const [to, setTo] = useState<string>(initialRestore?.to ?? '');
  const [currency, setCurrency] = useState<string>(initialRestore?.currency ?? ''); // "" = الكل
  const [valuated, setValuated] = useState<boolean>(initialRestore?.valuated ?? true);
  const [maxLevel, setMaxLevel] = useState<number | ''>(initialRestore?.maxLevel ?? '');
  const [leavesOnly, setLeavesOnly] = useState<boolean>(initialRestore?.leavesOnly ?? true);
  const [includeDraft, setIncludeDraft] = useState<boolean>(initialRestore?.includeDraft ?? false);
  const [includeOpeningEntries, setIncludeOpeningEntries] = useState<boolean>(initialRestore?.includeOpeningEntries ?? true);
  const [hideZero, setHideZero] = useState<boolean>(initialRestore?.hideZero ?? true);
  const [showProfitLoss, setShowProfitLoss] = useState<boolean>(initialRestore?.showProfitLoss ?? true);
  const [showBalanceSheet, setShowBalanceSheet] = useState<boolean>(initialRestore?.showBalanceSheet ?? true);
  const [showProfitCalculation, setShowProfitCalculation] = useState<boolean>(
    initialRestore?.showProfitCalculation ?? true,
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsPanelRef = useRef<HTMLDivElement>(null);

  // إعدادات الشركة (للوكو/الترويسة على نافذة الطباعة)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 10 * 60 * 1000,
  });

  // ‎شجرة الحسابات — لاستخراج قاموس (code → nameEn) يُستخدم في طباعة الميزان بالإنجليزية
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
    staleTime: 5 * 60 * 1000,
  });

  // ضبط الفترة الافتراضية على السنة المالية عند تحميلها:
  // ‎البداية = بداية السنة المالية، النهاية = اليوم دائماً (طلب: "لحد اليوم")
  useEffect(() => {
    if (from && to) return;
    if (!defaultFromDate) return;
    setFrom(prev => prev || defaultFromDate);
    setTo(prev => prev || defaultToDate);
  }, [defaultFromDate, defaultToDate, from, to]);

  // عند فلترة بعملة واحدة، إيقاف التقويم تلقائياً (المبالغ بالعملة الأصلية فقط)
  useEffect(() => {
    if (currency) setValuated(false);
  }, [currency]);

  useEffect(() => {
    if (!optionsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (optionsPanelRef.current && !optionsPanelRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [optionsOpen]);

  const optionsActiveCount = useMemo(
    () =>
      [!leavesOnly, !hideZero, !showProfitLoss, !showBalanceSheet, !showProfitCalculation].filter(Boolean)
        .length,
    [leavesOnly, hideZero, showProfitLoss, showBalanceSheet, showProfitCalculation],
  );

  // ── جلب البيانات
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['trial-balance', from, to, currency, valuated, maxLevel, leavesOnly, includeDraft, includeOpeningEntries],
    queryFn: () => accountingApi.getTrialBalance({
      from, to,
      currency: currency || null,
      valuated,
      maxLevel: maxLevel === '' ? null : Number(maxLevel),
      leavesOnly,
      includeDraft,
      includeOpeningEntries,
    }),
    enabled: !!from && !!to,
  });

  // ── فلترة الصفوف (ميزانية + أرباح/خسائر + صفرية)
  const displayRows = useMemo(() => {
    let src = data?.rows ?? [];
    if (!showBalanceSheet) src = src.filter(r => !isBalanceSheetRow(r));
    if (!showProfitLoss) src = src.filter(r => !isProfitLossRow(r));
    if (!hideZero) return src;
    return src.filter(r => {
      return (
        Math.abs(r.openingDebit ?? 0) > 0 ||
        Math.abs(r.openingCredit ?? 0) > 0 ||
        Math.abs(r.periodDebit ?? 0) > 0 ||
        Math.abs(r.periodCredit ?? 0) > 0 ||
        Math.abs(r.closingDebit ?? 0) > 0 ||
        Math.abs(r.closingCredit ?? 0) > 0
      );
    });
  }, [data?.rows, hideZero, showBalanceSheet, showProfitLoss]);

  const displayTotals = useMemo(
    () => (data ? computeTrialBalanceTotals(data, showBalanceSheet, showProfitLoss) : EMPTY_TOTALS),
    [data, showBalanceSheet, showProfitLoss],
  );

  const isBalanced = Math.abs(displayTotals.totalClosingDebit - displayTotals.totalClosingCredit) < 0.01;

  /** خريطة code → { nameAr, nameEn } مأخوذة من شجرة الحسابات لاستخدامها في عرض الأسماء بحسب اللغة. */
  const accountNamesByCode = useMemo(() => {
    const map = new Map<string, { nameAr: string; nameEn?: string | null }>();
    const walk = (nodes: any[]) => {
      for (const n of nodes ?? []) {
        if (n?.code) map.set(n.code, { nameAr: n.nameAr ?? n.name ?? '', nameEn: n.nameEn });
        if (Array.isArray(n?.children) && n.children.length > 0) walk(n.children);
      }
    };
    walk(treeQuery.data ?? []);
    return map;
  }, [treeQuery.data]);

  /** اسم الحساب بحسب اللغة الحالية مع fallback. */
  const displayAccountName = (code: string, fallbackAr: string): string => {
    const found = accountNamesByCode.get(code);
    return localizedAccountName(locale, found?.nameAr ?? fallbackAr, found?.nameEn);
  };

  // الوحدة المعروضة (للعنوان والإجماليات)
  const displayUnit = useMemo(() => {
    if (currency) return currency;
    if (valuated) return baseCurrency?.code ?? data?.baseCurrency ?? 'IQD';
    return t('trialBalance.filters.multiCurrencyDisplay');
  }, [currency, valuated, baseCurrency, data, t]);

  const handleOpenStatement = useCallback((row: TrialBalanceRowDto) => {
    const found = accountNamesByCode.get(row.accountCode);
    const name = localizedAccountName(locale, found?.nameAr ?? row.accountName, found?.nameEn);
    try {
      sessionStorage.setItem('account-statement:return-state', JSON.stringify({
        from,
        to,
        accountId: row.accountId,
        accountLabel: `${row.accountCode} - ${name}`,
        selectedCurrencies: currency ? [currency] : [],
        autoSubmit: true,
        ts: Date.now(),
      }));
      saveStatementSource({
        sourcePath: '/accounting/trial-balance',
        sourceLabelKey: 'sidebar.items.trialBalance',
        restoreKey: ReportNavKeys.trialBalanceRestore,
        restore: {
          from,
          to,
          currency,
          valuated,
          maxLevel,
          leavesOnly,
          includeDraft,
          includeOpeningEntries,
          hideZero,
          showProfitLoss,
          showBalanceSheet,
          showProfitCalculation,
        },
        highlightAccountId: row.accountId,
      });
    } catch { /* تجاهُل */ }
    navigate('/accounting/account-statement');
  }, [
    navigate, from, to, currency, valuated, maxLevel, leavesOnly, includeDraft, includeOpeningEntries,
    hideZero, showProfitLoss, showBalanceSheet, showProfitCalculation,
    accountNamesByCode, locale,
  ]);

  useEffect(() => {
    if (highlightAccountId == null || !displayRows.length || highlightDoneRef.current) return;
    const el = document.querySelector<HTMLElement>(`[data-tb-account-id="${highlightAccountId}"]`);
    if (!el) return;
    highlightDoneRef.current = true;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    const timer = setTimeout(() => setHighlightAccountId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightAccountId, displayRows]);

  const exportCsv = () => {
    if (!data?.rows?.length) return;
    const header = [
      t('trialBalance.csv.code'), t('trialBalance.csv.account'), t('trialBalance.csv.type'), t('trialBalance.csv.level'),
      t('trialBalance.csv.openingDebit'), t('trialBalance.csv.openingCredit'),
      t('trialBalance.csv.periodDebit'), t('trialBalance.csv.periodCredit'),
      t('trialBalance.csv.closingDebit'), t('trialBalance.csv.closingCredit'),
    ];
    const lines = [
      header,
      ...displayRows.map(r => [
        r.accountCode, displayAccountName(r.accountCode, r.accountName),
        t(`trialBalance.types.${r.accountType}`, { defaultValue: r.accountType }),
        r.level,
        r.openingDebit, r.openingCredit,
        r.periodDebit, r.periodCredit,
        r.closingDebit, r.closingCredit,
      ]),
      ['', t('trialBalance.csv.total'), '', '',
        displayTotals.totalOpeningDebit, displayTotals.totalOpeningCredit,
        displayTotals.totalPeriodDebit, displayTotals.totalPeriodCredit,
        displayTotals.totalClosingDebit, displayTotals.totalClosingCredit,
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
    // ‎اجمع قاموس code → nameEn من شجرة الحسابات لاستخدامه في الطباعة الإنجليزية.
    const accountNamesEn: Record<string, string> = {};
    const walk = (nodes: any[]) => {
      for (const n of nodes ?? []) {
        if (n?.code && n?.nameEn) accountNamesEn[n.code] = n.nameEn;
        if (Array.isArray(n?.children) && n.children.length > 0) walk(n.children);
      }
    };
    walk(treeQuery.data ?? []);
    printTrialBalance(data, companyQuery.data ?? null, undefined, {
      accountNamesEn,
      showProfitLoss,
      showBalanceSheet,
      showProfitCalculation,
    });
    void auditApi.logPrint({
      entityType: 'TrialBalance',
      entityId: '*',
      summary: 'طباعة ميزان المراجعة',
      details: { rowCount: data?.rows?.length ?? 0 },
    });
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_140px_auto]">
            <div>
              <Label className="mb-1 text-[11px] text-muted-foreground">{t('trialBalance.filters.fromDate')}</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="mb-1 text-[11px] text-muted-foreground">{t('trialBalance.filters.toDate')}</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Coins className="h-3 w-3" /> {t('trialBalance.filters.currency')}
              </Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
              >
                <option value="">{t('trialBalance.filters.allCurrencies')}</option>
                {enabledCurrencies.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {locale === 'en' ? (c.nameEn || c.nameAr) : c.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Layers className="h-3 w-3" /> {t('trialBalance.filters.treeLevel')}
                <span className="ms-1 text-[9px] text-muted-foreground/70">
                  ({maxLevel === '' ? t('trialBalance.filters.allLevels') : `≤ ${maxLevel}`})
                </span>
              </Label>
              <div
                role="radiogroup"
                aria-label={t('trialBalance.filters.treeLevel')}
                className="flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-secondary/40 text-xs"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={maxLevel === ''}
                  onClick={() => setMaxLevel('')}
                  title={t('trialBalance.filters.allLevels')}
                  className={cn(
                    'flex flex-1 items-center justify-center px-2 font-medium transition',
                    maxLevel === ''
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  {t('trialBalance.filters.allLevels')}
                </button>
                {Array.from({ length: MAX_LEVELS }, (_, i) => i + 1).map(lv => (
                  <button
                    key={lv}
                    type="button"
                    role="radio"
                    aria-checked={maxLevel === lv}
                    onClick={() => setMaxLevel(lv)}
                    title={t('trialBalance.filters.levelUpTo', { level: lv })}
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
            <div ref={optionsPanelRef} className="relative flex items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="relative h-8 gap-1.5 px-2.5"
                onClick={() => setOptionsOpen(v => !v)}
                title={t('trialBalance.filters.options')}
                aria-expanded={optionsOpen}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {optionsActiveCount > 0 && (
                  <span className="absolute -top-1 end-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {optionsActiveCount}
                  </span>
                )}
              </Button>
              {optionsOpen && (
                <div
                  className="absolute end-0 top-[calc(100%+4px)] z-50 w-64 rounded-lg border border-border bg-popover shadow-lg"
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <div className="border-b border-border/60 bg-secondary/30 px-3 py-2 text-xs font-semibold">
                    {t('trialBalance.filters.options')}
                  </div>
                  <div className="flex flex-col gap-1 p-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={leavesOnly}
                        onChange={e => setLeavesOnly(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      {t('trialBalance.filters.leavesOnly')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={hideZero}
                        onChange={e => setHideZero(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      {t('trialBalance.filters.hideZero', { defaultValue: 'إخفاء الأرصدة الصفرية' })}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={showBalanceSheet}
                        onChange={e => setShowBalanceSheet(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      {t('trialBalance.filters.showBalanceSheet')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={showProfitLoss}
                        onChange={e => setShowProfitLoss(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      {t('trialBalance.filters.showProfitLoss')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={showProfitCalculation}
                        onChange={e => setShowProfitCalculation(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      {t('trialBalance.filters.showProfitCalculation')}
                    </label>
                  </div>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 gap-1.5" disabled={!data?.rows?.length}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={printPage} className="h-8 gap-1.5" disabled={!data?.rows?.length}>
                <Printer className="h-3.5 w-3.5" /> {t('trialBalance.filters.print')}
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
              title={currency ? t('trialBalance.filters.valuatedOnlyAll') : t('trialBalance.filters.valuatedHint')}
            >
              <input
                type="checkbox"
                checked={valuated && !currency}
                onChange={e => setValuated(e.target.checked)}
                disabled={!!currency}
                className="h-3.5 w-3.5"
              />
              {t('trialBalance.filters.valuated', { currency: baseCurrency?.code ?? 'IQD' })}
            </label>

            <label
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 text-xs text-muted-foreground hover:bg-secondary"
              title={t('trialBalance.filters.includeDraft')}
            >
              <input
                type="checkbox"
                checked={includeDraft}
                onChange={e => setIncludeDraft(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              {t('trialBalance.filters.includeDraft')}
            </label>

            <label
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 text-xs text-muted-foreground hover:bg-secondary"
              title={t('trialBalance.filters.includeOpeningEntriesTip')}
            >
              <input
                type="checkbox"
                checked={includeOpeningEntries}
                onChange={e => setIncludeOpeningEntries(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              {t('trialBalance.filters.includeOpeningEntries')}
            </label>

            {data?.fxBulletinName && (
              <span className="ms-auto rounded-md bg-secondary/60 px-2 py-1 text-[10px] text-muted-foreground">
                {t('trialBalance.filters.bulletinLabel')} <span className="font-semibold text-foreground">{data.fxBulletinName}</span>
                {data.fxBulletinEffectiveAt && (
                  <span className="text-[10px] text-muted-foreground/80"> · {data.fxBulletinEffectiveAt.slice(0, 10)}</span>
                )}
              </span>
            )}
          </div>

          {data?.fxUsedFallback && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t('trialBalance.filters.fxFallback')}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════
           المحتوى: حالة التحميل/الخطأ/الجدول
         ════════════════════════════════════════ */}
      {isLoading ? (
        <LoadingSpinner text={t('trialBalance.loading')} />
      ) : isError ? (
        <EmptyState
          icon={Calculator}
          title={t('trialBalance.loadFailed')}
          description={(error as Error)?.message ?? ''}
        />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title={t('trialBalance.noMovements')}
          description={t('trialBalance.noMovementsDesc')}
        />
      ) : (
        <>
          {/* ── جدول الميزان */}
          <Card className="print:shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calculator className="h-4 w-4 text-primary" />
                  {t('trialBalance.table.title')}
                </CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('trialBalance.table.dateRange', { from, to })}
                  {' · '}
                  {t('trialBalance.table.accountsCount', { count: displayRows.length })}
                  {' · '}
                  {t('trialBalance.table.currencyLabel')} <span className="font-medium text-foreground">{displayUnit}</span>
                  {data.leavesOnly && ` · ${t('trialBalance.table.leavesOnlyBadge')}`}
                  {data.maxLevel != null && ` · ${t('trialBalance.table.maxLevelBadge', { level: data.maxLevel })}`}
                </p>
              </div>
              <div>
                {isBalanced ? (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    {t('trialBalance.table.balanced')}
                  </span>
                ) : (
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">
                    {t('trialBalance.table.unbalanced')}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="table-scroll trial-balance-scroll p-0">
              <table className="data-table trial-balance-table text-xs">
                <thead>
                  <tr className="border-b-2 border-border/60">
                    <th rowSpan={2} className={cn(TB_PIN_CODE, TB_PIN_SOLID, 'text-center align-middle')}>{t('trialBalance.table.code')}</th>
                    <th rowSpan={2} className={cn(TB_PIN_ACCOUNT, TB_PIN_SOLID, 'text-right align-middle')}>{t('trialBalance.table.account')}</th>
                    <th rowSpan={2} className={cn(TB_PIN_TYPE, TB_PIN_SOLID, 'text-center align-middle')}>{t('trialBalance.table.type')}</th>
                    <th colSpan={2} className="border-r border-border/40 bg-secondary/30 text-center">
                      {t('trialBalance.table.previousPeriod')}
                    </th>
                    <th colSpan={2} className="border-r border-border/40 bg-primary/10 text-center">
                      {t('trialBalance.table.currentPeriod')}
                    </th>
                    <th colSpan={2} className="border-r border-border/40 bg-amber-500/10 text-center">
                      {t('trialBalance.table.closingBalance')}
                    </th>
                    {canOpenStatement && (
                      <th rowSpan={2} className={cn(TB_PIN_ACTIONS, TB_PIN_SOLID, 'w-11 min-w-[2.75rem] px-1 text-center align-middle')}>
                        {t('trialBalance.table.actions')}
                      </th>
                    )}
                  </tr>
                  <tr className="border-b border-border/60 text-[10px] text-muted-foreground">
                    <th className={cn('tb-amt-h border-r border-border/40 bg-secondary/30 text-center')}>{t('trialBalance.table.debit')}</th>
                    <th className="tb-amt-h bg-secondary/30 text-center">{t('trialBalance.table.credit')}</th>
                    <th className={cn('tb-amt-h border-r border-border/40 bg-primary/10 text-center')}>{t('trialBalance.table.debit')}</th>
                    <th className="tb-amt-h bg-primary/10 text-center">{t('trialBalance.table.credit')}</th>
                    <th className={cn('tb-amt-h border-r border-border/40 bg-amber-500/10 text-center')}>{t('trialBalance.table.debit')}</th>
                    <th className="tb-amt-h bg-amber-500/10 text-center">{t('trialBalance.table.credit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map(r => {
                    const pinBg = !r.isLeaf ? TB_PIN_SOLID_GROUP : TB_PIN_SOLID;
                    return (
                    <tr
                      key={r.accountId}
                      data-tb-account-id={r.accountId}
                      className={cn(
                        !r.isLeaf && 'font-semibold bg-secondary/20',
                        highlightAccountId === r.accountId && 'bg-primary/15 ring-2 ring-primary/60 ring-inset',
                      )}
                    >
                      <td className={cn(TB_PIN_CODE, pinBg, 'num-display text-xs text-muted-foreground')}>
                        {r.accountCode}
                      </td>
                      <td className={cn(TB_PIN_ACCOUNT, pinBg)}>
                        <span
                          className="block truncate"
                          style={{ paddingInlineStart: `${(r.level - 1) * 12}px` }}
                          title={displayAccountName(r.accountCode, r.accountName)}
                        >
                          {displayAccountName(r.accountCode, r.accountName)}
                        </span>
                      </td>
                      <td className={cn(TB_PIN_TYPE, pinBg, 'text-center')}>
                        <span className={cn(
                          'inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-medium',
                          TYPE_COLORS[r.accountType] ?? 'text-muted-foreground bg-secondary/40 border-border'
                        )}>
                          {t(`trialBalance.types.${r.accountType}`, { defaultValue: r.accountType })}
                        </span>
                      </td>
                      <td className={TB_AMT}>{fmt(r.openingDebit)}</td>
                      <td className={TB_AMT_END}>{fmt(r.openingCredit)}</td>
                      <td className={TB_AMT}>{fmt(r.periodDebit)}</td>
                      <td className={TB_AMT_END}>{fmt(r.periodCredit)}</td>
                      <td className={cn(TB_AMT, 'font-semibold text-emerald-300')}>{fmt(r.closingDebit)}</td>
                      <td className={cn(TB_AMT_END, 'font-semibold text-amber-300')}>{fmt(r.closingCredit)}</td>
                      {canOpenStatement && (
                        <td className={cn(TB_PIN_ACTIONS, pinBg, 'w-11 min-w-[2.75rem] px-1 text-center')}>
                          {r.isLeaf && (
                            <TrialBalanceRowActionsMenu
                              onOpenStatement={() => handleOpenStatement(r)}
                              isRtl={isRtl}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-primary/40 text-xs font-bold">
                  <tr>
                    <td colSpan={3} className={cn(TB_PIN_CODE, TB_PIN_SOLID, 'text-center')}>{t('trialBalance.table.total')}</td>
                    <td className={TB_AMT}>{fmt(displayTotals.totalOpeningDebit)}</td>
                    <td className={TB_AMT_END}>{fmt(displayTotals.totalOpeningCredit)}</td>
                    <td className={TB_AMT}>{fmt(displayTotals.totalPeriodDebit)}</td>
                    <td className={TB_AMT_END}>{fmt(displayTotals.totalPeriodCredit)}</td>
                    <td className={cn(TB_AMT, 'text-emerald-300')}>{fmt(displayTotals.totalClosingDebit)}</td>
                    <td className={cn(TB_AMT_END, 'text-amber-300')}>{fmt(displayTotals.totalClosingCredit)}</td>
                    {canOpenStatement && <td className={cn(TB_PIN_ACTIONS, TB_PIN_SOLID, 'w-11 min-w-[2.75rem]')} />}
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* ════════════════════════════════════════
               بطاقة: طريقة احتساب الأرباح (نتيجة الفترة)
             ════════════════════════════════════════ */}
          {showProfitCalculation && (
            <ProfitCalculationCard
              totalRevenue={data.totalRevenue}
              totalExpense={data.totalExpense}
              netIncome={data.netIncome}
              unit={displayUnit}
            />
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// قائمة إجراءات صف الحساب الورقة
// ═══════════════════════════════════════════════════════════════

function TrialBalanceRowActionsMenu({
  onOpenStatement,
  isRtl,
}: {
  onOpenStatement: () => void;
  isRtl: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const computePos = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = 200;
    const margin = 8;
    let left = isRtl ? rect.right - menuW : rect.left;
    left = Math.min(Math.max(left, margin), window.innerWidth - menuW - margin);
    setPos({ top: rect.bottom + 4, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computePos();
    window.addEventListener('resize', computePos);
    window.addEventListener('scroll', computePos, true);
    return () => {
      window.removeEventListener('resize', computePos);
      window.removeEventListener('scroll', computePos, true);
    };
  }, [open, isRtl]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = ('touches' in e ? e.touches[0]?.target : e.target) as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      if (target && triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown as EventListener);
    document.addEventListener('touchstart', onDown as EventListener, { passive: true });
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown as EventListener);
      document.removeEventListener('touchstart', onDown as EventListener);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
          'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          open && 'bg-secondary/80 text-foreground',
        )}
        title={t('trialBalance.table.actionsMenuTip')}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 200, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-border bg-popover/95 shadow-2xl backdrop-blur-sm"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onOpenStatement(); }}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2.5 text-xs font-medium text-foreground transition-colors',
              'hover:bg-primary/10 hover:text-primary',
              isRtl ? 'text-right' : 'text-left',
            )}
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            {t('trialBalance.table.accountStatement')}
          </button>
        </div>,
        document.body,
      )}
    </>
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
  const { t } = useTranslation();
  const isProfit = netIncome >= 0;
  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          {t('trialBalance.profit.title')}
        </CardTitle>
        <span className="rounded-md bg-secondary/60 px-2 py-1 text-[10px] text-muted-foreground">
          {t('trialBalance.profit.unit')} <span className="font-semibold text-foreground">{unit}</span>
        </span>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="leading-6">
            <div className="mb-1 font-semibold text-foreground">{t('trialBalance.profit.formulaTitle')}</div>
            <div className="font-mono text-[11px] text-foreground/90">
              {t('trialBalance.profit.formulaLine')}
            </div>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-[11px]">
              <li>{t('trialBalance.profit.revenueNote')}</li>
              <li>{t('trialBalance.profit.expenseNote')}</li>
              <li>{t('trialBalance.profit.profitNote')}</li>
              <li>{t('trialBalance.profit.closingNote')}</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Box
            icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
            label={t('trialBalance.profit.totalRevenue')}
            value={totalRevenue}
            unit={unit}
            tone="emerald"
          />
          <Box
            icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
            label={t('trialBalance.profit.totalExpenses')}
            value={totalExpense}
            unit={unit}
            tone="rose"
          />
          <Box
            icon={<Calculator className={cn('h-5 w-5', isProfit ? 'text-emerald-400' : 'text-rose-400')} />}
            label={isProfit ? t('trialBalance.profit.netProfit') : t('trialBalance.profit.netLoss')}
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
