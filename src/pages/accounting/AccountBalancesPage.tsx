import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wallet, FileText, Layers, Coins, AlertTriangle,
  Search, ChevronRight, ChevronLeft, X, BarChart2, Printer, SlidersHorizontal, MoreVertical, Landmark,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { accountingApi } from '@/lib/api/accounting';
import { currenciesApi } from '@/lib/api/currencies';
import { BranchFilterSelect } from '@/components/branches/BranchSelect';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { companySettingsApi } from '@/lib/api/companySettings';
import { formatAmountFixed2, cn } from '@/lib/utils';
import { useLocale, localizedAccountName, type AppLocale } from '@/lib/i18n';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { printAccountBalances } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { readSessionJson, ReportNavKeys, saveStatementSource } from '@/lib/reportReturnState';
import type { AccountBalanceRowDto, FinancialPartyCategoryDto, FinancialPartyDto, FinancialPartyKind } from '@/types/api';

type AccountBalancesRestore = {
  ts?: number;
  from?: string;
  to?: string;
  accountId?: number | null;
  accountLabel?: string;
  currency?: string;
  valuated?: boolean;
  maxLevel?: number | '';
  leavesOnly?: boolean;
  includeDraft?: boolean;
  includeOpeningEntries?: boolean;
  showZero?: boolean;
  showBalanceSheet?: boolean;
  showProfitLoss?: boolean;
  showFmPartyTypes?: boolean;
  partiesOnly?: boolean;
  fmCategoryEnabled?: Record<number, boolean>;
  balanceSort?: 'none' | 'desc' | 'asc';
  search?: string;
  triggered?: boolean;
  runKeys?: object | null;
  highlightAccountId?: number;
  highlightCurrency?: string;
};

const FM_KIND_ORDER: FinancialPartyKind[] = ['Supplier', 'Customer', 'Bank', 'CashBox', 'PaymentCompany'];

const FM_KIND_COLORS: Record<FinancialPartyKind, string> = {
  Supplier:       'text-blue-400 bg-blue-500/10 border-blue-500/30',
  Customer:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Bank:           'text-violet-400 bg-violet-500/10 border-violet-500/30',
  CashBox:        'text-amber-400 bg-amber-500/10 border-amber-500/30',
  PaymentCompany: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
};

function displayPartyCategoryName(
  party: Pick<FinancialPartyDto, 'categoryNameAr' | 'categoryNameEn'>,
  locale: AppLocale,
): string {
  return localizedAccountName(locale, party.categoryNameAr, party.categoryNameEn);
}

function sortFmCategories(cats: FinancialPartyCategoryDto[]): FinancialPartyCategoryDto[] {
  return [...cats].sort((a, b) => {
    const ki = FM_KIND_ORDER.indexOf(a.kind) - FM_KIND_ORDER.indexOf(b.kind);
    if (ki !== 0) return ki;
    return a.displayOrder - b.displayOrder;
  });
}

function fmt(n: number): string {
  if (!n || Math.abs(n) < 0.005) return '—';
  return formatAmountFixed2(n);
}

const MAX_LEVELS = 5;
const PROFIT_LOSS_TYPES = new Set(['Revenue', 'Expense']);
const BALANCE_SHEET_TYPES = new Set(['Asset', 'Liability', 'Equity']);

function isProfitLossRow(r: AccountBalanceRowDto): boolean {
  return PROFIT_LOSS_TYPES.has(r.accountType);
}

function isBalanceSheetRow(r: AccountBalanceRowDto): boolean {
  return BALANCE_SHEET_TYPES.has(r.accountType);
}

