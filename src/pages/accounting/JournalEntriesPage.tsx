import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
  Printer,
  CalendarRange,
  GripVertical,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { useAuthStore } from '@/lib/auth/auth-store';
import { formatAmount, formatDate, cn } from '@/lib/utils';
import { printJournalEntriesList, printSingleJournalEntry } from '@/lib/printUtils';
import type { JournalEntryDto } from '@/types/api';

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    Posted: { label: 'مرحَّل', variant: 'success' },
    Draft: { label: 'مسودة', variant: 'muted' },
    Reversed: { label: 'معكوس', variant: 'destructive' },
  };
  const cfg = map[status] ?? { label: status, variant: 'muted' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function TypeBadge({ type }: { type?: string }) {
  if (!type || type === 'Normal') return null;
  return (
    <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
      افتتاحي
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// نظام ترتيب وعرض أعمدة جدول البنود (drag & drop + resize + persist)
// ════════════════════════════════════════════════════════════
type LineColKey = 'idx' | 'account' | 'desc' | 'debit' | 'credit';

const LINE_COL_LABEL: Record<LineColKey, string> = {
  idx: '#',
  account: 'الحساب',
  desc: 'البيان',
  debit: 'المدين',
  credit: 'الدائن',
};

const LINE_COL_DEFAULT: LineColKey[] = ['idx', 'account', 'desc', 'debit', 'credit'];
const LINE_COL_DEFAULT_WIDTH: Record<LineColKey, number> = {
  idx: 50,
  account: 280,
  desc: 280,
  debit: 140,
  credit: 140,
};
const LINE_COL_LIMITS: Record<LineColKey, { min: number; max: number }> = {
  idx: { min: 36, max: 100 },
  account: { min: 120, max: 600 },
  desc: { min: 120, max: 700 },
  debit: { min: 80, max: 260 },
  credit: { min: 80, max: 260 },
};

/** المفاتيح القديمة (المشتركة) — تُقرأ كاحتياطي عند ترقية الإصدار */
const LEGACY_LINE_COL_ORDER_KEY = 'journal-entry-lines-col-order';
const LEGACY_LINE_COL_WIDTH_KEY = 'journal-entry-lines-col-widths';

function lineColStorageKeys(userNs: string) {
  const enc = encodeURIComponent(userNs || '__guest__');
  return {
    order: `journal-entry-lines-col-order:user:${enc}`,
    widths: `journal-entry-lines-col-widths:user:${enc}`,
  };
}

function loadLineColOrder(userNs: string): LineColKey[] {
  try {
    const k = lineColStorageKeys(userNs);
    const raw = localStorage.getItem(k.order) ?? localStorage.getItem(LEGACY_LINE_COL_ORDER_KEY);
    if (!raw) return LINE_COL_DEFAULT;
    const arr = JSON.parse(raw) as LineColKey[];
    const valid = arr.filter(c => LINE_COL_DEFAULT.includes(c));
    LINE_COL_DEFAULT.forEach(c => {
      if (!valid.includes(c)) valid.push(c);
    });
    return valid;
  } catch {
    return LINE_COL_DEFAULT;
  }
}

function saveLineColOrder(userNs: string, order: LineColKey[]) {
  try {
    localStorage.setItem(lineColStorageKeys(userNs).order, JSON.stringify(order));
  } catch { /* ignore */ }
}

function loadLineColWidths(userNs: string): Record<LineColKey, number> {
  try {
    const k = lineColStorageKeys(userNs);
    const raw = localStorage.getItem(k.widths) ?? localStorage.getItem(LEGACY_LINE_COL_WIDTH_KEY);
    if (!raw) return { ...LINE_COL_DEFAULT_WIDTH };
    const obj = JSON.parse(raw) as Partial<Record<LineColKey, number>>;
    return { ...LINE_COL_DEFAULT_WIDTH, ...obj };
  } catch {
    return { ...LINE_COL_DEFAULT_WIDTH };
  }
}

function saveLineColWidths(userNs: string, w: Record<LineColKey, number>) {
  try {
    localStorage.setItem(lineColStorageKeys(userNs).widths, JSON.stringify(w));
  } catch { /* ignore */ }
}

function clampLineColWidth(key: LineColKey, w: number): number {
  const { min, max } = LINE_COL_LIMITS[key];
  return Math.round(Math.min(max, Math.max(min, w)));
}

function LineColHeader({
  colKey,
  order,
  setOrder,
  userNs,
  width,
  onResizeStart,
  className,
  isDropTarget,
  setDropTarget,
  children,
}: {
  colKey: LineColKey;
  order: LineColKey[];
  setOrder: (o: LineColKey[]) => void;
  userNs: string;
  width: number;
  onResizeStart: (colKey: LineColKey, startX: number, startWidth: number) => void;
  className?: string;
  isDropTarget: boolean;
  setDropTarget: (k: LineColKey | null) => void;
  children: React.ReactNode;
}) {
  return (
    <th
      style={{ width, minWidth: width, maxWidth: width }}
      draggable
      onDragStart={(e: ReactDragEvent) => {
        e.dataTransfer.setData('text/plain', colKey);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e: ReactDragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => setDropTarget(colKey)}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e: ReactDragEvent) => {
        e.preventDefault();
        const src = e.dataTransfer.getData('text/plain') as LineColKey;
        setDropTarget(null);
        if (!src || src === colKey) return;
        const next = order.filter(k => k !== src);
        const at = next.indexOf(colKey);
        if (at < 0) return;
        next.splice(at, 0, src);
        setOrder(next);
        saveLineColOrder(userNs, next);
      }}
      className={cn(
        'group relative cursor-grab select-none transition-colors',
        isDropTarget && 'bg-primary/15',
        className
      )}
      title="اسحب لإعادة الترتيب · اسحب الحافة لتغيير العرض"
    >
      <div className="flex items-center gap-1">
        <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
        {children}
      </div>
      {/* مقبض تغيير العرض - على الحافة اليسرى (لـ RTL) */}
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(colKey, e.clientX, width);
        }}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        draggable={false}
        className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 group-hover:bg-primary/20"
        title="اسحب لتغيير عرض العمود"
      />
    </th>
  );
}

