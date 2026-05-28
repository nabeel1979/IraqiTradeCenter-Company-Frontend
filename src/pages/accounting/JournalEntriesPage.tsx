import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Plus,
  AlertTriangle,
  X,
  Printer,
  CalendarRange,
  GripVertical,
  RotateCcw,
  Eye,
  FileText,
  History,
  Archive,
  MoreVertical,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { JournalEntryViewDialog } from '@/components/accounting/JournalEntryViewDialog';
import { EntityAuditDialog } from '@/components/audit/EntityAuditDialog';
import { VoucherAttachmentsDialog } from '@/components/accounting/VoucherAttachmentsDialog';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { useActiveFiscalYear, isDateInFiscalYear } from '@/hooks/useActiveFiscalYear';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { useAuthStore } from '@/lib/auth/auth-store';
import { formatAmount, formatDate, cn } from '@/lib/utils';
import { printJournalEntriesList, printSingleJournalEntry } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import { useLocale } from '@/lib/i18n/useLocale';
import { localizedAccountName, localizedVoucherTypeName, localizedEntryDescription } from '@/lib/i18n';
import type { JournalEntryDto } from '@/types/api';

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000] as const;

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variantMap: Record<string, any> = {
    Posted: 'success',
    Draft: 'muted',
    Reversed: 'destructive',
  };
  const variant = variantMap[status] ?? 'muted';
  const label = t(`journalEntries.status.${status}`, { defaultValue: status });
  return <Badge variant={variant}>{label}</Badge>;
}

function TypeBadge({ type }: { type?: string }) {
  const { t } = useTranslation();
  if (!type || type === 'Normal') return null;
  return (
    <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
      {t('journalEntries.entry.opening')}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// نظام ترتيب وعرض أعمدة جدول البنود (drag & drop + resize + persist)
// ════════════════════════════════════════════════════════════
type LineColKey = 'idx' | 'account' | 'desc' | 'debit' | 'credit';

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
  const { t } = useTranslation();
  const { isRtl } = useLocale();
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
      title={t('journalEntries.entry.dragReorderTip')}
    >
      <div className="flex items-center gap-1">
        <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
        {children}
      </div>
      {/* مقبض تغيير العرض - الحافة المعاكسة لاتجاه القراءة (يسار في RTL، يمين في LTR) */}
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(colKey, e.clientX, width);
        }}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        draggable={false}
        className={cn(
          'absolute top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 group-hover:bg-primary/20',
          isRtl ? 'left-0' : 'right-0',
        )}
        title={t('journalEntries.entry.resizeColTip')}
      />
    </th>
  );
}

