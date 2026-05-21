import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Printer,
  CalendarRange,
  RotateCcw,
  AlertTriangle,
  GripVertical,
  Columns,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { JournalEntryViewDialog } from '@/components/accounting/JournalEntryViewDialog';
import { StatementRowActionsMenu } from '@/components/accounting/StatementRowActionsMenu';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { currenciesApi } from '@/lib/api/currencies';
import { formatAmount, formatDate, cn } from '@/lib/utils';
import { printAccountStatement } from '@/lib/printUtils';
import { useAuthStore } from '@/lib/auth/auth-store';
import type { AccountDto, AccountStatementDto, AccountStatementRowDto } from '@/types/api';

/** قائمة احتياطية تُستخدم فقط حتى ينتهي تحميل العملات من الـ API */
const FALLBACK_CURRENCIES = ['IQD', 'USD', 'EUR', 'SAR', 'AED'];

/** مفاتيح قديمة (قبل ربط الإعدادات بالمستخدم) — تُقرأ كاحتياطي فقط */
const LEGACY_COL_WIDTH_KEY = 'account-statement-col-widths';
const LEGACY_COL_ORDER_KEY = 'account-statement-col-order';
const LEGACY_COL_HIDDEN_KEY = 'account-statement-col-hidden';

type StatementLayoutStorageKeys = {
  widths: string;
  order: string;
  hidden: string;
};

/** نطاق تفضيلات تخطيط الجدول لكل مستخدم */
function statementLayoutStorageKeys(userNs: string): StatementLayoutStorageKeys {
  const enc = encodeURIComponent(userNs);
  return {
    widths: `account-statement-col-widths:user:${enc}`,
    order: `account-statement-col-order:user:${enc}`,
    hidden: `account-statement-col-hidden:user:${enc}`,
  };
}

type StatementColKey = 'idx' | 'date' | 'entry' | 'account' | 'desc' | 'debit' | 'credit' | 'balance' | 'valBalance' | 'currency' | 'actions';

const COL_LABEL: Record<StatementColKey, string> = {
  idx: '#',
  date: 'التاريخ',
  entry: 'السند / القيد',
  account: 'الحساب',
  desc: 'البيان',
  debit: 'مدين',
  credit: 'دائن',
  balance: 'الرصيد',
  valBalance: 'رصيد مقوم',
  currency: 'العملة',
  actions: 'إجراءات',
};

/** يُسمح إخفاء أي عمود عدا المرجع */
const REQUIRED_COL: StatementColKey = 'idx';

const COL_DEFAULT_WIDTH: Record<StatementColKey, number> = {
  idx: 50,
  date: 110,
  entry: 110,
  account: 240,
  desc: 280,
  debit: 130,
  credit: 130,
  balance: 140,
  valBalance: 150,
  currency: 70,
  actions: 80,
};

const COL_LIMITS: Partial<Record<StatementColKey, { min?: number; max?: number }>> = {
  idx: { min: 40, max: 80 },
  date: { min: 90, max: 160 },
  entry: { min: 80, max: 160 },
  account: { min: 140, max: 480 },
  desc: { min: 140, max: 900 },
  debit: { min: 100, max: 220 },
  credit: { min: 100, max: 220 },
  balance: { min: 110, max: 240 },
  valBalance: { min: 120, max: 280 },
  currency: { min: 56, max: 120 },
  actions: { min: 64, max: 140 },
};

const AMOUNT_KEYS: StatementColKey[] = ['debit', 'credit', 'balance', 'valBalance'];

function clampColWidth(key: StatementColKey, w: number): number {
  const { min = 48, max = 800 } = COL_LIMITS[key] ?? {};
  return Math.round(Math.min(max, Math.max(min, w)));
}

function defaultColumnOrder(includeAccount: boolean): StatementColKey[] {
  const o: StatementColKey[] = ['idx', 'date', 'entry'];
  if (includeAccount) o.push('account');
  o.push('desc', 'debit', 'credit', 'balance', 'valBalance', 'currency', 'actions');
  return o;
}

function allowedKeys(includeAccount: boolean): Set<StatementColKey> {
  const s = new Set<StatementColKey>(['idx', 'date', 'entry', 'desc', 'debit', 'credit', 'balance', 'valBalance', 'currency', 'actions']);
  if (includeAccount) s.add('account');
  return s;
}

function sanitizeOrder(saved: StatementColKey[] | null | undefined, includeAccount: boolean): StatementColKey[] {
  const def = defaultColumnOrder(includeAccount);
  const allow = allowedKeys(includeAccount);
  const base = !saved?.length ? def : saved.filter(k => allow.has(k));
  const merged: StatementColKey[] = [...base];
  def.forEach(k => {
    if (!merged.includes(k)) merged.push(k);
  });
  return merged.filter(k => allow.has(k));
}