function renderLineCell(
  col: LineColKey,
  line: import('@/types/api').JournalLineDto,
  idx: number
) {
  switch (col) {
    case 'idx':
      return (
        <td className="border-l border-border/30 px-3 py-2 text-center text-xs text-muted-foreground">
          {idx + 1}
        </td>
      );
    case 'account':
      return (
        <td className="border-l border-border/30 px-3 py-2">
          <span className="font-medium">{line.accountName ?? `#${line.accountId}`}</span>
        </td>
      );
    case 'desc':
      return (
        <td className="border-l border-border/30 px-3 py-2 text-sm text-muted-foreground">
          {line.description || '—'}
        </td>
      );
    case 'debit':
      return (
        <td className="border-l border-border/30 px-3 py-2 text-right num-display">
          {line.isDebit ? (
            <span className="font-semibold text-emerald-400">{formatAmount(line.amount)}</span>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
      );
    case 'credit':
      return (
        <td className="border-l border-border/30 px-3 py-2 text-right num-display">
          {!line.isDebit ? (
            <span className="font-semibold text-amber-400">{formatAmount(line.amount)}</span>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
      );
  }
}

function renderTotalCell(col: LineColKey, totalD: number, totalC: number, balanced: boolean) {
  switch (col) {
    case 'idx':
      return <td className="border-l border-t-2 border-border/60 px-3 py-2"></td>;
    case 'account':
      return (
        <td className="border-l border-t-2 border-border/60 px-3 py-2 text-right">
          الإجمالي
          {!balanced && (
            <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />
              غير متوازن
            </span>
          )}
        </td>
      );
    case 'desc':
      return <td className="border-l border-t-2 border-border/60 px-3 py-2"></td>;
    case 'debit':
      return (
        <td className="border-l border-t-2 border-border/60 px-3 py-2 text-right num-display text-emerald-400">
          {formatAmount(totalD)}
        </td>
      );
    case 'credit':
      return (
        <td className="border-l border-t-2 border-border/60 px-3 py-2 text-right num-display text-amber-400">
          {formatAmount(totalC)}
        </td>
      );
  }
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
  onPrint,
  colOrder,
  setColOrder,
  colWidths,
  onResizeStart,
  userNs,
  isOpen,
  onToggle,
}: {
  entry: JournalEntryDto;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
  colOrder: LineColKey[];
  setColOrder: (o: LineColKey[]) => void;
  colWidths: Record<LineColKey, number>;
  onResizeStart: (colKey: LineColKey, startX: number, startWidth: number) => void;
  userNs: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const canEdit = entry.status !== 'Reversed';
  const totalD = entry.lines?.reduce((s, l) => s + (l.isDebit ? l.amount : 0), 0) ?? entry.totalDebit;
  const totalC = entry.lines?.reduce((s, l) => s + (!l.isDebit ? l.amount : 0), 0) ?? entry.totalCredit;
  const balanced = Math.abs(totalD - totalC) < 0.01;
  const lineCount = entry.lines?.length ?? 0;

  const [dropTarget, setDropTarget] = useState<LineColKey | null>(null);

  const headerAlign: Record<LineColKey, string> = {
    idx: 'text-right',
    account: 'text-right',
    desc: 'text-right',
    debit: 'text-right',
    credit: 'text-right',
  };

  return (
    <Card className="overflow-hidden border-border/60">
      {/* ───────── Header القيد ───────── */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-secondary/30 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/40"
        onClick={onToggle}
        title={isOpen ? 'انقر لإغلاق التفاصيل' : 'انقر لفتح التفاصيل'}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          title={isOpen ? 'إغلاق' : 'فتح'}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              !isOpen && '-rotate-90'
            )}
          />
        </button>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">قيد رقم</span>
          <span className="num-display text-base font-bold text-primary">{entry.entryNumber}</span>
        </div>
        <span className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          {formatDate(entry.entryDate)}
        </div>
        <span className="h-4 w-px bg-border" />
        <div className="flex flex-1 items-center gap-2 min-w-[160px]">
          <span className="font-semibold truncate" title={entry.description}>
            {entry.description}
          </span>
          <TypeBadge type={entry.entryType} />
          {entry.voucherTypeId && (entry.voucherTypeName || entry.voucherTypeCode) && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              title={entry.voucherTypeName ?? undefined}
            >
              {entry.voucherTypeCode && (
                <span className="num-display text-[9px] opacity-80">{entry.voucherTypeCode}</span>
              )}
              <span>{entry.voucherTypeName ?? entry.voucherTypeCode}</span>
            </span>
          )}
        </div>
        {/* الإجماليات في الـ header (تظهر دائماً) */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-baseline gap-1">
            <span className="text-muted-foreground">مدين:</span>
            <span className="num-display font-semibold text-emerald-400">{formatAmount(totalD)}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-muted-foreground">دائن:</span>
            <span className="num-display font-semibold text-amber-400">{formatAmount(totalC)}</span>
          </div>
          {!balanced && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />
              غير متوازن
            </span>
          )}
          <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {lineCount} {lineCount === 1 ? 'بند' : 'بنود'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="num-display rounded bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            {entry.currency || 'IQD'}
          </span>
          <StatusBadge status={entry.status} />
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onPrint}
            title="طباعة القيد"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            disabled={!canEdit}
            title={canEdit ? 'تعديل' : 'لا يمكن تعديل قيد معكوس'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={!canEdit}
            title={canEdit ? 'حذف' : 'لا يمكن حذف قيد معكوس'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ───────── جدول البنود (يظهر فقط عند الفتح) ───────── */}
      {isOpen && (
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {colOrder.map(col => (
                <col key={col} style={{ width: colWidths[col] }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-secondary/15 text-xs uppercase tracking-wider text-muted-foreground">
                {colOrder.map(col => (
                  <LineColHeader
                    key={col}
                    colKey={col}
                    order={colOrder}
                    setOrder={setColOrder}
                    userNs={userNs}
                    width={colWidths[col]}
                    onResizeStart={onResizeStart}
                    isDropTarget={dropTarget === col}
                    setDropTarget={setDropTarget}
                    className={cn(
                      'border-b border-l border-border/60 px-3 py-2',
                      headerAlign[col]
                    )}
                  >
                    {LINE_COL_LABEL[col]}
                  </LineColHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.lines?.map((line, idx) => (
                <tr key={line.id} className="border-b border-border/30 hover:bg-secondary/20">
                  {colOrder.map(col => (
                    <Fragment key={col}>
                      {renderLineCell(col, line, idx)}
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/30 font-semibold">
                {colOrder.map(col => (
                  <Fragment key={col}>
                    {renderTotalCell(col, totalD, totalC, balanced)}
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

interface JournalEntriesPageProps {
  /**
   * عند تمريره: تقفل الصفحة فلتر نوع السند على هذا النوع (بالكود)،
   * يختفي قائمة "كل الأنواع"، ويظهر شريط رأس باسم/كود السند،
   * وزر "+ سند جديد" يوجّه إلى صفحة إنشاء هذا السند تحديداً.
   * استخدام نموذجي: لتقرير سند مخصّص (سند دفع، سند قبض، …)
   */
  lockedVoucherCode?: string;
}

export function JournalEntriesPage({ lockedVoucherCode }: JournalEntriesPageProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLocked = !!lockedVoucherCode;
  const lockedCodeUpper = lockedVoucherCode?.toUpperCase() ?? '';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // ‎علامة: هل لمس المستخدم فلتر التاريخ؟ — إن لم يلمسه نعيّنه افتراضياً "من بداية السنة → اليوم"
  const userTouchedDatesRef = useRef(false);
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<number | ''>('');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [confirmDelete, setConfirmDelete] = useState<JournalEntryDto | null>(null);
  const userNs = useAuthStore(s => s.user?.id ?? '__guest__');

  // ‎جلب السنوات المالية لتعيين الفترة الافتراضية
  const fiscalYearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  // ‎الفترة الافتراضية = من بداية السنة المالية الحالية → اليوم
  useEffect(() => {
    if (userTouchedDatesRef.current) return;
    if (fromDate || toDate) return;
    const list = fiscalYearsQuery.data ?? [];
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let fyStart = '';
    let fyEnd = '';
    if (list.length > 0) {
      const active = list.find(fy => {
        const s = (fy.startDate ?? '').slice(0, 10);
        const e = (fy.endDate ?? '').slice(0, 10);
        return s && e && todayIso >= s && todayIso <= e;
      });
      const open = list.find(fy => !(fy as any).isClosed);
      const newest = [...list].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
      const chosen = active ?? open ?? newest;
      if (chosen) {
        fyStart = (chosen.startDate ?? '').slice(0, 10);
        fyEnd = (chosen.endDate ?? '').slice(0, 10);
      }
    }
    // ‎احتياط: لو لم تتوفر سنة مالية، استخدم 1 يناير من السنة التقويمية
    if (!fyStart) {
      fyStart = `${today.getFullYear()}-01-01`;
    }
    const to = fyEnd && todayIso > fyEnd ? fyEnd : todayIso;
    setFromDate(fyStart);
    setToDate(to);
  }, [fiscalYearsQuery.data, fromDate, toDate]);
  const [colOrder, setColOrder] = useState<LineColKey[]>(() => loadLineColOrder(userNs));
  const [colWidths, setColWidths] = useState<Record<LineColKey, number>>(() => loadLineColWidths(userNs));
  // القيود المفتوحة (الافتراضي: مغلقة جميعاً)
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  const toggleEntry = (id: number) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    setOpenIds(new Set(data.items.map(e => e.id)));
  };

  const collapseAll = () => {
    setOpenIds(new Set());
  };

  // إعادة تحميل التفضيلات عند تغيير المستخدم (مثلاً بعد تبديل الحساب)
  useEffect(() => {
    setColOrder(loadLineColOrder(userNs));
    setColWidths(loadLineColWidths(userNs));
  }, [userNs]);

  const isCustomColOrder = JSON.stringify(colOrder) !== JSON.stringify(LINE_COL_DEFAULT);
  const isCustomColWidths = JSON.stringify(colWidths) !== JSON.stringify(LINE_COL_DEFAULT_WIDTH);
  const isCustomLayout = isCustomColOrder || isCustomColWidths;
  const resetLayout = () => {
    setColOrder(LINE_COL_DEFAULT);
    setColWidths({ ...LINE_COL_DEFAULT_WIDTH });
    saveLineColOrder(userNs, LINE_COL_DEFAULT);
    saveLineColWidths(userNs, { ...LINE_COL_DEFAULT_WIDTH });
  };

  // resize handler — مرة واحدة لكل بطاقة قيد عبر document listeners
  const handleResizeStart = useCallback((colKey: LineColKey, startX: number, startWidth: number) => {
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      // RTL: السحب لليسار يزيد العرض، لليمين ينقص (الحافة على اليسار)
      const deltaX = startX - ev.clientX;
      const newWidth = clampLineColWidth(colKey, startWidth + deltaX);
      setColWidths(prev => {
        if (prev[colKey] === newWidth) return prev;
        return { ...prev, [colKey]: newWidth };
      });
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // حفظ بعد الانتهاء
      setColWidths(prev => {
        saveLineColWidths(userNs, prev);
        return prev;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [userNs]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['journal-entries', search, status, fromDate, toDate, voucherTypeFilter, pageNumber, pageSize],
    queryFn: () =>
      accountingApi.getJournalEntries({
        search: search || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        voucherTypeId: voucherTypeFilter === '' ? undefined : Number(voucherTypeFilter),
        pageNumber,
        pageSize,
      }),
    // ‎في وضع الإقفال: لا نشغّل الاستعلام قبل أن يُحلّ كود السند → id
    // ‎(وإلا قد يعرض الكل لثوانٍ قبل تطبيق الفلتر)
    enabled: !isLocked || voucherTypeFilter !== '',
  });

  const voucherTypesQuery = useQuery({
    queryKey: ['journal-voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
    staleTime: 60_000,
  });
  const voucherTypes = voucherTypesQuery.data ?? [];

  // ‎عند الإقفال على نوع سند: حلّ الكود → id وعيّنه كفلتر ثابت
  const lockedVoucherType = useMemo(
    () => (isLocked ? voucherTypes.find(v => v.code.toUpperCase() === lockedCodeUpper) ?? null : null),
    [isLocked, voucherTypes, lockedCodeUpper]
  );
  useEffect(() => {
    if (!isLocked) return;
    if (lockedVoucherType && voucherTypeFilter !== lockedVoucherType.id) {
      setVoucherTypeFilter(lockedVoucherType.id);
    }
  }, [isLocked, lockedVoucherType, voucherTypeFilter]);

  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountingApi.deleteJournalEntry(id),
    onSuccess: res => {
      if (!res.success) {
        toast.error((res as any).message || 'تعذّر حذف القيد');
        return;
      }
      toast.success('تم حذف القيد');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'فشل الحذف');
    },
  });

  const handlePrintList = async () => {
    // طباعة كامل النتائج المطابقة للفلاتر (بحد أقصى 5000)
    try {
      const all = await accountingApi.getJournalEntries({
        search: search || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        voucherTypeId: voucherTypeFilter === '' ? undefined : Number(voucherTypeFilter),
        pageNumber: 1,
        pageSize: 5000,
      });
      printJournalEntriesList(all.items, {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: status || undefined,
        search: search || undefined,
      }, company ?? null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'تعذّر تحميل البيانات للطباعة');
    }
  };

  const handlePrintSingle = async (entry: JournalEntryDto) => {
    try {
      const full = await accountingApi.getJournalEntryById(entry.id);
      printSingleJournalEntry(full, company ?? null);
    } catch {
      printSingleJournalEntry(entry, company ?? null);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setFromDate('');
    setToDate('');
    userTouchedDatesRef.current = false; // ‎اسمح لـ effect بإعادة تطبيق "من بداية السنة"
    if (!isLocked) setVoucherTypeFilter('');
    setPageNumber(1);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / pageSize)) : 1;

  // ‎في وضع الإقفال: لو حُمّلت أنواع السندات ولم يُعثر على الكود → ‎رسالة واضحة
  if (isLocked && !voucherTypesQuery.isLoading && !lockedVoucherType) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="نوع السند غير موجود"
        description={`لا يوجد نوع سند مفعَّل بالكود "${lockedCodeUpper}". تحقّق من إدارة أنواع السندات.`}
      />
    );
  }

  if (isLoading || (isLocked && !lockedVoucherType)) return <LoadingSpinner text="جاري تحميل القيود..." />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={BookOpen}
        title="تعذّر تحميل القيود"
        description="حدث خطأ في الاتصال بالخادم"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* شريط رأس نوع السند (في وضع الإقفال فقط) */}
      {isLocked && lockedVoucherType && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2.5">
              {lockedVoucherType.nature === 'Debit' ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                  <ArrowDownLeft className="h-4 w-4" />
                </span>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold leading-none">{lockedVoucherType.nameAr}</h1>
                  <span className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {lockedVoucherType.code}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      lockedVoucherType.nature === 'Debit'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    )}
                  >
                    طبيعة {lockedVoucherType.nature === 'Debit' ? 'مدين' : 'دائن'}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">سجلّ السندات وتقريرها</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/accounting/journal')}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="عرض كل القيود (الدفتر العام)"
            >
              <BookOpen className="h-3.5 w-3.5" />
              عرض كل القيود
            </Button>
          </CardContent>
        </Card>
      )}

      {/* شريط الفلاتر - سطر واحد */}
      <Card>
        <CardContent className="space-y-2 p-3">
          {/* فترات سريعة */}
          <DateRangePresets
            from={fromDate}
            to={toDate}
            onChange={(f, t) => {
              userTouchedDatesRef.current = true;
              setFromDate(f);
              setToDate(t);
              setPageNumber(1);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="رقم القيد أو البيان..."
              className="h-9 pr-10"
              value={search}
              onChange={e => { setSearch(e.target.value); setPageNumber(1); }}
            />
          </div>

          <select
            className="h-9 rounded-md border border-input bg-secondary/40 px-3 text-sm"
            value={status}
            onChange={e => { setStatus(e.target.value); setPageNumber(1); }}
          >
            <option value="">كل الحالات</option>
            <option value="Posted">مرحَّل</option>
            <option value="Draft">مسودة</option>
            <option value="Reversed">معكوس</option>
          </select>

          {!isLocked && (
            <select
              className="h-9 rounded-md border border-input bg-secondary/40 px-3 text-sm"
              value={voucherTypeFilter}
              onChange={e => {
                const v = e.target.value;
                setVoucherTypeFilter(v === '' ? '' : Number(v));
                setPageNumber(1);
              }}
              title="فلترة حسب نوع السند"
            >
              <option value="">كل الأنواع</option>
              {voucherTypes.map(v => (
                <option key={v.id} value={v.id}>{v.nameAr}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2">
            <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">من</span>
            <Input
              type="date"
              className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
              value={fromDate}
              onChange={e => { userTouchedDatesRef.current = true; setFromDate(e.target.value); setPageNumber(1); }}
            />
            <span className="text-xs text-muted-foreground">إلى</span>
            <Input
              type="date"
              className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
              value={toDate}
              onChange={e => { userTouchedDatesRef.current = true; setToDate(e.target.value); setPageNumber(1); }}
            />
          </div>

          {(search || status || fromDate || toDate || (!isLocked && voucherTypeFilter !== '')) && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1" title="مسح الفلاتر">
              <X className="h-3.5 w-3.5" />
              مسح
            </Button>
          )}

          {isCustomLayout && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetLayout}
              className="h-9 gap-1"
              title="استرجاع التخطيط الافتراضي للأعمدة"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              تخطيط الأعمدة
            </Button>
          )}

          {data && data.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={openIds.size === data.items.length ? collapseAll : expandAll}
              className="h-9 gap-1"
              title={openIds.size === data.items.length ? 'إغلاق كل القيود' : 'فتح كل القيود'}
            >
              {openIds.size === data.items.length ? (
                <>
                  <ChevronsUp className="h-3.5 w-3.5" />
                  إغلاق الكل
                </>
              ) : (
                <>
                  <ChevronsDown className="h-3.5 w-3.5" />
                  فتح الكل
                </>
              )}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintList}
            className="h-9 gap-2"
            disabled={data.items.length === 0}
            title="طباعة التقرير"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </Button>

          <Button
            onClick={() => navigate(
              isLocked && lockedVoucherType
                ? `/accounting/vouchers/${lockedVoucherType.code}/new`
                : '/accounting/journal/new'
            )}
            size="sm"
            className="h-9 gap-2"
          >
            <Plus className="h-4 w-4" />
            {isLocked && lockedVoucherType ? `${lockedVoucherType.nameAr} جديد` : 'قيد جديد'}
          </Button>
          </div>
        </CardContent>
      </Card>

      {data.items.length === 0 ? (
        <EmptyState icon={BookOpen} title="لا قيود" description="لم تُسجَّل قيود مطابقة للمعايير المحددة" />
      ) : (
        <div className="space-y-3">
          {data.items.map(e => (
            <EntryCard
              key={e.id}
              entry={e}
              onEdit={() => navigate(`/accounting/journal/${e.id}/edit`)}
              onDelete={() => setConfirmDelete(e)}
              onPrint={() => handlePrintSingle(e)}
              colOrder={colOrder}
              setColOrder={(o) => { setColOrder(o); saveLineColOrder(userNs, o); }}
              colWidths={colWidths}
              onResizeStart={handleResizeStart}
              userNs={userNs}
              isOpen={openIds.has(e.id)}
              onToggle={() => toggleEntry(e.id)}
            />
          ))}
        </div>
      )}

      {/* شريط الترقيم */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">عرض:</span>
            <select
              className="h-8 rounded-md border border-input bg-secondary/40 px-2 text-xs"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPageNumber(1); }}
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-muted-foreground">قيد لكل صفحة</span>
          </div>

          <div className="text-xs text-muted-foreground">
            إجمالي{' '}
            <span className="font-semibold text-foreground">{data.totalCount.toLocaleString('en-US')}</span>{' '}
            قيد
            {isFetching && <span className="ms-2 text-amber-400">⟳</span>}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(1)}
              disabled={pageNumber === 1}
              className="h-8 px-2"
            >
              «
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber === 1}
              className="h-8 gap-1"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              السابق
            </Button>
            <span className="px-3 text-xs">
              <span className="font-semibold text-foreground">{pageNumber}</span>
              <span className="text-muted-foreground"> / {totalPages}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
              disabled={pageNumber >= totalPages}
              className="h-8 gap-1"
            >
              التالي
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(totalPages)}
              disabled={pageNumber >= totalPages}
              className="h-8 px-2"
            >
              »
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* مودال تأكيد الحذف */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="font-semibold">تأكيد حذف القيد</h3>
              </div>
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p>
                هل أنت متأكد من حذف القيد رقم{' '}
                <span className="font-mono text-primary">{confirmDelete.entryNumber}</span>؟
              </p>
              <div className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
                <div>البيان: {confirmDelete.description}</div>
                <div>المبلغ: {formatAmount(confirmDelete.totalDebit)} {confirmDelete.currency || 'IQD'}</div>
                <div>التاريخ: {formatDate(confirmDelete.entryDate)}</div>
              </div>
              <p className="text-xs text-amber-400">
                لا يمكن التراجع عن هذه العملية.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-3">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteMutation.isPending ? 'جارٍ الحذف...' : 'حذف القيد'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
