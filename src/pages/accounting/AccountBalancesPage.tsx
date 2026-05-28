import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wallet, FileText, Layers, Coins, AlertTriangle,
  Search, ChevronRight, ChevronLeft, X, BarChart2, Printer,
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
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { companySettingsApi } from '@/lib/api/companySettings';
import { formatAmount, cn } from '@/lib/utils';
import { useLocale, localizedAccountName } from '@/lib/i18n';
import { printAccountBalances } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import type { AccountBalanceRowDto } from '@/types/api';

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt(n: number): string {
  if (!n || Math.abs(n) < 0.005) return '—';
  return formatAmount(n, 2);
}

const TYPE_COLORS: Record<string, string> = {
  Asset:     'text-blue-400 bg-blue-500/10 border-blue-500/30',
  Liability: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Equity:    'text-violet-400 bg-violet-500/10 border-violet-500/30',
  Revenue:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Expense:   'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

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
            'flex h-9 flex-1 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
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
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"
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
  const { locale } = useLocale();

  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 5 * 60 * 1000,
  });
  const baseCurrency = useMemo(
    () => currenciesQuery.data?.find(c => c.isBase) ?? null,
    [currenciesQuery.data],
  );

  const fiscalQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  // إعدادات الشركة (لاستخدامها في ترويسة الطباعة: لوغو/اسم/عنوان/تذييل)
  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });
  const currentFY = useMemo(() => {
    const list = fiscalQuery.data ?? [];
    if (!list.length) return null;
    const active = list.find(f => f.isActive);
    if (active) return active;
    const today = toISODate(new Date());
    return list.find(f => {
      const s = (f.startDate ?? '').slice(0, 10);
      const e = (f.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e && !f.isClosed;
    }) ?? [...list].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0] ?? null;
  }, [fiscalQuery.data]);

  // ── الفلاتر
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountLabel, setAccountLabel] = useState('');
  const [currency, setCurrency] = useState('');
  const [valuated, setValuated] = useState(true);   // ← مقوَّم افتراضياً
  const [maxLevel, setMaxLevel] = useState<number | ''>('');
  const [leavesOnly, setLeavesOnly] = useState(true);
  const [includeDraft, setIncludeDraft] = useState(false);
  const [hideZero, setHideZero] = useState(true);
  const [balanceSort, setBalanceSort] = useState<'none' | 'desc' | 'asc'>('none');
  const [search, setSearch] = useState('');

  // ── التنفيذ اليدوي (زر "عرض الأرصدة")
  const [triggered, setTriggered] = useState(false);
  // مفاتيح الاستعلام المُنفَّذ فعلاً (تتغير فقط عند الضغط)
  const [runKeys, setRunKeys] = useState<object | null>(null);

  // ── فترة افتراضية
  useEffect(() => {
    if (from && to) return;
    const today = toISODate(new Date());
    if (currentFY) {
      const s = (currentFY.startDate ?? '').slice(0, 10);
      if (s) setFrom(p => p || s);
      setTo(p => p || today);
    } else {
      setFrom(p => p || toISODate(new Date(new Date().getFullYear(), 0, 1)));
      setTo(p => p || today);
    }
  }, [currentFY, from, to]);

  useEffect(() => { if (currency) setValuated(false); }, [currency]);

  const handleRun = () => {
    setTriggered(true);
    setRunKeys({ from, to, accountId, currency, valuated, maxLevel, leavesOnly, includeDraft });
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
    }),
    enabled: !!runKeys && !!from && !!to,
  });

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

    // ‎إخفاء الحسابات ذات الرصيد الصفري (مدين + دائن = 0 في جميع الأعمدة)
    if (hideZero) {
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
  }, [data, search, hideZero, balanceSort, accountNamesByCode, locale]);

  // ── الانتقال لكشف الحساب مع تعبئة الحساب والتاريخ
  const handleAccountLink = useCallback((row: AccountBalanceRowDto) => {
    try {
      sessionStorage.setItem('account-statement:return-state', JSON.stringify({
        from,
        to,
        accountId: row.accountId,
        // ‎نمرّر اسم الحساب أيضاً ليظهر في حقل البحث في صفحة كشف الحساب،
        // ‎حتى لو كان الحساب «أب» (غير ورقة) ولا يوجد في قائمة الأوراق التي
        // ‎يستهلكها الـ AccountPicker هناك.
        accountLabel: `${row.accountCode} - ${row.accountName}`,
        selectedCurrencies: [],
        autoSubmit: true,
        ts: Date.now(),
      }));
    } catch {}
    navigate('/accounting/account-statement');
  }, [navigate, from, to]);

  // ── الطباعة: الجدول ديناميكي حسب البيانات (يحترم البحث المحلي و الإجماليات
  //    تُعاد حسابها من الصفوف المُصفّاة لتطابق ما يراه المستخدم).
  const handlePrint = useCallback(() => {
    if (!data) return;

    // إجماليات الصفوف الظاهرة فعلياً (بعد البحث المحلي)
    let totalDebit = 0, totalCredit = 0, totalValuatedDebit = 0, totalValuatedCredit = 0;
    for (const r of rows) {
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
  }, [data, rows, companyQuery.data, accountLabel, search, treeQuery.data]);

  return (
    <div className="space-y-3">
      {/* ── الفلاتر */}
      <Card>
        <CardContent className="space-y-2.5 p-3">
          {/* التواريخ */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">{t('accountBalances.filters.fromDate')}</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('accountBalances.filters.toDate')}</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" />
            </div>
            <div className="col-span-2 flex items-end">
              <DateRangePresets from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            </div>
          </div>

          {/* الحساب والعملة */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('accountBalances.filters.account')}</Label>
              <AccountPicker
                value={accountId}
                label={accountLabel}
                onSelect={(id, lbl) => { setAccountId(id); setAccountLabel(lbl); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('accountBalances.filters.currency')}</Label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-secondary/30 px-3 text-sm"
              >
                <option value="">{t('accountBalances.filters.allCurrencies')}</option>
                {(currenciesQuery.data ?? []).map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {locale === 'en' ? (c.nameEn || c.nameAr) : c.nameAr}</option>
                ))}
              </select>
            </div>
          </div>

          {/* خيارات + زر العرض */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs">{t('accountBalances.filters.maxLevel')}</Label>
                <select
                  value={maxLevel}
                  onChange={e => setMaxLevel(e.target.value === '' ? '' : Number(e.target.value))}
                  className="h-8 rounded-md border border-border bg-secondary/30 px-2 text-xs"
                >
                  <option value="">{t('accountBalances.filters.allLevels')}</option>
                  {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={leavesOnly}
                  onChange={e => setLeavesOnly(e.target.checked)} className="accent-primary" />
                {t('accountBalances.filters.leavesOnly')}
              </label>

              <label className={cn('flex cursor-pointer items-center gap-2 text-xs', currency && 'opacity-50 pointer-events-none')}>
                <input type="checkbox" checked={valuated}
                  onChange={e => setValuated(e.target.checked)}
                  disabled={!!currency} className="accent-primary" />
                <Coins className="h-3.5 w-3.5" />
                {t('accountBalances.filters.valuated', { currency: baseCurrency?.code ?? 'IQD' })}
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={includeDraft}
                  onChange={e => setIncludeDraft(e.target.checked)} className="accent-primary" />
                {t('accountBalances.filters.includeDraft')}
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={hideZero}
                  onChange={e => setHideZero(e.target.checked)} className="accent-primary" />
                {t('accountBalances.filters.hideZero', { defaultValue: 'إخفاء الأرصدة الصفرية' })}
              </label>

              <div className="flex items-center gap-2">
                <Label className="text-xs">{t('accountBalances.filters.sortBalance', { defaultValue: 'ترتيب الرصيد' })}</Label>
                <select
                  value={balanceSort}
                  onChange={e => setBalanceSort(e.target.value as 'none' | 'desc' | 'asc')}
                  className="h-8 rounded-md border border-border bg-secondary/30 px-2 text-xs"
                >
                  <option value="none">{t('accountBalances.filters.sortNone', { defaultValue: 'بدون ترتيب' })}</option>
                  <option value="desc">{t('accountBalances.filters.sortDesc', { defaultValue: 'أعلى رصيد' })}</option>
                  <option value="asc">{t('accountBalances.filters.sortAsc', { defaultValue: 'أقل رصيد' })}</option>
                </select>
              </div>
            </div>

            {/* زر عرض التقرير */}
            <Button
              onClick={handleRun}
              disabled={!from || !to}
              className="gap-2"
            >
              <BarChart2 className="h-4 w-4" />
              {t('accountBalances.filters.run')}
            </Button>
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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">#</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t('accountBalances.table.code')}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t('accountBalances.table.account')}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t('accountBalances.table.type')}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t('accountBalances.table.currency')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t('accountBalances.table.debitBalance')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t('accountBalances.table.creditBalance')}</th>
                      {data.valuated && (
                        <>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-amber-400">
                            {t('accountBalances.table.valuatedDebit', { currency: data.baseCurrency })}
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-amber-400">
                            {t('accountBalances.table.valuatedCredit', { currency: data.baseCurrency })}
                          </th>
                        </>
                      )}
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t('accountBalances.table.statement')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {rows.map((row, i) => (
                      <tr key={`${row.accountId}-${row.currency}`}
                        className="group transition-colors hover:bg-secondary/30">
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-primary">{row.accountCode}</td>
                        <td className="px-3 py-2">
                          <span className="text-sm font-medium"
                            style={{ paddingRight: `${(row.level - 1) * 12}px` }}>
                            {displayAccountName(row.accountCode, row.accountName)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn(
                            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                            TYPE_COLORS[row.accountType] ?? 'text-muted-foreground',
                          )}>
                            {t(`accountBalances.types.${row.accountType}`, { defaultValue: row.accountType })}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                            {row.currency}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-left font-mono text-sm">
                          {row.debitBalance > 0
                            ? <span className="font-semibold text-emerald-400">{fmt(row.debitBalance)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-2 text-left font-mono text-sm">
                          {row.creditBalance > 0
                            ? <span className="font-semibold text-rose-400">{fmt(row.creditBalance)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        {data.valuated && (
                          <>
                            <td className="px-3 py-2 text-left font-mono text-xs">
                              {row.valuatedDebit > 0
                                ? <span className="font-semibold text-amber-400">{fmt(row.valuatedDebit)}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2 text-left font-mono text-xs">
                              {row.valuatedCredit > 0
                                ? <span className="font-semibold text-amber-400">{fmt(row.valuatedCredit)}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-center">
                          <button type="button" title={t('accountBalances.table.statementTooltip')}
                            onClick={() => handleAccountLink(row)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/60 font-bold">
                      <td colSpan={5} className="px-3 py-2.5 text-right text-xs">
                        {t('accountBalances.table.total', { count: rows.length })}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-sm text-emerald-400">
                        {fmt(data.totalDebit)}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-sm text-rose-400">
                        {fmt(data.totalCredit)}
                      </td>
                      {data.valuated && (
                        <>
                          <td className="px-3 py-2.5 text-left font-mono text-sm text-amber-400">
                            {fmt(data.totalValuatedDebit)}
                          </td>
                          <td className="px-3 py-2.5 text-left font-mono text-sm text-amber-400">
                            {fmt(data.totalValuatedCredit)}
                          </td>
                        </>
                      )}
                      <td />
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
