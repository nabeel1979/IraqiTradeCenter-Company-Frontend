import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Receipt,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  readSessionJson,
  ReportNavKeys,
  writeSessionJson,
  saveJournalEntrySourceState,
  ACCOUNT_STATEMENT_PATH,
  type StatementSourceState,
} from '@/lib/reportReturnState';
import { localizedEntryDescription } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { JournalEntryViewDialog } from '@/components/accounting/JournalEntryViewDialog';
import { StatementRowActionsMenu } from '@/components/accounting/StatementRowActionsMenu';
import { accountingApi } from '@/lib/api/accounting';
import { BranchFilterSelect } from '@/components/branches/BranchSelect';
import {
  CASH_BOX_TRANSFERS_PATH,
  navigateJournalEntrySource,
} from '@/lib/accounting/journalEntrySource';
import { companySettingsApi } from '@/lib/api/companySettings';
import { currenciesApi } from '@/lib/api/currencies';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { toast } from 'sonner';
import { formatAmountFixed2, formatDate, cn } from '@/lib/utils';
import { printAccountStatement } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import { useAuthStore } from '@/lib/auth/auth-store';
import type { AccountDto, AccountStatementDto, AccountStatementRowDto, OpeningEntryRowDto } from '@/types/api';

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
  colLabels,
  t,
}: {
  colKey: StatementColKey;
  width: number;
  draggable?: boolean;
  isDropTarget?: boolean;
  truncateLabel?: boolean;
  className?: string;
  children: ReactNode;
  colLabels: Record<StatementColKey, string>;
  t: TFunction;
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
          title={t('accountStatement.table.reorderColumn', { name: colLabels[colKey] })}
          aria-label={t('accountStatement.table.reorderColumn', { name: colLabels[colKey] })}
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
        title={t('accountStatement.table.resizeColumn')}
        onMouseDown={onResizeStripDown}
        className="group/resizer absolute inset-y-0 z-40 flex cursor-col-resize items-center justify-center"
        style={{ width: '6px', insetInlineEnd: '-3px' }}
      >
        <span className="block h-4 w-px rounded-full bg-border transition-all group-hover/resizer:h-6 group-hover/resizer:w-0.5 group-hover/resizer:bg-primary" />
      </span>
    </th>
  );
}

