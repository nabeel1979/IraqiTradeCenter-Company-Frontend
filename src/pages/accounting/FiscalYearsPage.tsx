import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  Lock,
  LockOpen,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Repeat,
  Eye,
  Calendar,
  X,
  ExternalLink,
  Pencil,
  Trash2,
  Unlock,
  RefreshCw,
  Undo2,
  TrendingUp,
  TrendingDown,
  Star,
  Coins,
  Layers,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { accountingApi } from '@/lib/api/accounting';
import { journalVoucherTypesApi } from '@/lib/api/journalVoucherTypes';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { formatDate, formatIQD, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  FiscalYearDto,
  AccountingPeriodStatus,
  FiscalYearValidationDto,
  AccountDto,
  RolloverUndoTargetDto,
} from '@/types/api';
import { useLocale, localizedName, localizedEntryDescription } from '@/lib/i18n';

/**
 * يترجم رسائل التحقق المُرجَعة من الخادم (إنّها بالعربية حالياً) إلى الإنجليزية
 * بالاعتماد على مطابقة الأنماط — حتى لا نضطر لتعديل عقود الـ API.
 *
 * المطابقة:
 *   - "السنة المالية غير موجودة"                  → Fiscal year not found
 *   - "السنة المالية مغلقة بالفعل"                 → Fiscal year is already closed
 *   - "يوجد N قيد غير مرحَّل (مسودة)"              → There are N unposted (draft) entries
 *   - "القيود المرحَّلة غير متوازنة (فرق: X.XX)"   → Posted entries are not balanced (difference: X.XX)
 *
 * إذا لم يتطابق أي نمط، يُعاد النص كما هو.
 */
function translateValidationIssue(
  locale: 'ar' | 'en',
  raw: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (locale !== 'en') return raw;
  const s = (raw ?? '').trim();
  if (!s) return raw;

  if (s.includes('السنة المالية غير موجودة')) return t('fiscalYears.issues.notFound');
  if (s.includes('السنة المالية مغلقة بالفعل')) return t('fiscalYears.issues.alreadyClosed');

  // ‎"يوجد N قيد غير مرحَّل (مسودة)" — استخراج العدد
  const draftMatch = /^\s*يوجد\s+(\d+)\s+قيد\s+غير\s+مرحَّل/.exec(s)
    ?? /^\s*يوجد\s+(\d+)\s+قيد\s+غير\s+مرحل/.exec(s);
  if (draftMatch) {
    const count = Number(draftMatch[1]) || 0;
    return t('fiscalYears.issues.unpostedDrafts', { count });
  }

  // ‎"القيود المرحَّلة غير متوازنة (فرق: 1,234.56)"
  const unbalancedMatch = /غير\s+متوازنة[^()]*\(\s*فرق[^:]*:\s*([\d.,\-]+)\s*\)/.exec(s);
  if (unbalancedMatch) {
    return t('fiscalYears.issues.unbalanced', { diff: unbalancedMatch[1] });
  }

  return raw;
}

/** يحول شجرة الحسابات إلى قائمة مسطحة بالحسابات التفصيلية فقط */
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

// Labels resolved via t() at render time — see usePeriodStatusLabel below

const PERIOD_STATUS_CLASS: Record<AccountingPeriodStatus, string> = {
  1: 'bg-success/10 text-success',
  2: 'bg-warning/10 text-warning',
  3: 'bg-destructive/10 text-destructive',
};

