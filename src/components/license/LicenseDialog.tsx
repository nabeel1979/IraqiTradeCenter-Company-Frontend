import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, ShieldCheck, ShieldAlert, ShieldOff, KeyRound, Wallet,
  CreditCard, History, Loader2, CheckCircle2, AlertCircle,
  FlaskConical, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { licenseApi, type LicenseStatus, type ActivationRow } from '@/lib/api/license';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';

interface LicenseDialogProps {
  open: boolean;
  onClose: () => void;
}

const DAY_PACKAGES = [
  { days: 30,  label: 'شهر'      },
  { days: 90,  label: '3 أشهر'   },
  { days: 180, label: '6 أشهر'   },
  { days: 365, label: 'سنة كاملة' },
];

/**
 * حوار إدارة ترخيص النظام — يُتيح:
 *   1) عرض حالة الترخيص الحالية (تاريخ الانتهاء + الأيام المتبقية)
 *   2) إدخال شفرة تفعيل وتطبيقها فوراً
 *   3) شراء أيام إضافية من المحفظة أو ببطاقة الدفع
 *   4) عرض سجلّ آخر التفعيلات
 *
 * الحوار يقفل بالـ Escape أو بالنقر على الخلفية. لا يُغلق ذاتياً بعد عمليّة
 * تطبيق ناجحة كي يرى المستخدم النتيجة ويعود لشاشات النظام بإرادته.
 */