function summaryAmountSizeClass(value: number): string {
  const len = formatAmountFixed2(value).length;
  if (len > 20) return 'text-[11px]';
  if (len > 16) return 'text-xs';
  if (len > 12) return 'text-sm';
  return 'text-base sm:text-lg';
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
  const formatted = formatAmountFixed2(value);
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
      <div className={cn(
        'mt-2 max-w-full overflow-x-auto font-bold tabular-nums num-display tracking-tight whitespace-nowrap',
        summaryAmountSizeClass(value),
        accent,
      )}>
        {formatted}
      </div>
      {subtitle ? (
        <div className="mt-1.5 text-[10.5px] leading-tight text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

function entryDateKey(iso: string): string {
  return iso.slice(0, 10);
}

type StatementTimelineItem =
  | { kind: 'opening'; oe: OpeningEntryRowDto }
  | { kind: 'row'; row: AccountStatementRowDto; sourceIdx: number };

function buildStatementTimeline(
  rows: AccountStatementRowDto[],
  openingInPeriod: OpeningEntryRowDto[],
): StatementTimelineItem[] {
  const items: StatementTimelineItem[] = [
    ...openingInPeriod.map(oe => ({ kind: 'opening' as const, oe })),
    ...rows.map((row, sourceIdx) => ({ kind: 'row' as const, row, sourceIdx })),
  ];
  items.sort((a, b) => {
    const da = a.kind === 'opening' ? a.oe.entryDate : a.row.date;
    const db = b.kind === 'opening' ? b.oe.entryDate : b.row.date;
    const d = da.localeCompare(db);
    if (d !== 0) return d;
    const na = a.kind === 'opening' ? a.oe.entryNumber : a.row.entryNumber;
    const nb = b.kind === 'opening' ? b.oe.entryNumber : b.row.entryNumber;
    const n = na.localeCompare(nb);
    if (n !== 0) return n;
    if (a.kind !== b.kind) return a.kind === 'opening' ? -1 : 1;
    return 0;
  });
  return items;
}


/** أرصدة العملة — أعلى جدول كل عملة */
function CurrencyBalanceHeader({
  cur,
  count,
  totals,
  t,
}: {
  cur: string;
  count: number;
  totals: { opening: number; debit: number; credit: number; balance: number };
  t: TFunction;
}) {
  const items = [
    { label: t('accountStatement.summary.openingBalance'), value: totals.opening, accent: 'text-blue-400' },
    { label: t('accountStatement.table.debit'), value: totals.debit, accent: 'text-emerald-400' },
    { label: t('accountStatement.table.credit'), value: totals.credit, accent: 'text-rose-400' },
    { label: t('accountStatement.table.balance'), value: totals.balance, accent: 'text-primary' },
  ] as const;

  return (
    <div className="overflow-hidden border-b border-border/60 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-secondary px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
          <Wallet className="h-3 w-3" />
          {cur}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t('accountStatement.table.currencyBlockMovements', { count })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border/40 md:grid-cols-4">
        {items.map(item => (
          <div key={item.label} className="bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{item.label}</div>
            <div className={cn(
              'mt-0.5 max-w-full overflow-x-auto font-bold tabular-nums num-display whitespace-nowrap',
              summaryAmountSizeClass(item.value),
              item.accent,
            )}>
              {formatAmountFixed2(item.value)}
            </div>
          </div>
        ))}
      </div>
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
function resolveSourceLink(
  row: {
    entryId: number;
    source?: string;
    referenceType?: string | null;
    referenceId?: number | null;
  },
  t: TFunction,
): { href: string; label: string } {
  const src = (row.source || '').trim();
  const refType = (row.referenceType || '').trim();
  const refId = row.referenceId;
  if (refType === 'CashBoxTransfer' || refType === 'CashBoxTransferReversal') {
    return { href: CASH_BOX_TRANSFERS_PATH, label: t('accountStatement.sources.cashTransfer') };
  }
  if (refType === 'ReversalOf') {
    return { href: '#', label: t('accountStatement.sources.reversalEntry') };
  }
  switch (src) {
    case 'SalesInvoice':
      if (refId) return { href: `/invoices/${refId}/edit`, label: t('accountStatement.sources.salesInvoice') };
      break;
    case 'PurchaseInvoice':
      if (refId) return { href: `/invoices/${refId}/edit`, label: t('accountStatement.sources.purchaseInvoice') };
      break;
    case 'Payment':
      if (refId) return { href: `/finance/payments/${refId}`, label: t('accountStatement.sources.paymentReceipt') };
      break;
    case 'Receipt':
      if (refId) return { href: `/finance/receipts/${refId}`, label: t('accountStatement.sources.financeReceipt') };
      break;
    case 'StockMovement':
      if (refId) return { href: `/inventory/movements/${refId}`, label: t('accountStatement.sources.stockMovement') };
      break;
    case 'CommissionPayment':
      if (refId) return { href: `/finance/commissions/${refId}`, label: t('accountStatement.sources.commission') };
      break;
    case 'SalaryPayment':
      if (refId) return { href: `/hr/salaries/${refId}`, label: t('accountStatement.sources.salary') };
      break;
    default:
      if (refId) {
        if (refType.toLowerCase().includes('sales')) return { href: `/invoices/${refId}/edit`, label: t('accountStatement.sources.salesInvoice') };
        if (refType.toLowerCase().includes('purchase')) return { href: `/invoices/${refId}/edit`, label: t('accountStatement.sources.purchaseInvoice') };
      }
      break;
  }
  return { href: `/accounting/journal/${row.entryId}/edit`, label: t('accountStatement.sources.manualEntry') };
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
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();
  const location = useLocation();

  const [statementSource] = useState(() =>
    readSessionJson<StatementSourceState>(ReportNavKeys.statementSource, false),
  );

  const handleBackToSource = useCallback(() => {
    if (!statementSource) return;
    writeSessionJson(statementSource.restoreKey, {
      ...statementSource.restore,
      highlightAccountId: statementSource.highlightAccountId,
      highlightCurrency: statementSource.highlightCurrency,
    });
    try {
      sessionStorage.removeItem(ReportNavKeys.statementSource);
    } catch {
      // تجاهل
    }
    navigate(statementSource.sourcePath);
  }, [statementSource, navigate]);

  const colLabels = useMemo(
    (): Record<StatementColKey, string> => ({
      idx: t('accountStatement.table.cols.idx'),
      date: t('accountStatement.table.cols.date'),
      entry: t('accountStatement.table.cols.entry'),
      account: t('accountStatement.table.cols.account'),
      desc: t('accountStatement.table.cols.desc'),
      debit: t('accountStatement.table.cols.debit'),
      credit: t('accountStatement.table.cols.credit'),
      balance: t('accountStatement.table.cols.balance'),
      valBalance: t('accountStatement.table.cols.valBalance'),
      currency: t('accountStatement.table.cols.currency'),
      actions: t('accountStatement.table.cols.actions'),
    }),
    [t],
  );

  const reportPrefsUserNs = useAuthStore(s => s.user?.id ?? '__guest__');
  const layoutKeysRef = useRef(statementLayoutStorageKeys(reportPrefsUserNs));
  layoutKeysRef.current = statementLayoutStorageKeys(reportPrefsUserNs);

  /**
   * مفتاح تخزين الحالة (فلاتر/نتائج الكشف) في sessionStorage حتى نستعيدها عند
   * الرجوع من صفحة "أصل القيد". يُحذف بعد الاستعادة لتجنّب التعارض مع زيارة عادية.
   */
  type StatementReturnState = {
    from: string;
    to: string;
    accountId: number | null;
    accountLabel?: string;
    selectedCurrencies: string[];
    autoSubmit?: boolean;
    focusEntryId?: number | null;
    ts?: number;
  };

  /** قراءة لمرة واحدة عند التركيب — يمنع استهلاك الحالة مرتين (React Strict Mode). */
  const [returnBoot] = useState(() =>
    readSessionJson<StatementReturnState>(ReportNavKeys.statementReturn, true),
  );
  const hadInitialReturnRef = useRef(!!returnBoot);

  const [from, setFrom] = useState(returnBoot?.from ?? '');
  const [to, setTo] = useState(returnBoot?.to ?? today);
  const [accountId, setAccountId] = useState<number | null>(returnBoot?.accountId ?? null);
  /**
   * اسم الحساب المختار (كود + اسم) — يُستعمل كـ fallback في الـ AccountPicker
   * عندما يأتي accountId من صفحة أخرى ولا يكون ضمن الأوراق المُمرَّرة.
   */
  const [accountLabel, setAccountLabel] = useState<string>(returnBoot?.accountLabel ?? '');
  /** عملات مختارة (فارغ = جميع العملات). تعدد الاختيار يدعم checkboxes. */
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(
    returnBoot?.selectedCurrencies ?? []
  );
  const [includeOpeningEntries, setIncludeOpeningEntries] = useState(true);
  const [currencyPanelOpen, setCurrencyPanelOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState<number | ''>('');

  /** معرّف القيد المعروض حالياً في النافذة المنبثقة (null = الـ Dialog مغلق) */
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);

  /** قائمة السياق عند النقر بالزر الأيمن على صف */
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; row: AccountStatementRowDto;
  } | null>(null);

  /**
   * معرّف القيد المُميَّز بعد الرجوع من «أصل القيد» — يبقى حتى التفاعل مع سطر آخر.
   */
  const [focusEntryId, setFocusEntryId] = useState<number | null>(
    returnBoot?.focusEntryId ?? null
  );
  /** عُلِّم عند ظهور البيانات لتنفيذ التمرير مرة واحدة فقط */
  const focusScrollDoneRef = useRef(false);

  /** إزالة تمييز سطر الرجوع عند التفاعل مع سطر/قيد مختلف. */
  const handleRowInteract = useCallback((entryId: number) => {
    setFocusEntryId(prev => (prev != null && prev !== entryId ? null : prev));
  }, []);

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
  const [submitted, setSubmitted] = useState(!!returnBoot?.autoSubmit);
  /** هل عدّل المستخدم التواريخ يدوياً؟ لو نعم لا نستبدلها بقيم السنة المالية تلقائياً */
  const userTouchedDatesRef = useRef(!!returnBoot?.from || !!returnBoot?.to);

  const applyStatementReturnState = useCallback((data: StatementReturnState) => {
    hadInitialReturnRef.current = true;
    if (data.from || data.to) userTouchedDatesRef.current = true;
    setFrom(data.from);
    setTo(data.to);
    setAccountId(data.accountId);
    setAccountLabel(data.accountLabel ?? '');
    setSelectedCurrencies(data.selectedCurrencies ?? []);
    setSubmitted(!!data.autoSubmit);
    if (data.focusEntryId != null) {
      setFocusEntryId(data.focusEntryId);
      focusScrollDoneRef.current = false;
    }
  }, []);

  /** استعادة الكشف عند الرجوع من «أصل القيد» (حتى بدون إعادة تحميل كامل للصفحة). */
  useEffect(() => {
    const data = readSessionJson<StatementReturnState>(ReportNavKeys.statementReturn, true);
    if (data) applyStatementReturnState(data);
  }, [location.key, applyStatementReturnState]);

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

  const voucherTypesQuery = useQuery({
    queryKey: ['journal-voucher-types'],
    queryFn: () => journalVoucherTypesApi.getAll(),
    staleTime: 5 * 60 * 1000,
  });

  /**
   * يفتح أصل القيد في صفحته الأصلية، مع حفظ snapshot للفلاتر + معرّف السطر
   * الذي ضغط المستخدم عليه، حتى يمكن العودة لنفس السطر تماماً.
   */
  const openEntrySource = useCallback(async (row: AccountStatementRowDto) => {
    const snapshot = {
      from,
      to,
      accountId,
      accountLabel,
      selectedCurrencies,
      focusEntryId: row.entryId,
      autoSubmit: true,
    };
    writeSessionJson(ReportNavKeys.statementReturn, snapshot);
    saveJournalEntrySourceState({
      returnTo: ACCOUNT_STATEMENT_PATH,
      returnLabel: t('accountStatement.returnLabel'),
      restore: {
        from,
        to,
        accountId,
        accountLabel,
        selectedCurrencies,
      },
      highlightEntryId: row.entryId,
    });
    await navigateJournalEntrySource(
      {
        id: row.entryId,
        source: row.source,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        voucherTypeCode: row.voucherTypeCode,
      },
      navigate,
      {
        returnState: {
          returnTo: ACCOUNT_STATEMENT_PATH,
          returnLabel: t('accountStatement.returnLabel'),
        },
        voucherTypes: voucherTypesQuery.data ?? [],
      },
    );
  }, [from, to, accountId, accountLabel, selectedCurrencies, navigate, t, voucherTypesQuery.data]);

  const openOpeningEntrySource = useCallback(async (entryId: number) => {
    writeSessionJson(ReportNavKeys.statementReturn, {
      from,
      to,
      accountId,
      accountLabel,
      selectedCurrencies,
      focusEntryId: entryId,
      autoSubmit: true,
    });
    saveJournalEntrySourceState({
      returnTo: ACCOUNT_STATEMENT_PATH,
      returnLabel: t('accountStatement.returnLabel'),
      restore: { from, to, accountId, accountLabel, selectedCurrencies },
      highlightEntryId: entryId,
    });
    let entryInput: Parameters<typeof navigateJournalEntrySource>[0] = {
      id: entryId,
      source: 'Manual',
    };
    try {
      const full = await accountingApi.getJournalEntryById(entryId);
      entryInput = {
        id: entryId,
        source: full.source,
        referenceType: full.referenceType,
        referenceId: full.referenceId,
        voucherTypeId: full.voucherTypeId,
        voucherTypeCode: full.voucherTypeCode,
      };
    } catch {
      toast.error(t('accountStatement.openSourceFailed'));
      return;
    }
    await navigateJournalEntrySource(entryInput, navigate, {
      returnState: {
        returnTo: ACCOUNT_STATEMENT_PATH,
        returnLabel: t('accountStatement.returnLabel'),
      },
      voucherTypes: voucherTypesQuery.data ?? [],
    });
  }, [from, to, accountId, accountLabel, selectedCurrencies, navigate, t, voucherTypesQuery.data]);

  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const { datesReady, defaultFromDate, defaultToDate } = useActiveFiscalYear();

  // ‎الصناديق — للاستعمال كسياق ترجمة لوصف القيد المُولّد تلقائياً.
  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'all-for-translation'],
    queryFn: () => cashBoxesApi.getAll(false),
    staleTime: 5 * 60 * 1000,
  });

  /** عند توفّر السنة المالية، عيّن التواريخ الافتراضية ضمن نطاق الفترة المحاسبية */
  useEffect(() => {
    if (hadInitialReturnRef.current) return;
    if (userTouchedDatesRef.current) return;
    if (!datesReady || !defaultFromDate) return;
    setFrom(prev => prev || defaultFromDate);
    setTo(prev => prev || defaultToDate);
  }, [datesReady, defaultFromDate, defaultToDate]);

  const leaves = useMemo(() => (treeQuery.data ? flattenLeaves(treeQuery.data) : []), [treeQuery.data]);

  const filteredAccounts = leaves;

  /** تمرير عملة واحدة فقط للـ API لاستفادة كاملة من احتساب الافتتاحي؛ في حالة التعدد نجلب الكل ثم نفلتر محلياً. */
  const apiCurrency = useMemo(
    () => (selectedCurrencies.length === 1 ? selectedCurrencies[0] : undefined),
    [selectedCurrencies]
  );

  const statementQuery = useQuery<AccountStatementDto>({
    queryKey: ['account-statement', from, to, accountId, apiCurrency, includeOpeningEntries, branchFilter],
    queryFn: () =>
      accountingApi.getAccountStatement({
        from,
        to,
        accountId: accountId ?? undefined,
        currency: apiCurrency,
        includeOpeningEntries,
        branchId: branchFilter === '' ? null : Number(branchFilter),
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
    const openingByCurrency = Object.fromEntries(
      Object.entries(rdRaw.openingByCurrency ?? {}).filter(([k]) => set.has(k.toUpperCase())),
    );
    return {
      ...rdRaw,
      rows: (rdRaw.rows ?? []).filter(r => set.has(r.currency)),
      openingEntries: (rdRaw.openingEntries ?? []).filter(oe => set.has(oe.currency.toUpperCase())),
      openingByCurrency,
    };
  }, [rdRaw, selectedCurrencies, CURRENCIES.length]);

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
    if (!rd) return [] as string[];
    const set = new Set<string>();
    for (const r of rd.rows ?? []) set.add((r.currency || 'IQD').toUpperCase());
    for (const oe of rd.openingEntries ?? []) set.add((oe.currency || 'IQD').toUpperCase());
    if (rd.openingByCurrency) {
      for (const k of Object.keys(rd.openingByCurrency)) set.add(k.toUpperCase());
    }
    const ord = CURRENCIES;
    return Array.from(set).sort((a, b) => {
      const ia = ord.indexOf(a);
      const ib = ord.indexOf(b);
      if (ia < 0 && ib < 0) return a.localeCompare(b);
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
  }, [rd, CURRENCIES]);

  const openingEntriesByCurrency = useMemo(() => {
    const out = new Map<string, OpeningEntryRowDto[]>();
    if (!includeOpeningEntries || !rd?.openingEntries?.length) return out;
    for (const oe of rd.openingEntries) {
      const cur = (oe.currency || 'IQD').toUpperCase();
      if (!out.has(cur)) out.set(cur, []);
      out.get(cur)!.push(oe);
    }
    for (const [, list] of out) {
      list.sort((a, b) => {
        const d = a.entryDate.localeCompare(b.entryDate);
        return d !== 0 ? d : a.entryNumber.localeCompare(b.entryNumber);
      });
    }
    return out;
  }, [rd?.openingEntries, includeOpeningEntries]);

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
    if (!rd || currenciesPresent.length === 0) return list;
    const fromKey = from.slice(0, 10);
    for (const cur of currenciesPresent) {
      const arr = rowsByCurrency.get(cur) ?? [];
      let debit = 0;
      let credit = 0;
      for (const r of arr) {
        debit += r.debit ?? 0;
        credit += r.credit ?? 0;
      }
      if (includeOpeningEntries && rd.openingEntries?.length) {
        for (const oe of rd.openingEntries) {
          if ((oe.currency || 'IQD').toUpperCase() !== cur) continue;
          if (entryDateKey(oe.entryDate) >= fromKey) {
            debit += oe.debit ?? 0;
            credit += oe.credit ?? 0;
          }
        }
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
  }, [rd, currenciesPresent, rowsByCurrency, openingByCurrency, multipliers, from, includeOpeningEntries]);

  const handleShow = () => {
    if (!from || !to) return;
    setSubmitted(true);
    statementQuery.refetch();
  };

  const handleReset = () => {
    setFrom(defaultFromDate || '');
    setTo(defaultToDate || '');
    setAccountId(null);
    setAccountLabel('');
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
    if (selectedCurrencies.length === 0) return t('accountStatement.filters.allCurrencies');
    if (selectedCurrencies.length === 1) return selectedCurrencies[0];
    if (selectedCurrencies.length === CURRENCIES.length) return t('accountStatement.filters.allCurrencies');
    return t('accountStatement.filters.multiCurrency', { count: selectedCurrencies.length });
  }, [selectedCurrencies, t]);

  const accountNamesEnByCode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of leaves) {
      if (a.code && a.nameEn) m[a.code] = a.nameEn;
    }
    return m;
  }, [leaves]);

  // ‎خريطة (nameAr → nameEn) مشتقّة من الحسابات + الصناديق — لترجمة وصف القيد
  // ‎المركّب (سند قبض — صندوق نبيل) عند العرض في كشف الحساب.
  const descriptionContextMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of leaves) {
      const ar = (a.nameAr ?? '').trim();
      const en = (a.nameEn ?? '').trim();
      if (ar && en) m[ar] = en;
    }
    for (const cb of cashBoxesQuery.data ?? []) {
      const ar = (cb.nameAr ?? '').trim();
      const en = (cb.nameEn ?? '').trim();
      if (ar && en) m[ar] = en;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaves, cashBoxesQuery.data]);

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

  const applyPresetRange = (presetFrom: string, presetTo: string) => {
    setFrom(presetFrom);
    setTo(presetTo);
    userTouchedDatesRef.current = true;
  };

  const handlePrint = () => {
    if (!rd) return;
    // نمرّر نفس الأعمدة المرئية على الشاشة (باستثناء عمود الإجراءات غير القابل للطباعة)
    // كي يكون تنسيق الطباعة مطابقاً تماماً للتقرير: نفس الترتيب، نفس الإخفاء، نفس العرض.
    const printableOrder = visibleCols.filter(k => k !== 'actions');
    // ‎مرّر nameEn للحساب المختار حتى تستخدمه الطباعة عندما اللغة EN
    const selectedAcc = accountId != null
      ? (treeQuery.data ?? []).find(a => a.id === accountId)
      : null;
    const accountNamesEn: Record<string, string> = {};
    for (const leaf of leaves) {
      if (leaf.code && leaf.nameEn) accountNamesEn[leaf.code] = leaf.nameEn;
    }
    printAccountStatement(
      rd,
      companyQuery.data ?? null,
      {
        order:  printableOrder,
        hidden: [],
        widths: colWidths,
      },
      undefined,
      { accountNameEn: selectedAcc?.nameEn ?? null, accountNamesEn },
    );
    void auditApi.logPrint({
      entityType: 'AccountStatement',
      entityId: accountId ? String(accountId) : '*',
      summary: selectedAcc
        ? `طباعة كشف حساب ${selectedAcc.code} — ${selectedAcc.nameAr}`
        : 'طباعة كشف حساب',
      details: {
        accountId,
        accountCode: selectedAcc?.code ?? null,
        rowCount: rd?.rows?.length ?? 0,
      },
    });
  };

  const renderHeadLabel = useCallback((k: StatementColKey) => {
    if (!rd) return null;
    if (k === 'valBalance')
      return (
        <>
          <span className="block leading-tight">{colLabels[k]}</span>
          <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground opacity-90">
            ({rd.baseCurrency ?? 'IQD'})
          </span>
        </>
      );
    return colLabels[k];
  }, [rd, colLabels]);

  const renderOpeningCell = (
    k: StatementColKey,
    opts?: { opening?: number; openingValuated?: number; currency?: string; label?: string }
  ): ReactNode => {
    if (!rd) return null;
    const opening = opts?.opening ?? rd.openingBalance ?? 0;
    const openingV = opts?.openingValuated ?? rd.openingBalanceValuated ?? 0;
    const cur = opts?.currency ?? rd.baseCurrency ?? 'IQD';
    const rowLabel = opts?.label ?? t('accountStatement.table.openingBalanceRow');
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
          <td key={k} className="overflow-hidden px-2 text-xs italic text-muted-foreground">{rowLabel}</td>
        );
      case 'debit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-emerald-400">
            {opening > 0 ? formatAmountFixed2(opening) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'credit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-rose-400">
            {opening < 0 ? formatAmountFixed2(Math.abs(opening)) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'balance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display font-bold text-blue-400">
            {opening !== 0 ? formatAmountFixed2(opening) : '—'}
          </td>
        );
      case 'valBalance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display font-bold text-amber-400/95">
            {formatAmountFixed2(openingV)}
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

  const renderOpeningEntryCell = (
    oe: OpeningEntryRowDto,
    k: StatementColKey,
    balance: number,
    balanceValuated: number,
  ): ReactNode => {
    const desc = oe.description?.trim() || t('accountStatement.openingEntries.rowLabel');
    switch (k) {
      case 'idx':
        return <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">—</td>;
      case 'date':
        return (
          <td key={k} className="overflow-hidden whitespace-nowrap px-2 text-xs">{formatDate(oe.entryDate)}</td>
        );
      case 'entry':
        return (
          <td key={k} className="overflow-hidden px-2 text-xs">
            <span className="num-display font-semibold text-primary">#{oe.entryNumber}</span>
          </td>
        );
      case 'account':
        return <td key={k} className="overflow-hidden px-2 text-xs text-muted-foreground">—</td>;
      case 'desc':
        return (
          <td key={k} className="overflow-hidden px-2 text-xs italic text-blue-300/90">{desc}</td>
        );
      case 'debit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-emerald-400">
            {oe.debit > 0 ? formatAmountFixed2(oe.debit) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'credit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-rose-400">
            {oe.credit > 0 ? formatAmountFixed2(oe.credit) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'balance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs font-semibold">
            {formatAmountFixed2(balance)}
          </td>
        );
      case 'valBalance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs font-semibold text-amber-400">
            {formatAmountFixed2(balanceValuated)}
          </td>
        );
      case 'currency':
        return (
          <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">{oe.currency}</td>
        );
      case 'actions':
        return (
          <td key={k} data-col="actions" className="overflow-visible px-1.5 text-center align-middle">
            <StatementRowActionsMenu
              entryNumber={oe.entryNumber}
              sourceLabel={t('accountStatement.sources.openingEntry')}
              onView={() => setViewEntryId(oe.entryId)}
              onOpenSource={() => { void openOpeningEntrySource(oe.entryId); }}
            />
          </td>
        );
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
                  title={t('accountStatement.table.entryInternal', { num: row.entryNumber })}
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
              <span>
                {locale === 'en'
                  ? (accountNamesEnByCode[row.accountCode] || row.accountName)
                  : row.accountName}
              </span>
            </div>
          </td>
        );
      case 'desc': {
        const rawDesc = row.lineDescription || row.description || '';
        const dispDesc = rawDesc ? localizedEntryDescription(locale, rawDesc, descriptionContextMap) : '';
        return (
          <td key={k} className="overflow-hidden px-2 text-xs align-middle">
            <div className="truncate" title={descTitle || '—'}>
              {dispDesc || '—'}
            </div>
          </td>
        );
      }
      case 'debit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-emerald-400">
            {row.debit > 0 ? formatAmountFixed2(row.debit) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'credit':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-rose-400">
            {row.credit > 0 ? formatAmountFixed2(row.credit) : <span className="text-muted-foreground/40">—</span>}
          </td>
        );
      case 'balance':
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs font-semibold">
            {formatAmountFixed2(row.balance)}
          </td>
        );
      case 'valBalance':
        if (opts?.hideValuated) {
          return (
            <td key={k} className="overflow-hidden px-2 text-right num-display text-xs text-muted-foreground/40">—</td>
          );
        }
        return (
          <td key={k} className="overflow-hidden px-2 text-right num-display text-xs font-semibold text-amber-400">
            {formatAmountFixed2(bv)}
          </td>
        );
      case 'currency':
        return (
          <td key={k} className="overflow-hidden px-2 text-center text-xs text-muted-foreground">{row.currency}</td>
        );
      case 'actions': {
        const sourceLink = resolveSourceLink(row, t);
        const refSuffix = row.referenceNumber ?? row.referenceId;
        const sourceDescr = refSuffix ? `${sourceLink.label} #${refSuffix}` : sourceLink.label;
        return (
          <td key={k} data-col="actions" className="overflow-visible px-1.5 text-center align-middle">
            <StatementRowActionsMenu
              entryNumber={row.entryNumber}
              sourceLabel={sourceDescr}
              sourceHref={sourceLink.href}
              onView={() => {
                handleRowInteract(row.entryId);
                setViewEntryId(row.entryId);
              }}
              onOpenSource={() => { void openEntrySource(row); }}
              onOpenChange={open => { if (open) handleRowInteract(row.entryId); }}
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
      ? t('accountStatement.table.totalWithOpening', { amount: formatAmountFixed2(totals.opening) })
      : t('accountStatement.table.total');
    const cells: ReactNode[] = [
      <td key="lab" colSpan={ai} className="overflow-hidden px-3 py-2 text-right">{labelText}</td>,
    ];
    tail.forEach(k => {
      switch (k) {
        case 'debit':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-emerald-400">
              {formatAmountFixed2(totals.debit)}
            </td>); break;
        case 'credit':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-rose-400">
              {formatAmountFixed2(totals.credit)}
            </td>); break;
        case 'balance':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display text-primary">
              {formatAmountFixed2(totals.balance)}
            </td>); break;
        case 'valBalance':
          cells.push(
            <td key={k} className="overflow-hidden px-2 text-right num-display font-bold text-amber-400">
              {formatAmountFixed2(totals.balanceValuated)}
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
      {statementSource && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="h-8 gap-1.5"
          onClick={handleBackToSource}
        >
          {isRtl ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
          {t('accountStatement.backToReport', { label: t(statementSource.sourceLabelKey) })}
        </Button>
      )}

      {/* ════════ شريط الفترات السريعة (بارز في الأعلى) ════════ */}
      <div className="border-b border-border/50 pb-2 [&_button]:h-8 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-xs [&_button]:font-semibold">
        <DateRangePresets
          from={from}
          to={to}
          onChange={applyPresetRange}
          showLabel={false}
          showClearButton={false}
          showFiscalYearBadge
        />
      </div>

      {/* ════════ صف الفلاتر (بدون إطار بطاقة — تصميم flat) ════════ */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px]">
          <label className="mb-1 flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground">
            <CalendarRange className="h-3 w-3" /> {t('accountStatement.filters.fromDate')}
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
          <label className="mb-1 block text-[10.5px] font-medium text-muted-foreground">{t('accountStatement.filters.toDate')}</label>
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
          <label className="mb-1 block text-[10.5px] font-medium text-muted-foreground">{t('accountStatement.filters.account')}</label>
          <AccountPicker
            accounts={filteredAccounts}
            value={accountId}
            initialLabel={accountLabel}
            onChange={(id, lbl) => {
              setAccountId(id);
              setAccountLabel(lbl);
            }}
            allowClear
            placeholder={t('accountStatement.filters.accountPlaceholder')}
            inputHeight={9}
          />
        </div>

        <div className="min-w-[130px]" ref={currencyPanelRef}>
          <label className="mb-1 block text-[10.5px] font-medium text-muted-foreground">{t('accountStatement.filters.currency')}</label>
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
                  ? t('accountStatement.filters.allCurrenciesTitle')
                  : t('accountStatement.filters.selectedCurrencies', { list: selectedCurrencies.join(', ') })
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
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="flex items-center justify-between border-b border-border/60 bg-secondary/30 px-3 py-1.5 text-[10.5px] text-muted-foreground">
                  <span>{t('accountStatement.filters.currencyPickerHint')}</span>
                  {selectedCurrencies.length > 0 && (
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[10px] hover:bg-secondary hover:text-foreground"
                      onClick={() => setSelectedCurrencies([])}
                    >
                      {t('accountStatement.filters.clearCurrency')}
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
                    ? t('accountStatement.filters.showAllCurrencies')
                    : t('accountStatement.filters.currencyCount', { selected: selectedCurrencies.length, total: CURRENCIES.length })}
                </div>
              </div>
            )}
          </div>
        </div>

        <BranchFilterSelect
          value={branchFilter}
          onChange={setBranchFilter}
          showAllOption
          selectClassName="h-9"
        />

        <label
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2.5 text-xs"
          title={t('accountStatement.filters.includeOpeningEntriesTip')}
        >
          <input
            type="checkbox"
            checked={includeOpeningEntries}
            onChange={e => setIncludeOpeningEntries(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          <span>{t('accountStatement.filters.includeOpeningEntries')}</span>
        </label>

        <div className="flex items-center gap-1.5">
          <Button onClick={handleShow} className="h-9 gap-2" disabled={!from || !to}>
            <Search className="h-4 w-4" />
            {t('accountStatement.filters.show')}
          </Button>
          {rd && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 gap-1.5" title={t('accountStatement.filters.printTooltip')}>
              <Printer className="h-3.5 w-3.5" />
              {t('accountStatement.filters.print')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleReset} className="h-9 gap-1.5" title={t('accountStatement.filters.resetTooltip')}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t('accountStatement.filters.reset')}
          </Button>
        </div>
      </div>

      {!submitted ? (
        <EmptyState
          icon={FileText}
          title={t('accountStatement.empty.promptTitle')}
          description={t('accountStatement.empty.promptDesc')}
        />
      ) : statementQuery.isLoading ? (
        <LoadingSpinner text={t('accountStatement.loading')} />
      ) : statementQuery.isError || !rd ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('accountStatement.empty.loadFailed')}
          description={t('accountStatement.empty.loadError')}
        />
      ) : (
        <>
          {rd.rows.length === 0 && (
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-4">
              <SummaryCell
                label={t('accountStatement.summary.openingBalance')}
                value={rd.openingBalanceValuated ?? 0}
                accent="text-blue-400"
                subtitle={t('accountStatement.summary.valuedIn', { currency: rd.baseCurrency ?? 'IQD' })}
                icon={<Wallet className="h-4 w-4" />}
              />
              <SummaryCell
                label={t('accountStatement.summary.totalDebit')}
                value={rd.totalDebitValuated ?? rd.totalDebit}
                accent="text-emerald-400"
                subtitle={t('accountStatement.summary.valuedIn', { currency: rd.baseCurrency ?? 'IQD' })}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <SummaryCell
                label={t('accountStatement.summary.totalCredit')}
                value={rd.totalCreditValuated ?? rd.totalCredit}
                accent="text-rose-400"
                subtitle={t('accountStatement.summary.valuedIn', { currency: rd.baseCurrency ?? 'IQD' })}
                icon={<TrendingDown className="h-4 w-4" />}
              />
              <SummaryCell
                label={t('accountStatement.summary.closingBalance')}
                value={rd.closingBalanceValuated ?? rd.closingBalance}
                accent="text-primary"
                highlight
                subtitle={t('accountStatement.summary.closingNote', { currency: rd.baseCurrency ?? 'IQD' })}
                icon={<Scale className="h-4 w-4" />}
              />
            </CardContent>
            {/*
             * قيود الافتتاح: تُعرض كصف معلوماتي تحت البطاقات الإحصائية لتوضيح
             * مصدر الرصيد الافتتاحي. لا تُكرَّر بين الحركات لأنها مدمجة بالفعل
             * في openingBalance.
             */}
            {includeOpeningEntries && rd.openingEntries && rd.openingEntries.length > 0 && (
              <div className="border-t border-blue-500/30 bg-blue-500/5 px-4 py-2 text-[11px]">
                <div className="mb-1.5 flex items-center gap-1.5 font-medium text-blue-300">
                  <Wallet className="h-3.5 w-3.5" />
                  {t('accountStatement.openingEntries.title', { count: rd.openingEntries.length })}
                </div>
                <div className="space-y-1">
                  {rd.openingEntries.map(oe => {
                    const sign = oe.net >= 0 ? '+' : '';
                    const isCredit = oe.net < 0;
                    return (
                      <div
                        key={oe.entryId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setViewEntryId(oe.entryId)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setViewEntryId(oe.entryId); }}
                        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-blue-500/20 bg-blue-500/5 px-2 py-1 cursor-pointer transition-colors hover:bg-blue-500/10"
                      >
                        <span className="font-semibold text-blue-200">
                          #{oe.entryNumber}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate(oe.entryDate)}
                        </span>
                        {oe.description && (
                          <span className="truncate text-muted-foreground" title={oe.description}>
                            {oe.description}
                          </span>
                        )}
                        <span className="ms-auto inline-flex items-center gap-2">
                          {oe.debit > 0 && (
                            <span className="text-emerald-300">
                              {t('accountStatement.openingEntries.debit')} <span className="num-display">{formatAmountFixed2(oe.debit)}</span>
                            </span>
                          )}
                          {oe.credit > 0 && (
                            <span className="text-rose-300">
                              {t('accountStatement.openingEntries.credit')} <span className="num-display">{formatAmountFixed2(oe.credit)}</span>
                            </span>
                          )}
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 font-bold',
                              isCredit
                                ? 'bg-rose-500/20 text-rose-200'
                                : 'bg-emerald-500/20 text-emerald-200'
                            )}
                          >
                            {sign}
                            <span className="num-display">{formatAmountFixed2(Math.abs(oe.net))}</span> {oe.currency}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-blue-200"
                            onClick={e => { e.stopPropagation(); setViewEntryId(oe.entryId); }}
                          >
                            {t('accountStatement.openingEntries.viewEntry')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-amber-200"
                            onClick={e => { e.stopPropagation(); void openOpeningEntrySource(oe.entryId); }}
                          >
                            {t('accountStatement.rowActions.openSource')}
                          </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {rd.fxBulletinName ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-800 dark:bg-emerald-500/5 dark:text-emerald-200">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('accountStatement.fx.bulletinPublished')}
                  <span className="font-bold text-emerald-900 dark:text-emerald-100">{rd.fxBulletinName}</span>
                </span>
                {rd.fxBulletinEffectiveAt && (
                  <span className="text-emerald-700 dark:text-emerald-300/80">
                    {t('accountStatement.fx.effective')} {formatDate(rd.fxBulletinEffectiveAt)}
                  </span>
                )}
                {rd.fxUsedFallback && (
                  <span className="ms-auto inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('accountStatement.fx.fallbackSome')}
                  </span>
                )}
              </div>
            ) : rd.fxUsedFallback ? (
              <div className="flex items-center gap-1.5 border-t border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('accountStatement.fx.noBulletin')} {t('accountStatement.fx.noBulletinHint')}
                </span>
              </div>
            ) : null}
          </Card>
          )}

          {rd.rows.length === 0 && !(rd.openingBalance ?? 0) && !(includeOpeningEntries && rd.openingEntries?.length) ? (
            <EmptyState icon={FileText} title={t('accountStatement.empty.noMovements')} description={t('accountStatement.empty.noMovementsDesc')} />
          ) : (
            <Card className="overflow-visible">
              <div className="border-b border-border/60">
                {includeOpeningEntries && rd.openingEntries && rd.openingEntries.length > 0 && (
                  <div className="border-blue-500/30 bg-blue-500/5 px-4 py-2 text-[11px]">
                    <div className="mb-1.5 flex items-center gap-1.5 font-medium text-blue-300">
                      <Wallet className="h-3.5 w-3.5" />
                      {t('accountStatement.openingEntries.title', { count: rd.openingEntries.length })}
                    </div>
                    <div className="space-y-1">
                      {rd.openingEntries.map(oe => {
                        const sign = oe.net >= 0 ? '+' : '';
                        const isCredit = oe.net < 0;
                        return (
                          <div
                            key={oe.entryId}
                            role="button"
                            tabIndex={0}
                            onClick={() => setViewEntryId(oe.entryId)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setViewEntryId(oe.entryId); }}
                            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-blue-500/20 bg-blue-500/5 px-2 py-1 cursor-pointer transition-colors hover:bg-blue-500/10"
                          >
                            <span className="font-semibold text-blue-200">#{oe.entryNumber}</span>
                            <span className="text-muted-foreground">{formatDate(oe.entryDate)}</span>
                            {oe.description && (
                              <span className="truncate text-muted-foreground" title={oe.description}>{oe.description}</span>
                            )}
                            <span className="ms-auto inline-flex items-center gap-2">
                              {oe.debit > 0 && (
                                <span className="text-emerald-300">
                                  {t('accountStatement.openingEntries.debit')} <span className="num-display">{formatAmountFixed2(oe.debit)}</span>
                                </span>
                              )}
                              {oe.credit > 0 && (
                                <span className="text-rose-300">
                                  {t('accountStatement.openingEntries.credit')} <span className="num-display">{formatAmountFixed2(oe.credit)}</span>
                                </span>
                              )}
                              <span className={cn('rounded px-1.5 py-0.5 font-bold', isCredit ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/20 text-emerald-200')}>
                                {sign}<span className="num-display">{formatAmountFixed2(Math.abs(oe.net))}</span> {oe.currency}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-blue-200"
                                onClick={e => { e.stopPropagation(); setViewEntryId(oe.entryId); }}
                              >
                                {t('accountStatement.openingEntries.viewEntry')}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-amber-200"
                                onClick={e => { e.stopPropagation(); void openOpeningEntrySource(oe.entryId); }}
                              >
                                {t('accountStatement.rowActions.openSource')}
                              </Button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {rd.fxBulletinName ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-800 dark:bg-emerald-500/5 dark:text-emerald-200">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('accountStatement.fx.bulletinPublished')}
                      <span className="font-bold text-emerald-900 dark:text-emerald-100">{rd.fxBulletinName}</span>
                    </span>
                    {rd.fxBulletinEffectiveAt && (
                      <span className="text-emerald-700 dark:text-emerald-300/80">
                        {t('accountStatement.fx.effective')} {formatDate(rd.fxBulletinEffectiveAt)}
                      </span>
                    )}
                    {rd.fxUsedFallback && (
                      <span className="ms-auto inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t('accountStatement.fx.fallbackSome')}
                      </span>
                    )}
                  </div>
                ) : rd.fxUsedFallback ? (
                  <div className="flex items-center gap-1.5 border-t border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('accountStatement.fx.noBulletin')} {t('accountStatement.fx.noBulletinHint')}</span>
                  </div>
                ) : null}
              </div>
              <div className="sticky top-0 z-30 shrink-0 border-b border-border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10.5px] font-semibold text-primary">
                      <FileText className="h-3 w-3" />
                      {t('accountStatement.table.movements', { count: rd.rows.length })}
                    </span>
                    <span className="hidden text-[10.5px] sm:inline">
                      {t('accountStatement.table.dragHint')}
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
                      {t('accountStatement.table.columns')}
                    </Button>
                    <Button variant="ghost" size="sm" type="button" className="h-8 gap-1 px-2 text-xs" onClick={resetTableLayout} title={t('accountStatement.table.resetLayout')}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                {colsPanelOpen && (() => {
                  const allow = allowedKeys(rd.isAllAccounts);
                  const ordered = sanitizeOrder(columnOrder, rd.isAllAccounts).filter(c => allow.has(c));
                  return (
                    <div
                      className="absolute end-0 top-[calc(100%+4px)] z-50 max-h-[min(70vh,520px)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      <div className="border-b border-border/60 bg-secondary/30 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Columns className="h-3.5 w-3.5 text-primary" />
                          {t('accountStatement.table.columnsSettings')}
                        </div>
                        <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
                          {t('accountStatement.table.columnsHelp')}
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
                                title={colLabels[k]}
                              >
                                {colLabels[k]}
                                {disabled && (
                                  <span className="ms-1.5 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                                    {t('accountStatement.table.requiredCol')}
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
                                  title={t('accountStatement.table.moveUp')}
                                  aria-label={t('accountStatement.table.moveUpAria', { name: colLabels[k] })}
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
                                  title={t('accountStatement.table.moveDown')}
                                  aria-label={t('accountStatement.table.moveDownAria', { name: colLabels[k] })}
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
                          {t('accountStatement.table.restoreOrder')}
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
                  const mult = multipliers.get(cur) ?? 1;
                  const openingEntriesForCur = includeOpeningEntries
                    ? (openingEntriesByCurrency.get(cur) ?? [])
                    : [];
                  const fromKey = from.slice(0, 10);
                  const openingBeforeFrom = openingEntriesForCur.filter(
                    oe => entryDateKey(oe.entryDate) < fromKey,
                  );
                  const openingInPeriod = openingEntriesForCur.filter(
                    oe => entryDateKey(oe.entryDate) >= fromKey,
                  );
                  const openingBeforeFromNet = openingBeforeFrom.reduce((s, oe) => s + oe.net, 0);
                  const carryForward = totals.opening - openingBeforeFromNet;
                  const showCarryForwardRow = !includeOpeningEntries
                    ? totals.opening !== 0 || totals.openingValuated !== 0
                    : Math.abs(carryForward) > 1e-9;
                  const showOpeningBeforeFromRows = includeOpeningEntries && openingBeforeFrom.length > 0;
                  const showAggregateOpeningOnly = includeOpeningEntries
                    && openingBeforeFrom.length === 0
                    && openingInPeriod.length === 0
                    && (totals.opening !== 0 || totals.openingValuated !== 0);
                  const timeline = buildStatementTimeline(rows, openingInPeriod);
                  let runningBal = totals.opening;
                  let runningBalV = totals.openingValuated;
                  const timelineRows = timeline.map(item => {
                    if (item.kind === 'opening') {
                      runningBal += item.oe.net;
                      runningBalV += item.oe.netValuated ?? item.oe.net * mult;
                      return {
                        kind: 'opening' as const,
                        oe: item.oe,
                        balance: runningBal,
                        balanceValuated: runningBalV,
                      };
                    }
                    const delta = (item.row.debit ?? 0) - (item.row.credit ?? 0);
                    runningBal += delta;
                    runningBalV += delta * mult;
                    return {
                      kind: 'row' as const,
                      row: { ...item.row, balance: runningBal, balanceValuated: runningBalV },
                      sourceIdx: item.sourceIdx,
                    };
                  });
                  const movementCount = rows.length + openingInPeriod.length;
                  return (
                    <div
                      key={cur}
                      className="overflow-hidden rounded-lg border border-border/60 bg-card/50"
                    >
                      <CurrencyBalanceHeader
                        cur={cur}
                        count={movementCount}
                        totals={totals}
                        t={t}
                      />

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
                                  colLabels={colLabels}
                                  t={t}
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
                            {showCarryForwardRow ? (
                              <tr className="h-9 border-b border-border/40 bg-secondary/40 font-medium">
                                {visibleCols.map(k =>
                                  renderOpeningCell(k, {
                                    opening: includeOpeningEntries ? carryForward : totals.opening,
                                    openingValuated: includeOpeningEntries ? carryForward * mult : totals.openingValuated,
                                    currency: cur,
                                    label: includeOpeningEntries
                                      ? t('accountStatement.table.carryForwardRow')
                                      : t('accountStatement.table.openingBalanceRow'),
                                  })
                                )}
                              </tr>
                            ) : null}
                            {showOpeningBeforeFromRows
                              ? openingBeforeFrom.map((oe, oi) => {
                                  let bal = carryForward;
                                  for (let i = 0; i <= oi; i++) bal += openingBeforeFrom[i]!.net;
                                  return (
                                    <tr
                                      key={`oe-${oe.entryId}`}
                                      className="h-9 cursor-pointer border-b border-blue-500/20 bg-blue-500/5 font-medium transition-colors hover:bg-blue-500/10"
                                      onClick={e => {
                                        if ((e.target as HTMLElement).closest('[data-col="actions"]')) return;
                                        setViewEntryId(oe.entryId);
                                      }}
                                    >
                                      {visibleCols.map(k =>
                                        renderOpeningEntryCell(oe, k, bal, bal * mult)
                                      )}
                                    </tr>
                                  );
                                })
                              : null}
                            {showAggregateOpeningOnly ? (
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
                            {timelineRows.map((item, idx) => {
                              if (item.kind === 'opening') {
                                return (
                                  <tr
                                    key={`oe-in-${item.oe.entryId}`}
                                    className="h-9 cursor-pointer border-b border-blue-500/20 bg-blue-500/5 font-medium transition-colors hover:bg-blue-500/10"
                                    onClick={e => {
                                      if ((e.target as HTMLElement).closest('[data-col="actions"]')) return;
                                      setViewEntryId(item.oe.entryId);
                                    }}
                                  >
                                    {visibleCols.map(k =>
                                      renderOpeningEntryCell(
                                        item.oe,
                                        k,
                                        item.balance,
                                        item.balanceValuated,
                                      )
                                    )}
                                  </tr>
                                );
                              }
                              const row = item.row;
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
                                  onContextMenu={e => {
                                    e.preventDefault();
                                    setCtxMenu({ x: e.clientX, y: e.clientY, row });
                                  }}
                                  onClick={e => {
                                    if ((e.target as HTMLElement).closest('[data-col="actions"]')) return;
                                    setCtxMenu({ x: e.clientX, y: e.clientY, row });
                                  }}
                                  className={cn(
                                    'h-9 cursor-pointer border-b border-border/30 transition-colors hover:bg-secondary/30',
                                    isFocused && 'bg-primary/15 ring-2 ring-primary/60 ring-inset'
                                  )}
                                >
                                  {visibleCols.map(k => renderDataCell(row, item.sourceIdx, k))}
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
                    {t('accountStatement.table.grandTotalTitle', { currency: rd.baseCurrency ?? 'IQD' })}
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-border/40 md:grid-cols-4">
                    <div className="bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">{t('accountStatement.summary.openingBalance')}</span>
                        <Wallet className="h-3.5 w-3.5 text-blue-400 opacity-70" />
                      </div>
                      <div className={cn('mt-1 max-w-full overflow-x-auto font-bold tabular-nums num-display whitespace-nowrap text-blue-400', summaryAmountSizeClass(rd.openingBalanceValuated ?? 0))}>
                        {formatAmountFixed2(rd.openingBalanceValuated ?? 0)}
                      </div>
                    </div>
                    <div className="bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">{t('accountStatement.summary.totalDebit')}</span>
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400 opacity-70" />
                      </div>
                      <div className={cn('mt-1 max-w-full overflow-x-auto font-bold tabular-nums num-display whitespace-nowrap text-emerald-400', summaryAmountSizeClass(rd.totalDebitValuated ?? rd.totalDebit))}>
                        {formatAmountFixed2(rd.totalDebitValuated ?? rd.totalDebit)}
                      </div>
                    </div>
                    <div className="bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">{t('accountStatement.summary.totalCredit')}</span>
                        <TrendingDown className="h-3.5 w-3.5 text-rose-400 opacity-70" />
                      </div>
                      <div className={cn('mt-1 max-w-full overflow-x-auto font-bold tabular-nums num-display whitespace-nowrap text-rose-400', summaryAmountSizeClass(rd.totalCreditValuated ?? rd.totalCredit))}>
                        {formatAmountFixed2(rd.totalCreditValuated ?? rd.totalCredit)}
                      </div>
                    </div>
                    <div className="bg-primary/10 p-3 ring-1 ring-primary/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-medium text-muted-foreground">{t('accountStatement.summary.closingBalance')}</span>
                        <Scale className="h-3.5 w-3.5 text-primary opacity-80" />
                      </div>
                      <div className={cn('mt-1 max-w-full overflow-x-auto font-bold tabular-nums num-display whitespace-nowrap text-primary', summaryAmountSizeClass(rd.closingBalanceValuated ?? rd.closingBalance))}>
                        {formatAmountFixed2(rd.closingBalanceValuated ?? rd.closingBalance)}
                      </div>
                    </div>
                  </div>
                  {currenciesPresent.length > 1 && (
                    <div className="border-t border-primary/20 bg-primary/5 px-3 py-2 text-[10.5px] text-muted-foreground">
                      {t('accountStatement.table.multiCurrencyFoot', { count: currenciesPresent.length })}
                      {rd.fxBulletinName && t('accountStatement.table.multiCurrencyBulletin', { name: rd.fxBulletinName })}
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

      {/* ── قائمة السياق (كليك يمين على الصف) ── */}
      {ctxMenu && createPortal(
        <RowContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          row={ctxMenu.row}
          isRtl={isRtl}
          onClose={() => setCtxMenu(null)}
          onView={() => { setCtxMenu(null); setViewEntryId(ctxMenu.row.entryId); }}
          onOpenSource={() => {
            setCtxMenu(null);
            void openEntrySource(ctxMenu.row);
          }}
          t={t}
        />,
        document.body
      )}
    </div>
  );
}

// ── مكوّن قائمة السياق ───────────────────────────────────────────────────────
interface RowContextMenuProps {
  x: number;
  y: number;
  row: AccountStatementRowDto;
  isRtl: boolean;
  onClose: () => void;
  onView: () => void;
  onOpenSource: () => void;
  t: TFunction;
}

function RowContextMenu({ x, y, row, isRtl, onClose, onView, onOpenSource, t }: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sourceLink = resolveSourceLink(row, t);

  // إغلاق عند الضغط أو اللمس خارج القائمة أو Esc
  useEffect(() => {
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const target = ('touches' in e ? e.touches[0]?.target : e.target) as Node | null;
      if (target && !menuRef.current?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onOutside as EventListener);
    document.addEventListener('touchstart', onOutside as EventListener, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside as EventListener);
      document.removeEventListener('touchstart', onOutside as EventListener);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // تعديل الموضع لضمان ظهور القائمة داخل حدود الشاشة
  // إذا كانت الإحداثيات صفراً (نقر لمسي بدون موضع دقيق)، تُمركز القائمة أفقياً
  const menuW = 220;
  const menuH = 110;
  const rawLeft = x || window.innerWidth / 2 - menuW / 2;
  const rawTop  = y || window.innerHeight / 2 - menuH / 2;
  const left = Math.min(Math.max(rawLeft, 8), window.innerWidth - menuW - 8);
  const top  = Math.min(Math.max(rawTop, 8), window.innerHeight - menuH - 8);

  const refSuffix = row.referenceNumber ?? row.referenceId;
  const sourceDescr = refSuffix ? `${sourceLink.label} #${refSuffix}` : sourceLink.label;

  return (
    <div
      ref={menuRef}
      role="menu"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', top, left, width: menuW, zIndex: 9999 }}
      className="overflow-hidden rounded-lg border border-border bg-popover/95 shadow-2xl backdrop-blur-sm"
    >
      {/* رأس القائمة: رقم القيد */}
      <div className="border-b border-border/50 px-3 py-1.5">
        <span className="num-display text-[11px] font-semibold text-muted-foreground">
          # {row.entryNumber}
        </span>
      </div>
      {/* عرض القيد */}
      <button
        type="button"
        role="menuitem"
        onClick={onView}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground transition-colors hover:bg-primary/10 hover:text-primary',
          isRtl ? 'text-right' : 'text-left'
        )}
      >
        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{t('accountStatement.rowActions.viewEntry')}</div>
          <div className="truncate text-[10px] text-muted-foreground">{t('accountStatement.rowActions.viewEntryHint')}</div>
        </div>
      </button>
      <div className="h-px bg-border/50" />
      {/* أصل القيد */}
      <button
        type="button"
        role="menuitem"
        onClick={onOpenSource}
        disabled={!sourceLink.href}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors',
          isRtl ? 'text-right' : 'text-left',
          sourceLink.href
            ? 'text-foreground hover:bg-amber-500/10 hover:text-amber-300'
            : 'cursor-not-allowed text-muted-foreground/40'
        )}
      >
        <Receipt className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{t('accountStatement.rowActions.openSource')}</div>
          <div className="truncate text-[10px] text-muted-foreground">{sourceDescr}</div>
        </div>
      </button>
    </div>
  );
}