export function FiscalYearsPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showRollover, setShowRollover] = useState(false);
  /** لقطة عند فتح التدوير — تمنع اختفاء النافذة أثناء الطلب أو إعادة جلب السنوات. */
  const [rolloverSnap, setRolloverSnap] = useState<{
    source: FiscalYearDto;
    years: FiscalYearDto[];
    openingEntriesCount?: number;
  } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [deletingPeriodId, setDeletingPeriodId] = useState<number | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showResync, setShowResync] = useState(false);
  /** سنة الهدف المختارة عند إلغاء التدوير */
  const [undoTargetId, setUndoTargetId] = useState<number | null>(null);

  const { data: years, isLoading } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: () => fiscalYearsApi.getAll(),
  });

  /**
   * عند تحميل السنوات لأول مرة، اختر السنة المالية الافتراضية بترتيب الأولوية:
   *   1. السنة المُعَلَّمة كنشطة (isActive).
   *   2. السنة المفتوحة التي تحتوي تاريخ اليوم.
   *   3. أحدث سنة مالية مفتوحة.
   *   4. السنة المغلقة التي تحتوي تاريخ اليوم.
   *   5. الأحدث مطلقاً.
   */
  useEffect(() => {
    if (selectedId !== null) return;
    if (!years || years.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);

    const explicit = years.find(fy => fy.isActive);
    if (explicit) {
      setSelectedId(explicit.id);
      return;
    }

    const openContainsToday = years.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e && !fy.isClosed;
    });
    if (openContainsToday) {
      setSelectedId(openContainsToday.id);
      return;
    }

    const newestOpen = [...years]
      .filter(fy => !fy.isClosed)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
    if (newestOpen) {
      setSelectedId(newestOpen.id);
      return;
    }

    const closedContainsToday = years.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e;
    });
    if (closedContainsToday) {
      setSelectedId(closedContainsToday.id);
      return;
    }

    const newest = [...years].sort(
      (a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '')
    )[0];
    if (newest) setSelectedId(newest.id);
  }, [years, selectedId]);

  const selected = years?.find(y => y.id === selectedId) ?? null;

  const { data: status } = useQuery({
    queryKey: ['fiscal-year-status', selected?.id],
    queryFn: () => fiscalYearsApi.getStatus(selected!.id),
    enabled: !!selected,
  });

  const { data: validation, refetch: refetchValidation, isFetching: validating } = useQuery({
    queryKey: ['fiscal-year-validate', selected?.id],
    queryFn: () => fiscalYearsApi.validate(selected!.id),
    enabled: !!selected,
  });

  // ‎تفعيل السنة المالية كنشطة (المصدر الأساسي للتقارير)
  const activateM = useMutation({
    mutationFn: (id: number) => fiscalYearsApi.activate(id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.card.activeBadge'));
        qc.invalidateQueries({ queryKey: ['fiscal-years'] });
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('common.saveFailed', { defaultValue: 'Failed' }));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('common.saveFailed', { defaultValue: 'Failed' })),
  });

  const cancelRolloverM = useMutation({
    mutationFn: (targetFiscalYearId: number) =>
      fiscalYearsApi.undoRollover({ targetFiscalYearId, reopenSource: true }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message ?? t('fiscalYears.detail.cancelRolloverSuccess'));
        qc.invalidateQueries({ queryKey: ['fiscal-years'] });
        if (selectedId != null) {
          qc.invalidateQueries({ queryKey: ['fiscal-year-status', selectedId] });
        }
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.detail.cancelRolloverFailed'));
      }
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message ?? t('fiscalYears.detail.cancelRolloverFailed')),
  });

  const rolloverUndoTargets: RolloverUndoTargetDto[] = status?.rolloverUndoTargets ?? [];
  const rolloverTargetId = status?.rolloverTargetFiscalYearId ?? null;
  const canCancelRollover = rolloverUndoTargets.length > 0;
  const nextTargetAlreadyRolled = rolloverUndoTargets.some(
    t => t.targetFiscalYearId === rolloverTargetId,
  );
  const canRollover =
    !!selected?.isClosed && !!rolloverTargetId && !nextTargetAlreadyRolled;

  const undoTargetsKey = rolloverUndoTargets.map(t => t.targetFiscalYearId).join(',');

  useEffect(() => {
    if (rolloverUndoTargets.length === 0) {
      setUndoTargetId(null);
      return;
    }
    setUndoTargetId(prev => {
      if (prev != null && rolloverUndoTargets.some(t => t.targetFiscalYearId === prev)) {
        return prev;
      }
      return rolloverUndoTargets[0]!.targetFiscalYearId;
    });
  }, [selectedId, undoTargetsKey, rolloverUndoTargets]);

  const selectedUndoTarget = rolloverUndoTargets.find(t => t.targetFiscalYearId === undoTargetId)
    ?? rolloverUndoTargets[0]
    ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('fiscalYears.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('fiscalYears.subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('fiscalYears.newFY')}
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner text={t('fiscalYears.loading')} />
      ) : (years?.length ?? 0) === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={t('fiscalYears.empty.title')}
          description={t('fiscalYears.empty.description')}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('fiscalYears.createModal.title')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
          {/* قائمة السنوات */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('fiscalYears.card.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 p-2">
              {years!.map(y => (
                <button
                  key={y.id}
                  onClick={() => setSelectedId(y.id)}
                  className={cn(
                    'relative w-full rounded-md border px-3 py-2.5 text-right transition-colors',
                    y.isActive && 'ring-1 ring-primary/40',
                    selected?.id === y.id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/50 hover:bg-accent/40'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      {y.isActive && (
                        <Star
                          className="h-3.5 w-3.5 shrink-0 fill-primary text-primary"
                          aria-label={t('fiscalYears.card.activeBadge')}
                        />
                      )}
                      {localizedName(locale, y.name, y.nameEn)}
                    </span>
                    {y.isClosed ? (
                      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
                        <Lock className="h-3 w-3" />
                        {t('periodStatus.locked', { defaultValue: 'Locked' })}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('periodStatus.open', { defaultValue: 'Open' })}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {formatDate(y.startDate, { short: true })} → {formatDate(y.endDate, { short: true })}
                    </span>
                    {y.isActive && (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                        {t('fiscalYears.card.activeBadge')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* تفاصيل السنة المختارة */}
          {selected && (
            <div className="space-y-4">
              {/* بطاقات الحالة */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBox label={t('fiscalYears.card.stats.openPeriods')} value={status?.openPeriods ?? 0} tone="success" />
                <StatBox label={t('fiscalYears.card.stats.closedPeriods')} value={status?.closedPeriods ?? 0} tone="warning" />
                <StatBox label={t('fiscalYears.card.stats.lockedPeriods')} value={status?.lockedPeriods ?? 0} tone="destructive" />
                <StatBox label={t('fiscalYears.card.stats.draftEntries')} value={status?.draftEntries ?? 0} tone="muted" />
              </div>

              {/* ملخص + أزرار العمليات */}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">{localizedName(locale, selected.name, selected.nameEn)}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => refetchValidation()}>
                        <Eye className="h-4 w-4" />
                        {t('fiscalYears.detail.check')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isActive || activateM.isPending}
                        onClick={() => activateM.mutate(selected.id)}
                        className={cn(
                          selected.isActive
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-primary/40 text-primary hover:bg-primary/10'
                        )}
                        title={
                          selected.isActive
                            ? t('fiscalYears.detail.alreadyActive')
                            : selected.isClosed
                              ? t('fiscalYears.detail.activateClosedTip')
                              : t('fiscalYears.detail.activateTip')
                        }
                      >
                        <Star
                          className={cn('h-4 w-4', selected.isActive && 'fill-current')}
                        />
                        {selected.isActive ? t('fiscalYears.card.activeBadge') : t('fiscalYears.detail.activate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed}
                        onClick={() => setShowEdit(true)}
                        title={selected.isClosed ? t('fiscalYears.detail.cannotEditClosed') : t('fiscalYears.detail.editTip')}
                      >
                        <Pencil className="h-4 w-4" />
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed}
                        onClick={() => setShowResync(true)}
                        title={selected.isClosed
                          ? t('fiscalYears.detail.cannotResyncClosed')
                          : t('fiscalYears.detail.resyncTip')}
                      >
                        <RefreshCw className="h-4 w-4" />
                        {t('fiscalYears.detail.resync')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed}
                        onClick={() => setShowDelete(true)}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        title={selected.isClosed ? t('fiscalYears.detail.cannotDeleteClosed') : t('fiscalYears.detail.deleteTip')}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('common.delete')}
                      </Button>
                      {selected.isClosed ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowReopen(true)}
                          className="border-warning/40 text-warning hover:bg-warning/10"
                          title={t('fiscalYears.detail.reopenTip')}
                        >
                          <LockOpen className="h-4 w-4" />
                          {t('fiscalYears.detail.reopen')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setShowClose(true)}
                        >
                          <Lock className="h-4 w-4" />
                          {t('fiscalYears.detail.close')}
                        </Button>
                      )}
                      {canCancelRollover && selectedUndoTarget ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rolloverUndoTargets.length > 1 ? (
                            <select
                              className="h-8 max-w-[11rem] rounded-md border border-border/60 bg-background px-2 text-xs"
                              value={undoTargetId ?? ''}
                              onChange={e => setUndoTargetId(Number(e.target.value))}
                              title={t('fiscalYears.detail.cancelRolloverSelectTarget')}
                              aria-label={t('fiscalYears.detail.cancelRolloverSelectTarget')}
                            >
                              {rolloverUndoTargets.map(t => (
                                <option key={t.targetFiscalYearId} value={t.targetFiscalYearId}>
                                  {localizedName(locale, t.targetFiscalYearName, t.targetFiscalYearNameEn)}
                                  {t.openingEntriesCount > 0 ? ` (${t.openingEntriesCount})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {t('fiscalYears.detail.cancelRolloverTo', {
                                target: localizedName(
                                  locale,
                                  selectedUndoTarget.targetFiscalYearName,
                                  selectedUndoTarget.targetFiscalYearNameEn,
                                ),
                              })}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-warning/40 text-warning hover:bg-warning/10"
                            disabled={cancelRolloverM.isPending || undoTargetId == null}
                            onClick={() => {
                              if (!selected || undoTargetId == null) return;
                              const targetLabel = localizedName(
                                locale,
                                selectedUndoTarget.targetFiscalYearName,
                                selectedUndoTarget.targetFiscalYearNameEn,
                              );
                              const sourceLabel = localizedName(
                                locale,
                                selectedUndoTarget.sourceFiscalYearName
                                  ?? selected.name,
                                selectedUndoTarget.sourceFiscalYearNameEn ?? selected.nameEn,
                              );
                              if (!confirm(t('fiscalYears.detail.cancelRolloverConfirm', {
                                count: selectedUndoTarget.openingEntriesCount,
                                target: targetLabel,
                                source: sourceLabel,
                              }))) return;
                              cancelRolloverM.mutate(undoTargetId);
                            }}
                            title={t('fiscalYears.detail.cancelRolloverTip')}
                          >
                            <Undo2 className="h-4 w-4" />
                            {cancelRolloverM.isPending
                              ? t('fiscalYears.rolloverModal.undoing')
                              : t('fiscalYears.detail.cancelRollover')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!selected || !years) return;
                            setRolloverSnap({
                              source: selected,
                              years,
                              openingEntriesCount: status?.rolloverOpeningEntriesCount ?? 0,
                            });
                            setShowRollover(true);
                          }}
                          disabled={!canRollover}
                          title={
                            !selected.isClosed
                              ? t('fiscalYears.detail.rolloverRequiresClosed')
                              : nextTargetAlreadyRolled
                                ? t('fiscalYears.detail.rolloverAlreadyDone')
                                : !rolloverTargetId
                                  ? t('fiscalYears.detail.rolloverNoTarget')
                                  : t('fiscalYears.detail.rolloverTip')
                          }
                        >
                          <Repeat className="h-4 w-4" />
                          {t('fiscalYears.detail.rollover')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
                    <KV k={t('common.from')} v={formatDate(selected.startDate)} />
                    <KV k={t('common.to')} v={formatDate(selected.endDate)} />
                    <KV k={t('fiscalYears.detail.totalDebits')} v={formatIQD(status?.totalDebits)} />
                    <KV k={t('fiscalYears.detail.totalCredits')} v={formatIQD(status?.totalCredits)} />
                  </div>

                  <Separator />

                  {/* نتيجة الفحص */}
                  {validating ? (
                    <div className="text-xs text-muted-foreground">{t('fiscalYears.detail.checking')}</div>
                  ) : validation && (
                    <div
                      className={cn(
                        'rounded-md border px-3 py-2.5 text-sm',
                        validation.canClose
                          ? 'border-success/30 bg-success/5 text-success'
                          : 'border-destructive/30 bg-destructive/5 text-destructive'
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {validation.canClose ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                        {validation.canClose
                          ? t('fiscalYears.detail.readyToClose')
                          : t('fiscalYears.detail.cannotClose')}
                      </div>
                      {validation.issues.length > 0 && (
                        <ul className="mt-2 list-inside list-disc text-xs">
                          {validation.issues.map((iss, i) => (
                            <li key={i}>{translateValidationIssue(locale, iss, t)}</li>
                          ))}
                        </ul>
                      )}
                      {validation.draftEntriesList && validation.draftEntriesList.length > 0 && (
                        <DraftEntriesList entries={validation.draftEntriesList} />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* جدول الفترات — مع إمكانية التعديل/الحذف/تغيير الحالة */}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{t('fiscalYears.detail.periodsTitle', { count: selected.periods.length })}</CardTitle>
                    <div className="flex items-center gap-2">
                      {!selected.isClosed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowBulk(true)}
                          className="gap-1.5"
                          title={t('fiscalYears.detail.bulkTip')}
                        >
                          <CalendarRange className="h-3.5 w-3.5" />
                          {t('fiscalYears.detail.bulk')}
                        </Button>
                      )}
                      {selected.isClosed && (
                        <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-[11px] text-warning">
                          {t('fiscalYears.detail.closedNote')}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-16">{t('fiscalYears.detail.colNum')}</th>
                        <th>{t('common.from')}</th>
                        <th>{t('common.to')}</th>
                        <th>{t('common.status')}</th>
                        <th className="w-44 text-center">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.periods.map(p => (
                        <PeriodRow
                          key={p.id}
                          period={p}
                          fyClosed={selected.isClosed}
                          onEdit={() => setEditingPeriodId(p.id)}
                          onDelete={() => setDeletingPeriodId(p.id)}
                          onStatusChanged={() => {
                            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
                            qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateFiscalYearModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
          }}
        />
      )}

      {showClose && selected && (
        <CloseFiscalYearModal
          fy={selected}
          canClose={validation?.canClose ?? false}
          issues={validation?.issues ?? []}
          onClose={() => setShowClose(false)}
          onSuccess={() => {
            setShowClose(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-validate', selected.id] });
          }}
        />
      )}

      {showRollover && rolloverSnap && (
        <RolloverModal
          source={rolloverSnap.source}
          years={rolloverSnap.years}
          openingEntriesCount={rolloverSnap.openingEntriesCount ?? 0}
          onClose={() => {
            setShowRollover(false);
            setRolloverSnap(null);
          }}
          onSuccess={() => {
            setShowRollover(false);
            setRolloverSnap(null);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-status', rolloverSnap.source.id] });
          }}
        />
      )}

      {showEdit && selected && (
        <EditFiscalYearModal
          fy={selected}
          others={(years ?? []).filter(y => y.id !== selected.id)}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-validate', selected.id] });
          }}
        />
      )}

      {showDelete && selected && (
        <DeleteFiscalYearModal
          fy={selected}
          onClose={() => setShowDelete(false)}
          onSuccess={() => {
            setShowDelete(false);
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
          }}
        />
      )}

      {showReopen && selected && (
        <ReopenFiscalYearModal
          fy={selected}
          onClose={() => setShowReopen(false)}
          onSuccess={() => {
            setShowReopen(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-validate', selected.id] });
          }}
        />
      )}

      {editingPeriodId != null && selected && (() => {
        const period = selected.periods.find(p => p.id === editingPeriodId);
        if (!period) return null;
        return (
          <EditPeriodModal
            period={period}
            fy={selected}
            siblings={selected.periods.filter(x => x.id !== period.id)}
            onClose={() => setEditingPeriodId(null)}
            onSuccess={() => {
              setEditingPeriodId(null);
              qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            }}
          />
        );
      })()}

      {deletingPeriodId != null && selected && (() => {
        const period = selected.periods.find(p => p.id === deletingPeriodId);
        if (!period) return null;
        return (
          <DeletePeriodModal
            period={period}
            onClose={() => setDeletingPeriodId(null)}
            onSuccess={() => {
              setDeletingPeriodId(null);
              qc.invalidateQueries({ queryKey: ['fiscal-years'] });
              qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
            }}
          />
        );
      })()}

      {showBulk && selected && (
        <BulkPeriodsModal
          fy={selected}
          onClose={() => setShowBulk(false)}
          onSuccess={() => {
            setShowBulk(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
          }}
        />
      )}

      {showResync && selected && (
        <ResyncPeriodsModal
          fy={selected}
          onClose={() => setShowResync(false)}
          onSuccess={() => {
            setShowResync(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
            qc.invalidateQueries({ queryKey: ['fiscal-year-status', selected.id] });
          }}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// صف فترة شهرية مع أزرار العمليات (تعديل/حذف/فتح/إغلاق)
// ═════════════════════════════════════════════════════════════════════════
function PeriodRow({
  period, fyClosed, onEdit, onDelete, onStatusChanged,
}: {
  period: FiscalYearDto['periods'][number];
  fyClosed: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChanged: () => void;
}) {
  const { t } = useTranslation();
  // ‎التعديل والحذف يتطلبان السنة مفتوحة + الفترة مفتوحة. تغيير الحالة
  // ‎يتطلب فقط السنة مفتوحة (الفترات تستطيع التحوّل بين Open/Closed/Locked
  // ‎حتى لو وُجدت فيها قيود — هذا فقط يتحكم بإمكانية إضافة/تعديل قيود لاحقة).
  const canModify = !fyClosed;
  const isOpen = period.status === 1;
  const isLocked = period.status === 3;

  const setStatus = useMutation({
    mutationFn: (status: 1 | 2 | 3) => fiscalYearsApi.setPeriodStatus(period.id, status),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.period.statusUpdated'));
        onStatusChanged();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('common.error'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('common.error')),
  });

  return (
    <tr>
      <td className="num-display text-xs">{period.periodNumber}</td>
      <td>{formatDate(period.startDate)}</td>
      <td>{formatDate(period.endDate)}</td>
      <td>
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-xs',
          PERIOD_STATUS_CLASS[period.status]
        )}>
          {period.status === 1 ? t('periodStatus.open', { defaultValue: 'Open' }) : period.status === 2 ? t('periodStatus.closed', { defaultValue: 'Closed' }) : t('periodStatus.locked', { defaultValue: 'Locked' })}
        </span>
      </td>
      <td>
        <div className="flex items-center justify-center gap-1">
          {/* فتح (إذا مغلقة أو مقفلة) */}
          {!isOpen && (
            <button
              type="button"
              onClick={() => setStatus.mutate(1)}
              disabled={!canModify || setStatus.isPending}
              className="rounded p-1 text-success hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-30"
              title={canModify ? t('fiscalYears.period.open') : t('fiscalYears.period.unlockFirst')}
            >
              <LockOpen className="h-3.5 w-3.5" />
            </button>
          )}
          {/* إغلاق (إذا مفتوحة) */}
          {isOpen && (
            <button
              type="button"
              onClick={() => setStatus.mutate(2)}
              disabled={!canModify || setStatus.isPending}
              className="rounded p-1 text-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-30"
              title={canModify ? t('fiscalYears.period.close') : t('fiscalYears.period.fyClosed')}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
          {/* تعديل التواريخ — فقط إذا مفتوحة وغير مقفلة */}
          <button
            type="button"
            onClick={onEdit}
            disabled={!canModify || isLocked}
            className="rounded p-1 text-blue-400 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-30"
            title={
              !canModify ? t('fiscalYears.period.unlockFirst')
                : isLocked ? t('fiscalYears.period.lockedUnlockFirst')
                : t('fiscalYears.period.editTip')
            }
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {/* حذف — فقط إذا لا قيود فيها */}
          <button
            type="button"
            onClick={onDelete}
            disabled={!canModify || isLocked}
            className="rounded p-1 text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-30"
            title={
              !canModify ? t('fiscalYears.period.unlockFirst')
                : isLocked ? t('fiscalYears.period.lockedUnlockFirst')
                : t('fiscalYears.period.deleteTip')
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** قائمة القيود غير المرحَّلة مع روابط لفتح كل قيد ومعالجته (ترحيل/حذف). */
function DraftEntriesList({ entries }: { entries: NonNullable<FiscalYearValidationDto['draftEntriesList']> }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const linkFor = (id: number) => `/accounting/journal/${id}/edit`;

  // ‎الصناديق — كي نقدر نترجم وصف القيد المُنشأ تلقائياً (سند قبض — صندوق X).
  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'all-for-translation'],
    queryFn: () => cashBoxesApi.getAll(false),
    staleTime: 5 * 60 * 1000,
    enabled: locale === 'en',
  });
  const descCtx: Record<string, string> = {};
  for (const cb of cashBoxesQuery.data ?? []) {
    const ar = (cb.nameAr ?? '').trim();
    const en = (cb.nameEn ?? '').trim();
    if (ar && en) descCtx[ar] = en;
  }
  return (
    <div className="mt-3 rounded-md border border-destructive/20 bg-background/60 p-2.5">
      <div className="mb-1.5 text-xs font-semibold text-foreground/90">
        {t('fiscalYears.detail.draftEntriesTitle')}
      </div>
      <ul className="space-y-1.5">
        {entries.map(e => {
          const display = e.voucherTypeCode && e.voucherSequence
            ? `${e.voucherTypeCode}-${e.voucherSequence}`
            : e.entryNumber;
          return (
            <li key={e.id} className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1.5 text-xs">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
                  #{e.id}
                </span>
                <span className="font-medium">{display}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{formatDate(e.entryDate)}</span>
                <span className="truncate text-muted-foreground/80" title={e.description}>
                  {localizedEntryDescription(locale, e.description, descCtx)}
                </span>
              </div>
              <Link
                to={linkFor(e.id)}
                className="shrink-0 inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent/40"
                title={t('fiscalYears.detail.openEntry')}
              >
                <ExternalLink className="h-3 w-3" />
                {t('fiscalYears.detail.open')}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'destructive' | 'muted' }) {
  const toneCls = {
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-2xl font-semibold num-display', toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="mt-0.5 font-medium">{v}</div>
    </div>
  );
}

function Modal({
  title, onClose, children, size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const { t } = useTranslation();
  const sizeCls =
    size === 'xl' ? 'max-w-2xl' :
    size === 'lg' ? 'max-w-xl' :
    'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <Card className={cn('flex max-h-[90vh] w-full flex-col', sizeCls)}>
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base">{title}</CardTitle>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent/40"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto py-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function CreateFiscalYearModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const now = new Date();
  const year = now.getFullYear() + 1;
  const [name, setName] = useState(`${t('fiscalYears.createModal.defaultName')} ${year}`);
  const [nameEn, setNameEn] = useState(`Fiscal Year ${year}`);
  const [startDate, setStartDate] = useState(`${year}-01-01`);
  const [endDate, setEndDate] = useState(`${year}-12-31`);

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.create({ name, nameEn: nameEn || null, startDate, endDate }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.createModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? t('fiscalYears.createModal.failed'));
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('fiscalYears.createModal.failed'));
    },
  });

  return (
    <Modal title={t('fiscalYears.createModal.title')} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block text-xs">{t('fiscalYears.createModal.name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('fiscalYears.createModal.namePlaceholder')} dir="rtl" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{t('fiscalYears.createModal.nameEn')}</Label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder={t('fiscalYears.createModal.nameEnPlaceholder')} dir="ltr" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {t('common.from')}
            </Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {t('common.to')}
            </Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? t('fiscalYears.createModal.creating') : t('common.create')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CloseFiscalYearModal({
  fy, canClose, issues, onClose, onSuccess,
}: {
  fy: FiscalYearDto;
  canClose: boolean;
  issues: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [forceClose, setForceClose] = useState(false);
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.close(fy.id, { forceClose }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.closeModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? t('fiscalYears.closeModal.failed'));
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('fiscalYears.closeModal.failed'));
    },
  });

  return (
    <Modal title={t('fiscalYears.closeModal.title', { year: (fy.startDate ?? '').slice(0, 4) || fy.name })} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="h-4 w-4" />
            {t('common.warning')}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('fiscalYears.closeModal.warning')}
          </p>
        </div>

        {!canClose && issues.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">{t('fiscalYears.closeModal.issues')}</div>
            <ul className="mt-1.5 list-inside list-disc text-xs text-destructive/80">
              {issues.map((i, idx) => (
                <li key={idx}>{translateValidationIssue(locale, i, t)}</li>
              ))}
            </ul>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={forceClose}
                onChange={e => setForceClose(e.target.checked)}
                className="rounded"
              />
              <span>{t('fiscalYears.closeModal.forceClose')}</span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="default"
            onClick={() => m.mutate()}
            disabled={m.isPending || (!canClose && !forceClose)}
          >
            {m.isPending ? t('fiscalYears.closeModal.closing') : t('fiscalYears.closeModal.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RolloverModal({
  source, years, openingEntriesCount, onClose, onSuccess,
}: {
  source: FiscalYearDto;
  years: FiscalYearDto[];
  openingEntriesCount: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const candidates = years.filter(y => y.id !== source.id && new Date(y.startDate) > new Date(source.endDate));
  const [targetId, setTargetId] = useState<number | null>(candidates[0]?.id ?? null);
  const hasExistingOpening = openingEntriesCount > 0;
  // ‎بُعد الحسابات: 1=ميزانية فقط، 2=ميزانية + إقفال أرباح/خسائر
  const [scope, setScope] = useState<1 | 2>(2);
  // ‎بُعد العملة: 1=لكل عملة مستقلة، 2=تحويل للعملة الأساسية
  const [currencyMode, setCurrencyMode] = useState<1 | 2>(1);
  // ‎نوع السند الثنائي (Mixed) للقيد الافتتاحي
  const [openingVoucherTypeId, setOpeningVoucherTypeId] = useState<number | null>(null);
  // ‎تدوير نشرة الأسعار المعتمدة إلى السنة الجديدة
  const [rollBulletin, setRollBulletin] = useState(true);
  // ‎نخزّن id الحساب للعرض في AccountPicker، ونرسل الكود للـ API لأن الـ backend يستقبل code
  const [profitAccountId, setProfitAccountId] = useState<number | null>(null);
  const [lossAccountId, setLossAccountId] = useState<number | null>(null);
  const [previewOnly, setPreviewOnly] = useState(true);

  // ‎جلب شجرة الحسابات لاستخدامها في الـ AccountPicker
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });

  // ‎للقيد الافتتاحي: فقط امتداد «قيد محاسبي» JV من النوع المزدوج (Mixed).
  const voucherTypesQuery = useQuery({
    queryKey: ['journal-voucher-types', 'enabled'],
    queryFn: () => journalVoucherTypesApi.getAll(true),
  });
  const jvMixedVoucherTypes = (voucherTypesQuery.data ?? []).filter(
    v => v.isEnabled && v.nature === 'Mixed' && v.code.trim().toUpperCase() === 'JV',
  );

  useEffect(() => {
    if (openingVoucherTypeId != null || jvMixedVoucherTypes.length === 0) return;
    setOpeningVoucherTypeId(jvMixedVoucherTypes[0]!.id);
  }, [jvMixedVoucherTypes, openingVoucherTypeId]);
  // ‎جميع الحسابات التفصيلية (leaf) — نتركها كاملة كما في شاشة القيود
  // ‎حتى يستطيع المستخدم اختيار أي حساب يريده كحساب أرباح/خسائر بحسب
  // ‎شجرة الحسابات الفعلية لديه (قد تختلف من شركة لأخرى).
  const leafAccounts = treeQuery.data ? flattenLeafAccounts(treeQuery.data) : [];

  const profitCode = profitAccountId
    ? leafAccounts.find(a => a.id === profitAccountId)?.code ?? ''
    : '';
  const lossCode = lossAccountId
    ? leafAccounts.find(a => a.id === lossAccountId)?.code ?? ''
    : '';

  const [submitError, setSubmitError] = useState<string | null>(null);

  const rollM = useMutation({
    mutationFn: () => fiscalYearsApi.rollover({
      sourceFiscalYearId: source.id,
      targetFiscalYearId: targetId!,
      profitAccountCode: scope === 2 ? profitCode : null,
      lossAccountCode: scope === 2 ? lossCode : null,
      mode: scope,
      currencyMode,
      openingVoucherTypeId,
      rollBulletin,
      previewOnly,
    }),
    onSuccess: (res) => {
      setSubmitError(null);
      const msg = res.data?.message ?? t('fiscalYears.rolloverModal.success');
      toast.success(msg, { duration: previewOnly ? 8000 : 5000 });
      if (!previewOnly) onSuccess();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: string[] } }; message?: string };
      const msg =
        err?.response?.data?.message
        ?? err?.response?.data?.errors?.[0]
        ?? err?.message
        ?? t('fiscalYears.rolloverModal.failed');
      setSubmitError(msg);
      toast.error(msg, { duration: 15000 });
    },
  });

  const undoM = useMutation({
    mutationFn: () => fiscalYearsApi.undoRollover({
      targetFiscalYearId: targetId!,
      reopenSource: true,
    }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message ?? t('fiscalYears.rolloverModal.undoSuccess'));
        qc.invalidateQueries({ queryKey: ['fiscal-years'] });
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.rolloverModal.undoFailed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('fiscalYears.rolloverModal.undoFailed')),
  });

  return (
    <Modal title={t('fiscalYears.rolloverModal.title')} onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        {submitError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-relaxed">{submitError}</p>
            </div>
          </div>
        )}
        {!source.isClosed && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              {t('fiscalYears.rolloverModal.sourceOpen')}
            </div>
            <p className="mt-1">
              {t('fiscalYears.rolloverModal.sourceOpenNote')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block text-xs">{t('fiscalYears.rolloverModal.fromFY')}</Label>
            <Input value={source.name} disabled />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{t('fiscalYears.rolloverModal.toFY')}</Label>
            {candidates.length === 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
                {t('fiscalYears.rolloverModal.noNextFY')}
              </div>
            ) : (
              <select
                value={targetId ?? ''}
                onChange={e => setTargetId(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {candidates.map(y => (
                  <option key={y.id} value={y.id}>{localizedName(locale, y.name, y.nameEn)}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">نوع الإغلاق — الحسابات المُدوَّرة</Label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setScope(1)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                scope === 1 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Layers className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">ميزانية فقط</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  تدوير أرصدة الأصول/الالتزامات/حقوق الملكية فقط (تُفترض النتيجة مُقفلة).
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setScope(2)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                scope === 2 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">ميزانية + أرباح وخسائر</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  تدوير الميزانية وإقفال صافي الربح/الخسارة على الحساب المناسب.
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">معالجة العملات</Label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setCurrencyMode(1)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                currencyMode === 1 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Coins className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">لكل عملة بشكل مستقل</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  قيد افتتاحي منفصل لكل عملة بعملتها الأصلية (مع تجميد سعر النشرة).
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setCurrencyMode(2)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                currencyMode === 2 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">تحويل للعملة الأساسية</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  قيد افتتاحي واحد محوَّل للعملة الأساسية بسعر النشرة المعتمدة.
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <FileText className="h-3 w-3" />
              نوع سند القيد الافتتاحي
            </Label>
            <select
              value={openingVoucherTypeId ?? ''}
              onChange={e => setOpeningVoucherTypeId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {jvMixedVoucherTypes.length === 0 && (
                <option value="">— لا يوجد نوع JV مزدوج مُفعَّل —</option>
              )}
              {jvMixedVoucherTypes.map(v => (
                <option key={v.id} value={v.id}>{v.code} — {v.nameAr}</option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-muted-foreground">
              قيد محاسبي JV (مزدوج Mixed) فقط — ليبقى القيد قابلاً للتعديل من نافذة القيود اليومية.
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={rollBulletin}
                onChange={e => setRollBulletin(e.target.checked)}
                className="rounded"
              />
              <span>تدوير نشرة الأسعار المعتمدة إلى السنة الجديدة</span>
            </label>
          </div>
        </div>

        {scope === 2 && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1.5 flex items-center gap-1 text-xs">
                  <TrendingUp className="h-3 w-3 text-success" />
                  {t('fiscalYears.rolloverModal.profitAccount')}
                  <span className="text-[10px] text-muted-foreground">({t('fiscalYears.rolloverModal.credit')})</span>
                </Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={profitAccountId}
                  onChange={(id) => setProfitAccountId(id)}
                  placeholder={t('fiscalYears.rolloverModal.accountSearchPlaceholder')}
                  allowClear
                />
                {profitCode && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {t('common.code')}: <span className="num-display">{profitCode}</span>
                  </div>
                )}
              </div>
              <div>
                <Label className="mb-1.5 flex items-center gap-1 text-xs">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  {t('fiscalYears.rolloverModal.lossAccount')}
                  <span className="text-[10px] text-muted-foreground">({t('fiscalYears.rolloverModal.debit')})</span>
                </Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={lossAccountId}
                  onChange={(id) => setLossAccountId(id)}
                  placeholder={t('fiscalYears.rolloverModal.accountSearchPlaceholder')}
                  allowClear
                />
                {lossCode && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {t('common.code')}: <span className="num-display">{lossCode}</span>
                  </div>
                )}
              </div>
            </div>
            {treeQuery.isLoading && (
              <div className="text-[11px] text-muted-foreground">{t('fiscalYears.rolloverModal.loadingAccounts')}</div>
            )}
            {!treeQuery.isLoading && leafAccounts.length === 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
                {t('fiscalYears.rolloverModal.noAccounts')}
              </div>
            )}
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              {t('fiscalYears.rolloverModal.accountNote')}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={previewOnly}
            onChange={e => setPreviewOnly(e.target.checked)}
            className="rounded"
          />
          <span>{t('fiscalYears.rolloverModal.previewOnly')}</span>
        </label>

        {hasExistingOpening && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            {t('fiscalYears.detail.rolloverAlreadyDone')}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          {hasExistingOpening ? (
            <Button
              type="button"
              variant="outline"
              className="border-warning/40 text-warning hover:bg-warning/10"
              disabled={undoM.isPending || !targetId}
              onClick={() => {
                if (!confirm(t('fiscalYears.rolloverModal.undoConfirm'))) return;
                undoM.mutate();
              }}
              title={t('fiscalYears.rolloverModal.undoTip')}
            >
              <Undo2 className="h-4 w-4" />
              {undoM.isPending ? t('fiscalYears.rolloverModal.undoing') : t('fiscalYears.detail.cancelRollover')}
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            {!hasExistingOpening && (
            <Button
              type="button"
              onClick={() => {
                setSubmitError(null);
                rollM.mutate();
              }}
              disabled={
                rollM.isPending || !targetId || !source.isClosed ||
                !openingVoucherTypeId ||
                (scope === 2 && (!profitCode || !lossCode))
              }
            >
              {rollM.isPending ? t('fiscalYears.rolloverModal.executing') : (previewOnly ? t('fiscalYears.rolloverModal.preview') : t('fiscalYears.rolloverModal.execute'))}
            </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** يستخرج YYYY-MM-DD من ISO string بشكل آمن للـ <input type="date">. */
function toDateInput(d: string): string {
  if (!d) return '';
  const idx = d.indexOf('T');
  return idx > 0 ? d.slice(0, idx) : d.slice(0, 10);
}

function EditFiscalYearModal({
  fy, others, onClose, onSuccess,
}: {
  fy: FiscalYearDto;
  others: FiscalYearDto[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(fy.name);
  const [nameEn, setNameEn] = useState(fy.nameEn ?? '');
  const [startDate, setStartDate] = useState(toDateInput(fy.startDate));
  const [endDate, setEndDate] = useState(toDateInput(fy.endDate));

  const validation = (() => {
    if (!name.trim()) return t('fiscalYears.editModal.nameRequired');
    if (!startDate) return t('fiscalYears.editModal.startRequired');
    if (!endDate) return t('fiscalYears.editModal.endRequired');
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime())) return t('fiscalYears.editModal.startInvalid');
    if (isNaN(e.getTime())) return t('fiscalYears.editModal.endInvalid');
    if (e <= s) return t('fiscalYears.editModal.endBeforeStart');
    for (const o of others) {
      const os = new Date(o.startDate);
      const oe = new Date(o.endDate);
      const intersects = (s >= os && s <= oe) || (e >= os && e <= oe) || (s <= os && e >= oe);
      if (intersects) return t('fiscalYears.editModal.overlap', { name: o.name, start: toDateInput(o.startDate), end: toDateInput(o.endDate) });
    }
    return null;
  })();

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.update(fy.id, {
      name: name.trim(),
      nameEn: nameEn.trim() || null,
      startDate,
      endDate,
    }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.editModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.editModal.failed'));
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('fiscalYears.editModal.failed'));
    },
  });

  const hasChanges =
    name.trim() !== fy.name ||
    (nameEn.trim() || null) !== (fy.nameEn ?? null) ||
    startDate !== toDateInput(fy.startDate) ||
    endDate !== toDateInput(fy.endDate);

  return (
    <Modal title={t('fiscalYears.editModal.title', { year: (fy.startDate ?? '').slice(0, 4) || fy.name })} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block text-xs">{t('fiscalYears.createModal.name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('fiscalYears.createModal.namePlaceholder')} dir="rtl" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{t('fiscalYears.createModal.nameEn')}</Label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder={t('fiscalYears.createModal.nameEnPlaceholder')} dir="ltr" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {t('common.from')}
            </Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {t('common.to')}
            </Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        {validation && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline-block h-3 w-3" />
            {validation}
          </div>
        )}

        {!validation && !hasChanges && (
          <div className="rounded-md border border-muted/40 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
            {t('fiscalYears.editModal.noChanges')}
          </div>
        )}

        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-muted-foreground">
          {t('fiscalYears.editModal.note')}
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !!validation || !hasChanges}
          >
            {m.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteFiscalYearModal({
  fy, onClose, onSuccess,
}: {
  fy: FiscalYearDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.delete(fy.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.deleteModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? t('fiscalYears.deleteModal.failed'));
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('fiscalYears.deleteModal.failed'));
    },
  });

  const canConfirm = confirmText.trim() === fy.name.trim();

  return (
    <Modal title={t('fiscalYears.deleteModal.title')} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t('fiscalYears.deleteModal.confirm', { name: fy.name })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('fiscalYears.deleteModal.warning')}
          </p>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs">
            {t('fiscalYears.deleteModal.typeToConfirm')}
            <span className="mx-1 font-mono text-foreground">{fy.name}</span>
          </Label>
          <Input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={fy.name}
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => m.mutate()}
            disabled={m.isPending || !canConfirm}
          >
            {m.isPending ? t('common.deleting') : t('fiscalYears.deleteModal.confirmBtn')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// نافذة فك إغلاق السنة المالية
// ═════════════════════════════════════════════════════════════════════════
function ReopenFiscalYearModal({
  fy, onClose, onSuccess,
}: {
  fy: FiscalYearDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.reopen(fy.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.reopenModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.reopenModal.failed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('fiscalYears.reopenModal.failed')),
  });

  return (
    <Modal title={t('fiscalYears.reopenModal.title', { year: (fy.startDate ?? '').slice(0, 4) || fy.name })} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <Unlock className="h-4 w-4" />
            {t('fiscalYears.reopenModal.heading')}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('fiscalYears.reopenModal.warning')}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
          >
            {m.isPending ? t('fiscalYears.reopenModal.reopening') : t('fiscalYears.reopenModal.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// نافذة تعديل تواريخ فترة محاسبية
// ═════════════════════════════════════════════════════════════════════════
function EditPeriodModal({
  period, fy, siblings, onClose, onSuccess,
}: {
  period: FiscalYearDto['periods'][number];
  fy: FiscalYearDto;
  siblings: FiscalYearDto['periods'];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(toDateInput(period.startDate));
  const [endDate, setEndDate] = useState(toDateInput(period.endDate));

  const validation = (() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (e <= s) return t('fiscalYears.editModal.endBeforeStart');
    const fyStart = new Date(toDateInput(fy.startDate));
    const fyEnd = new Date(toDateInput(fy.endDate));
    if (s < fyStart || e > fyEnd)
      return t('fiscalYears.editPeriodModal.outOfRange', { start: toDateInput(fy.startDate), end: toDateInput(fy.endDate) });
    for (const o of siblings) {
      const os = new Date(toDateInput(o.startDate));
      const oe = new Date(toDateInput(o.endDate));
      const intersects = (s >= os && s <= oe) || (e >= os && e <= oe) || (s <= os && e >= oe);
      if (intersects) return t('fiscalYears.editPeriodModal.overlap', { num: o.periodNumber });
    }
    return null;
  })();

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.updatePeriod(period.id, { startDate, endDate }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.editPeriodModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.editPeriodModal.failed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('fiscalYears.editPeriodModal.failed')),
  });

  return (
    <Modal title={t('fiscalYears.editPeriodModal.title', { num: period.periodNumber })} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {t('common.from')}
            </Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> {t('common.to')}
            </Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        {validation && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mr-1 inline-block h-3 w-3" />
            {validation}
          </div>
        )}
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-muted-foreground">
          {t('fiscalYears.editPeriodModal.note')}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !!validation || !startDate || !endDate}
          >
            {m.isPending ? t('common.saving') : t('common.saveChanges')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// نافذة حذف فترة محاسبية
// ═════════════════════════════════════════════════════════════════════════
function DeletePeriodModal({
  period, onClose, onSuccess,
}: {
  period: FiscalYearDto['periods'][number];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.deletePeriod(period.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('fiscalYears.deletePeriodModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.deletePeriodModal.failed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('fiscalYears.deletePeriodModal.failed')),
  });

  return (
    <Modal title={t('fiscalYears.deletePeriodModal.title', { num: period.periodNumber })} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t('fiscalYears.deletePeriodModal.confirm', { num: period.periodNumber })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ({formatDate(period.startDate)} → {formatDate(period.endDate)})
            <br />
            {t('fiscalYears.deletePeriodModal.warning')}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => m.mutate()}
            disabled={m.isPending}
          >
            {m.isPending ? t('common.deleting') : t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ResyncPeriodsModal — إعادة مزامنة الفترات الشهرية لتطابق تواريخ السنة الحالية.
// مفيدة لإصلاح سنة عُدّلت تواريخها لاحقاً وبقيت فترات معلّقة خارج النطاق.
// ─────────────────────────────────────────────────────────────────────────
function ResyncPeriodsModal({
  fy, onClose, onSuccess,
}: {
  fy: FiscalYearDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const fyStart = new Date(fy.startDate.slice(0, 10)).getTime();
  const fyEnd = new Date(fy.endDate.slice(0, 10)).getTime();
  const outOfRange = fy.periods.filter(p => {
    const ps = new Date(p.startDate.slice(0, 10)).getTime();
    const pe = new Date(p.endDate.slice(0, 10)).getTime();
    return pe < fyStart || ps > fyEnd;
  });

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.resyncPeriods(fy.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message ?? t('fiscalYears.resyncModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.resyncModal.failed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('fiscalYears.resyncModal.failed')),
  });

  return (
    <Modal title={t('fiscalYears.resyncModal.title')} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          {t('fiscalYears.resyncModal.desc', { start: formatDate(fy.startDate), end: formatDate(fy.endDate) })}
        </div>

        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('fiscalYears.resyncModal.currentPeriods')}:</span>
            <span className="font-bold">{fy.periods.length}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('fiscalYears.resyncModal.outOfRange')}:</span>
            <span className={cn(
              'font-bold',
              outOfRange.length > 0 ? 'text-warning' : 'text-muted-foreground'
            )}>
              {outOfRange.length}
            </span>
          </div>
          {outOfRange.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {outOfRange.slice(0, 12).map(p => (
                <span
                  key={p.id}
                  className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
                  title={`${formatDate(p.startDate)} → ${formatDate(p.endDate)}`}
                >
                  {p.periodNumber}
                </span>
              ))}
              {outOfRange.length > 12 && (
                <span className="text-[10px] text-muted-foreground">
                  +{outOfRange.length - 12} ...
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            <RefreshCw className="h-4 w-4" />
            {m.isPending ? t('fiscalYears.resyncModal.syncing') : t('fiscalYears.resyncModal.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BulkPeriodsModal — إغلاق/فتح كل الفترات الشهرية حتى/من تاريخ معيّن.
// مفيد للمحاسب: يقفل كل أشهر النصف الأول بضغطة واحدة بدل فتح كل فترة لوحدها.
// ─────────────────────────────────────────────────────────────────────────
function BulkPeriodsModal({
  fy, onClose, onSuccess,
}: {
  fy: FiscalYearDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date();
  const lastDayOfThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const defaultDate = lastDayOfThisMonth.toISOString().slice(0, 10);

  const [mode, setMode] = useState<1 | 2>(1); // 1=CloseUpTo, 2=OpenFrom
  const [targetStatus, setTargetStatus] = useState<1 | 2 | 3>(2); // 1=Open، 2=Closed، 3=Locked
  const [date, setDate] = useState<string>(defaultDate);

  const fyStart = fy.startDate.slice(0, 10);
  const fyEnd = fy.endDate.slice(0, 10);

  // ‎معاينة عدد الفترات المتأثّرة محلياً قبل الإرسال.
  const preview = (() => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return { count: 0, items: [] as typeof fy.periods };
    const items = mode === 1
      ? fy.periods.filter(p => new Date(p.endDate).getTime() <= d.getTime())
      : fy.periods.filter(p => new Date(p.startDate).getTime() >= d.getTime());
    const willChange = items.filter(p => Number(p.status) !== targetStatus);
    return { count: willChange.length, items: willChange };
  })();

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.bulkSetPeriodsStatus({
      fiscalYearId: fy.id,
      date,
      mode,
      targetStatus,
    }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message ?? res.message ?? t('fiscalYears.bulkModal.success'));
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? t('fiscalYears.bulkModal.failed'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('fiscalYears.bulkModal.failed')),
  });

  const statusLabel = (s: 1 | 2 | 3) =>
    s === 1 ? t('periodStatus.open') : s === 2 ? t('periodStatus.closed') : t('periodStatus.locked');

  const dateOutOfRange =
    !!date && (date < fyStart || date > fyEnd);

  return (
    <Modal title={t('fiscalYears.bulkModal.title')} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          {t('fiscalYears.bulkModal.fyLabel')}: <span className="font-medium text-foreground">{fy.name}</span>
          {' '}({formatDate(fy.startDate)} → {formatDate(fy.endDate)})
        </div>

        <div className="space-y-2">
          <Label>{t('fiscalYears.bulkModal.operationType')}</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode(1)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                mode === 1
                  ? 'border-primary bg-primary/10'
                  : 'hover:border-foreground/30'
              )}
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">{t('fiscalYears.bulkModal.closeUpto')}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('fiscalYears.bulkModal.closeUptoDesc')}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode(2)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                mode === 2
                  ? 'border-primary bg-primary/10'
                  : 'hover:border-foreground/30'
              )}
            >
              <LockOpen className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">{t('fiscalYears.bulkModal.openFrom')}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('fiscalYears.bulkModal.openFromDesc')}
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('fiscalYears.bulkModal.targetStatus')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setTargetStatus(s)}
                className={cn(
                  'rounded-md border px-2 py-2 text-center text-xs transition',
                  targetStatus === s
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'hover:border-foreground/30'
                )}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bulk-date">{t('fiscalYears.bulkModal.referenceDate')}</Label>
          <Input
            id="bulk-date"
            type="date"
            value={date}
            min={fyStart}
            max={fyEnd}
            onChange={e => setDate(e.target.value)}
          />
          {dateOutOfRange && (
            <p className="text-[11px] text-destructive">
              {t('fiscalYears.bulkModal.dateOutOfRange')}
            </p>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('fiscalYears.bulkModal.affectedCount')}:</span>
            <span className="font-bold text-foreground">{preview.count}</span>
          </div>
          {preview.count > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {preview.items.slice(0, 12).map(p => (
                <span
                  key={p.id}
                  className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title={`${formatDate(p.startDate)} → ${formatDate(p.endDate)}`}
                >
                  {p.periodNumber}
                </span>
              ))}
              {preview.items.length > 12 && (
                <span className="text-[10px] text-muted-foreground">
                  +{preview.items.length - 12} ...
                </span>
              )}
            </div>
          )}
          {preview.count === 0 && date && !dateOutOfRange && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('fiscalYears.bulkModal.noPeriods')}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !date || dateOutOfRange || preview.count === 0}
          >
            {m.isPending ? t('fiscalYears.bulkModal.applying') : t('fiscalYears.bulkModal.apply', { count: preview.count })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