export function LicenseDialog({ open, onClose }: LicenseDialogProps) {
  const qc = useQueryClient();
  const { can } = usePermissions();

  const canApply    = can(PERMS.System.License.Apply);
  const canGenerate = can(PERMS.System.License.Generate);

  const [code, setCode]               = useState('');
  const [busy, setBusy]               = useState<'apply' | 'wallet' | 'card' | 'test-expire' | 'test-restore' | null>(null);
  const [feedback, setFeedback]       = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // إغلاق Esc + قفل scroll الخلفية + تنظيف الحالة عند الإغلاق
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCode('');
      setBusy(null);
      setFeedback(null);
    }
  }, [open]);

  const statusQuery = useQuery({
    queryKey: ['license', 'status'],
    queryFn:  licenseApi.status,
    enabled:  open,
    staleTime: 5_000,
  });
  const historyQuery = useQuery({
    queryKey: ['license', 'history'],
    queryFn:  () => licenseApi.history(10),
    enabled:  open,
    staleTime: 10_000,
  });

  const status = statusQuery.data;

  const applyMut = useMutation({
    mutationFn: (c: string) => licenseApi.apply(c),
    onSuccess: (row) => {
      setFeedback({ type: 'success', text: `تمّ التفعيل بنجاح: +${row.days} يوم (حتى ${formatDateAr(row.endDate)})` });
      setCode('');
      void qc.invalidateQueries({ queryKey: ['license'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (e: unknown) => {
      setFeedback({ type: 'error', text: extractError(e) });
    },
    onSettled: () => setBusy(null),
  });

  const walletMut = useMutation({
    mutationFn: (days: number) => licenseApi.buyWithWallet(days),
    onSuccess: (row) => {
      setFeedback({ type: 'success', text: `تمّ شراء ${row.days} يوم من المحفظة — الترخيص نشط حتى ${formatDateAr(row.endDate)}` });
      void qc.invalidateQueries({ queryKey: ['license'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (e: unknown) => setFeedback({ type: 'error', text: extractError(e) }),
    onSettled: () => setBusy(null),
  });

  const cardMut = useMutation({
    mutationFn: (days: number) => licenseApi.buyWithCard(days),
    onSuccess: (result) => {
      setFeedback({
        type: 'success',
        text: result.message ?? `طلب شراء ${result.days} يوم بقيمة ${formatMoney(result.amount)} ${result.currency} (${result.status})`,
      });
    },
    onError: (e: unknown) => setFeedback({ type: 'error', text: extractError(e) }),
    onSettled: () => setBusy(null),
  });

  const testExpireMut = useMutation({
    mutationFn: () => licenseApi.testExpire(),
    onSuccess: () => {
      setFeedback({
        type: 'success',
        text: 'تمّ إنهاء الترخيص للاختبار — النظام الآن في وضع قراءة فقط.',
      });
      void qc.invalidateQueries({ queryKey: ['license'] });
    },
    onError: (e: unknown) => setFeedback({ type: 'error', text: extractError(e) }),
    onSettled: () => setBusy(null),
  });

  const testRestoreMut = useMutation({
    mutationFn: () => licenseApi.testRestore(30),
    onSuccess: () => {
      setFeedback({
        type: 'success',
        text: 'تمّ تجديد الترخيص للاختبار بـ 30 يوم — النظام نشط الآن.',
      });
      void qc.invalidateQueries({ queryKey: ['license'] });
    },
    onError: (e: unknown) => setFeedback({ type: 'error', text: extractError(e) }),
    onSettled: () => setBusy(null),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/*
        ‎الحوار مُثبَّت في الأعلى دائماً حتى لا يختفي عنوانه فوق الـ viewport عند
        ‎الشاشات القصيرة (laptops 13"). الـ overlay نفسه قابل للتمرير لو زاد المحتوى
        ‎عن ارتفاع الشاشة.
      */}
      <div className="flex min-h-full items-start justify-center p-3 sm:items-center sm:p-4">
        <div
          className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="ترخيص النظام"
        >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <StatusIcon status={status} />
            <div>
              <h3 className="font-display text-sm font-semibold leading-tight">ترخيص النظام</h3>
              <p className="text-[10px] text-muted-foreground">
                {status?.companyKey ? `كود الشركة: ${status.companyKey}` : 'جارٍ القراءة...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-3.5 py-3">
          {/* قسم 1: الحالة الحالية */}
          <StatusPanel status={status} loading={statusQuery.isLoading} />

          {feedback && (
            <FeedbackBanner
              kind={feedback.type}
              text={feedback.text}
              onClose={() => setFeedback(null)}
            />
          )}

          {/* قسم 2: تطبيق شفرة */}
          {canApply && (
            <section className="mt-3 rounded-md border border-border bg-secondary/30 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-xs font-semibold">تطبيق شفرة تفعيل</h4>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row">
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="ITC-XXXX-NNN-YYYYMMDD-SSSSSSSS"
                  className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  dir="ltr"
                  disabled={busy === 'apply'}
                />
                <button
                  type="button"
                  onClick={() => { setBusy('apply'); setFeedback(null); applyMut.mutate(code.trim()); }}
                  disabled={!code.trim() || busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === 'apply' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  تطبيق
                </button>
              </div>
            </section>
          )}

          {/* قسم 3: شراء أيام */}
          {canApply && (
            <section className="mt-3 rounded-md border border-border bg-secondary/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <h4 className="text-xs font-semibold">شراء أيام إضافية</h4>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  <span className="font-semibold tnum text-foreground">{status ? formatMoney(status.pricePerDay) : '—'}</span>{' '}
                  {status?.currency ?? 'IQD'}/يوم
                </span>
              </div>

              <BuyDaysGrid
                status={status}
                busy={busy}
                onBuy={(days, method) => {
                  setBusy(method);
                  setFeedback(null);
                  if (method === 'wallet') walletMut.mutate(days);
                  else                     cardMut.mutate(days);
                }}
              />
            </section>
          )}

          {/* قسم 4: أدوات الاختبار (للمسؤول الأعلى فقط) */}
          {canGenerate && (
            <section className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-amber-500" />
                <h4 className="text-xs font-semibold text-amber-500">أدوات اختبار</h4>
                <span className="ms-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-500">
                  مسؤول فقط
                </span>
              </div>
              <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
                يُعدِّل تاريخ انتهاء آخر تفعيل للتحقّق من سلوك "قراءة فقط" بدون انتظار الانتهاء الفعلي.
                التغيير يُحفظ موقَّعاً ضمن سلسلة التواقيع (Hash Chain).
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBusy('test-expire');
                    setFeedback(null);
                    testExpireMut.mutate();
                  }}
                  disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === 'test-expire'
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ShieldOff className="h-3.5 w-3.5" />}
                  إنهاء فوري
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBusy('test-restore');
                    setFeedback(null);
                    testRestoreMut.mutate();
                  }}
                  disabled={busy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === 'test-restore'
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RotateCcw className="h-3.5 w-3.5" />}
                  إعادة + 30 يوم
                </button>
              </div>
            </section>
          )}

          {/* قسم 5: سجلّ التفعيلات */}
          <section className="mt-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-xs font-semibold">آخر التفعيلات</h4>
            </div>
            <HistoryList rows={historyQuery.data} loading={historyQuery.isLoading} />
          </section>
        </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatusIcon({ status }: { status: LicenseStatus | undefined }) {
  const base = 'flex h-8 w-8 items-center justify-center rounded-md';
  if (!status) {
    return (
      <span className={cn(base, 'bg-secondary text-muted-foreground')}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    );
  }
  if (status.isExpired && !status.isInGrace) {
    return (
      <span className={cn(base, 'bg-rose-500/15 text-rose-400')}>
        <ShieldOff className="h-4 w-4" />
      </span>
    );
  }
  if (status.isInGrace || status.daysRemaining < 7) {
    return (
      <span className={cn(base, 'bg-amber-500/15 text-amber-400')}>
        <ShieldAlert className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className={cn(base, 'bg-emerald-500/15 text-emerald-400')}>
      <ShieldCheck className="h-4 w-4" />
    </span>
  );
}

function StatusPanel({ status, loading }: { status: LicenseStatus | undefined; loading: boolean }) {
  if (loading || !status) {
    return (
      <div className="rounded-md border border-border bg-secondary/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ التحقّق...
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      <StatCard
        label="متبقّي"
        value={status.isExpired && !status.isInGrace ? 'منتهٍ' : `${status.daysRemaining}`}
        suffix={!(status.isExpired && !status.isInGrace) ? 'يوم' : undefined}
        tone={status.isExpired && !status.isInGrace ? 'critical' : status.daysRemaining < 7 ? 'warning' : 'healthy'}
      />
      <StatCard
        label="ينتهي"
        value={status.endDateUtc ? formatDateShort(status.endDateUtc) : '—'}
        tone="neutral"
      />
      <StatCard
        label="المحفظة"
        value={formatMoney(status.walletBalance)}
        suffix={status.currency}
        tone="neutral"
      />
    </div>
  );
}

function StatCard({
  label, value, suffix, tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: 'healthy' | 'warning' | 'critical' | 'neutral';
}) {
  const toneClasses: Record<string, string> = {
    healthy:  'border-emerald-500/25 bg-emerald-500/5',
    warning:  'border-amber-500/25 bg-amber-500/5',
    critical: 'border-rose-500/25 bg-rose-500/5',
    neutral:  'border-border bg-secondary/30',
  };
  const valueClasses: Record<string, string> = {
    healthy:  'text-emerald-400',
    warning:  'text-amber-400',
    critical: 'text-rose-400',
    neutral:  'text-foreground',
  };

  return (
    <div className={cn('flex flex-col gap-0.5 rounded-md border px-2 py-1.5', toneClasses[tone])}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn('flex items-baseline gap-1', valueClasses[tone])}>
        <span className="text-sm font-bold tnum leading-none">{value}</span>
        {suffix && <span className="text-[10px] font-normal opacity-70">{suffix}</span>}
      </div>
    </div>
  );
}

function BuyDaysGrid({
  status, busy, onBuy,
}: {
  status: LicenseStatus | undefined;
  busy: 'apply' | 'wallet' | 'card' | 'test-expire' | 'test-restore' | null;
  onBuy: (days: number, method: 'wallet' | 'card') => void;
}) {
  const [selected, setSelected] = useState<number>(30);
  const cost = useMemo(() => (status ? status.pricePerDay * selected : 0), [status, selected]);
  const enoughWallet = status ? status.walletBalance >= cost : false;

  return (
    <>
      <div className="grid grid-cols-4 gap-1.5">
        {DAY_PACKAGES.map(p => (
          <button
            key={p.days}
            type="button"
            onClick={() => setSelected(p.days)}
            className={cn(
              'flex flex-col items-center gap-0 rounded-md border py-1.5 transition-colors',
              selected === p.days
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-secondary/40 text-foreground hover:border-primary/40 hover:bg-secondary',
            )}
          >
            <span className="text-sm font-bold tnum leading-tight">{p.days}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-[11px]">
        <span className="text-muted-foreground">الإجمالي:</span>
        <span className="font-bold tnum text-foreground">
          {formatMoney(cost)} {status?.currency ?? 'IQD'}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onBuy(selected, 'wallet')}
          disabled={busy !== null || !enoughWallet}
          title={enoughWallet ? 'الدفع من رصيد المحفظة' : 'الرصيد غير كافٍ'}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
            enoughWallet
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
              : 'border-border bg-secondary/30 text-muted-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {busy === 'wallet' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
          المحفظة
        </button>
        <button
          type="button"
          onClick={() => onBuy(selected, 'card')}
          disabled={busy !== null}
          title="الدفع ببطاقة (قيد التكامل)"
          className="flex items-center justify-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'card' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          بطاقة
        </button>
      </div>
    </>
  );
}

function HistoryList({ rows, loading }: { rows: ActivationRow[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
        <Loader2 className="inline h-3 w-3 animate-spin" /> جارٍ التحميل...
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-secondary/20 p-2 text-center text-[11px] text-muted-foreground">
        لا توجد عمليات تفعيل سابقة.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-[11px]">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-1.5 py-1 text-right font-medium">التاريخ</th>
            <th className="px-1.5 py-1 text-right font-medium">المصدر</th>
            <th className="px-1.5 py-1 text-right font-medium">الأيام</th>
            <th className="px-1.5 py-1 text-right font-medium">حتى</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-1.5 py-1 tnum text-muted-foreground">{formatDateShort(r.appliedAt)}</td>
              <td className="px-1.5 py-1"><SourceBadge source={r.source} /></td>
              <td className="px-1.5 py-1 tnum font-medium">+{r.days}</td>
              <td className="px-1.5 py-1 tnum text-muted-foreground">{formatDateShort(r.endDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    Code:   { label: 'شفرة',  cls: 'bg-primary/10 text-primary' },
    Wallet: { label: 'محفظة', cls: 'bg-emerald-500/10 text-emerald-400' },
    Card:   { label: 'بطاقة', cls: 'bg-sky-500/10 text-sky-400' },
  };
  const m = map[source] ?? { label: source, cls: 'bg-secondary text-muted-foreground' };
  return <span className={cn('rounded px-1 py-0 text-[9px] font-medium', m.cls)}>{m.label}</span>;
}

function FeedbackBanner({
  kind, text, onClose,
}: {
  kind: 'success' | 'error';
  text: string;
  onClose: () => void;
}) {
  const isSuccess = kind === 'success';
  return (
    <div
      className={cn(
        'mt-3 flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
        isSuccess
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
      )}
    >
      {isSuccess ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <p className="flex-1 leading-snug">{text}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 opacity-60 hover:opacity-100"
        aria-label="إغلاق"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatDateAr(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ar-IQ', {
      year: 'numeric', month: 'short', day: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ar-IQ', {
      month: 'numeric', day: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

function formatMoney(n: number): string {
  try {
    return new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 3 }).format(n);
  } catch {
    return n.toLocaleString();
  }
}

function extractError(e: unknown): string {
  const anyErr = e as { response?: { data?: { errors?: string[]; message?: string; code?: string } }; message?: string };
  return (
    anyErr?.response?.data?.errors?.[0]
    ?? anyErr?.response?.data?.message
    ?? anyErr?.message
    ?? 'حدث خطأ غير متوقع'
  );
}