const TYPE_COLORS: Record<string, string> = {
  Asset:     'text-blue-400 bg-blue-500/10 border-blue-500/30',
  Liability: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Equity:    'text-violet-400 bg-violet-500/10 border-violet-500/30',
  Revenue:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Expense:   'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

const AB_AMT = 'tb-amt border-r border-border/40';
const AB_AMT_END = 'tb-amt';
const AB_PIN_SOLID = 'tb-pin-solid';
const AB_PIN_IDX = 'tb-idx ab-pin-start-0';
const AB_PIN_CODE = 'tb-code ab-pin-start-1';
const AB_PIN_ACCOUNT = 'tb-account ab-pin-start-2';
const AB_PIN_TYPE = 'tb-type ab-pin-start-3';
const AB_PIN_ACTIONS = 'tb-pin-end-0';

// ── مكوّن اختيار الحساب: بحث نصي مباشر + قائمة منسدلة بكل المستويات
interface AccountPickerProps {
  value: number | null;
  label: string;
  onSelect: (id: number | null, label: string) => void;
}
function AccountPicker({ value, label, onSelect }: AccountPickerProps) {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
    staleTime: 5 * 60 * 1000,
  });

  // تسطيح كل الحسابات (آباء وأوراق) بكل المستويات.
  // ‎`searchPath` يضم أكواد + أسماء كل الآباء حتى الجذر، يفصل بينهم " / ".
  // ‎هذا يسمح بالبحث بـ:
  //   - كود/اسم العقدة نفسها.
  //   - كود/اسم أي حساب أب أعلاها → فتظهر العقدة كنتيجة.
  // ‎مثال: البحث بـ "أصول ثابتة" يُظهر كل أحفاد حساب «الأصول الثابتة».
  const flat = useMemo(() => {
    const list: {
      id: number;
      code: string;
      name: string;
      level: number;
      hasChildren: boolean;
      searchPath: string;
    }[] = [];
    const walk = (nodes: any[], parentPath: string) => {
      for (const n of nodes ?? []) {
        const name = localizedAccountName(locale, (n.nameAr ?? n.name ?? '') as string, n.nameEn);
        const own = `${n.code} ${name} ${n.nameAr ?? ''} ${n.nameEn ?? ''}`;
        const fullPath = parentPath ? `${parentPath} / ${own}` : own;
        const hasChildren = Array.isArray(n.children) && n.children.length > 0;
        list.push({
          id: n.id,
          code: n.code,
          name,
          level: n.level ?? 1,
          hasChildren,
          searchPath: fullPath,
        });
        if (hasChildren) walk(n.children, fullPath);
      }
    };
    walk(treeQuery.data ?? [], '');
    return list;
  }, [treeQuery.data, locale]);

  const filtered = useMemo(() => {
    const raw = q.trim();
    if (!raw) return flat; // كل الحسابات بلا حد

    // ‎البحث الرقمي يطابق "بادئة كود الحساب" (يسار → يمين):
    //   كتابة "2"   ⇒ كل الحسابات التي كودها يبدأ بـ 2
    //   كتابة "11"  ⇒ كل الحسابات التي كودها يبدأ بـ 11
    // ‎هذا أكثر طبيعية في النظام المحاسبي لأن الأكواد هرمية، ويمنع ضوضاء
    // ‎النتائج عند تمرير رقم قصير. نُسقط أي مسافات داخل النص قبل التحقّق.
    const compact = raw.replace(/\s+/g, '');
    if (compact.length > 0 && /^\d+$/.test(compact)) {
      return flat.filter(a => (a.code ?? '').startsWith(compact));
    }

    // البحث النصي يبقى كما هو: مطابقة جزئية على المسار الكامل (كود + اسم + آباء).
    const lq = raw.toLowerCase();
    return flat.filter(a => a.searchPath.toLowerCase().includes(lq));
  }, [flat, q]);

  // إغلاق بالضغط خارج المكوّن
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClear = () => {
    onSelect(null, '');
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={cn(
            'flex h-8 flex-1 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
            'border-border bg-secondary/30 hover:bg-secondary/60',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="min-w-0 truncate">{value ? label : t('accountBalances.filters.allAccounts')}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-10 z-50 w-full min-w-[300px] rounded-md border border-border bg-card shadow-xl">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t('accountBalances.filters.searchPlaceholder')}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onSelect(null, ''); setOpen(false); setQ(''); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/50 text-muted-foreground border-b border-border/50"
            >
              {t('accountBalances.filters.allAccounts')}
            </button>
            {filtered.map(a => {
              const ArrowIcon = isRtl ? ChevronRight : ChevronLeft;
              return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelect(a.id, `${a.code} — ${a.name}`);
                  setOpen(false);
                  setQ('');
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 py-1.5 text-sm hover:bg-secondary/50',
                  isRtl ? 'pl-2' : 'pr-2',
                  value === a.id && 'bg-primary/10 text-primary',
                )}
                style={isRtl
                  ? { paddingRight: `${(a.level - 1) * 14 + 12}px` }
                  : { paddingLeft: `${(a.level - 1) * 14 + 12}px` }}
              >
                <ArrowIcon className={cn('h-3 w-3 shrink-0', a.hasChildren ? 'opacity-70 text-primary' : 'opacity-30')} />
                <span className={cn(
                  'font-mono text-[11px] w-14 shrink-0',
                  a.hasChildren ? 'font-bold text-foreground/80' : 'text-muted-foreground',
                )}>{a.code}</span>
                <span className={cn(
                  'flex-1 min-w-0 truncate text-xs',
                  a.hasChildren && 'font-semibold',
                )}>{a.name}</span>
                {a.hasChildren && (
                  <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold leading-none text-primary">
                    {t('accountBalances.filters.parentBadge')}
                  </span>
                )}
              </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t('accountBalances.filters.noResults')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
export function AccountBalancesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const { can } = usePermissions();
  const canOpenStatement = can(PERMS.Accounting.AccountStatement.Read);
  const canReadParties = can(PERMS.FinancialManagement.Parties.Read);

  const initialRestore = readSessionJson<AccountBalancesRestore>(ReportNavKeys.accountBalancesRestore);
  const highlightDoneRef = useRef(false);

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60 * 1000,
  });
  const baseCurrency = useMemo(
    () => currenciesQuery.data?.find(c => c.isBase) ?? null,
    [currenciesQuery.data],
  );

  const { defaultFromDate, defaultToDate } = useActiveFiscalYear();

  // إعدادات الشركة (لاستخدامها في ترويسة الطباعة: لوغو/اسم/عنوان/تذييل)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  // ── الفلاتر
  const [from, setFrom] = useState(initialRestore?.from ?? '');
  const [to, setTo] = useState(initialRestore?.to ?? '');
  const [accountId, setAccountId] = useState<number | null>(initialRestore?.accountId ?? null);
  const [accountLabel, setAccountLabel] = useState(initialRestore?.accountLabel ?? '');
  const [currency, setCurrency] = useState(initialRestore?.currency ?? '');
  const [valuated, setValuated] = useState(initialRestore?.valuated ?? true);
  const [maxLevel, setMaxLevel] = useState<number | ''>(initialRestore?.maxLevel ?? '');
  const [leavesOnly, setLeavesOnly] = useState(initialRestore?.leavesOnly ?? true);
  const [includeDraft, setIncludeDraft] = useState(initialRestore?.includeDraft ?? true);
  const [includeOpeningEntries, setIncludeOpeningEntries] = useState(initialRestore?.includeOpeningEntries ?? true);
  const [showZero, setShowZero] = useState(initialRestore?.showZero ?? true);
  const [showBalanceSheet, setShowBalanceSheet] = useState(initialRestore?.showBalanceSheet ?? true);
  const [showProfitLoss, setShowProfitLoss] = useState(initialRestore?.showProfitLoss ?? true);
  const [showFmPartyTypes, setShowFmPartyTypes] = useState(initialRestore?.showFmPartyTypes ?? false);
  const [partiesOnly, setPartiesOnly] = useState(initialRestore?.partiesOnly ?? false);
  const [fmCategoryEnabled, setFmCategoryEnabled] = useState<Record<number, boolean>>(
    initialRestore?.fmCategoryEnabled ?? {},
  );
  const [balanceSort, setBalanceSort] = useState<'none' | 'desc' | 'asc'>(initialRestore?.balanceSort ?? 'none');
  const [search, setSearch] = useState(initialRestore?.search ?? '');
  const [highlightRow, setHighlightRow] = useState<{ accountId: number; currency?: string } | null>(
    initialRestore?.highlightAccountId != null
      ? { accountId: initialRestore.highlightAccountId, currency: initialRestore.highlightCurrency }
      : null,
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [fmOptionsOpen, setFmOptionsOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState<number | ''>('');
  const optionsPanelRef = useRef<HTMLDivElement>(null);
  const fmOptionsPanelRef = useRef<HTMLDivElement>(null);

  const fmSelectAllRef = useRef<HTMLInputElement>(null);

  // ── التنفيذ اليدوي (زر "عرض الأرصدة")
  const [triggered, setTriggered] = useState(!!initialRestore?.triggered);
  // مفاتيح الاستعلام المُنفَّذ فعلاً (تتغير فقط عند الضغط)
  const [runKeys, setRunKeys] = useState<object | null>(initialRestore?.runKeys ?? null);

  // ── فترة افتراضية
  useEffect(() => {
    if (from && to) return;
    if (!defaultFromDate) return;
    setFrom(p => p || defaultFromDate);
    setTo(p => p || defaultToDate);
  }, [defaultFromDate, defaultToDate, from, to]);

  useEffect(() => { if (currency) setValuated(false); }, [currency]);

  useEffect(() => {
    if (!optionsOpen && !fmOptionsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (optionsOpen && optionsPanelRef.current && !optionsPanelRef.current.contains(target)) {
        setOptionsOpen(false);
      }
      if (fmOptionsOpen && fmOptionsPanelRef.current && !fmOptionsPanelRef.current.contains(target)) {
        setFmOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [optionsOpen, fmOptionsOpen]);

  const optionsActiveCount = useMemo(
    () =>
      [
        !leavesOnly,
        !showBalanceSheet,
        !showProfitLoss,
        !showZero,
        !valuated,
        !includeDraft,
        !includeOpeningEntries,
      ].filter(Boolean).length,
    [leavesOnly, showBalanceSheet, showProfitLoss, showZero, valuated, includeDraft, includeOpeningEntries],
  );

  /** عمود نوع الطرف الإضافي: عند «إظهار أنواع الإدارة المالية» دون «الأطراف فقط». */
  const showFmPartyColumn = canReadParties && showFmPartyTypes && !partiesOnly;
  /** عند «الأطراف فقط» يُعرض نوع الطرف في عمود «النوع» بدل نوع الحساب. */
  const showPartyTypeInTypeColumn = canReadParties && partiesOnly;

  const handleRun = () => {
    setTriggered(true);
    setRunKeys({ from, to, accountId, currency, valuated, maxLevel, leavesOnly, includeDraft, includeOpeningEntries, branchFilter });
  };

  // ── جلب البيانات (فقط بعد الضغط على "عرض الأرصدة")
  const { data, isLoading, isError } = useQuery({
    queryKey: ['account-balances', runKeys],
    queryFn: () => accountingApi.getAccountBalances({
      from, to,
      accountId: accountId ?? undefined,
      currency: currency || null,
      valuated,
      maxLevel: maxLevel === '' ? null : Number(maxLevel),
      leavesOnly,
      includeDraft,
      includeOpeningEntries,
      branchId: branchFilter === '' ? null : Number(branchFilter),
    }),
    enabled: !!runKeys && !!from && !!to,
  });

  const partiesQuery = useQuery({
    queryKey: ['financial-parties', 'account-balances'],
    queryFn: () => financialManagementApi.getParties({ includeInactive: true }),
    enabled: canReadParties,
    staleTime: 60_000,
  });

  const categoriesQuery = useQuery({
    queryKey: ['financial-categories', 'account-balances'],
    queryFn: () => financialManagementApi.getCategories(undefined, true),
    enabled: canReadParties,
    staleTime: 60_000,
  });

  const fmCategories = useMemo(
    () => sortFmCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );

  useEffect(() => {
    if (!fmCategories.length) return;
    setFmCategoryEnabled(prev => {
      let changed = false;
      const next = { ...prev };
      for (const cat of fmCategories) {
        if (next[cat.id] === undefined) {
          next[cat.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [fmCategories]);

  const fmCategoryFilterActive = useMemo(
    () => fmCategories.some(cat => fmCategoryEnabled[cat.id] === false),
    [fmCategories, fmCategoryEnabled],
  );

  const isFmCategoryEnabled = useCallback(
    (categoryId: number) => fmCategoryEnabled[categoryId] !== false,
    [fmCategoryEnabled],
  );

  const allFmCategoriesSelected = useMemo(
    () => fmCategories.length > 0 && fmCategories.every(cat => isFmCategoryEnabled(cat.id)),
    [fmCategories, isFmCategoryEnabled],
  );

  const someFmCategoriesSelected = useMemo(
    () => !allFmCategoriesSelected && fmCategories.some(cat => isFmCategoryEnabled(cat.id)),
    [fmCategories, allFmCategoriesSelected, isFmCategoryEnabled],
  );

  const toggleAllFmCategories = useCallback((checked: boolean) => {
    setFmCategoryEnabled(prev => {
      const next = { ...prev };
      for (const cat of fmCategories) {
        next[cat.id] = checked;
      }
      return next;
    });
  }, [fmCategories]);

  useEffect(() => {
    if (fmSelectAllRef.current) {
      fmSelectAllRef.current.indeterminate = someFmCategoriesSelected;
    }
  }, [someFmCategoriesSelected, fmOptionsOpen]);

  const fmOptionsActiveCount = useMemo(
    () =>
      [partiesOnly, showFmPartyTypes, fmCategoryFilterActive].filter(Boolean).length,
    [partiesOnly, showFmPartyTypes, fmCategoryFilterActive],
  );

  const partyByAccountId = useMemo(() => {
    const map = new Map<number, FinancialPartyDto>();
    for (const party of partiesQuery.data ?? []) {
      map.set(party.accountId, party);
    }
    return map;
  }, [partiesQuery.data]);

  // ‎شجرة الحسابات — لاستخراج قاموس (code → nameEn) للطباعة الإنجليزية
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
    staleTime: 5 * 60 * 1000,
  });

  /** خريطة code → { nameAr, nameEn } لاستخدامها في عرض الأسماء بحسب اللغة. */
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

  const displayAccountName = (code: string, fallbackAr: string): string => {
    const found = accountNamesByCode.get(code);
    return localizedAccountName(locale, found?.nameAr ?? fallbackAr, found?.nameEn);
  };

  // ── فلترة وبحث محلي
  const rows: AccountBalanceRowDto[] = useMemo(() => {
    let src = data?.rows ?? [];

    if (!showBalanceSheet) src = src.filter(r => !isBalanceSheetRow(r));
    if (!showProfitLoss) src = src.filter(r => !isProfitLossRow(r));

    if (partiesOnly) {
      src = src.filter(r => {
        const party = partyByAccountId.get(r.accountId);
        return !!party && isFmCategoryEnabled(party.categoryId);
      });
    } else if (fmCategoryFilterActive) {
      src = src.filter(r => {
        const party = partyByAccountId.get(r.accountId);
        if (!party) return true;
        return isFmCategoryEnabled(party.categoryId);
      });
    }

    if (!showZero) {
      src = src.filter(r => {
        const db = r.debitBalance ?? 0;
        const cr = r.creditBalance ?? 0;
        const vd = r.valuatedDebit ?? 0;
        const vc = r.valuatedCredit ?? 0;
        return Math.abs(db) > 0 || Math.abs(cr) > 0 || Math.abs(vd) > 0 || Math.abs(vc) > 0;
      });
    }

    const raw = search.trim();
    if (raw) {
      // ‎الإدخال الرقمي يطابق "بادئة كود الحساب" (يسار → يمين). نظام الأكواد
      // ‎هرمي، فالبحث بـ "11" يجب أن يُرجع الحسابات التي تبدأ بـ 11 فقط، لا
      // ‎كل حساب يتضمّن الرقم 11 في موضع ما.
      const compact = raw.replace(/\s+/g, '');
      if (compact.length > 0 && /^\d+$/.test(compact)) {
        src = src.filter(r => (r.accountCode ?? '').startsWith(compact));
      } else {
        const lq = raw.toLowerCase();
        src = src.filter(r =>
          r.accountCode.toLowerCase().includes(lq) ||
          r.accountName.toLowerCase().includes(lq) ||
          displayAccountName(r.accountCode, r.accountName).toLowerCase().includes(lq) ||
          r.currency.toLowerCase().includes(lq),
        );
      }
    }

    if (balanceSort !== 'none') {
      const absBalance = (r: AccountBalanceRowDto) =>
        Math.abs((r.valuatedDebit ?? 0) - (r.valuatedCredit ?? 0)) ||
        Math.abs((r.debitBalance ?? 0) - (r.creditBalance ?? 0));
      src = [...src].sort((a, b) =>
        balanceSort === 'desc'
          ? absBalance(b) - absBalance(a)
          : absBalance(a) - absBalance(b),
      );
    }

    return src;
  }, [data, search, showZero, showBalanceSheet, showProfitLoss, partiesOnly, fmCategoryFilterActive, isFmCategoryEnabled, partyByAccountId, balanceSort, accountNamesByCode, locale]);

  /** إجمالي الصفوف الظاهرة — من الأوراق فقط لتجنّب تكرار أرصدة الآباء. */
  const displayTotals = useMemo(() => {
    const leafRows = rows.filter(r => r.isLeaf);
    return leafRows.reduce(
      (t, r) => ({
        totalDebit: t.totalDebit + (r.debitBalance ?? 0),
        totalCredit: t.totalCredit + (r.creditBalance ?? 0),
        totalValuatedDebit: t.totalValuatedDebit + (r.valuatedDebit ?? 0),
        totalValuatedCredit: t.totalValuatedCredit + (r.valuatedCredit ?? 0),
      }),
      { totalDebit: 0, totalCredit: 0, totalValuatedDebit: 0, totalValuatedCredit: 0 },
    );
  }, [rows]);

  useEffect(() => {
    if (!highlightRow || !rows.length || highlightDoneRef.current) return;
    const selector = highlightRow.currency
      ? `[data-ab-account-id="${highlightRow.accountId}"][data-ab-currency="${highlightRow.currency}"]`
      : `[data-ab-account-id="${highlightRow.accountId}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    highlightDoneRef.current = true;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    const timer = setTimeout(() => setHighlightRow(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightRow, rows]);

  // ── الانتقال لكشف الحساب مع تعبئة الحساب والتاريخ
  const handleAccountLink = useCallback((row: AccountBalanceRowDto) => {
    try {
      sessionStorage.setItem('account-statement:return-state', JSON.stringify({
        from,
        to,
        accountId: row.accountId,
        accountLabel: `${row.accountCode} - ${displayAccountName(row.accountCode, row.accountName)}`,
        selectedCurrencies: row.currency ? [row.currency] : [],
        autoSubmit: true,
        ts: Date.now(),
      }));
      saveStatementSource({
        sourcePath: '/accounting/account-balances',
        sourceLabelKey: 'sidebar.items.accountBalances',
        restoreKey: ReportNavKeys.accountBalancesRestore,
        restore: {
          from,
          to,
          accountId,
          accountLabel,
          currency,
          valuated,
          maxLevel,
          leavesOnly,
          includeDraft,
          includeOpeningEntries,
          showZero,
          showBalanceSheet,
          showProfitLoss,
          showFmPartyTypes,
          partiesOnly,
          fmCategoryEnabled,
          balanceSort,
          search,
          triggered: true,
          runKeys: runKeys ?? { from, to, accountId, currency, valuated, maxLevel, leavesOnly, includeDraft, includeOpeningEntries },
        },
        highlightAccountId: row.accountId,
        highlightCurrency: row.currency,
      });
    } catch {}
    navigate('/accounting/account-statement');
  }, [
    navigate, from, to, accountId, accountLabel, currency, valuated, maxLevel, leavesOnly, includeDraft, includeOpeningEntries,
    showZero, showBalanceSheet, showProfitLoss, showFmPartyTypes, partiesOnly, fmCategoryEnabled,
    balanceSort, search, runKeys, accountNamesByCode, locale,
  ]);

  // ── الطباعة: الجدول ديناميكي حسب البيانات (يحترم البحث المحلي و الإجماليات
  //    تُعاد حسابها من الصفوف المُصفّاة لتطابق ما يراه المستخدم).
  const handlePrint = useCallback(() => {
    if (!data) return;

    // إجماليات الأوراق الظاهرة فقط (بعد الفلترة المحلية)
    const leafRows = rows.filter(r => r.isLeaf);
    let totalDebit = 0, totalCredit = 0, totalValuatedDebit = 0, totalValuatedCredit = 0;
    for (const r of leafRows) {
      totalDebit += r.debitBalance ?? 0;
      totalCredit += r.creditBalance ?? 0;
      totalValuatedDebit += r.valuatedDebit ?? 0;
      totalValuatedCredit += r.valuatedCredit ?? 0;
    }

    // ‎قاموس code→nameEn من شجرة الحسابات حتى تستخدمه الطباعة الإنجليزية
    const accountNamesEn: Record<string, string> = {};
    const walk = (nodes: any[]) => {
      for (const n of nodes ?? []) {
        if (n?.code && n?.nameEn) accountNamesEn[n.code] = n.nameEn;
        if (Array.isArray(n?.children) && n.children.length > 0) walk(n.children);
      }
    };
    walk(treeQuery.data ?? []);

    const partiesByAccountId: Record<number, { kind: string; categoryNameAr: string; categoryNameEn?: string | null }> = {};
    for (const party of partyByAccountId.values()) {
      partiesByAccountId[party.accountId] = {
        kind: party.kind,
        categoryNameAr: party.categoryNameAr,
        categoryNameEn: party.categoryNameEn,
      };
    }

    printAccountBalances(
      {
        ...data,
        rows,
        totalDebit,
        totalCredit,
        totalValuatedDebit,
        totalValuatedCredit,
      },
      companyQuery.data ?? null,
      {
        accountLabel: accountLabel || undefined,
        searchFilter: search.trim() || undefined,
        accountNamesEn,
        showFmPartyTypes: showFmPartyColumn,
        partiesOnly,
        fmCategoriesEnabled: fmCategories
          .filter(cat => isFmCategoryEnabled(cat.id))
          .map(cat => localizedAccountName(locale, cat.nameAr, cat.nameEn)),
        fmCategoriesTotal: fmCategories.length,
        partiesByAccountId,
      },
    );
    void auditApi.logPrint({
      entityType: 'AccountBalances',
      entityId: '*',
      summary: accountLabel ? `طباعة أرصدة الحسابات — ${accountLabel}` : 'طباعة أرصدة الحسابات',
      details: {
        accountLabel: accountLabel || null,
        searchFilter: search.trim() || null,
        rowCount: rows.length,
      },
    });
  }, [data, rows, companyQuery.data, accountLabel, search, treeQuery.data, showFmPartyColumn, showPartyTypeInTypeColumn, partiesOnly, fmCategories, isFmCategoryEnabled, locale, partyByAccountId]);

  return (
    <div className="space-y-3">
      {/* ── الفلاتر */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <DateRangePresets from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[9.5rem_9.5rem_minmax(0,1fr)_10.5rem]">
            <div className="min-w-0">
              <Label className="mb-1 text-[11px] text-muted-foreground">{t('accountBalances.filters.fromDate')}</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-full max-w-[9.5rem] text-sm" />
            </div>
            <div className="min-w-0">
              <Label className="mb-1 text-[11px] text-muted-foreground">{t('accountBalances.filters.toDate')}</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-full max-w-[9.5rem] text-sm" />
            </div>
            <div className="min-w-0 md:col-span-2 lg:col-span-1">
              <Label className="mb-1 text-[11px] text-muted-foreground">{t('accountBalances.filters.account')}</Label>
              <AccountPicker
                value={accountId}
                label={accountLabel}
                onSelect={(id, lbl) => { setAccountId(id); setAccountLabel(lbl); }}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Coins className="h-3 w-3" /> {t('accountBalances.filters.currency')}
              </Label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-secondary/40 px-2 text-sm"
              >
                <option value="">{t('accountBalances.filters.allCurrencies')}</option>
                {(currenciesQuery.data ?? []).map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {locale === 'en' ? (c.nameEn || c.nameAr) : c.nameAr}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1">
              <Label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Layers className="h-3 w-3" /> {t('accountBalances.filters.treeLevel')}
                <span className="ms-1 text-[9px] text-muted-foreground/70">
                  ({maxLevel === '' ? t('accountBalances.filters.allLevels') : `≤ ${maxLevel}`})
                </span>
              </Label>
              <div
                role="radiogroup"
                aria-label={t('accountBalances.filters.treeLevel')}
                className="flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-secondary/40 text-xs"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={maxLevel === ''}
                  onClick={() => setMaxLevel('')}
                  title={t('accountBalances.filters.allLevels')}
                  className={cn(
                    'flex flex-1 items-center justify-center px-2 font-medium transition',
                    maxLevel === ''
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {t('accountBalances.filters.allLevels')}
                </button>
                {Array.from({ length: MAX_LEVELS }, (_, i) => i + 1).map(lv => (
                  <button
                    key={lv}
                    type="button"
                    role="radio"
                    aria-checked={maxLevel === lv}
                    onClick={() => setMaxLevel(lv)}
                    title={t('accountBalances.filters.levelUpTo', { level: lv })}
                    className={cn(
                      'flex w-7 items-center justify-center border-r border-input/60 font-semibold tabular-nums transition',
                      maxLevel === lv
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[140px]">
              <Label className="mb-1 text-[11px] text-muted-foreground">الفرع</Label>
              <BranchFilterSelect
                value={branchFilter}
                onChange={setBranchFilter}
                showAllOption
                className="w-full"
                selectClassName="h-8 w-full"
              />
            </div>
            <div ref={optionsPanelRef} className="relative flex items-end gap-2">
              {canReadParties && (
                <div ref={fmOptionsPanelRef} className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="relative h-8 gap-1.5 px-2.5"
                    onClick={() => {
                      setFmOptionsOpen(v => !v);
                      setOptionsOpen(false);
                    }}
                    title={t('accountBalances.filters.fmSection')}
                    aria-expanded={fmOptionsOpen}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                    {fmOptionsActiveCount > 0 && (
                      <span className="absolute -top-1 end-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                        {fmOptionsActiveCount}
                      </span>
                    )}
                  </Button>
                  {fmOptionsOpen && (
                    <div
                      className="absolute end-0 top-[calc(100%+4px)] z-50 w-64 rounded-lg border border-border bg-popover shadow-lg"
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      <div className="border-b border-border/60 bg-secondary/30 px-3 py-2 text-xs font-semibold">
                        {t('accountBalances.filters.fmSection')}
                      </div>
                      <div className="flex max-h-[min(70vh,24rem)] flex-col gap-1 overflow-y-auto p-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                          <input type="checkbox" checked={showFmPartyTypes} onChange={e => setShowFmPartyTypes(e.target.checked)} className="h-3.5 w-3.5" />
                          {t('accountBalances.filters.showFmPartyTypes')}
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                          <input type="checkbox" checked={partiesOnly} onChange={e => setPartiesOnly(e.target.checked)} className="h-3.5 w-3.5" />
                          {t('accountBalances.filters.partiesOnly')}
                        </label>
                        <div className="my-1 flex items-center justify-between gap-2 border-t border-border/60 px-2 pt-2">
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {t('accountBalances.filters.fmKindsSection')}
                          </span>
                          {fmCategories.length > 0 && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-medium text-primary hover:underline">
                              <input
                                ref={fmSelectAllRef}
                                type="checkbox"
                                checked={allFmCategoriesSelected}
                                onChange={e => toggleAllFmCategories(e.target.checked)}
                                className="h-3 w-3"
                              />
                              {t('common.selectAll')}
                            </label>
                          )}
                        </div>
                        {fmCategories.length === 0 ? (
                          <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            {categoriesQuery.isLoading
                              ? t('common.loading')
                              : t('financialManagement.categories.empty')}
                          </p>
                        ) : (
                          fmCategories.map(cat => (
                            <label key={cat.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                              <input
                                type="checkbox"
                                checked={isFmCategoryEnabled(cat.id)}
                                onChange={e => setFmCategoryEnabled(prev => ({ ...prev, [cat.id]: e.target.checked }))}
                                className="h-3.5 w-3.5"
                              />
                              {localizedAccountName(locale, cat.nameAr, cat.nameEn)}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="relative h-8 gap-1.5 px-2.5"
                onClick={() => {
                  setOptionsOpen(v => !v);
                  setFmOptionsOpen(false);
                }}
                title={t('accountBalances.filters.options')}
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
                    {t('accountBalances.filters.options')}
                  </div>
                  <div className="flex flex-col gap-1 p-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input type="checkbox" checked={leavesOnly} onChange={e => setLeavesOnly(e.target.checked)} className="h-3.5 w-3.5" />
                      {t('accountBalances.filters.leavesOnly')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input type="checkbox" checked={showBalanceSheet} onChange={e => setShowBalanceSheet(e.target.checked)} className="h-3.5 w-3.5" />
                      {t('accountBalances.filters.showBalanceSheet')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input type="checkbox" checked={showProfitLoss} onChange={e => setShowProfitLoss(e.target.checked)} className="h-3.5 w-3.5" />
                      {t('accountBalances.filters.showProfitLoss')}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} className="h-3.5 w-3.5" />
                      {t('accountBalances.filters.showZero')}
                    </label>
                    <label className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50', currency && 'cursor-not-allowed opacity-50')}>
                      <input
                        type="checkbox"
                        checked={valuated && !currency}
                        onChange={e => setValuated(e.target.checked)}
                        disabled={!!currency}
                        className="h-3.5 w-3.5"
                      />
                      {t('accountBalances.filters.valuated', { currency: baseCurrency?.code ?? 'IQD' })}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50">
                      <input type="checkbox" checked={includeDraft} onChange={e => setIncludeDraft(e.target.checked)} className="h-3.5 w-3.5" />
                      {t('accountBalances.filters.includeDraft')}
                    </label>
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50"
                      title={t('accountBalances.filters.includeOpeningEntriesTip')}
                    >
                      <input type="checkbox" checked={includeOpeningEntries} onChange={e => setIncludeOpeningEntries(e.target.checked)} className="h-3.5 w-3.5" />
                      {t('accountBalances.filters.includeOpeningEntries')}
                    </label>
                  </div>
                </div>
              )}
              <Button onClick={handleRun} disabled={!from || !to} className="h-8 gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" />
                {t('accountBalances.filters.run')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── تحميل / خطأ */}
      {isLoading && <LoadingSpinner text={t('accountBalances.loading')} />}
      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
            {t('accountBalances.fetchFailed')}
          </CardContent>
        </Card>
      )}

      {/* ── الرسالة الأولية */}
      {!triggered && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">
              {t('accountBalances.promptTitle')}{' '}
              <strong>{t('accountBalances.filters.run')}</strong>
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── النتائج */}
      {data && !isLoading && (
        <>
          {/* شريط المعلومات + بحث */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
              <span>{t('accountBalances.info.accountsCount', { count: data.rows.length })}</span>
              {data.fxBulletinName && (
                <span className="flex items-center gap-1 text-xs">
                  <Coins className="h-3.5 w-3.5" />
                  {t('accountBalances.info.bulletin', { name: data.fxBulletinName })}
                </span>
              )}
              {data.fxUsedFallback && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t('accountBalances.info.fxFallback')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={balanceSort}
                onChange={e => setBalanceSort(e.target.value as 'none' | 'desc' | 'asc')}
                className="h-8 rounded-md border border-border bg-secondary/30 px-2 text-xs"
                title={t('accountBalances.filters.sortBalance')}
              >
                <option value="none">{t('accountBalances.filters.sortNone')}</option>
                <option value="desc">{t('accountBalances.filters.sortDesc')}</option>
                <option value="asc">{t('accountBalances.filters.sortAsc')}</option>
              </select>
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('accountBalances.info.quickSearch')} className="h-8 w-40 text-sm" />
              {search && (
                <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={!rows.length}
                className="h-8 gap-1.5"
                title={t('accountBalances.info.printTooltip')}
              >
                <Printer className="h-3.5 w-3.5" />
                {t('accountBalances.info.print')}
              </Button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title={t('accountBalances.empty.title')}
              description={t('accountBalances.empty.description')}
              icon={Wallet}
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="table-scroll account-balances-scroll p-0">
                <table className="data-table account-balances-table text-xs">
                  <thead>
                    <tr className="border-b-2 border-border/60">
                      <th className={cn(AB_PIN_IDX, AB_PIN_SOLID, 'text-center align-middle text-muted-foreground')}>#</th>
                      <th className={cn(AB_PIN_CODE, AB_PIN_SOLID, 'text-right align-middle')}>{t('accountBalances.table.code')}</th>
                      <th className={cn(AB_PIN_ACCOUNT, AB_PIN_SOLID, 'text-right align-middle')}>{t('accountBalances.table.account')}</th>
                      <th className={cn(AB_PIN_TYPE, AB_PIN_SOLID, 'text-center align-middle')}>
                        {showPartyTypeInTypeColumn
                          ? t('accountBalances.table.fmPartyKind')
                          : t('accountBalances.table.type')}
                      </th>
                      {showFmPartyColumn && (
                        <th className="tb-fm-party bg-card min-w-[7.5rem] text-center align-middle">
                          {t('accountBalances.table.fmPartyKind')}
                        </th>
                      )}
                      <th className="tb-currency bg-card text-center align-middle">{t('accountBalances.table.currency')}</th>
                      <th className={cn(AB_AMT, 'bg-secondary/30 text-center')}>{t('accountBalances.table.debitBalance')}</th>
                      <th className={cn(AB_AMT_END, 'bg-secondary/30 text-center')}>{t('accountBalances.table.creditBalance')}</th>
                      {data.valuated && (
                        <>
                          <th className={cn(AB_AMT, 'bg-amber-500/10 text-center text-amber-400')}>
                            {t('accountBalances.table.valuatedDebit', { currency: data.baseCurrency })}
                          </th>
                          <th className={cn(AB_AMT_END, 'bg-amber-500/10 text-center text-amber-400')}>
                            {t('accountBalances.table.valuatedCredit', { currency: data.baseCurrency })}
                          </th>
                        </>
                      )}
                      {canOpenStatement && (
                        <th className={cn(AB_PIN_ACTIONS, AB_PIN_SOLID, 'w-11 min-w-[2.75rem] px-1 text-center align-middle')}>
                          {t('accountBalances.table.actions')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const party = partyByAccountId.get(row.accountId);
                      return (
                      <tr
                        key={`${row.accountId}-${row.currency}`}
                        data-ab-account-id={row.accountId}
                        data-ab-currency={row.currency}
                        className={cn(
                          'transition-colors hover:bg-secondary/30',
                          highlightRow?.accountId === row.accountId
                            && (!highlightRow.currency || highlightRow.currency === row.currency)
                            && 'bg-primary/15 ring-2 ring-primary/60 ring-inset',
                        )}
                      >
                        <td className={cn(AB_PIN_IDX, AB_PIN_SOLID, 'text-center text-muted-foreground')}>{i + 1}</td>
                        <td className={cn(AB_PIN_CODE, AB_PIN_SOLID, 'num-display text-primary')}>{row.accountCode}</td>
                        <td className={cn(AB_PIN_ACCOUNT, AB_PIN_SOLID)}>
                          <span
                            className="block truncate font-medium"
                            style={{ paddingInlineStart: `${(row.level - 1) * 12}px` }}
                            title={displayAccountName(row.accountCode, row.accountName)}
                          >
                            {displayAccountName(row.accountCode, row.accountName)}
                          </span>
                        </td>
                        <td className={cn(AB_PIN_TYPE, AB_PIN_SOLID, 'text-center')}>
                          {showPartyTypeInTypeColumn && party ? (
                            <span
                              className={cn(
                                'inline-flex max-w-[8rem] items-center truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                                FM_KIND_COLORS[party.kind],
                              )}
                              title={displayPartyCategoryName(party, locale)}
                            >
                              {displayPartyCategoryName(party, locale)}
                            </span>
                          ) : (
                            <span className={cn(
                              'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                              TYPE_COLORS[row.accountType] ?? 'text-muted-foreground',
                            )}>
                              {t(`accountBalances.types.${row.accountType}`, { defaultValue: row.accountType })}
                            </span>
                          )}
                        </td>
                        {showFmPartyColumn && (
                          <td className="tb-fm-party bg-card text-center">
                            {party ? (
                              <span
                                className={cn(
                                  'inline-flex max-w-[8rem] items-center truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                                  FM_KIND_COLORS[party.kind],
                                )}
                                title={displayPartyCategoryName(party, locale)}
                              >
                                {displayPartyCategoryName(party, locale)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        )}
                        <td className="tb-currency bg-card text-center">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {row.currency}
                          </span>
                        </td>
                        <td className={AB_AMT}>
                          {row.debitBalance > 0
                            ? <span className="font-semibold text-emerald-400">{fmt(row.debitBalance)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className={AB_AMT_END}>
                          {row.creditBalance > 0
                            ? <span className="font-semibold text-rose-400">{fmt(row.creditBalance)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        {data.valuated && (
                          <>
                            <td className={AB_AMT}>
                              {row.valuatedDebit > 0
                                ? <span className="font-semibold text-amber-400">{fmt(row.valuatedDebit)}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className={AB_AMT_END}>
                              {row.valuatedCredit > 0
                                ? <span className="font-semibold text-amber-400">{fmt(row.valuatedCredit)}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          </>
                        )}
                        {canOpenStatement && (
                          <td className={cn(AB_PIN_ACTIONS, AB_PIN_SOLID, 'w-11 min-w-[2.75rem] px-1 text-center')}>
                            {row.isLeaf && (
                              <AccountBalanceRowActionsMenu
                                onOpenStatement={() => handleAccountLink(row)}
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
                      <td colSpan={showFmPartyColumn ? 6 : 5} className={cn(AB_PIN_IDX, AB_PIN_SOLID, 'text-right')}>
                        {t('accountBalances.table.total', { count: rows.length })}
                      </td>
                      <td className={cn(AB_AMT, 'text-emerald-400')}>{fmt(displayTotals.totalDebit)}</td>
                      <td className={cn(AB_AMT_END, 'text-rose-400')}>{fmt(displayTotals.totalCredit)}</td>
                      {data.valuated && (
                        <>
                          <td className={cn(AB_AMT, 'text-amber-400')}>{fmt(displayTotals.totalValuatedDebit)}</td>
                          <td className={cn(AB_AMT_END, 'text-amber-400')}>{fmt(displayTotals.totalValuatedCredit)}</td>
                        </>
                      )}
                      {canOpenStatement && <td className={cn(AB_PIN_ACTIONS, AB_PIN_SOLID, 'w-11 min-w-[2.75rem]')} />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function AccountBalanceRowActionsMenu({
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
        title={t('accountBalances.table.actionsMenuTip')}
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
            {t('accountBalances.table.accountStatement')}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