function renderLineCell(
  col: LineColKey,
  line: import('@/types/api').JournalLineDto,
  idx: number,
  locale: 'ar' | 'en',
  descContext?: Record<string, string>,
) {
  const nameAr = (line.accountNameAr ?? line.accountName ?? '') as string;
  const nameEn = (line.accountNameEn ?? null) as string | null;
  const accountLabel = localizedAccountName(locale, nameAr, nameEn) || (line.accountName ?? `#${line.accountId}`);

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
          <span className="font-medium">{accountLabel}</span>
        </td>
      );
    case 'desc':
      return (
        <td className="border-l border-border/30 px-3 py-2 text-sm text-muted-foreground">
          {localizedEntryDescription(locale, line.description ?? '', descContext) || '—'}
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

function renderTotalCell(
  col: LineColKey,
  totalD: number,
  totalC: number,
  balanced: boolean,
  t: (k: string) => string,
  isRtl: boolean,
) {
  switch (col) {
    case 'idx':
      return <td className="border-l border-t-2 border-border/60 px-3 py-2"></td>;
    case 'account':
      return (
        <td className={cn('border-l border-t-2 border-border/60 px-3 py-2', isRtl ? 'text-right' : 'text-left')}>
          {t('journalEntries.entry.total')}
          {!balanced && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive',
              isRtl ? 'mr-2' : 'ml-2',
            )}>
              <AlertTriangle className="h-3 w-3" />
              {t('journalEntries.entry.unbalanced')}
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

// ════════════════════════════════════════════════════════════════════════
// قائمة الإجراءات المنسدلة لكل بطاقة قيد
// ════════════════════════════════════════════════════════════════════════
interface EntryActionsMenuProps {
  onPrint: () => void;
  onMonitor: () => void;
  onArchive: () => void;
  onView: () => void;
  onViewSource: () => void;
  outsideActiveFY?: boolean;
  isRtl: boolean;
}

function EntryActionsMenu({
  onPrint, onMonitor, onArchive, onView, onViewSource, outsideActiveFY, isRtl,
}: EntryActionsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const computePos = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = 220;
    const margin = 8;
    let left = isRtl ? rect.right - menuW : rect.left;
    left = Math.min(Math.max(left, margin), window.innerWidth - menuW - margin);
    const top = rect.bottom + 4;
    setPos({ top, left });
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

  const action = (fn: () => void) => () => { setOpen(false); fn(); };

  const menuItems = [
    {
      icon: <Eye className="h-4 w-4 text-primary" />,
      label: t('journalEntries.entry.viewTip'),
      hint: t('journalEntries.entry.viewEntryHint', { defaultValue: 'عرض تفاصيل القيد' }),
      onClick: action(onView),
      disabled: false,
      color: 'hover:bg-primary/10 hover:text-primary',
    },
    {
      icon: <FileText className="h-4 w-4 text-violet-400" />,
      label: t('journalEntries.entry.viewSourceTip'),
      hint: outsideActiveFY ? t('journalEntries.entry.outsideFYTip') : undefined,
      onClick: action(onViewSource),
      disabled: !!outsideActiveFY,
      color: outsideActiveFY
        ? 'cursor-not-allowed text-muted-foreground/40'
        : 'hover:bg-violet-500/10 hover:text-violet-300',
    },
    {
      icon: <Printer className="h-4 w-4 text-blue-400" />,
      label: t('journalEntries.entry.printTip'),
      hint: undefined,
      onClick: action(onPrint),
      disabled: false,
      color: 'hover:bg-blue-500/10 hover:text-blue-300',
    },
    {
      icon: <History className="h-4 w-4 text-violet-400" />,
      label: t('audit.openButtonTip'),
      hint: undefined,
      onClick: action(onMonitor),
      disabled: false,
      color: 'hover:bg-violet-500/10 hover:text-violet-300',
    },
    {
      icon: <Archive className="h-4 w-4 text-amber-400" />,
      label: t('attachments.openButtonTip'),
      hint: undefined,
      onClick: action(onArchive),
      disabled: false,
      color: 'hover:bg-amber-500/10 hover:text-amber-300',
    },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          open && 'bg-secondary/80 text-foreground'
        )}
        title={t('journalEntries.entry.actionsMenuTip', { defaultValue: 'الإجراءات' })}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 220, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-border bg-popover/95 shadow-2xl backdrop-blur-sm"
        >
          {menuItems.map((item, i) => (
            <div key={i}>
              {i > 0 && <div className="h-px bg-border/40" />}
              <button
                type="button"
                role="menuitem"
                onClick={item.onClick}
                disabled={item.disabled}
                title={item.hint}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-xs text-foreground transition-colors',
                  isRtl ? 'text-right' : 'text-left',
                  item.color,
                  item.disabled && 'pointer-events-none'
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function EntryCard({
  entry,
  onView,
  onViewSource,
  onPrint,
  onMonitor,
  onArchive,
  colOrder,
  setColOrder,
  colWidths,
  onResizeStart,
  userNs,
  isOpen,
  onToggle,
  outsideActiveFY = false,
  extraDescriptionContext,
}: {
  entry: JournalEntryDto;
  onView: () => void;
  onViewSource: () => void;
  onPrint: () => void;
  /** فتح نافذة سجل المراقبة الخاص بهذا القيد/السند. */
  onMonitor: () => void;
  /** فتح نافذة أرشيف مرفقات هذا السند. */
  onArchive: () => void;
  colOrder: LineColKey[];
  setColOrder: (o: LineColKey[]) => void;
  colWidths: Record<LineColKey, number>;
  onResizeStart: (colKey: LineColKey, startX: number, startWidth: number) => void;
  userNs: string;
  isOpen: boolean;
  onToggle: () => void;
  /** هل تاريخ هذا القيد خارج السنة المالية النشطة؟ يُعطّل زر "أصل القيد" بصرياً. */
  outsideActiveFY?: boolean;
  /** خريطة سياق إضافية (nameAr → nameEn) — تُستخدم لترجمة وصف القيد المُنشأ تلقائياً
   *  كأسماء الصناديق المخصّصة (مثلاً "صندوق نبيل" → "Nabeel Box"). */
  extraDescriptionContext?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  const totalD = entry.lines?.reduce((s, l) => s + (l.isDebit ? l.amount : 0), 0) ?? entry.totalDebit;
  const totalC = entry.lines?.reduce((s, l) => s + (!l.isDebit ? l.amount : 0), 0) ?? entry.totalCredit;
  const balanced = Math.abs(totalD - totalC) < 0.01;
  const lineCount = entry.lines?.length ?? 0;

  const [dropTarget, setDropTarget] = useState<LineColKey | null>(null);

  const headerAlignCls = isRtl ? 'text-right' : 'text-left';
  const headerAlign: Record<LineColKey, string> = {
    idx: headerAlignCls,
    account: headerAlignCls,
    desc: headerAlignCls,
    debit: headerAlignCls,
    credit: headerAlignCls,
  };

  const lineColLabel = (k: LineColKey) => t(`journalEntries.cols.${k}`);
  const voucherDisplayName = localizedVoucherTypeName(
    locale,
    entry.voucherTypeName ?? '',
    entry.voucherTypeNameEn,
  );
  // ‎اجمع خريطة nameAr → nameEn من سطور القيد لاستخدامها كسياق في ترجمة الوصف.
  // ‎هذا يضمن ترجمة أسماء الصناديق/الحسابات المخصّصة (مثل "صندوق نبيل") إن كان
  // ‎الـ NameEn معبَّأ في قاعدة البيانات لها.
  const entryContextMap: Record<string, string> = { ...(extraDescriptionContext ?? {}) };
  for (const ln of entry.lines ?? []) {
    const ar = (ln.accountNameAr ?? ln.accountName ?? '').trim();
    const en = (ln.accountNameEn ?? '').trim();
    if (ar && en) entryContextMap[ar] = en;
  }
  if (entry.voucherTypeName && entry.voucherTypeNameEn) {
    entryContextMap[entry.voucherTypeName] = entry.voucherTypeNameEn;
  }
  const entryDescription =
    localizedEntryDescription(locale, entry.description ?? '', entryContextMap) ||
    entry.description;

  return (
    <Card className="overflow-hidden border-border/60">
      {/* ───────── Header القيد ───────── */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-secondary/30 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/40"
        onClick={onToggle}
        title={isOpen ? t('journalEntries.entry.closeDetailsTip') : t('journalEntries.entry.openDetailsTip')}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          title={isOpen ? t('journalEntries.entry.close') : t('journalEntries.entry.open')}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              !isOpen && '-rotate-90'
            )}
          />
        </button>
        {/* رقم السند المخصّص ("PV-1") إن وُجد، وإلا رقم القيد العام */}
        {entry.voucherNumber ? (
          <div className="flex items-baseline gap-1.5">
            <span className="num-display rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-sm font-bold text-primary">
              {entry.voucherNumber}
            </span>
            <span
              className="num-display text-[11px] text-muted-foreground"
              title={t('journalEntries.entry.internalNumberTip', { number: entry.entryNumber })}
            >
              #{entry.entryNumber}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('journalEntries.entry.entryNumberLabel')}</span>
            <span className="num-display text-base font-bold text-primary">{entry.entryNumber}</span>
          </div>
        )}
        <span className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          {formatDate(entry.entryDate)}
        </div>
        {/*
          الرقم اليدوي (إن وُجد): شارة صغيرة تُسهّل تمييز السندات المرتبطة
          بشيكات / إيصالات خارجية. مرئيّ بجانب التاريخ ويظهر في tooltip بقيمته
          كاملةً.
        */}
        {entry.manualNumber && (
          <>
            <span className="h-4 w-px bg-border" />
            <span
              className="num-display inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
              title={t('journalEntries.entry.manualNumberTip', { number: entry.manualNumber, defaultValue: 'Manual no.: {{number}}' })}
              dir="ltr"
            >
              <span className="opacity-70">#</span>
              {entry.manualNumber}
            </span>
          </>
        )}
        <span className="h-4 w-px bg-border" />
        <div className="flex flex-1 items-center gap-2 min-w-[160px]">
          <span className="font-semibold truncate" title={entryDescription ?? undefined}>
            {entryDescription}
          </span>
          <TypeBadge type={entry.entryType} />
          {entry.voucherTypeId && (voucherDisplayName || entry.voucherTypeCode) && !entry.voucherNumber && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              title={voucherDisplayName || undefined}
            >
              {entry.voucherTypeCode && (
                <span className="num-display text-[9px] opacity-80">{entry.voucherTypeCode}</span>
              )}
              <span>{voucherDisplayName || entry.voucherTypeCode}</span>
            </span>
          )}
          {entry.voucherTypeId && voucherDisplayName && entry.voucherNumber && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-primary/80"
              title={voucherDisplayName}
            >
              {voucherDisplayName}
            </span>
          )}
        </div>
        {/* الإجماليات في الـ header (تظهر دائماً) */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-baseline gap-1">
            <span className="text-muted-foreground">{t('journalEntries.entry.debit')}</span>
            <span className="num-display font-semibold text-emerald-400">{formatAmount(totalD)}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-muted-foreground">{t('journalEntries.entry.credit')}</span>
            <span className="num-display font-semibold text-amber-400">{formatAmount(totalC)}</span>
          </div>
          {!balanced && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {t('journalEntries.entry.unbalanced')}
            </span>
          )}
          <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {lineCount} {lineCount === 1 ? t('journalEntries.entry.lineSingle') : t('journalEntries.entry.linePlural')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="num-display rounded bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            {entry.currency || 'IQD'}
          </span>
          <StatusBadge status={entry.status} />
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <EntryActionsMenu
            onPrint={onPrint}
            onMonitor={onMonitor}
            onArchive={onArchive}
            onView={onView}
            onViewSource={onViewSource}
            outsideActiveFY={outsideActiveFY}
            isRtl={isRtl}
          />
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
                    {lineColLabel(col)}
                  </LineColHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.lines?.map((line, idx) => (
                <tr key={line.id} className="border-b border-border/30 hover:bg-secondary/20">
                  {colOrder.map(col => (
                    <Fragment key={col}>
                      {renderLineCell(col, line, idx, locale, entryContextMap)}
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/30 font-semibold">
                {colOrder.map(col => (
                  <Fragment key={col}>
                    {renderTotalCell(col, totalD, totalC, balanced, t, isRtl)}
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
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
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
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);
  // ‎كيان مفتوح في نافذة "مراقبة": نُخزّن نوع الكيان (Voucher / JournalEntry)
  // ‎و المعرّف لجلب سجله من /audit/entity.
  const [monitorTarget, setMonitorTarget] = useState<{ entityType: string; entityId: number; subtitle?: string } | null>(null);
  // ‎الكيان المفتوح عليه أرشيف المرفقات (null = لا شيء مفتوح).
  const [archiveTarget, setArchiveTarget] = useState<{ entityId: number; subtitle?: string } | null>(null);
  const userNs = useAuthStore(s => s.user?.id ?? '__guest__');

  // ‎جلب السنوات المالية لتعيين الفترة الافتراضية
  const fiscalYearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  // ‎جلب الصناديق كي نقدر نترجم وصف القيد المُنشأ تلقائياً (سند قبض — صندوق X).
  // ‎نستعملها كخريطة سياق إضافية في `localizedEntryDescription`.
  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'all-for-translation'],
    queryFn: () => cashBoxesApi.getAll(false),
    staleTime: 5 * 60 * 1000,
  });
  const cashBoxNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cb of cashBoxesQuery.data ?? []) {
      const ar = (cb.nameAr ?? '').trim();
      const en = (cb.nameEn ?? '').trim();
      if (ar && en) map[ar] = en;
    }
    return map;
  }, [cashBoxesQuery.data]);

  // ‎السنة المالية النشطة — لمنع فتح/تعديل قيود من خارج نطاقها
  const { activeFiscalYear } = useActiveFiscalYear();

  // ‎الفترة الافتراضية = من بداية السنة المالية الحالية → اليوم
  useEffect(() => {
    if (userTouchedDatesRef.current) return;
    if (fromDate || toDate) return;
    const list = fiscalYearsQuery.data ?? [];
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let fyStart = '';
    if (list.length > 0) {
      // ‎الأولوية: السنة النشطة → المفتوحة التي تحتوي اليوم → أحدث مفتوحة → المغلقة التي تحتوي اليوم → الأحدث
      const explicit = list.find(fy => (fy as any).isActive);
      const openContainsToday = list.find(fy => {
        const s = (fy.startDate ?? '').slice(0, 10);
        const e = (fy.endDate ?? '').slice(0, 10);
        return s && e && todayIso >= s && todayIso <= e && !(fy as any).isClosed;
      });
      const newestOpen = [...list]
        .filter(fy => !(fy as any).isClosed)
        .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
      const closedContainsToday = list.find(fy => {
        const s = (fy.startDate ?? '').slice(0, 10);
        const e = (fy.endDate ?? '').slice(0, 10);
        return s && e && todayIso >= s && todayIso <= e;
      });
      const newest = [...list].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
      const chosen = explicit ?? openContainsToday ?? newestOpen ?? closedContainsToday ?? newest;
      if (chosen) {
        fyStart = (chosen.startDate ?? '').slice(0, 10);
      }
    }
    // ‎احتياط: لو لم تتوفر سنة مالية، استخدم 1 يناير من السنة التقويمية
    if (!fyStart) {
      fyStart = `${today.getFullYear()}-01-01`;
    }
    // ‎النهاية = اليوم دائماً (طلب المستخدم: "ولحد اليوم")
    setFromDate(fyStart);
    setToDate(todayIso);
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
    queryKey: ['journal-entries', search, status, fromDate, toDate, voucherTypeFilter, pageNumber, pageSize, isLocked],
    queryFn: () =>
      accountingApi.getJournalEntries({
        search: search || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        voucherTypeId: voucherTypeFilter === '' ? undefined : Number(voucherTypeFilter),
        // ‎نافذة "القيود اليومية" تعرض جميع القيود (يدوية + متولّدة من أي
        // نوع سند، بما فيها التي لها صفحات مخصّصة في القائمة الجانبية).
        // ‎للتنقّل إلى نافذة المصدر استخدم زر "أصل القيد" (FileText) داخل البطاقة.
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
  // ‎قائمة الفلتر تعرض كل الأنواع المفعّلة (الصفحة موحَّدة لكل القيود).

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
      // ‎سجّل عملية طباعة قائمة القيود — لا entityId محدد فنستعمل "*"
      void auditApi.logPrint({
        entityType: 'JournalEntriesList',
        entityId: '*',
        summary: `طباعة قائمة القيود (${all.items.length})`,
        details: {
          search: search || null,
          status: status || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          voucherTypeId: voucherTypeFilter || null,
          count: all.items.length,
        },
      });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t('journalEntries.loadPrintFailed'));
    }
  };

  const handlePrintSingle = async (entry: JournalEntryDto) => {
    try {
      const full = await accountingApi.getJournalEntryById(entry.id);
      printSingleJournalEntry(full, company ?? null);
    } catch {
      printSingleJournalEntry(entry, company ?? null);
    }
    // ‎سجل طباعة هذا القيد/السند بشكل مفصول — entityType يتبع نوع الكيان
    void auditApi.logPrint({
      entityType: entry.voucherTypeId ? 'Voucher' : 'JournalEntry',
      entityId: entry.id,
      summary: entry.voucherNumber
        ? `طباعة سند ${entry.voucherNumber} — ${entry.description}`
        : `طباعة قيد ${entry.entryNumber} — ${entry.description}`,
      details: {
        entryNumber: entry.entryNumber,
        voucherNumber: entry.voucherNumber,
        manualNumber: entry.manualNumber,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
      },
    });
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
        title={t('journalEntries.voucherTypeNotFound')}
        description={t('journalEntries.voucherTypeNotFoundDesc', { code: lockedCodeUpper })}
      />
    );
  }

  if (isLoading || (isLocked && !lockedVoucherType)) return <LoadingSpinner text={t('journalEntries.loadingEntries')} />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={BookOpen}
        title={t('journalEntries.loadFailed')}
        description={t('journalEntries.connectionError')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ‎ملاحظة: في وضع الإقفال على نوع سند، يعرض الـ TopBar بطاقة نوع السند
          ‎(الاسم + الكود + الطبيعة) تلقائياً من المسار، فلم نعد نحتاج بطاقة رأس
          ‎هنا — مما يُصعِّد المحتوى للأعلى. زر "عرض كل القيود" نُقل إلى شريط الفلاتر. */}

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
            <Search className={cn('absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground', isRtl ? 'right-3' : 'left-3')} />
            <Input
              placeholder={t('journalEntries.filters.searchPlaceholder')}
              className={cn('h-9', isRtl ? 'pr-10' : 'pl-10')}
              value={search}
              onChange={e => { setSearch(e.target.value); setPageNumber(1); }}
            />
          </div>

          <select
            className="h-9 rounded-md border border-input bg-secondary/40 px-3 text-sm"
            value={status}
            onChange={e => { setStatus(e.target.value); setPageNumber(1); }}
          >
            <option value="">{t('journalEntries.filters.allStatuses')}</option>
            <option value="Posted">{t('journalEntries.status.Posted')}</option>
            <option value="Draft">{t('journalEntries.status.Draft')}</option>
            <option value="Reversed">{t('journalEntries.status.Reversed')}</option>
          </select>

          {!isLocked && voucherTypes.length > 0 && (
            <select
              className="h-9 rounded-md border border-input bg-secondary/40 px-3 text-sm"
              value={voucherTypeFilter}
              onChange={e => {
                const v = e.target.value;
                setVoucherTypeFilter(v === '' ? '' : Number(v));
                setPageNumber(1);
              }}
              title={t('journalEntries.filters.filterByVoucherType')}
            >
              <option value="">{t('journalEntries.filters.allTypes')}</option>
              {voucherTypes.map(v => (
                <option key={v.id} value={v.id}>
                  {localizedVoucherTypeName(locale, v.nameAr, v.nameEn)}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2">
            <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('journalEntries.filters.from')}</span>
            <Input
              type="date"
              className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
              value={fromDate}
              onChange={e => { userTouchedDatesRef.current = true; setFromDate(e.target.value); setPageNumber(1); }}
            />
            <span className="text-xs text-muted-foreground">{t('journalEntries.filters.to')}</span>
            <Input
              type="date"
              className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
              value={toDate}
              onChange={e => { userTouchedDatesRef.current = true; setToDate(e.target.value); setPageNumber(1); }}
            />
          </div>

          {(search || status || fromDate || toDate || (!isLocked && voucherTypeFilter !== '')) && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1" title={t('journalEntries.filters.clearFilters')}>
              <X className="h-3.5 w-3.5" />
              {t('journalEntries.filters.clear')}
            </Button>
          )}

          {isCustomLayout && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetLayout}
              className="h-9 gap-1"
              title={t('journalEntries.filters.resetLayoutTip')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('journalEntries.filters.resetLayout')}
            </Button>
          )}

          {data && data.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={openIds.size === data.items.length ? collapseAll : expandAll}
              className="h-9 gap-1"
              title={openIds.size === data.items.length ? t('journalEntries.filters.collapseAllTip') : t('journalEntries.filters.expandAllTip')}
            >
              {openIds.size === data.items.length ? (
                <>
                  <ChevronsUp className="h-3.5 w-3.5" />
                  {t('journalEntries.filters.collapseAll')}
                </>
              ) : (
                <>
                  <ChevronsDown className="h-3.5 w-3.5" />
                  {t('journalEntries.filters.expandAll')}
                </>
              )}
            </Button>
          )}

          {isLocked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/accounting/journal')}
              className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
              title={t('journalEntries.filters.viewAllEntriesTip')}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t('journalEntries.filters.viewAllEntries')}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintList}
            className="h-9 gap-2"
            disabled={data.items.length === 0}
            title={t('journalEntries.filters.printTip')}
          >
            <Printer className="h-4 w-4" />
            {t('journalEntries.filters.print')}
          </Button>

          {/*
            * زر "قيد جديد":
            *  - في وضع الإقفال على نوع سند → يُنشئ سنداً من هذا النوع.
            *  - في الصفحة الرئيسية "القيود اليومية" → مخفي عمداً؛
            *    الإنشاء يتم من صفحة السند المخصّصة (سند قبض، سند دفع، …).
            */}
          {isLocked && lockedVoucherType && (
            <Button
              onClick={() => navigate(
                lockedVoucherType.nature === 'Mixed'
                  // ‎مختلط: استخدم صفحة القيد متعدد البنود مع تثبيت النوع
                  ? `/accounting/journal/new?voucherType=${encodeURIComponent(lockedVoucherType.code)}`
                  // ‎مدين/دائن: استخدم صفحة السند المبسّطة
                  : `/accounting/vouchers/${lockedVoucherType.code}/new`
              )}
              size="sm"
              className="h-9 gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('journalEntries.filters.newVoucher', { name: localizedVoucherTypeName(locale, lockedVoucherType.nameAr, lockedVoucherType.nameEn) })}
            </Button>
          )}
          </div>
        </CardContent>
      </Card>

      {data.items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t('journalEntries.noEntries')}
          description={t('journalEntries.noEntriesDesc')}
        />
      ) : (
        <div className="space-y-3">
          {data.items.map(e => (
            <EntryCard
              key={e.id}
              entry={e}
              onView={() => setViewEntryId(e.id)}
              onViewSource={() => {
                // ‎"أصل القيد" — يتنقّل إلى النافذة التي وُلّد منها القيد:
                //  - سند مخصّص (مدين/دائن) → نموذج السند المبسّط (وضع التعديل)
                //  - سند مخصّص (مختلط) → صفحة القيد متعدد البنود (وضع التعديل)
                //  - فاتورة → صفحة الفاتورة
                //  - يدوي → صفحة القيد المحاسبي (وضع العرض)
                //
                // ‎حارس السنة المالية النشطة:
                //   إذا كان تاريخ القيد خارج نطاق السنة المالية المُفَعَّلة،
                //   نمنع الفتح ونعرض إشعاراً يوضّح السبب. هذا يُكمِّل حارس
                //   "الفترة المغلقة" بحيث لا يصل المستخدم إطلاقاً إلى نموذج
                //   تعديل قيد لا يخصّ السنة الحالية.
                if (activeFiscalYear && !isDateInFiscalYear(e.entryDate, activeFiscalYear)) {
                  toast.error(t('journalEntries.openSourceFailed'), {
                    description: t('journalEntries.outsideFYReason', {
                      date: formatDate(e.entryDate),
                      fy: activeFiscalYear.name,
                    }),
                    duration: 6000,
                  });
                  return;
                }
                // ‎قيد مناقلة بين صناديق: لا يُفتح للتعديل من هنا — يوجَّه
                // ‎للمناقلات حصراً (تعديل/إلغاء/تراجع عن استلام).
                if (e.referenceType === 'CashBoxTransfer' || e.referenceType === 'CashBoxTransferReversal') {
                  navigate('/accounting/cash-boxes?tab=transfers');
                  return;
                }
                // ‎نمرّر returnTo/returnLabel ليرجع المستخدم إلى صفحة السند بعد الحفظ/الإلغاء
                const returnState = isLocked && lockedVoucherType
                  ? {
                      returnTo: `/accounting/vouchers/${lockedVoucherType.code}`,
                      returnLabel: localizedVoucherTypeName(locale, lockedVoucherType.nameAr, lockedVoucherType.nameEn),
                    }
                  : undefined;
                if (e.voucherTypeId && e.voucherTypeCode) {
                  const vt = voucherTypes.find(v => v.id === e.voucherTypeId);
                  if (vt && vt.nature === 'Mixed') {
                    navigate(`/accounting/journal/${e.id}/edit`, { state: returnState });
                  } else {
                    navigate(`/accounting/vouchers/${e.voucherTypeCode}/${e.id}/edit`, { state: returnState });
                  }
                  return;
                }
                if (e.source === 'SalesInvoice' && e.referenceId) {
                  navigate(`/sales/invoices/${e.referenceId}`);
                  return;
                }
                if (e.source === 'PurchaseInvoice' && e.referenceId) {
                  navigate(`/purchases/invoices/${e.referenceId}`);
                  return;
                }
                navigate(`/accounting/journal/${e.id}/view`, { state: returnState });
              }}
              onPrint={() => handlePrintSingle(e)}
              onMonitor={() =>
                setMonitorTarget({
                  entityType: e.voucherTypeId ? 'Voucher' : 'JournalEntry',
                  entityId: e.id,
                  subtitle: e.voucherNumber
                    ? `${e.voucherNumber} · #${e.entryNumber}`
                    : `#${e.entryNumber}`,
                })
              }
              onArchive={() =>
                setArchiveTarget({
                  entityId: e.id,
                  subtitle: e.voucherNumber
                    ? `${e.voucherNumber} · #${e.entryNumber}`
                    : `#${e.entryNumber}`,
                })
              }
              colOrder={colOrder}
              setColOrder={(o) => { setColOrder(o); saveLineColOrder(userNs, o); }}
              colWidths={colWidths}
              onResizeStart={handleResizeStart}
              userNs={userNs}
              isOpen={openIds.has(e.id)}
              onToggle={() => toggleEntry(e.id)}
              outsideActiveFY={
                !!activeFiscalYear && !isDateInFiscalYear(e.entryDate, activeFiscalYear)
              }
              extraDescriptionContext={cashBoxNameMap}
            />
          ))}
        </div>
      )}

      {/* شريط الترقيم */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('journalEntries.pagination.show')}</span>
            <select
              className="h-8 rounded-md border border-input bg-secondary/40 px-2 text-xs"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPageNumber(1); }}
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-muted-foreground">{t('journalEntries.pagination.perPage')}</span>
          </div>

          <div className="text-xs text-muted-foreground">
            {t('journalEntries.pagination.totalLabel')}{' '}
            <span className="font-semibold text-foreground">{data.totalCount.toLocaleString('en-US')}</span>{' '}
            {t('journalEntries.pagination.totalSuffix')}
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
              {isRtl ? '»' : '«'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber === 1}
              className="h-8 gap-1"
            >
              {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              {t('journalEntries.pagination.previous')}
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
              {t('journalEntries.pagination.next')}
              {isRtl ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(totalPages)}
              disabled={pageNumber >= totalPages}
              className="h-8 px-2"
            >
              {isRtl ? '«' : '»'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* مودال عرض القيد السريع */}
      <JournalEntryViewDialog
        entryId={viewEntryId}
        onClose={() => setViewEntryId(null)}
        allowEdit={false}
      />

      {/* مودال "مراقبة" — سجل العمليات على السند/القيد الحالي */}
      {monitorTarget && (
        <EntityAuditDialog
          open={!!monitorTarget}
          onClose={() => setMonitorTarget(null)}
          entityType={monitorTarget.entityType}
          entityId={monitorTarget.entityId}
          subtitle={monitorTarget.subtitle}
        />
      )}

      {/* مودال "الأرشيف" — مرفقات السند/القيد الحالي */}
      {archiveTarget && (
        <VoucherAttachmentsDialog
          open={!!archiveTarget}
          onClose={() => setArchiveTarget(null)}
          entryId={archiveTarget.entityId}
          subtitle={archiveTarget.subtitle}
        />
      )}
    </div>
  );
}
