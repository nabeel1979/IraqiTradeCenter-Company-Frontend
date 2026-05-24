import { useState, useEffect } from 'react';
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
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { formatDate, formatIQD, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FiscalYearDto, AccountingPeriodStatus, FiscalYearValidationDto, AccountDto } from '@/types/api';

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

const PERIOD_STATUS_LABEL: Record<AccountingPeriodStatus, string> = {
  1: 'مفتوحة',
  2: 'مغلقة',
  3: 'مقفلة',
};

const PERIOD_STATUS_CLASS: Record<AccountingPeriodStatus, string> = {
  1: 'bg-success/10 text-success',
  2: 'bg-warning/10 text-warning',
  3: 'bg-destructive/10 text-destructive',
};

export function FiscalYearsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showRollover, setShowRollover] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [deletingPeriodId, setDeletingPeriodId] = useState<number | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showResync, setShowResync] = useState(false);

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
        toast.success('تم اعتماد السنة المالية كنشطة');
        qc.invalidateQueries({ queryKey: ['fiscal-years'] });
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل التفعيل');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشل التفعيل'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            الفترات المحاسبية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة السنوات المالية وإغلاقها وتدوير الأرصدة
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          سنة مالية جديدة
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner text="جاري تحميل السنوات المالية..." />
      ) : (years?.length ?? 0) === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="لا توجد سنوات مالية"
          description="ابدأ بإنشاء سنة مالية جديدة"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              إنشاء سنة مالية
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
          {/* قائمة السنوات */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">السنوات المالية</CardTitle>
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
                          aria-label="نشطة"
                        />
                      )}
                      {y.name}
                    </span>
                    {y.isClosed ? (
                      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
                        <Lock className="h-3 w-3" />
                        مغلقة
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        مفتوحة
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {formatDate(y.startDate, { short: true })} → {formatDate(y.endDate, { short: true })}
                    </span>
                    {y.isActive && (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                        نشطة
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
                <StatBox label="الفترات المفتوحة" value={status?.openPeriods ?? 0} tone="success" />
                <StatBox label="الفترات المغلقة" value={status?.closedPeriods ?? 0} tone="warning" />
                <StatBox label="الفترات المقفلة" value={status?.lockedPeriods ?? 0} tone="destructive" />
                <StatBox label="القيود غير المرحَّلة" value={status?.draftEntries ?? 0} tone="muted" />
              </div>

              {/* ملخص + أزرار العمليات */}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">{selected.name}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => refetchValidation()}>
                        <Eye className="h-4 w-4" />
                        فحص
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed || selected.isActive || activateM.isPending}
                        onClick={() => activateM.mutate(selected.id)}
                        className={cn(
                          selected.isActive
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-primary/40 text-primary hover:bg-primary/10'
                        )}
                        title={
                          selected.isClosed
                            ? 'لا يمكن تفعيل سنة مغلقة'
                            : selected.isActive
                            ? 'هذه السنة هي السنة المالية النشطة حالياً'
                            : 'اعتمد هذه السنة في التقارير الافتراضية'
                        }
                      >
                        <Star
                          className={cn('h-4 w-4', selected.isActive && 'fill-current')}
                        />
                        {selected.isActive ? 'نشطة' : 'تفعيل'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed}
                        onClick={() => setShowEdit(true)}
                        title={selected.isClosed ? 'لا يمكن تعديل سنة مغلقة' : 'تعديل الاسم والتواريخ'}
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed}
                        onClick={() => setShowResync(true)}
                        title={selected.isClosed
                          ? 'لا يمكن إعادة المزامنة لسنة مغلقة'
                          : 'إعادة مزامنة الفترات الشهرية لتطابق تواريخ السنة (تحذف الفترات الخارجة عن النطاق)'}
                      >
                        <RefreshCw className="h-4 w-4" />
                        مزامنة الفترات
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selected.isClosed}
                        onClick={() => setShowDelete(true)}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        title={selected.isClosed ? 'لا يمكن حذف سنة مغلقة' : 'حذف السنة المالية'}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                      {selected.isClosed ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowReopen(true)}
                          className="border-warning/40 text-warning hover:bg-warning/10"
                          title="فك إغلاق السنة المالية وإعادة فتح فتراتها للتعديل"
                        >
                          <LockOpen className="h-4 w-4" />
                          فك الإغلاق
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setShowClose(true)}
                        >
                          <Lock className="h-4 w-4" />
                          إغلاق السنة
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowRollover(true)}
                        disabled={!selected.isClosed}
                        title={selected.isClosed
                          ? 'تدوير أرصدة الميزانية إلى السنة التالية'
                          : 'يجب إغلاق السنة المالية أولاً قبل التدوير'}
                      >
                        <Repeat className="h-4 w-4" />
                        تدوير الأرصدة
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
                    <KV k="من" v={formatDate(selected.startDate)} />
                    <KV k="إلى" v={formatDate(selected.endDate)} />
                    <KV k="إجمالي المدين" v={formatIQD(status?.totalDebits)} />
                    <KV k="إجمالي الدائن" v={formatIQD(status?.totalCredits)} />
                  </div>

                  <Separator />

                  {/* نتيجة الفحص */}
                  {validating ? (
                    <div className="text-xs text-muted-foreground">جاري الفحص...</div>
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
                          ? 'السنة جاهزة للإغلاق'
                          : 'لا يمكن الإغلاق - راجع المشاكل التالية:'}
                      </div>
                      {validation.issues.length > 0 && (
                        <ul className="mt-2 list-inside list-disc text-xs">
                          {validation.issues.map((iss, i) => <li key={i}>{iss}</li>)}
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
                    <CardTitle className="text-base">الفترات الشهرية ({selected.periods.length})</CardTitle>
                    <div className="flex items-center gap-2">
                      {!selected.isClosed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowBulk(true)}
                          className="gap-1.5"
                          title="إغلاق/فتح كل الفترات حتى/من تاريخ معيّن بضغطة واحدة"
                        >
                          <CalendarRange className="h-3.5 w-3.5" />
                          إغلاق/فتح بالجملة
                        </Button>
                      )}
                      {selected.isClosed && (
                        <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-[11px] text-warning">
                          السنة مغلقة — فك الإغلاق أولاً للتعديل
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-16">رقم</th>
                        <th>من</th>
                        <th>إلى</th>
                        <th>الحالة</th>
                        <th className="w-44 text-center">عمليات</th>
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

      {showRollover && selected && years && (
        <RolloverModal
          source={selected}
          years={years}
          onClose={() => setShowRollover(false)}
          onSuccess={() => {
            setShowRollover(false);
            qc.invalidateQueries({ queryKey: ['fiscal-years'] });
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
        toast.success('تم تحديث حالة الفترة');
        onStatusChanged();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشلت العملية');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشلت العملية'),
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
          {PERIOD_STATUS_LABEL[period.status] ?? period.statusText}
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
              title={canModify ? 'فتح الفترة' : 'فك إغلاق السنة أولاً'}
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
              title={canModify ? 'إغلاق الفترة (يمنع إنشاء/تعديل قيود فيها)' : 'السنة مغلقة'}
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
              !canModify ? 'فك إغلاق السنة أولاً'
                : isLocked ? 'الفترة مقفلة — افتحها أولاً'
                : 'تعديل تواريخ الفترة (إذا لم تحوي قيوداً تتجاوز النطاق الجديد)'
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
              !canModify ? 'فك إغلاق السنة أولاً'
                : isLocked ? 'الفترة مقفلة — افتحها أولاً'
                : 'حذف الفترة (يُرفض إذا حوت قيوداً)'
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
  // يفتح القيد في صفحة التعديل — حيث يمكن للمستخدم ترحيله أو حذفه.
  const linkFor = (id: number) => `/accounting/journal/${id}/edit`;
  return (
    <div className="mt-3 rounded-md border border-destructive/20 bg-background/60 p-2.5">
      <div className="mb-1.5 text-xs font-semibold text-foreground/90">
        القيود غير المرحَّلة (افتح كل قيد لترحيله أو حذفه):
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
                  {e.description}
                </span>
              </div>
              <Link
                to={linkFor(e.id)}
                className="shrink-0 inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent/40"
                title="فتح القيد"
              >
                <ExternalLink className="h-3 w-3" />
                فتح
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
  /** حجم الـ modal: 'md' (افتراضي) | 'lg' للنوافذ الأوسع | 'xl' للأكبر. */
  size?: 'md' | 'lg' | 'xl';
}) {
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
            aria-label="إغلاق"
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
  const now = new Date();
  const year = now.getFullYear() + 1;
  const [name, setName] = useState(`السنة المالية ${year}`);
  const [startDate, setStartDate] = useState(`${year}-01-01`);
  const [endDate, setEndDate] = useState(`${year}-12-31`);

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.create({ name, startDate, endDate }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم إنشاء السنة المالية');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? 'فشل الإنشاء');
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'فشل الإنشاء');
    },
  });

  return (
    <Modal title="إنشاء سنة مالية جديدة" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label className="mb-1.5 block text-xs">الاسم</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="السنة المالية 2027" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> من
            </Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> إلى
            </Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'جاري الإنشاء...' : 'إنشاء'}
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
  const [forceClose, setForceClose] = useState(false);
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.close(fy.id, { forceClose }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم إغلاق السنة المالية');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? 'فشل الإغلاق');
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'فشل الإغلاق');
    },
  });

  return (
    <Modal title={`إغلاق ${fy.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="h-4 w-4" />
            تحذير
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            إغلاق السنة المالية يحوّل جميع فتراتها إلى حالة "مقفلة" ولا يمكن تعديل القيود فيها بعد ذلك.
          </p>
        </div>

        {!canClose && issues.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">المشاكل المكتشفة:</div>
            <ul className="mt-1.5 list-inside list-disc text-xs text-destructive/80">
              {issues.map((i, idx) => <li key={idx}>{i}</li>)}
            </ul>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={forceClose}
                onChange={e => setForceClose(e.target.checked)}
                className="rounded"
              />
              <span>إغلاق قسري (لا يُنصح به)</span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            variant="default"
            onClick={() => m.mutate()}
            disabled={m.isPending || (!canClose && !forceClose)}
          >
            {m.isPending ? 'جاري الإغلاق...' : 'تأكيد الإغلاق'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RolloverModal({
  source, years, onClose, onSuccess,
}: {
  source: FiscalYearDto;
  years: FiscalYearDto[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const candidates = years.filter(y => y.id !== source.id && new Date(y.startDate) > new Date(source.endDate));
  const [targetId, setTargetId] = useState<number | null>(candidates[0]?.id ?? null);
  // ‎ثلاثة أنماط: 1=مع الربح/الخسارة، 2=بدون تغيير (ميزانية)، 3=ترحيل كامل
  const [mode, setMode] = useState<1 | 2 | 3>(1);
  // ‎نخزّن id الحساب للعرض في AccountPicker، ونرسل الكود للـ API لأن الـ backend يستقبل code
  const [profitAccountId, setProfitAccountId] = useState<number | null>(null);
  const [lossAccountId, setLossAccountId] = useState<number | null>(null);
  const [previewOnly, setPreviewOnly] = useState(true);

  // ‎جلب شجرة الحسابات لاستخدامها في الـ AccountPicker
  const treeQuery = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: accountingApi.getTree,
  });
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

  const rollM = useMutation({
    mutationFn: () => fiscalYearsApi.rollover({
      sourceFiscalYearId: source.id,
      targetFiscalYearId: targetId!,
      profitAccountCode: mode === 1 ? profitCode : null,
      lossAccountCode: mode === 1 ? lossCode : null,
      mode,
      previewOnly,
    }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message ?? 'تم التدوير');
        if (!previewOnly) onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل التدوير');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشل التدوير'),
  });

  const undoM = useMutation({
    mutationFn: () => fiscalYearsApi.undoRollover({
      targetFiscalYearId: targetId!,
      reopenSource: true,
    }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.data?.message ?? 'تم التراجع عن التدوير');
        qc.invalidateQueries({ queryKey: ['fiscal-years'] });
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل التراجع');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشل التراجع'),
  });

  return (
    <Modal title="تدوير الأرصدة" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        {!source.isClosed && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              السنة المصدر مفتوحة — يجب إغلاقها أولاً
            </div>
            <p className="mt-1">
              لضمان ثبات الأرصدة، يجب إغلاق السنة المالية المصدر قبل تدوير أرصدتها.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block text-xs">من السنة</Label>
            <Input value={source.name} disabled />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">إلى السنة</Label>
            {candidates.length === 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
                لا توجد سنة مالية لاحقة. أنشئ سنة جديدة أولاً.
              </div>
            ) : (
              <select
                value={targetId ?? ''}
                onChange={e => setTargetId(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {candidates.map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* اختيار نمط التدوير - 3 بطاقات */}
        <div className="space-y-2">
          <Label className="text-xs">نمط التدوير</Label>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setMode(1)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                mode === 1 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">1) إقفال مع الربح/الخسارة</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  يدوّر حسابات الميزانية (أصول + خصوم + حقوق الملكية) ويحسب صافي
                  الربح/الخسارة من الإيرادات والمصاريف، ثم يرحّله إلى حساب الربح
                  أو الخسارة بحسب الإشارة.
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode(2)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                mode === 2 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">2) ميزانية فقط بدون تغيير</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  ينقل أرصدة الميزانية فقط (أصول + خصوم + حقوق الملكية) كما هي،
                  دون احتساب الربح/الخسارة ودون مساس بالإيرادات والمصاريف.
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode(3)}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2.5 text-right transition',
                mode === 3 ? 'border-primary bg-primary/10' : 'hover:border-foreground/30'
              )}
            >
              <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">3) ترحيل كامل (شامل الإيرادات والمصاريف)</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  يدوّر <span className="font-medium">كل</span> الحسابات الأربعة (أصول/خصوم/حقوق
                  ملكية/إيرادات/مصاريف) كأرصدة افتتاحية في السنة الجديدة.
                  يحفظ الأرصدة كما هي بدون إقفال نتيجة.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* حسابات الأرباح والخسائر — تظهر فقط في mode=1 */}
        {mode === 1 && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1.5 flex items-center gap-1 text-xs">
                  <TrendingUp className="h-3 w-3 text-success" />
                  حساب الأرباح
                  <span className="text-[10px] text-muted-foreground">(يُسجَّل دائناً)</span>
                </Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={profitAccountId}
                  onChange={(id) => setProfitAccountId(id)}
                  placeholder="ابحث برقم أو اسم الحساب..."
                  allowClear
                />
                {profitCode && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    الكود: <span className="num-display">{profitCode}</span>
                  </div>
                )}
              </div>
              <div>
                <Label className="mb-1.5 flex items-center gap-1 text-xs">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  حساب الخسائر
                  <span className="text-[10px] text-muted-foreground">(يُسجَّل مديناً)</span>
                </Label>
                <AccountPicker
                  accounts={leafAccounts}
                  value={lossAccountId}
                  onChange={(id) => setLossAccountId(id)}
                  placeholder="ابحث برقم أو اسم الحساب..."
                  allowClear
                />
                {lossCode && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    الكود: <span className="num-display">{lossCode}</span>
                  </div>
                )}
              </div>
            </div>
            {treeQuery.isLoading && (
              <div className="text-[11px] text-muted-foreground">جارٍ تحميل الحسابات...</div>
            )}
            {!treeQuery.isLoading && leafAccounts.length === 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
                لا توجد حسابات تفصيلية — أنشئ شجرة الحسابات أولاً.
              </div>
            )}
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              يمكنك اختيار أي حساب تفصيلي كحساب أرباح/خسائر (مثل حسابات حقوق
              الملكية أو الاحتياطيات) — لا يوجد قيد على نوع الحساب.
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
          <span>معاينة فقط (بدون تنفيذ — لرؤية النتيجة المتوقعة)</span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          {/* زر التراجع — يحذف القيد الافتتاحي ويفك إغلاق السنة المصدر */}
          <Button
            type="button"
            variant="outline"
            className="border-warning/40 text-warning hover:bg-warning/10"
            disabled={undoM.isPending || !targetId}
            onClick={() => {
              if (!confirm(
                'سيتم حذف القيد الافتتاحي المُدوَّر في السنة الهدف، وتصفير ' +
                'الأرصدة الافتتاحية للحسابات، وفك إغلاق السنة المصدر تلقائياً. ' +
                'هل تريد المتابعة؟'
              )) return;
              undoM.mutate();
            }}
            title="حذف القيد الافتتاحي وإعادة فتح السنة السابقة"
          >
            <Undo2 className="h-4 w-4" />
            {undoM.isPending ? 'جاري التراجع...' : 'تراجع عن التدوير'}
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button
              onClick={() => rollM.mutate()}
              disabled={
                rollM.isPending || !targetId || !source.isClosed ||
                (mode === 1 && (!profitCode || !lossCode))
              }
            >
              {rollM.isPending ? 'جاري التنفيذ...' : (previewOnly ? 'معاينة' : 'تنفيذ التدوير')}
            </Button>
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
  const [name, setName] = useState(fy.name);
  const [startDate, setStartDate] = useState(toDateInput(fy.startDate));
  const [endDate, setEndDate] = useState(toDateInput(fy.endDate));

  // ‎فحص شامل: اسم/تواريخ/تداخل. نُرجع نصاً يشرح السبب الدقيق ليُعرض
  // ‎للمستخدم بدلاً من تعطيل الزر بصمت (تجربة مستخدم محسّنة).
  const validation = (() => {
    if (!name.trim()) return 'الاسم مطلوب';
    if (!startDate) return 'تاريخ البداية مطلوب';
    if (!endDate) {
      return 'تاريخ النهاية مطلوب — تأكّد من إدخال يوم صالح (مثلاً نوفمبر فيه 30 يوماً فقط، فبراير 28/29).';
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime())) return 'تاريخ البداية غير صالح';
    if (isNaN(e.getTime())) return 'تاريخ النهاية غير صالح';
    if (e <= s) return 'تاريخ النهاية يجب أن يكون بعد البداية';
    for (const o of others) {
      const os = new Date(o.startDate);
      const oe = new Date(o.endDate);
      const intersects = (s >= os && s <= oe) || (e >= os && e <= oe) || (s <= os && e >= oe);
      if (intersects) return `الفترة تتداخل مع "${o.name}" (${toDateInput(o.startDate)} → ${toDateInput(o.endDate)})`;
    }
    return null;
  })();

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.update(fy.id, { name: name.trim(), startDate, endDate }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم تحديث السنة المالية');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل التحديث');
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'فشل التحديث');
    },
  });

  // ‎تغيّر شيء؟ (تجنّب إرسال طلب بلا تغييرات)
  const hasChanges =
    name.trim() !== fy.name ||
    startDate !== toDateInput(fy.startDate) ||
    endDate !== toDateInput(fy.endDate);

  return (
    <Modal title={`تعديل ${fy.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label className="mb-1.5 block text-xs">الاسم</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="السنة المالية 2027" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> من
            </Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> إلى
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
            لا توجد تغييرات للحفظ.
          </div>
        )}

        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-muted-foreground">
          ملاحظة: إذا كانت السنة تحتوي على قيود محاسبية، فلا يمكن تقليص نطاقها لما هو أضيق من تواريخ تلك القيود.
          الفترات الشهرية ستُحدَّث تلقائياً.
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !!validation || !hasChanges}
          >
            {m.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
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
  const [confirmText, setConfirmText] = useState('');
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.delete(fy.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم حذف السنة المالية');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? 'فشل الحذف');
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'فشل الحذف');
    },
  });

  const canConfirm = confirmText.trim() === fy.name.trim();

  return (
    <Modal title="حذف سنة مالية" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            هل أنت متأكد من حذف "{fy.name}"؟
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            سيُرفض الحذف إذا كانت السنة تحوي قيوداً محاسبية أو كانت مغلقة.
            إذا تم الحذف، تُحذف جميع فتراتها الشهرية معها.
          </p>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs">
            للتأكيد، اكتب اسم السنة:
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
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => m.mutate()}
            disabled={m.isPending || !canConfirm}
          >
            {m.isPending ? 'جاري الحذف...' : 'تأكيد الحذف'}
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
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.reopen(fy.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم فك إغلاق السنة المالية');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل فك الإغلاق');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشل فك الإغلاق'),
  });

  return (
    <Modal title={`فك إغلاق ${fy.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <Unlock className="h-4 w-4" />
            تأكيد فك الإغلاق
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ستُعاد جميع فترات السنة إلى حالة "مفتوحة"، وسيُسمح بإنشاء/تعديل/حذف القيود فيها مجدداً.
            استخدم هذه العملية بحذر — إذا كنت قد دوّرت الأرصدة إلى سنة لاحقة سيُرفض الطلب
            حتى تحذف القيد الافتتاحي في السنة اللاحقة أولاً.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
          >
            {m.isPending ? 'جاري فك الإغلاق...' : 'تأكيد فك الإغلاق'}
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
  const [startDate, setStartDate] = useState(toDateInput(period.startDate));
  const [endDate, setEndDate] = useState(toDateInput(period.endDate));

  // ‎فحوصات سريعة على المتصفح قبل الإرسال (تجنّب round-trip للسيرفر)
  const validation = (() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (e <= s) return 'تاريخ النهاية يجب أن يكون بعد البداية';
    const fyStart = new Date(toDateInput(fy.startDate));
    const fyEnd = new Date(toDateInput(fy.endDate));
    if (s < fyStart || e > fyEnd)
      return `الفترة يجب أن تقع ضمن نطاق السنة (${toDateInput(fy.startDate)} → ${toDateInput(fy.endDate)})`;
    for (const o of siblings) {
      const os = new Date(toDateInput(o.startDate));
      const oe = new Date(toDateInput(o.endDate));
      const intersects = (s >= os && s <= oe) || (e >= os && e <= oe) || (s <= os && e >= oe);
      if (intersects) return `تتداخل مع الفترة رقم ${o.periodNumber}`;
    }
    return null;
  })();

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.updatePeriod(period.id, { startDate, endDate }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم تحديث الفترة');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل التحديث');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشل التحديث'),
  });

  return (
    <Modal title={`تعديل الفترة ${period.periodNumber}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> من
            </Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> إلى
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
          ملاحظة: إذا كانت الفترة تحتوي على قيود محاسبية، فلا يمكن تقليص نطاقها لما هو أضيق من تواريخ تلك القيود.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !!validation || !startDate || !endDate}
          >
            {m.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
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
  const m = useMutation({
    mutationFn: () => fiscalYearsApi.deletePeriod(period.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('تم حذف الفترة');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشل الحذف');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشل الحذف'),
  });

  return (
    <Modal title={`حذف الفترة ${period.periodNumber}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            هل أنت متأكد من حذف الفترة رقم {period.periodNumber}؟
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ({formatDate(period.startDate)} → {formatDate(period.endDate)})
            <br />
            سيُرفض الحذف إذا كانت الفترة تحوي قيوداً محاسبية. هذه العملية لا يمكن التراجع عنها.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => m.mutate()}
            disabled={m.isPending}
          >
            {m.isPending ? 'جاري الحذف...' : 'تأكيد الحذف'}
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
  // ‎معاينة محلية: عدد الفترات الفارغة الخارجة عن النطاق.
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
        toast.success(res.data?.message ?? 'تمت إعادة المزامنة');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشلت إعادة المزامنة');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشلت إعادة المزامنة'),
  });

  return (
    <Modal title="إعادة مزامنة الفترات الشهرية" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          ستُحذَف الفترات الفارغة الخارجة عن نطاق السنة المالية، وتُعدَّل
          حدود الفترات المتبقّية لتطابق <span className="font-medium text-foreground">
            {formatDate(fy.startDate)} → {formatDate(fy.endDate)}
          </span>. لن تُمَس الفترات التي تحتوي قيوداً.
        </div>

        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">الفترات الحالية:</span>
            <span className="font-bold">{fy.periods.length}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">فترات خارج النطاق (ستُحذَف إن كانت فارغة):</span>
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
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            <RefreshCw className="h-4 w-4" />
            {m.isPending ? 'جاري المزامنة...' : 'إعادة المزامنة'}
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
  // ‎الافتراضي: إغلاق حتى نهاية الشهر الحالي.
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
        toast.success(res.data?.message ?? res.message ?? 'تمّت العملية');
        onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? res.message ?? 'فشلت العملية');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'فشلت العملية'),
  });

  const statusLabel = (s: 1 | 2 | 3) =>
    s === 1 ? 'مفتوحة' : s === 2 ? 'مغلقة' : 'مقفلة نهائياً';

  // ‎تنبيهات الإدخال غير المنطقي.
  const dateOutOfRange =
    !!date && (date < fyStart || date > fyEnd);

  return (
    <Modal title="إغلاق/فتح الفترات الشهرية بالجملة" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          السنة المالية: <span className="font-medium text-foreground">{fy.name}</span>
          {' '}({formatDate(fy.startDate)} → {formatDate(fy.endDate)})
        </div>

        {/* اختيار العملية */}
        <div className="space-y-2">
          <Label>نوع العملية</Label>
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
                <div className="font-medium">إغلاق حتى تاريخ</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  يطبَّق على كل الفترات التي تنتهي في تاريخ ≤ التاريخ المحدّد
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
                <div className="font-medium">فتح من تاريخ</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  يطبَّق على كل الفترات التي تبدأ في تاريخ ≥ التاريخ المحدّد
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* الحالة المرغوبة */}
        <div className="space-y-2">
          <Label>الحالة المرغوبة</Label>
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

        {/* التاريخ */}
        <div className="space-y-2">
          <Label htmlFor="bulk-date">التاريخ المرجعي</Label>
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
              التاريخ يجب أن يقع داخل حدود السنة المالية.
            </p>
          )}
        </div>

        {/* المعاينة */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">عدد الفترات التي ستتأثّر:</span>
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
              لا توجد فترات مطابقة للمعايير الحالية، أو جميعها بالحالة المطلوبة بالفعل.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !date || dateOutOfRange || preview.count === 0}
          >
            {m.isPending ? 'جاري التطبيق...' : `تطبيق على ${preview.count} فترة`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
