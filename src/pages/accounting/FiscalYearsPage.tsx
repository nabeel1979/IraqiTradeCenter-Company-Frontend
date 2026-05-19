import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Repeat,
  Eye,
  Calendar,
  X,
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
import { formatDate, formatIQD, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FiscalYearDto, AccountingPeriodStatus } from '@/types/api';

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
  const [showRollover, setShowRollover] = useState(false);

  const { data: years, isLoading } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: () => fiscalYearsApi.getAll(),
  });

  const selected = years?.find(y => y.id === selectedId) ?? years?.[0] ?? null;

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
                    'w-full rounded-md border px-3 py-2.5 text-right transition-colors',
                    selected?.id === y.id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/50 hover:bg-accent/40'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{y.name}</span>
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
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDate(y.startDate, { short: true })} → {formatDate(y.endDate, { short: true })}
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
                        variant={selected.isClosed ? 'outline' : 'default'}
                        disabled={selected.isClosed}
                        onClick={() => setShowClose(true)}
                      >
                        <Lock className="h-4 w-4" />
                        {selected.isClosed ? 'مغلقة' : 'إغلاق السنة'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowRollover(true)}>
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
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* جدول الفترات */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">الفترات الشهرية ({selected.periods.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-16">رقم</th>
                        <th>من</th>
                        <th>إلى</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.periods.map(p => (
                        <tr key={p.id}>
                          <td className="num-display text-xs">{p.periodNumber}</td>
                          <td>{formatDate(p.startDate)}</td>
                          <td>{formatDate(p.endDate)}</td>
                          <td>
                            <span className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs',
                              PERIOD_STATUS_CLASS[p.status]
                            )}>
                              {PERIOD_STATUS_LABEL[p.status] ?? p.statusText}
                            </span>
                          </td>
                        </tr>
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent/40"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>{children}</CardContent>
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
  const candidates = years.filter(y => y.id !== source.id && new Date(y.startDate) > new Date(source.endDate));
  const [targetId, setTargetId] = useState<number | null>(candidates[0]?.id ?? null);
  const [retainedCode, setRetainedCode] = useState('3100');
  const [previewOnly, setPreviewOnly] = useState(true);

  const m = useMutation({
    mutationFn: () => fiscalYearsApi.rollover({
      sourceFiscalYearId: source.id,
      targetFiscalYearId: targetId!,
      retainedEarningsCode: retainedCode,
      previewOnly,
    }),
    onSuccess: (res) => {
      if (res.success) {
        const d = res.data;
        toast.success(d?.message ?? 'تم التدوير');
        if (!previewOnly) onSuccess();
      } else {
        toast.error(res.errors?.[0] ?? 'فشل التدوير');
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'فشل التدوير');
    },
  });

  return (
    <Modal title="تدوير الأرصدة" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <Label className="mb-1.5 block text-xs">من السنة</Label>
          <Input value={source.name} disabled />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">إلى السنة</Label>
          {candidates.length === 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
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
        <div>
          <Label className="mb-1.5 block text-xs">رمز حساب الأرباح المحتجزة</Label>
          <Input value={retainedCode} onChange={e => setRetainedCode(e.target.value)} placeholder="3100" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={previewOnly}
            onChange={e => setPreviewOnly(e.target.checked)}
            className="rounded"
          />
          <span>معاينة فقط (بدون تنفيذ)</span>
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !targetId}
          >
            {m.isPending ? 'جاري التنفيذ...' : (previewOnly ? 'معاينة' : 'تنفيذ التدوير')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