function loadSavedColWidths(keys: StatementLayoutStorageKeys): Partial<Record<StatementColKey, number>> | null {
  try {
    const raw = localStorage.getItem(keys.widths) ?? localStorage.getItem(LEGACY_COL_WIDTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<Record<StatementColKey, number>>;
  } catch {
    return null;
  }
}

function loadColumnOrder(keys: StatementLayoutStorageKeys, includeAccount: boolean): StatementColKey[] {
  try {
    const raw = localStorage.getItem(keys.order) ?? localStorage.getItem(LEGACY_COL_ORDER_KEY);
    if (!raw) return defaultColumnOrder(includeAccount);
    const arr = JSON.parse(raw) as StatementColKey[];
    return sanitizeOrder(arr, includeAccount);
  } catch {
    return defaultColumnOrder(includeAccount);
  }
}

function loadHiddenCols(keys: StatementLayoutStorageKeys): Set<StatementColKey> {
  try {
    const raw = localStorage.getItem(keys.hidden) ?? localStorage.getItem(LEGACY_COL_HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as StatementColKey[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function firstAmountColumnIndex(cols: StatementColKey[]): number {
  const i = cols.findIndex(c => AMOUNT_KEYS.includes(c));
  return i < 0 ? cols.length : i;
}

function statementColDragMimeTypes(types: DOMStringList | readonly string[]): boolean {
  if (typeof window === 'undefined') return false;
  if ('contains' in types && typeof types.contains === 'function')
    return types.contains('text/plain') || types.contains('statement-col');
  return Array.from(types as string[]).some(t => t === 'text/plain' || t === 'statement-col');
}

function StatementColHead({
  colKey,
  width,
  draggable,
  isDropTarget,
  truncateLabel,
  className,
  children,
  onResizeDelta,
  onResizePersist,
  onDragEnterHeader,
  onDragLeaveHeader,
  onDropOnHeader,
  onGripDragEnd,
}: {
  colKey: StatementColKey;
  width: number;
  draggable?: boolean;
  isDropTarget?: boolean;
  truncateLabel?: boolean;
  className?: string;
  children: ReactNode;
  onResizeDelta: (key: StatementColKey, pixelDelta: number) => void;
  onResizePersist: () => void;
  onDragEnterHeader?: (e: ReactDragEvent<HTMLTableHeaderCellElement>) => void;
  onDragLeaveHeader?: (e: ReactDragEvent<HTMLTableHeaderCellElement>) => void;
  onDropOnHeader?: (e: ReactDragEvent<HTMLTableHeaderCellElement>) => void;
  onGripDragEnd?: () => void;
}) {
  const lastMoveX = useRef(0);

  const onGripDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    /* text/plain ضروري لتوافق السحب بين المتصفحات */
    e.dataTransfer.setData('text/plain', colKey);
    e.dataTransfer.setData('statement-col', colKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onResizeStripDown = (e: ReactMouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    lastMoveX.current = e.clientX;
    const rtl =
      typeof document !== 'undefined' &&
      (document.documentElement.dir === 'rtl' || Boolean(document.querySelector('[dir="rtl"]')));

    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - lastMoveX.current;
      lastMoveX.current = ev.clientX;
      const delta = rtl ? -dx : dx;
      onResizeDelta(colKey, delta);
    };

    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onResizePersist();
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <th
      className={cn(
        'group relative h-10 select-none align-middle overflow-visible border-e border-border/50 whitespace-nowrap',
        isDropTarget && 'bg-primary/15 ring-2 ring-primary/40 ring-inset',
        className
      )}
      style={{ width, minWidth: width, maxWidth: width }}
      onDragEnter={onDragEnterHeader}
      onDragLeave={onDragLeaveHeader}
      onDrop={onDropOnHeader}
      onDragOver={e => {
        if (statementColDragMimeTypes(e.dataTransfer.types)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
    >
      <span
        className={cn(
          'block leading-tight',
          truncateLabel && 'overflow-hidden text-ellipsis'
        )}
      >
        {children}
      </span>

      {draggable ? (
        <div
          role="presentation"
          draggable
          onDragStart={onGripDragStart}
          onDragEnd={onGripDragEnd}
          title={`إعادة ترتيب عمود «${COL_LABEL[colKey]}»`}
          aria-label={`سحب لإعادة ترتيب عمود ${COL_LABEL[colKey]}`}
          className="absolute top-1/2 z-30 -translate-y-1/2 cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-accent/70 hover:text-primary group-hover:opacity-100 active:cursor-grabbing"
          style={{ insetInlineStart: '2px' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" strokeWidth={2} />
        </div>
      ) : null}

      <span
        role="separator"
        aria-hidden="true"
        title="ضبط عرض العمود"
        onMouseDown={onResizeStripDown}
        className="group/resizer absolute inset-y-0 z-40 flex cursor-col-resize items-center justify-center"
        style={{ width: '6px', insetInlineEnd: '-3px' }}
      >
        <span className="block h-4 w-px rounded-full bg-border transition-all group-hover/resizer:h-6 group-hover/resizer:w-0.5 group-hover/resizer:bg-primary" />
      </span>
    </th>
  );
}

function SummaryCell({
  label,
  value,
  accent,
  subtitle,
  highlight,
  icon,
}: {
  label: string;
  value: number;
  accent: string;
  subtitle?: string;
  highlight?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'group/sum relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-border hover:shadow-sm',
        highlight && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {icon ? <div className={cn('opacity-70', accent)}>{icon}</div> : null}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums num-display tracking-tight', accent)}>
        {formatAmount(value)}
      </div>
      {subtitle ? (
        <div className="mt-1.5 text-[10.5px] leading-tight text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

/**
 * يُحدِّد المسار الأنسب لفتح "أصل القيد" بناءً على المصدر/المرجع:
 *   - إذا كان القيد يدوياً (Manual) أو لا يوجد له مصدر خارجي → يفتح القيد نفسه للتحرير.
 *   - إذا كان مولّداً من فاتورة/إيصال/حركة → يفتح المستند الأصلي للتحرير.
 *
 * بعد التعديل وحفظ التغييرات يُمكن المستخدم الرجوع إلى صفحة الكشف عبر زر "رجوع".
 */
function resolveSourceLink(row: {
  entryId: number;
  source?: string;
  referenceType?: string | null;
  referenceId?: number | null;
}): { href: string; label: string } {
  const src = (row.source || '').trim();
  const refType = (row.referenceType || '').trim();
  const refId = row.referenceId;
  switch (src) {
    case 'SalesInvoice':
      if (refId) return { href: `/sales/invoices/${refId}`, label: 'فاتورة بيع' };
      break;
    case 'PurchaseInvoice':
      if (refId) return { href: `/purchases/invoices/${refId}`, label: 'فاتورة شراء' };
      break;
    case 'Payment':
      if (refId) return { href: `/finance/payments/${refId}`, label: 'إيصال دفع' };
      break;
    case 'Receipt':
      if (refId) return { href: `/finance/receipts/${refId}`, label: 'إيصال قبض' };
      break;
    case 'StockMovement':
      if (refId) return { href: `/inventory/movements/${refId}`, label: 'حركة مخزون' };
      break;
    case 'CommissionPayment':
      if (refId) return { href: `/finance/commissions/${refId}`, label: 'دفعة عمولة' };
      break;
    case 'SalaryPayment':
      if (refId) return { href: `/hr/salaries/${refId}`, label: 'دفعة راتب' };
      break;
    default:
      if (refId) {
        if (refType.toLowerCase().includes('sales')) return { href: `/sales/invoices/${refId}`, label: 'فاتورة بيع' };
        if (refType.toLowerCase().includes('purchase')) return { href: `/purchases/invoices/${refId}`, label: 'فاتورة شراء' };
      }
      break;
  }
  // قيد يدوي أو مصدر غير معروف → يفتح القيد نفسه للتحرير
  return { href: `/accounting/journal/${row.entryId}/edit`, label: 'قيد يدوي' };
}

function flattenLeaves(tree: AccountDto[]): AccountDto[] {
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

export function AccountStatementPage() {
  const today = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();

  const reportPrefsUserNs = useAuthStore(s => s.user?.id ?? '__guest__');
  const layoutKeysRef = useRef(statementLayoutStorageKeys(reportPrefsUserNs));
  layoutKeysRef.current = statementLayoutStorageKeys(reportPrefsUserNs);

  /**
   * مفتاح تخزين الحالة (فلاتر/نتائج الكشف) في sessionStorage حتى نستعيدها عند
   * الرجوع من صفحة "أصل القيد". يُحذف بعد الاستعادة لتجنّب التعارض مع زيارة عادية.
   */
  const RETURN_STATE_KEY = 'account-statement:return-state';
  const RETURN_STATE_TTL_MS = 30 * 60 * 1000; // 30 دقيقة

  // محاولة استعادة الحالة المحفوظة عند الرجوع من صفحة المصدر
  const initialReturnState = (() => {
    try {
      const raw = sessionStorage.getItem(RETURN_STATE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(RETURN_STATE_KEY);
      const data = JSON.parse(raw) as {
        from: string;
        to: string;
        accountId: number | null;
        selectedCurrencies: string[];
        focusEntryId?: number | null;
        ts: number;
      };
      if (Date.now() - (data.ts || 0) > RETURN_STATE_TTL_MS) return null;
      return data;
    } catch {
      return null;
    }
  })();

  const [from, setFrom] = useState(initialReturnState?.from ?? '');
  const [to, setTo] = useState(initialReturnState?.to ?? today);
  const [accountId, setAccountId] = useState<number | null>(initialReturnState?.accountId ?? null);
  /** عملات مختارة (فارغ = جميع العملات). تعدد الاختيار يدعم checkboxes. */
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(
    initialReturnState?.selectedCurrencies ?? []
  );
  const [currencyPanelOpen, setCurrencyPanelOpen] = useState(false);

  /** معرّف القيد المعروض حالياً في النافذة المنبثقة (null = الـ Dialog مغلق) */
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);

  /**
   * معرّف القيد الذي يجب التمرير إليه وتمييزه مؤقتاً بعد الرجوع من صفحة "أصل القيد".
   * يُمسح بعد لحظات قليلة من إكمال التمرير (لإزالة التظليل).
   */
  const [focusEntryId, setFocusEntryId] = useState<number | null>(
    initialReturnState?.focusEntryId ?? null
  );
  /** عُلِّم عند ظهور البيانات لتنفيذ التمرير مرة واحدة فقط */
  const focusScrollDoneRef = useRef(false);

  // إزالة تظليل السطر بعد فترة وجيزة من ظهوره
  useEffect(() => {
    if (focusEntryId === null) return;
    const t = setTimeout(() => setFocusEntryId(null), 2500);
    return () => clearTimeout(t);
  }, [focusEntryId]);

  /**
   * يفتح أصل القيد في صفحته الأصلية، مع حفظ snapshot للفلاتر + معرّف السطر
   * الذي ضغط المستخدم عليه، حتى يمكن العودة لنفس السطر تماماً.
   */
  const openSourceWithReturn = useCallback((href: string, entryId: number) => {
    try {
      const snapshot = {
        from,
        to,
        accountId,
        selectedCurrencies,
        focusEntryId: entryId,
        ts: Date.now(),
      };
      sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify(snapshot));
    } catch {
      // تجاهل أخطاء sessionStorage (وضع الخصوصية مثلاً)
    }
    navigate(href, {
      state: {
        returnTo: '/accounting/account-statement',
        returnLabel: 'كشف الحساب',
      },
    });
  }, [from, to, accountId, selectedCurrencies, navigate]);

  /** العملات المُفعَّلة من إعدادات الشركة، مرتبة حسب DisplayOrder */
  const enabledCurrenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 60_000,
  });
  const CURRENCIES = useMemo(
    () =>
      (enabledCurrenciesQuery.data ?? []).length > 0
        ? enabledCurrenciesQuery.data!.map(c => c.code)
        : FALLBACK_CURRENCIES,
    [enabledCurrenciesQuery.data]
  );
  const [submitted, setSubmitted] = useState(false);
  /** هل عدّل المستخدم التواريخ يدوياً؟ لو نعم لا نستبدلها بقيم السنة المالية تلقائياً */
  const userTouchedDatesRef = useRef(false);

  const [reportData, setReportData] = useState<AccountStatementDto | null>(null);

  const widthsPersistRef = useRef<Record<StatementColKey, number>>({ ...COL_DEFAULT_WIDTH });
  const [colWidths, setColWidths] = useState<Record<StatementColKey, number>>(() => ({ ...COL_DEFAULT_WIDTH }));

  const [columnOrder, setColumnOrder] = useState<StatementColKey[]>(() => defaultColumnOrder(true));
  const columnOrderRef = useRef(columnOrder);
  columnOrderRef.current = columnOrder;

  const [hiddenCols, setHiddenCols] = useState<Set<StatementColKey>>(() => new Set());
  const hiddenRef = useRef(hiddenCols);
  hiddenRef.current = hiddenCols;

  const [colsPanelOpen, setColsPanelOpen] = useState(false);
  const [dropHoverKey, setDropHoverKey] = useState<StatementColKey | null>(null);

  /** تحميل تخطيط الجدول المحفوظ لكل مستخدم */
  useEffect(() => {
    const keys = statementLayoutStorageKeys(reportPrefsUserNs);
    layoutKeysRef.current = keys;

    const savedW = loadSavedColWidths(keys) ?? {};
    const mergedW = { ...COL_DEFAULT_WIDTH, ...savedW };
    widthsPersistRef.current = mergedW;
    setColWidths(mergedW);

    const ord = loadColumnOrder(keys, true);
    columnOrderRef.current = ord;
    setColumnOrder(ord);

    const hid = loadHiddenCols(keys);
    hiddenRef.current = hid;
    setHiddenCols(hid);
  }, [reportPrefsUserNs]);

  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });

  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const fiscalYearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * السنة المالية الحالية: أول سنة تحوي اليوم بين [start, end]
   * — وإن لم نجدها نأخذ آخر سنة غير مغلقة، وإلا أحدث سنة على الإطلاق.
   */
  const currentFiscalYear = useMemo(() => {
    const list = fiscalYearsQuery.data ?? [];
    if (list.length === 0) return null;
    const todayDate = today;
    const containsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && todayDate >= s && todayDate <= e;
    });
    if (containsToday) return containsToday;
    const open = [...list].filter(fy => !fy.isClosed)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
    if (open) return open;
    return [...list].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0] ?? null;
  }, [fiscalYearsQuery.data, today]);

  /** عند توفّر السنة المالية، عيّن التواريخ الافتراضية: من بداية السنة → اليوم */
  useEffect(() => {
    if (userTouchedDatesRef.current) return;
    if (!currentFiscalYear) return;
    const fyStart = (currentFiscalYear.startDate ?? '').slice(0, 10);
    const fyEnd = (currentFiscalYear.endDate ?? '').slice(0, 10);
    if (!fyStart) return;
    setFrom(prev => prev || fyStart);
    setTo(prev => {
      if (!prev) return today;
      // إن كان "to" أكبر من نهاية السنة المالية حدّه عند نهايتها
      if (fyEnd && prev > fyEnd) return fyEnd;
      return prev;
    });
  }, [currentFiscalYear, today]);

  /** Presets جاهزة لاختيار سريع للفترة — مطابقة لمجموعة DateRangePresets المشتركة */
  const datePresets = useMemo(() => {
    const list: { id: string; label: string; from: string; to: string }[] = [];
    const now = new Date();
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // ── السنة المالية (إن وُجدت) — تأتي أولاً
    if (currentFiscalYear) {
      const fyStart = (currentFiscalYear.startDate ?? '').slice(0, 10);
      const fyEnd = (currentFiscalYear.endDate ?? '').slice(0, 10);
      if (fyStart && fyEnd) {
        list.push({ id: 'fy-full', label: 'السنة المالية', from: fyStart, to: fyEnd });
      }
      if (fyStart) {
        list.push({
          id: 'fy-to-today',
          label: 'من بداية السنة',
          from: fyStart,
          to: fyEnd && today > fyEnd ? fyEnd : today,
        });
      }
    }

    // ── اليوم
    list.push({ id: 'today', label: 'اليوم', from: today, to: today });

    // ── أمس
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestIso = toIso(yest);
    list.push({ id: 'yesterday', label: 'أمس', from: yestIso, to: yestIso });

    // ── هذا الأسبوع (بداية السبت — التقويم العربي/العراقي)
    const dow = now.getDay(); // 0=Sun, 6=Sat
    const daysSinceSat = (dow + 1) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysSinceSat);
    list.push({ id: 'this-week', label: 'هذا الأسبوع', from: toIso(weekStart), to: today });

    // ── الأسبوع الماضي
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    list.push({
      id: 'last-week',
      label: 'الأسبوع الماضي',
      from: toIso(lastWeekStart),
      to: toIso(lastWeekEnd),
    });

    // ── هذا الشهر
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    list.push({ id: 'this-month', label: 'هذا الشهر', from: toIso(monthStart), to: today });

    // ── الشهر الماضي
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    list.push({
      id: 'last-month',
      label: 'الشهر الماضي',
      from: toIso(lastMonthStart),
      to: toIso(lastMonthEnd),
    });

    // ── هذا الربع
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    list.push({ id: 'this-quarter', label: 'هذا الربع', from: toIso(qStart), to: today });

    // ── هذا العام (تقويمي) — يُعرض فقط حين لا تتوفر سنة مالية،
    // ── لأنّ "بداية السنة" في سياقنا المحاسبي = بداية السنة المالية.
    if (!currentFiscalYear) {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      list.push({ id: 'this-year', label: 'هذا العام', from: toIso(yearStart), to: today });
    }

    return list;
  }, [currentFiscalYear, today]);

  const leaves = useMemo(() => (treeQuery.data ? flattenLeaves(treeQuery.data) : []), [treeQuery.data]);

  const filteredAccounts = leaves;

  /** تمرير عملة واحدة فقط للـ API لاستفادة كاملة من احتساب الافتتاحي؛ في حالة التعدد نجلب الكل ثم نفلتر محلياً. */
  const apiCurrency = useMemo(
    () => (selectedCurrencies.length === 1 ? selectedCurrencies[0] : undefined),
    [selectedCurrencies]
  );

  const statementQuery = useQuery<AccountStatementDto>({
    queryKey: ['account-statement', from, to, accountId, apiCurrency],
    queryFn: () =>
      accountingApi.getAccountStatement({
        from,
        to,
        accountId: accountId ?? undefined,
        currency: apiCurrency,
      }),
    enabled: submitted && !!from && !!to,
  });

  const data = statementQuery.data;
  useEffect(() => {
    setReportData(statementQuery.data ?? null);
  }, [statementQuery.data]);

  const rdRaw = submitted ? data : reportData;

  /**
   * عند اختيار عدة عملات (>1)، نفلتر الصفوف محلياً بناءً على `selectedCurrencies`.
   * عند اختيار عملة واحدة، الـ API يعيد بيانات نظيفة فلا حاجة للفلترة.
   * عند عدم الاختيار (الكل) نُبقي البيانات كما هي.
   */
  const rd = useMemo<AccountStatementDto | null>(() => {
    if (!rdRaw) return null;
    if (selectedCurrencies.length <= 1) return rdRaw;
    if (selectedCurrencies.length >= CURRENCIES.length) return rdRaw;
    const set = new Set(selectedCurrencies);
    return {
      ...rdRaw,
      rows: (rdRaw.rows ?? []).filter(r => set.has(r.currency)),
    };
  }, [rdRaw, selectedCurrencies]);

  /** مزامنة ترتيب الأعمدة عند تفعيل عرض كل الحسابات */
  useEffect(() => {
    if (!rd) return;
    setColumnOrder(prev => sanitizeOrder(prev, rd.isAllAccounts));
  }, [rd?.isAllAccounts]);

  const visibleCols = useMemo(() => {
    if (!rd) return [] as StatementColKey[];
    const allow = allowedKeys(rd.isAllAccounts);
    const ord = sanitizeOrder(columnOrderRef.current, rd.isAllAccounts);
    return ord.filter(k => allow.has(k) && !hiddenRef.current.has(k));
  }, [rd, rd?.isAllAccounts, columnOrder, hiddenCols]);

  const handleResizeDelta = useCallback((key: StatementColKey, delta: number) => {
    if (!delta) return;
    setColWidths(prev => {
      const nw = clampColWidth(key, prev[key] + delta);
      const n = { ...prev, [key]: nw };
      widthsPersistRef.current = n;
      return n;
    });
  }, []);

  const handleColumnResizePersist = useCallback(() => {
    try {
      localStorage.setItem(layoutKeysRef.current.widths, JSON.stringify(widthsPersistRef.current));
    } catch {
      /* ignore */
    }
  }, []);

  const reorderColumns = useCallback((fromKey: StatementColKey, toKey: StatementColKey) => {
    if (fromKey === toKey || fromKey === REQUIRED_COL) return;
    setColumnOrder(prev => {
      const allow = rd ? allowedKeys(rd.isAllAccounts) : allowedKeys(true);
      const next = sanitizeOrder(prev, rd?.isAllAccounts ?? true);
      let a = [...next].filter(k => allow.has(k));
      const fi = a.indexOf(fromKey);
      const ti = a.indexOf(toKey);
      if (fi < 0 || ti < 0 || fromKey === REQUIRED_COL) return prev;
      a.splice(fi, 1);
      a.splice(ti, 0, fromKey);
      a = sanitizeOrder(a, rd?.isAllAccounts ?? true);
      columnOrderRef.current = a;
      try {
        localStorage.setItem(layoutKeysRef.current.order, JSON.stringify(a));
      } catch {
        /* ignore */
      }
      return a;
    });
  }, [rd?.isAllAccounts]);

  /** تحريك عمود إلى الأعلى (تقديم) أو الأسفل (تأخير) في قائمة الترتيب */
  const moveColumn = useCallback((k: StatementColKey, dir: -1 | 1) => {
    if (k === REQUIRED_COL) return;
    setColumnOrder(prev => {
      const allow = rd ? allowedKeys(rd.isAllAccounts) : allowedKeys(true);
      const a = sanitizeOrder(prev, rd?.isAllAccounts ?? true).filter(c => allow.has(c));
      const i = a.indexOf(k);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= a.length) return prev;
      // العمود المرجعي (#) دائمًا أول؛ لا تتجاوزه
      if (a[j] === REQUIRED_COL) return prev;
      [a[i], a[j]] = [a[j], a[i]];
      const out = sanitizeOrder(a, rd?.isAllAccounts ?? true);
      columnOrderRef.current = out;
      try {
        localStorage.setItem(layoutKeysRef.current.order, JSON.stringify(out));
      } catch {
        /* ignore */
      }
      return out;
    });
  }, [rd?.isAllAccounts]);

  const toggleHidden = useCallback((k: StatementColKey) => {
    if (k === REQUIRED_COL) return;
    setHiddenCols(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      hiddenRef.current = n;
      try {
        localStorage.setItem(layoutKeysRef.current.hidden, JSON.stringify(Array.from(n)));
      } catch {
        /* ignore */
      }
      return n;
    });
  }, []);

  const resetTableLayout = useCallback(() => {
    if (!rd) return;
    const def = defaultColumnOrder(rd.isAllAccounts);
    setColumnOrder(def);
    columnOrderRef.current = def;
    setHiddenCols(new Set());
    hiddenRef.current = new Set();
    const w = { ...COL_DEFAULT_WIDTH };
    setColWidths(w);
    widthsPersistRef.current = w;
    try {
      const k = layoutKeysRef.current;
      localStorage.removeItem(k.order);
      localStorage.removeItem(k.hidden);
      localStorage.removeItem(k.widths);
    } catch {
      /* ignore */
    }
  }, [rd]);

  const handleDropOnHeader = useCallback((e: ReactDragEvent<HTMLTableHeaderCellElement>, targetKey: StatementColKey) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('statement-col');
    const fromKey = raw as StatementColKey;
    setDropHoverKey(null);
    if (!raw || !allowedKeys(rd?.isAllAccounts ?? true).has(fromKey) || fromKey === targetKey) return;
    reorderColumns(fromKey, targetKey);
  }, [rd?.isAllAccounts, reorderColumns]);

  /**
   * العملات الموجودة فعلاً في صفوف الكشف، مرتّبة حسب CURRENCIES (DisplayOrder من الـ DB).
   * العملات غير المعروفة في القائمة تُلحَق في النهاية (نادرة).
   */
  const currenciesPresent = useMemo(() => {
    if (!rd?.rows?.length) return [] as string[];
    const set = new Set<string>();
    for (const r of rd.rows) set.add((r.currency || 'IQD').toUpperCase());
    const ord = CURRENCIES;
    return Array.from(set).sort((a, b) => {
      const ia = ord.indexOf(a);
      const ib = ord.indexOf(b);
      if (ia < 0 && ib < 0) return a.localeCompare(b);
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
  }, [rd?.rows, CURRENCIES]);

  /**
   * مُضاعِفات تحويل كل عملة إلى العملة الأساسية.
   * نأخذها أولاً من الـ Backend (إن أتت)، ونستنبطها كـ fallback من الصفوف نفسها
   * بمقارنة الفروق في `balanceValuated` و `(debit - credit)` ضمن نفس السطر.
   */
  const multipliers = useMemo(() => {
    const m = new Map<string, number>();
    if (!rd) return m;
    if (rd.currencyMultipliers) {
      for (const [k, v] of Object.entries(rd.currencyMultipliers)) {
        if (Number.isFinite(v) && v > 0) m.set(k.toUpperCase(), v);
      }
    }
    if (rd.rows?.length) {
      let prevValuated = rd.openingBalanceValuated ?? 0;
      for (const r of rd.rows) {
        const cur = (r.currency || 'IQD').toUpperCase();
        const delta = (r.debit ?? 0) - (r.credit ?? 0);
        if (delta !== 0 && !m.has(cur)) {
          const mult = (r.balanceValuated - prevValuated) / delta;
          if (Number.isFinite(mult) && mult > 0) m.set(cur, mult);
        }
        prevValuated = r.balanceValuated;
      }
    }
    return m;
  }, [rd]);

  /**
   * الرصيد الافتتاحي صافٍ لكل عملة (يأتي من الـ Backend مباشرةً).
   * خِلافاً للسلوك السابق، Backend يُعيده الآن لكل عملة مهما تعدّدت العملات في الكشف.
   */
  const openingByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    if (rd?.openingByCurrency) {
      for (const [k, v] of Object.entries(rd.openingByCurrency)) {
        m.set(k.toUpperCase(), v ?? 0);
      }
    }
    return m;
  }, [rd?.openingByCurrency]);

  /**
   * الصفوف موزّعة حسب العملة، مع إعادة حساب الرصيد الجاري بعملة السطر
   * **والرصيد الجاري المقوّم بالعملة الأساسية** ضمن كل عملة على حدة.
   * — الافتتاحي يُؤخذ من `openingByCurrency` لكل عملة على حدة.
   * — الرصيد المقوّم لكل سطر = (cumulative debit-credit ضمن العملة) × multiplier + openingValuated.
   */
  const rowsByCurrency = useMemo(() => {
    const out = new Map<string, AccountStatementRowDto[]>();
    if (!rd?.rows?.length) return out;

    const grouped = new Map<string, AccountStatementRowDto[]>();
    for (const r of rd.rows) {
      const cur = (r.currency || 'IQD').toUpperCase();
      if (!grouped.has(cur)) grouped.set(cur, []);
      grouped.get(cur)!.push(r);
    }
    for (const [cur, arr] of grouped) {
      const opening = openingByCurrency.get(cur) ?? 0;
      const mult = multipliers.get(cur) ?? 1;
      let bal = opening;
      let balV = opening * mult;
      const enriched = arr.map(r => {
        const delta = (r.debit ?? 0) - (r.credit ?? 0);
        bal += delta;
        balV += delta * mult;
        return { ...r, balance: bal, balanceValuated: balV };
      });
      out.set(cur, enriched);
    }
    return out;
  }, [rd, openingByCurrency, multipliers]);

  /** إجماليات بعملة السطر لكل عملة على حدة (تُستخدم في فوتر كل جدول) */
  const nativeTotalsByCurrency = useMemo(() => {
    const list: Array<{
      currency: string;
      debit: number;
      credit: number;
      balance: number;
      balanceValuated: number;
      opening: number;
      openingValuated: number;
    }> = [];
    if (!rd?.rows?.length) return list;
    for (const cur of currenciesPresent) {
      const arr = rowsByCurrency.get(cur) ?? [];
      let debit = 0;
      let credit = 0;
      for (const r of arr) {
        debit += r.debit ?? 0;
        credit += r.credit ?? 0;
      }
      const opening = openingByCurrency.get(cur) ?? 0;
      const mult = multipliers.get(cur) ?? 1;
      const balance = opening + debit - credit;
      list.push({
        currency: cur,
        debit,
        credit,
        balance,
        balanceValuated: balance * mult,
        opening,
        openingValuated: opening * mult,
      });
    }
    return list;
  }, [rd, currenciesPresent, rowsByCurrency, openingByCurrency, multipliers]);

  const handleShow = () => {
    if (!from || !to) return;
    setSubmitted(true);
    statementQuery.refetch();
  };

  const handleReset = () => {
    const fyStart = (currentFiscalYear?.startDate ?? '').slice(0, 10);
    const fyEnd = (currentFiscalYear?.endDate ?? '').slice(0, 10);
    setFrom(fyStart || '');
    setTo(fyEnd && today > fyEnd ? fyEnd : today);
    setAccountId(null);
    setSelectedCurrencies([]);
    setSubmitted(false);
    setReportData(null);
    userTouchedDatesRef.current = false;
  };

  const toggleCurrency = (c: string) => {
    setSelectedCurrencies(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const currencyButtonLabel = useMemo(() => {
    if (selectedCurrencies.length === 0) return 'الكل';
    if (selectedCurrencies.length === 1) return selectedCurrencies[0];
    if (selectedCurrencies.length === CURRENCIES.length) return 'الكل';
    return `${selectedCurrencies.length} عملات`;
  }, [selectedCurrencies]);

  /** إغلاق نافذة العملات عند النقر خارجها */
  const currencyPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!currencyPanelOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (currencyPanelRef.current && !currencyPanelRef.current.contains(e.target as Node)) {
        setCurrencyPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [currencyPanelOpen]);

  const applyPreset = (preset: { from: string; to: string }) => {
    setFrom(preset.from);
    setTo(preset.to);
    userTouchedDatesRef.current = true;
  };

  /** هل preset مفعّل حالياً (مطابق للقيم الراهنة)؟ */
  const isPresetActive = (p: { from: string; to: string }) => p.from === from && p.to === to;

  const handlePrint = () => {
    if (!rd) return;
    printAccountStatement(rd, companyQuery.data ?? null);
  };

  const renderHeadLabel = useCallback((k: StatementColKey) => {
    if (!rd) return null;
    if (k === 'valBalance')
      return (
        <>
          <span className="block leading-tight">{COL_LABEL[k]}</span>
          <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground opacity-90">
            ({rd.baseCurrency ?? 'IQD'})
          </span>
        </>
      );
    return COL_LABEL[k];
  }, [rd]);

  const renderOpeningCell = (
    k: StatementColKey,
    opts?: { opening?: number; openingValuated?: number; currency?: string }
  ): ReactNode => {
    if (!rd) return null;
    const opening = opts?.opening ?? rd.openingBalance ?? 0;
    const openingV = opts?.openingValuated ?? rd.openingBalanceValuated ?? 0;
    const cur = opts?.currency ?? rd.baseCurrency ?? 'IQD';
    if (opening === 0 && openingV === 0) return null;
    switch (k) {
      case 'idx':
        return <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">—</td>;
      case 'date':
        return (
          <td key={k} className="overflow-hidden whitespace-nowrap px-2 text-xs">{formatDate(rd.fromDate)}</td>
        );
      case 'entry':
      case 'account':
        return <td key={k} className="overflow-hidden px-2 text-xs text-muted-foreground">—</td>;
      case 'desc':
        return (
          <td key={k} className="overflow-hidden px-2 text-xs italic text-muted-foreground">رصيد افتتاحي</td>
        );
      case 'debit':
      case 'credit':
        return <td key={k} className="overflow-hidden px-2 text-right num-display text-muted-foreground/40">—</td>;
      case 'balance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display font-bold text-blue-400">
            {opening !== 0 ? formatAmount(opening) : '—'}
          </td>
        );
      case 'valBalance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display font-bold text-amber-400/95">
            {formatAmount(openingV)}
          </td>
        );
      case 'currency':
        return (
          <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">{cur}</td>
        );
      case 'actions':
        return <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">—</td>;
      default:
        return null;
    }
  };

  const renderDataCell = (
    row: AccountStatementDto['rows'][number],
    idx: number,
    k: StatementColKey,
    opts?: { hideValuated?: boolean }
  ): ReactNode => {
    const descTitle = `${row.description ?? ''}${row.lineDescription ? ` — ${row.lineDescription}` : ''}`.trim();
    const bv = row.balanceValuated ?? row.balance;
    switch (k) {
      case 'idx':
        return <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">{idx + 1}</td>;
      case 'date':
        return <td key={k} className="overflow-hidden whitespace-nowrap px-2 text-xs">{formatDate(row.date)}</td>;
      case 'entry':
        return (
          <td key={k} className="overflow-hidden px-2 text-xs">
            {row.voucherNumber ? (
              <div className="flex flex-col items-start leading-tight">
                <span className="num-display font-semibold text-primary">{row.voucherNumber}</span>
                <span
                  className="num-display text-[10px] text-muted-foreground"
                  title={`رقم القيد الداخلي: ${row.entryNumber}`}
                >
                  #{row.entryNumber}
                </span>
              </div>
            ) : (
              <span className="num-display">#{row.entryNumber}</span>
            )}
          </td>
        );
      case 'account':
        return (
          <td key={k} className="overflow-hidden px-2 text-xs">
            <div className="truncate" title={`${row.accountCode} ${row.accountName}`}>
              <span className="num-display text-muted-foreground">{row.accountCode}</span>
              {' - '}
              <span>{row.accountName}</span>
            </div>
          </td>
        );
      case 'desc':
        return (
          <td key={k} className="overflow-hidden px-2 text-xs align-middle">
            <div className="truncate" title={descTitle || '—'}>
              {row.lineDescription || row.description || '—'}
            </div>
          </td>
        );
      case 'debit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-emerald-400">
            {row.debit > 0 ? formatAmount(row.debit) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'credit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-rose-400">
            {row.credit > 0 ? formatAmount(row.credit) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'balance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs font-semibold">
            {formatAmount(row.balance)}
          </td>
        );
      case 'valBalance':
        if (opts?.hideValuated) {
          return (
            <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-muted-foreground/40">—</td>
          );
        }
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs font-semibold text-amber-100/95">
            {formatAmount(bv)}
          </td>
        );
      case 'currency':
        return (
          <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">{row.currency}</td>
        );
      case 'actions': {
        const sourceLink = resolveSourceLink(row);
        const refSuffix = row.referenceNumber ?? row.referenceId;
        const sourceDescr = refSuffix ? `${sourceLink.label} #${refSuffix}` : sourceLink.label;
        return (
          <td key={k} className="overflow-visible px-1.5 text-center align-middle">
            <StatementRowActionsMenu
              entryNumber={row.entryNumber}
              sourceLabel={sourceDescr}
              sourceHref={sourceLink.href}
              onView={() => setViewEntryId(row.entryId)}
              onOpenSource={() => openSourceWithReturn(sourceLink.href, row.entryId)}
            />
          </td>
        );
      }
      default:
        return null;
    }
  };

  /**
   * يُولّد صف فوتر إجمالي العملة الواحدة داخل جدولها.
   * - عمود "الرصيد" بعملة الجدول.
   * - عمود "رصيد مقوَّم" بالعملة الأساسية (= balance × multiplier).
   */
  const renderCurrencyFooterRow = (
    cur: string,
    totals: {
      debit: number;
      credit: number;
      balance: number;
      balanceValuated: number;
      opening: number;
      openingValuated: number;
    },
    rowClassName: string,
  ): ReactNode => {
    const ai = Math.max(1, firstAmountColumnIndex(visibleCols));
    const tail = visibleCols.slice(ai);
    const labelText = totals.opening
      ? `الإجمالي (شامل افتتاحي ${formatAmount(totals.opening)})`
      : 'الإجمالي';
    const cells: ReactNode[] = [
      <td key="lab" colSpan={ai} className="overflow-hidden px-3 py-2 text-right">{labelText}</td>,
    ];
    tail.forEach(k => {
      switch (k) {
        case 'debit':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-emerald-400">
              {formatAmount(totals.debit)}
            </td>); break;
        case 'credit':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-rose-400">
              {formatAmount(totals.credit)}
            </td>); break;
        case 'balance':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-primary">
              {formatAmount(totals.balance)}
            </td>); break;
        case 'valBalance':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-amber-200">
              {formatAmount(totals.balanceValuated)}
            </td>); break;
        case 'currency':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-center num-display text-xs font-bold text-muted-foreground">
              {cur}
            </td>); break;
        default:
          cells.push(<td key={k} className="overflow-hidden px-2">—</td>);
      }
    });
    return <tr className={rowClassName}>{cells}</tr>;
  };

  return (
    <div className="space-y-2.5">
      {/* ════════ شريط الفترات السريعة (بارز في الأعلى) ════════ */}
      {datePresets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 pb-2">
          {datePresets.map(p => {
            const active = isPresetActive(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  'h-8 rounded-md border px-3 text-xs font-semibold transition-all',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            );
          })}
          {currentFiscalYear && (
            <span className="ms-auto inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10.5px] font-medium text-primary">
              <CalendarRange className="h-3 w-3" />
              السنة المالية:
              <span className="font-bold">{currentFiscalYear.name}</span>
            </span>
          )}
        </div>
      )}

      {/* ════════ صف الفلاتر (بدون إطار بطاقة — تصميم flat) ════════ */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px]">
          <label className="mb-1 flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground">
            <CalendarRange className="h-3 w-3" /> من تاريخ
          </label>
          <Input
            type="date"
            className="h-9 w-full"
            value={from}
            onChange={e => {
              userTouchedDatesRef.current = true;
              setFrom(e.target.value);
            }}
          />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-[10.5px] font-medium text-muted-foreground">إلى تاريخ</label>
          <Input
            type="date"
            className="h-9 w-full"
            value={to}
            onChange={e => {
              userTouchedDatesRef.current = true;
              setTo(e.target.value);
            }}
          />
        </div>

        <div className="flex-1 min-w-[260px]">
          <label className="mb-1 block text-[10.5px] font-medium text-muted-foreground">الحساب</label>
          <AccountPicker
            accounts={filteredAccounts}
            value={accountId}
            onChange={(id) => setAccountId(id)}
            allowClear
            placeholder="جميع الحسابات (اكتب رقم/اسم للبحث)"
            inputHeight={9}
          />
        </div>

        <div className="min-w-[130px]" ref={currencyPanelRef}>
          <label className="mb-1 block text-[10.5px] font-medium text-muted-foreground">العملة</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCurrencyPanelOpen(v => !v)}
              className={cn(
                'flex h-9 w-full items-center justify-between rounded-md border border-input bg-secondary/40 px-2.5 text-sm transition-colors',
                'hover:border-primary/50 focus:border-primary focus:outline-none',
                currencyPanelOpen && 'border-primary'
              )}
              title={
                selectedCurrencies.length === 0
                  ? 'جميع العملات'
                  : `العملات المحددة: ${selectedCurrencies.join('، ')}`
              }
            >
              <span className={cn('truncate', selectedCurrencies.length === 0 && 'text-muted-foreground')}>
                {currencyButtonLabel}
              </span>
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', currencyPanelOpen && 'rotate-180')} />
            </button>
            {currencyPanelOpen && (
              <div
                className="absolute end-0 z-40 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-xl"
                dir="rtl"
              >
                <div className="flex items-center justify-between border-b border-border/60 bg-secondary/30 px-3 py-1.5 text-[10.5px] text-muted-foreground">
                  <span>اختر عملة أو أكثر</span>
                  {selectedCurrencies.length > 0 && (
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[10px] hover:bg-secondary hover:text-foreground"
                      onClick={() => setSelectedCurrencies([])}
                    >
                      مسح
                    </button>
                  )}
                </div>
                <ul className="max-h-60 overflow-y-auto p-1">
                  {CURRENCIES.map(c => {
                    const checked = selectedCurrencies.includes(c);
                    return (
                      <li key={c}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors',
                            'hover:bg-accent/50',
                            checked && 'bg-primary/10'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                            checked={checked}
                            onChange={() => toggleCurrency(c)}
                          />
                          <span className="flex-1">{c}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
                  {selectedCurrencies.length === 0
                    ? 'سيتم عرض جميع العملات'
                    : `${selectedCurrencies.length} من ${CURRENCIES.length}`}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button onClick={handleShow} className="h-9 gap-2" disabled={!from || !to}>
            <Search className="h-4 w-4" />
            عرض الكشف
          </Button>
          {rd && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 gap-1.5" title="طباعة الكشف">
              <Printer className="h-3.5 w-3.5" />
              طباعة
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleReset} className="h-9 gap-1.5" title="مسح الفلاتر">
            <RotateCcw className="h-3.5 w-3.5" />
            مسح
          </Button>
        </div>
      </div>

      {!submitted ? (
        <EmptyState
          icon={FileText}
          title="حدد الفلاتر ثم اضغط عرض"
          description="اختر الفترة والحساب ثم اضغط زر عرض لعرض كشف الحساب"
        />
      ) : statementQuery.isLoading ? (
        <LoadingSpinner text="جاري إعداد الكشف..." />
      ) : statementQuery.isError || !rd ? (
        <EmptyState
          icon={AlertTriangle}
          title="تعذّر تحميل الكشف"
          description="حدث خطأ في الاتصال بالخادم"
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-4">
              <SummaryCell
                label="الرصيد الافتتاحي"
                value={rd.openingBalanceValuated ?? 0}
                accent="text-blue-400"
                subtitle={`مقيم بـ ${rd.baseCurrency ?? 'IQD'}`}
                icon={<Wallet className="h-4 w-4" />}
              />
              <SummaryCell
                label="إجمالي المدين"
                value={rd.totalDebitValuated ?? rd.totalDebit}
                accent="text-emerald-400"
                subtitle={`مقيم بـ ${rd.baseCurrency ?? 'IQD'}`}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <SummaryCell
                label="إجمالي الدائن"
                value={rd.totalCreditValuated ?? rd.totalCredit}
                accent="text-rose-400"
                subtitle={`مقيم بـ ${rd.baseCurrency ?? 'IQD'}`}
                icon={<TrendingDown className="h-4 w-4" />}
              />
              <SummaryCell
                label="الرصيد الختامي"
                value={rd.closingBalanceValuated ?? rd.closingBalance}
                accent="text-primary"
                highlight
                subtitle={`مقيم بـ ${rd.baseCurrency ?? 'IQD'} — مجموع تقريري`}
                icon={<Scale className="h-4 w-4" />}
              />
            </CardContent>
            {rd.fxBulletinName ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-[11px] text-emerald-200">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  التقويم بالنشرة المنشورة:
                  <span className="font-bold text-emerald-100">{rd.fxBulletinName}</span>
                </span>
                {rd.fxBulletinEffectiveAt && (
                  <span className="text-emerald-300/80">
                    — سريان: {new Date(rd.fxBulletinEffectiveAt).toLocaleDateString('ar-IQ')}
                  </span>
                )}
                {rd.fxUsedFallback && (
                  <span className="ms-auto inline-flex items-center gap-1 text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    تنبيه: بعض العملات غير مدرجة في النشرة — استُخدم لها مُضاعِف 1
                  </span>
                )}
              </div>
            ) : rd.fxUsedFallback ? (
              <div className="flex items-center gap-1.5 border-t border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  لا توجد نشرة أسعار منشورة سارية — تم استخدام مُضاعِف 1 لجميع العملات.
                  أنشئ نشرة من <span className="font-bold">نشرات أسعار العملات</span> ثم انشرها لتقويم صحيح.
                </span>
              </div>
            ) : null}
          </Card>

          {rd.rows.length === 0 ? (
            <EmptyState icon={FileText} title="لا حركات" description="لا توجد حركات للمعايير المحددة" />
          ) : (
            <Card className="overflow-visible">
              <div className="sticky top-0 z-30 shrink-0 border-b border-border bg-card/95 px-3 py-2 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10.5px] font-semibold text-primary">
                      <FileText className="h-3 w-3" />
                      {rd.rows.length} حركة
                    </span>
                    <span className="hidden text-[10.5px] sm:inline">
                      اسحب حافة العمود لتغيير العرض، أو حرّك الأيقونة لتغيير الترتيب
                    </span>
                  </div>
                  <div className="relative flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setColsPanelOpen(v => !v)}
                    >
                      <Columns className="h-3.5 w-3.5" />
                      الأعمدة
                    </Button>
                    <Button variant="ghost" size="sm" type="button" className="h-8 gap-1 px-2 text-xs" onClick={resetTableLayout} title="إعادة التخطيط الافتراضي">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                {colsPanelOpen && (() => {
                  const allow = allowedKeys(rd.isAllAccounts);
                  const ordered = sanitizeOrder(columnOrder, rd.isAllAccounts).filter(c => allow.has(c));
                  return (
                    <div
                      className="absolute end-0 top-[calc(100%+4px)] z-50 max-h-[min(70vh,520px)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                      dir="rtl"
                    >
                      <div className="border-b border-border/60 bg-secondary/30 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Columns className="h-3.5 w-3.5 text-primary" />
                          إعدادات الأعمدة
                        </div>
                        <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
                          استخدم ☑ للإظهار/الإخفاء، و↑↓ لتقديم وتأخير العمود. تُحفظ الإعدادات لكل مستخدم.
                        </p>
                      </div>
                      <ul className="space-y-0.5 p-2">
                        {ordered.map((k, idx) => {
                          const disabled = k === REQUIRED_COL;
                          const checked = !hiddenCols.has(k);
                          // أول عمود قابل للتحريك (بعد العمود المرجعي)
                          const firstMovableIdx = ordered.findIndex(c => c !== REQUIRED_COL);
                          const lastIdx = ordered.length - 1;
                          const canMoveUp = !disabled && idx > firstMovableIdx;
                          const canMoveDown = !disabled && idx < lastIdx;
                          return (
                            <li
                              key={k}
                              className={cn(
                                'group/row flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                                'hover:bg-accent/50',
                                disabled && 'opacity-70'
                              )}
                            >
                              <input
                                id={`col-vis-${k}`}
                                type="checkbox"
                                className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                                disabled={disabled}
                                checked={checked}
                                onChange={() => toggleHidden(k)}
                              />
                              <label
                                htmlFor={`col-vis-${k}`}
                                className={cn(
                                  'flex-1 cursor-pointer select-none truncate',
                                  !checked && 'text-muted-foreground line-through'
                                )}
                                title={COL_LABEL[k]}
                              >
                                {COL_LABEL[k]}
                                {disabled && (
                                  <span className="ms-1.5 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                                    أساسي
                                  </span>
                                )}
                              </label>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  className={cn(
                                    'rounded p-1 text-muted-foreground transition-colors',
                                    canMoveUp
                                      ? 'hover:bg-primary/15 hover:text-primary'
                                      : 'cursor-not-allowed opacity-30'
                                  )}
                                  onClick={() => canMoveUp && moveColumn(k, -1)}
                                  disabled={!canMoveUp}
                                  title="تقديم العمود (للأعلى)"
                                  aria-label={`تقديم ${COL_LABEL[k]}`}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className={cn(
                                    'rounded p-1 text-muted-foreground transition-colors',
                                    canMoveDown
                                      ? 'hover:bg-primary/15 hover:text-primary'
                                      : 'cursor-not-allowed opacity-30'
                                  )}
                                  onClick={() => canMoveDown && moveColumn(k, 1)}
                                  disabled={!canMoveDown}
                                  title="تأخير العمود (للأسفل)"
                                  aria-label={`تأخير ${COL_LABEL[k]}`}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="border-t border-border/60 px-3 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="h-7 w-full gap-1.5 text-[11px]"
                          onClick={resetTableLayout}
                        >
                          <RotateCcw className="h-3 w-3" />
                          استعادة الترتيب الافتراضي
                        </Button>
                      </div>
                    </div>
                  );
                })()}
                  </div>
                </div>
              </div>
              <CardContent className="space-y-4 p-3">
                {currenciesPresent.map(cur => {
                  const rows = rowsByCurrency.get(cur) ?? [];
                  const totals = nativeTotalsByCurrency.find(t => t.currency === cur)
                    ?? { currency: cur, debit: 0, credit: 0, balance: 0, balanceValuated: 0, opening: 0, openingValuated: 0 };
                  const showOpeningRow = totals.opening !== 0 || totals.openingValuated !== 0;
                  return (
                    <div
                      key={cur}
                      className="overflow-hidden rounded-lg border border-border/60 bg-card/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-secondary/40 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary">
                            <Wallet className="h-3 w-3" />
                            {cur}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {rows.length} حركة
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground tnum">
                          <span>مدين: <span className="font-bold text-emerald-400 num-display">{formatAmount(totals.debit)}</span></span>
                          <span>دائن: <span className="font-bold text-rose-400 num-display">{formatAmount(totals.credit)}</span></span>
                          <span>الرصيد: <span className="font-bold text-primary num-display">{formatAmount(totals.balance)}</span></span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="account-statement-report data-table w-full border-collapse table-fixed bg-card">
                          <colgroup>
                            {visibleCols.map(k => (
                              <col key={k} style={{ width: colWidths[k] }} />
                            ))}
                          </colgroup>
                          <thead className="border-b-2 border-border">
                            <tr>
                              {visibleCols.map(k => (
                                <StatementColHead
                                  key={k}
                                  colKey={k}
                                  width={colWidths[k]}
                                  draggable={k !== REQUIRED_COL}
                                  isDropTarget={dropHoverKey === k}
                                  truncateLabel={k !== 'desc' && k !== 'valBalance' && k !== 'entry'}
                                  className={cn(
                                    'bg-secondary/40 text-xs font-semibold text-foreground/80',
                                    k === 'idx' && 'text-center',
                                    ['debit', 'credit', 'balance', 'valBalance'].includes(k) && 'text-right',
                                    k === 'currency' && 'text-center',
                                    !['idx', 'debit', 'credit', 'balance', 'valBalance', 'currency'].includes(k) && 'text-right'
                                  )}
                                  onResizeDelta={handleResizeDelta}
                                  onResizePersist={handleColumnResizePersist}
                                  onDragEnterHeader={() => setDropHoverKey(k)}
                                  onDragLeaveHeader={() => setDropHoverKey(null)}
                                  onDropOnHeader={e => handleDropOnHeader(e, k)}
                                  onGripDragEnd={() => setDropHoverKey(null)}
                                >
                                  {renderHeadLabel(k)}
                                </StatementColHead>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {showOpeningRow ? (
                              <tr className="h-9 border-b border-border/40 bg-secondary/40 font-medium">
                                {visibleCols.map(k =>
                                  renderOpeningCell(k, {
                                    opening: totals.opening,
                                    openingValuated: totals.openingValuated,
                                    currency: cur,
                                  })
                                )}
                              </tr>
                            ) : null}
                            {rows.map((row, idx) => {
                              const isFocused = focusEntryId !== null && row.entryId === focusEntryId;
                              return (
                                <tr
                                  key={`${row.entryId}-${idx}`}
                                  data-entry-id={row.entryId}
                                  ref={el => {
                                    if (!el || !isFocused || focusScrollDoneRef.current) return;
                                    focusScrollDoneRef.current = true;
                                    requestAnimationFrame(() => {
                                      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                    });
                                  }}
                                  className={cn(
                                    'h-9 border-b border-border/30 transition-colors hover:bg-secondary/30',
                                    isFocused && 'bg-primary/15 ring-2 ring-primary/60 ring-inset'
                                  )}
                                >
                                  {visibleCols.map(k => renderDataCell(row, idx, k))}
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {renderCurrencyFooterRow(
                              cur,
                              totals,
                              'h-10 border-t-2 border-border bg-secondary/60 text-xs font-bold',
                            )}
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {/* كارت الإجمالي المُقوَّم بالعملة الأساسية */}
                <div className="overflow-hidden rounded-lg border border-primary/40 bg-primary/5">
                  <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/15 px-3 py-2 text-xs font-bold text-primary">
                    <Scale className="h-3.5 w-3.5" />
                    الإجمالي المُقوَّم بالعملة الأساسية ({rd.baseCurrency ?? 'IQD'})
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
                    <div className="rounded-md border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">الرصيد الافتتاحي</span>
                        <Wallet className="h-3.5 w-3.5 text-blue-400 opacity-70" />
                      </div>
                      <div className="mt-1 text-lg font-bold tabular-nums num-display text-blue-400">
                        {formatAmount(rd.openingBalanceValuated ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">إجمالي المدين</span>
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400 opacity-70" />
                      </div>
                      <div className="mt-1 text-lg font-bold tabular-nums num-display text-emerald-400">
                        {formatAmount(rd.totalDebitValuated ?? rd.totalDebit)}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">إجمالي الدائن</span>
                        <TrendingDown className="h-3.5 w-3.5 text-rose-400 opacity-70" />
                      </div>
                      <div className="mt-1 text-lg font-bold tabular-nums num-display text-rose-400">
                        {formatAmount(rd.totalCreditValuated ?? rd.totalCredit)}
                      </div>
                    </div>
                    <div className="rounded-md border border-primary/40 bg-primary/10 p-3 ring-1 ring-primary/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-medium text-muted-foreground">الرصيد الختامي</span>
                        <Scale className="h-3.5 w-3.5 text-primary opacity-80" />
                      </div>
                      <div className="mt-1 text-lg font-bold tabular-nums num-display text-primary">
                        {formatAmount(rd.closingBalanceValuated ?? rd.closingBalance)}
                      </div>
                    </div>
                  </div>
                  {currenciesPresent.length > 1 && (
                    <div className="border-t border-primary/20 bg-primary/5 px-3 py-2 text-[10.5px] text-muted-foreground">
                      تم تجميع المجاميع من <span className="font-bold text-foreground">{currenciesPresent.length}</span> عملات مختلفة وتقويمها بالعملة الأساسية
                      {rd.fxBulletinName && <> باستخدام نشرة <span className="font-bold text-foreground">{rd.fxBulletinName}</span></>}
                      .
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* نافذة عرض القيد المنبثقة */}
      <JournalEntryViewDialog
        entryId={viewEntryId}
        onClose={() => setViewEntryId(null)}
      />
    </div>
  );
}
