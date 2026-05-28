import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  X, ShieldCheck, ShieldAlert, ShieldOff, KeyRound, Wallet,
  CreditCard, History, Loader2, CheckCircle2, AlertCircle,
  FlaskConical, RotateCcw, Building2, ChevronDown, ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  licenseApi,
  TERMINAL_CARD_STATUSES,
  type LicenseStatus,
  type ActivationRow,
} from '@/lib/api/license';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale } from '@/lib/i18n/useLocale';

interface LicenseDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * بطاقة ترخيص النظام — تستخدم HTML <dialog> الأصلي مع showModal() لتظهر في
 * المتصفح كـ "top layer" حقيقي فوق كل العناصر الأخرى (Sidebar, TopBar, إلخ)
 * بدون الحاجة لـ z-index عالٍ ولا لـ focus tricks ولا scroll workarounds.
 *
 * المتصفح يتولى:
 *   • Backdrop (عبر ::backdrop pseudo-element).
 *   • قفل scroll الصفحة الأم تلقائياً.
 *   • Focus trap داخل الـ dialog.
 *   • Esc للإغلاق.
 *
 * نحن نضيف:
 *   • تصميم compact يلائم شاشات 1024×600 دون scroll عادةً.
 *   • أقسام قابلة للطي (collapsible) للمحتوى الإضافي.
 *   • Body بـ overflow-y-auto كحاجز أمان لو احتاج المحتوى لـ scroll داخلي.
 */
export function LicenseDialog({ open, onClose }: LicenseDialogProps) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { locale, isRtl, direction } = useLocale();
  const { can, isSuper } = usePermissions();

  const canApply    = isSuper || can(PERMS.System.License.Apply);
  const canGenerate = isSuper || can(PERMS.System.License.Generate);

  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const [code, setCode]                 = useState('');
  const [busy, setBusy]                 = useState<'apply' | 'wallet' | 'card' | 'test-expire' | 'test-restore' | null>(null);
  const [expireType, setExpireType]     = useState<'natural' | 'canceled' | 'warning'>('natural');
  const [feedback, setFeedback]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHistory, setShowHistory]   = useState(false);
  const [showTestTools, setShowTestTools] = useState(false);
  /**
   * جلسة دفع بطاقة نشطة عبر QiCard. عندما تكون مُعرَّفة، نُظهر شريط "في انتظار
   * الدفع..." ونُفعّل polling على /license/qicard/status/{sessionId} كل 3 ثوانٍ
   * حتى تصبح الحالة نهائية.
   */
  const [cardSession, setCardSession]   = useState<{
    sessionId: string;
    formUrl:   string;
    amount:    number;
    currency:  string;
    days:      number;
  } | null>(null);

  const dayPackages = useMemo(
    () => [
      { days: 30,  label: t('license.buy.pkg.month')    },
      { days: 90,  label: t('license.buy.pkg.3months')  },
      { days: 180, label: t('license.buy.pkg.6months')  },
      { days: 365, label: t('license.buy.pkg.fullYear') },
    ],
    [t],
  );

  // ‎مزامنة props.open مع dialog.showModal()/dialog.close()
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      try { dlg.showModal(); } catch { /* fallback for very old browsers */ dlg.setAttribute('open', ''); }
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // ‎إعادة تهيئة الحالة عند الإغلاق
  useEffect(() => {
    if (!open) {
      setCode('');
      setBusy(null);
      setFeedback(null);
      setShowHistory(false);
      setShowTestTools(false);
      setCardSession(null);
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
    enabled:  open && showHistory,
    staleTime: 10_000,
  });

  const status = statusQuery.data;

  const applyMut = useMutation({
    mutationFn: (c: string) => licenseApi.apply(c),
    onSuccess: (row) => {
      setFeedback({
        type: 'success',
        text: t('license.apply.success', { days: row.days, date: formatDate(row.endDate, locale) }),
      });
      setCode('');
      void qc.invalidateQueries({ queryKey: ['license'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError:   (e: unknown) => setFeedback({ type: 'error', text: extractError(e, t) }),
    onSettled: () => setBusy(null),
  });

  const walletMut = useMutation({
    mutationFn: (days: number) => licenseApi.buyWithWallet(days),
    onSuccess: (row) => {
      setFeedback({
        type: 'success',
        text: t('license.buy.successWallet', { days: row.days, date: formatDate(row.endDate, locale) }),
      });
      void qc.invalidateQueries({ queryKey: ['license'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError:   (e: unknown) => setFeedback({ type: 'error', text: extractError(e, t) }),
    onSettled: () => setBusy(null),
  });

  const cardMut = useMutation({
    mutationFn: (days: number) => licenseApi.buyWithCard(days),
    onSuccess: (result) => {
      // ‎لو QiCard مُفعَّل في الباكاند: نتلقّى formUrl + sessionId → نفتح صفحة الدفع
      // ‎في تبويب جديد ونُفعّل الـ polling. وإلّا (Enabled=false) نعرض الرسالة العادية.
      if (result.formUrl && result.sessionId) {
        setCardSession({
          sessionId: result.sessionId,
          formUrl:   result.formUrl,
          amount:    result.amount,
          currency:  result.currency,
          days:      result.days,
        });
        setFeedback(null);
        window.open(result.formUrl, '_blank', 'noopener,noreferrer');
      } else {
        setFeedback({
          type: 'success',
          text: result.message ?? t('license.buy.purchaseRequest', {
            days: result.days,
            amount: formatMoney(result.amount),
            currency: result.currency,
          }),
        });
      }
    },
    onError:   (e: unknown) => setFeedback({ type: 'error', text: extractError(e, t) }),
    onSettled: () => setBusy(null),
  });

  // ‎polling لجلسة الدفع النشطة — كل 3 ثوانٍ نسأل الباكاند عن الحالة، وعند
  // ‎الوصول إلى حالة نهائية نوقف ونعكس النتيجة في الـ UI.
  const cardStatusQuery = useQuery({
    queryKey: ['license', 'cardStatus', cardSession?.sessionId],
    queryFn:  () => licenseApi.cardPaymentStatus(cardSession!.sessionId),
    enabled:  open && !!cardSession,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s && (TERMINAL_CARD_STATUSES as readonly string[]).includes(s)) return false;
      return 3000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  // ‎reaction على نتائج الـ polling: نعرض Banner + ننعش بيانات الترخيص.
  useEffect(() => {
    const s = cardStatusQuery.data;
    if (!s) return;
    if (s.status === 'Success') {
      setFeedback({ type: 'success', text: t('license.pending.paid', { days: s.days }) });
      void qc.invalidateQueries({ queryKey: ['license'] });
      setCardSession(null);
    } else if (s.status === 'Failed' || s.status === 'Error') {
      setFeedback({ type: 'error', text: s.errorMessage ?? t('license.pending.failed') });
      setCardSession(null);
    } else if (s.status === 'Expired') {
      setFeedback({ type: 'error', text: t('license.pending.expired') });
      setCardSession(null);
    } else if (s.status === 'Canceled') {
      setFeedback({ type: 'error', text: t('license.pending.canceled') });
      setCardSession(null);
    }
  }, [cardStatusQuery.data, qc, t]);

  const testExpireMut = useMutation({
    mutationFn: () => licenseApi.testExpire(expireType),
    onSuccess: () => {
      setFeedback({
        type: 'success',
        text: t('license.test.expireApplied', { label: t(`license.test.expireTypes.${expireType}Long`) }),
      });
      void qc.invalidateQueries({ queryKey: ['license'] });
    },
    onError:   (e: unknown) => setFeedback({ type: 'error', text: extractError(e, t) }),
    onSettled: () => setBusy(null),
  });

  const testRestoreMut = useMutation({
    mutationFn: () => licenseApi.testRestore(30),
    onSuccess: () => {
      setFeedback({ type: 'success', text: t('license.test.restoreSuccess') });
      void qc.invalidateQueries({ queryKey: ['license'] });
    },
    onError:   (e: unknown) => setFeedback({ type: 'error', text: extractError(e, t) }),
    onSettled: () => setBusy(null),
  });

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // إغلاق عند النقر على الـ backdrop (خارج الـ dialog content)
        if (e.target === dialogRef.current) onClose();
      }}
      className={cn(
        'w-[min(640px,calc(100vw-1rem))] h-[min(720px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] p-0 m-auto',
        'rounded-xl border border-border bg-card text-foreground shadow-2xl',
        'backdrop:bg-black/80 backdrop:backdrop-blur-sm',
        'open:flex open:flex-col',
      )}
      dir={direction}
    >
      {/* ════════════════════════ Header ════════════════════════ */}
      <div className={cn(
        'flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3',
        isRtl ? 'bg-gradient-to-l from-primary/5 to-transparent' : 'bg-gradient-to-r from-primary/5 to-transparent',
      )}>
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusIcon status={status} />
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold leading-tight">{t('license.title')}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {status?.companyKey ? t('license.companyKey', { key: status.companyKey }) : t('license.reading')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('license.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ════════════════════════ Body ════════════════════════ */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <StatusPanel status={status} loading={statusQuery.isLoading} />

        {feedback && (
          <FeedbackBanner
            kind={feedback.type}
            text={feedback.text}
            onClose={() => setFeedback(null)}
          />
        )}

        {cardSession && (
          <PendingPaymentBanner
            amount={cardSession.amount}
            currency={cardSession.currency}
            days={cardSession.days}
            formUrl={cardSession.formUrl}
            onCancel={() => setCardSession(null)}
          />
        )}

        {canApply && (
          <CompactSection icon={<KeyRound className="h-3.5 w-3.5 text-primary" />} title={t('license.apply.title')}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('license.apply.placeholder')}
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-ring"
                dir="ltr"
                disabled={busy === 'apply'}
              />
              <button
                type="button"
                onClick={() => { setBusy('apply'); setFeedback(null); applyMut.mutate(code.trim()); }}
                disabled={!code.trim() || busy !== null}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === 'apply'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                {t('license.apply.button')}
              </button>
            </div>
          </CompactSection>
        )}

        {canApply && (
          <CompactSection
            icon={<Wallet className="h-3.5 w-3.5 text-primary" />}
            title={t('license.buy.title')}
            aside={
              <span className="text-[10px] text-muted-foreground">
                <span className="tnum font-semibold text-foreground">
                  {status ? formatMoney(status.pricePerDay) : '—'}
                </span>{' '}
                {t('license.buy.perDay', { currency: status?.currency ?? 'IQD' })}
              </span>
            }
          >
            <BuyDaysGrid
              status={status}
              busy={busy}
              hasActiveCardSession={!!cardSession}
              packages={dayPackages}
              onBuy={(days, method) => {
                setBusy(method);
                setFeedback(null);
                if (method === 'wallet') walletMut.mutate(days);
                else                     cardMut.mutate(days);
              }}
            />
          </CompactSection>
        )}

        {canGenerate && (
          <Collapsible
            icon={<FlaskConical className="h-3.5 w-3.5 text-amber-500" />}
            title={t('license.test.title')}
            titleClassName="text-amber-500"
            variant="warning"
            open={showTestTools}
            onToggle={() => setShowTestTools((v) => !v)}
          >
            <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
              {t('license.test.description')}
            </p>

            <div className="mb-2">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">{t('license.test.typeLabel')}</p>
              <div className="flex gap-1">
                {(
                  [
                    { id: 'natural'  as const },
                    { id: 'canceled' as const },
                    { id: 'warning'  as const },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExpireType(opt.id)}
                    disabled={busy !== null}
                    className={cn(
                      'flex flex-1 flex-col items-center gap-0.5 rounded border px-1.5 py-1.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      expireType === opt.id
                        ? 'border-rose-500/50 bg-rose-500/15 text-rose-400'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-rose-500/30 hover:text-rose-400/70',
                    )}
                  >
                    <span className="font-semibold">{t(`license.test.expireTypes.${opt.id}`)}</span>
                    <span className="opacity-60">{t(`license.test.expireTypes.${opt.id}Desc`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setBusy('test-expire'); setFeedback(null); testExpireMut.mutate(); }}
                disabled={busy !== null}
                className="flex items-center justify-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'test-expire'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <ShieldOff className="h-3.5 w-3.5" />}
                {t('license.test.expireNow')}
              </button>
              <button
                type="button"
                onClick={() => { setBusy('test-restore'); setFeedback(null); testRestoreMut.mutate(); }}
                disabled={busy !== null}
                className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'test-restore'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />}
                {t('license.test.restore')}
              </button>
            </div>
          </Collapsible>
        )}

        <Collapsible
          icon={<History className="h-3.5 w-3.5 text-muted-foreground" />}
          title={t('license.history.title')}
          open={showHistory}
          onToggle={() => setShowHistory((v) => !v)}
        >
          <HistoryList rows={historyQuery.data} loading={historyQuery.isLoading} />
        </Collapsible>
      </div>

      {/* ════════════════════════ Footer ════════════════════════ */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-4 py-2.5 text-[10px] text-muted-foreground">
        <span>{t('license.footer')}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border bg-secondary/50 px-3 py-1 text-xs font-medium hover:bg-secondary"
        >
          {t('license.close')}
        </button>
      </div>
    </dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════

function CompactSection({
  icon, title, aside, children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-xs font-semibold">{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Collapsible({
  icon, title, titleClassName, variant = 'default', open, onToggle, children,
}: {
  icon: React.ReactNode;
  title: string;
  titleClassName?: string;
  variant?: 'default' | 'warning';
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { isRtl } = useLocale();
  return (
    <section
      className={cn(
        'rounded-lg border',
        variant === 'warning'
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-border bg-secondary/30',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn('flex w-full items-center justify-between gap-2 px-3 py-2', isRtl ? 'text-right' : 'text-left')}
      >
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className={cn('text-xs font-semibold', titleClassName)}>{title}</h3>
        </div>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/50 p-3">
          {children}
        </div>
      )}
    </section>
  );
}

function StatusIcon({ status }: { status: LicenseStatus | undefined }) {
  const base = 'flex h-9 w-9 items-center justify-center rounded-lg shrink-0';
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
  const { t } = useTranslation();
  const { locale } = useLocale();
  if (loading || !status) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('license.stat.loadingStatus')}
      </div>
    );
  }

  const isExpired = status.isExpired && !status.isInGrace;
  const remainingValue = isExpired ? t('license.stat.expired') : String(status.daysRemaining);
  const remainingTone: 'healthy' | 'warning' | 'critical' =
    isExpired
      ? 'critical'
      : status.daysRemaining < 7
        ? 'critical'
        : status.daysRemaining < 30
          ? 'warning'
          : 'healthy';

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <StatCard label={t('license.stat.daysRemaining')} value={remainingValue} suffix={isExpired ? undefined : t('license.stat.day')} tone={remainingTone} />
      <StatCard label={t('license.stat.endsOn')}        value={status.endDateUtc ? formatDate(status.endDateUtc, locale) : '—'} tone="neutral" />
      <StatCard label={t('license.stat.walletBalance')} value={formatMoney(status.walletBalance)} suffix={status.currency} tone="neutral" />
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
  const toneStyles: Record<string, string> = {
    healthy:  'border-emerald-500/30 bg-emerald-500/5',
    warning:  'border-amber-500/30 bg-amber-500/5',
    critical: 'border-rose-500/30 bg-rose-500/5',
    neutral:  'border-border bg-secondary/30',
  };
  const valueStyles: Record<string, string> = {
    healthy:  'text-emerald-400',
    warning:  'text-amber-400',
    critical: 'text-rose-400',
    neutral:  'text-foreground',
  };

  return (
    <div className={cn('flex flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5', toneStyles[tone])}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('flex items-baseline gap-1', valueStyles[tone])}>
        <span className="tnum text-base font-bold leading-none sm:text-lg">{value}</span>
        {suffix ? <span className="text-[11px] font-normal opacity-70">{suffix}</span> : null}
      </div>
    </div>
  );
}

function BuyDaysGrid({
  status, busy, hasActiveCardSession, packages, onBuy,
}: {
  status: LicenseStatus | undefined;
  busy: 'apply' | 'wallet' | 'card' | 'test-expire' | 'test-restore' | null;
  hasActiveCardSession: boolean;
  packages: { days: number; label: string }[];
  onBuy: (days: number, method: 'wallet' | 'card') => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number>(30);
  const cost = useMemo(() => (status ? status.pricePerDay * selected : 0), [status, selected]);
  const enoughWallet = status ? status.walletBalance >= cost : false;
  const buttonsDisabled = busy !== null || hasActiveCardSession;

  return (
    <>
      <div className="grid grid-cols-4 gap-1.5">
        {packages.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setSelected(p.days)}
            className={cn(
              'flex flex-col items-center gap-0 rounded-md border py-1.5 transition-colors',
              selected === p.days
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-secondary/40 text-foreground hover:border-primary/40',
            )}
          >
            <span className="tnum text-sm font-bold leading-tight">{p.days}</span>
            <span className="text-[10px] text-muted-foreground">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1 text-xs">
        <span className="text-muted-foreground">{t('license.buy.total')}</span>
        <span className="tnum font-bold text-foreground">
          {formatMoney(cost)} {status?.currency ?? 'IQD'}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onBuy(selected, 'wallet')}
          disabled={buttonsDisabled || !enoughWallet}
          title={
            hasActiveCardSession
              ? t('license.buy.activeCardSession')
              : enoughWallet
                ? t('license.buy.walletEnough')
                : t('license.buy.walletShort')
          }
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium',
            enoughWallet
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
              : 'border-border bg-secondary/30 text-muted-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {busy === 'wallet' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
          {t('license.buy.wallet')}
        </button>
        <button
          type="button"
          onClick={() => onBuy(selected, 'card')}
          disabled={buttonsDisabled}
          title={hasActiveCardSession ? t('license.buy.activeCardSession') : t('license.buy.cardTooltip')}
          className="flex items-center justify-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'card' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          {t('license.buy.card')}
        </button>
      </div>
    </>
  );
}

/**
 * شريط يظهر عندما يكون هناك جلسة دفع نشطة عبر QiCard. يعرض المبلغ + يوفّر زر
 * "إعادة فتح صفحة الدفع" (لو أغلق المستخدم التبويب) + زر "إلغاء" (يوقف الـ polling).
 *
 * الـ polling يجري في الخلفية تلقائياً عبر <c>cardStatusQuery</c> في المكوّن الأم.
 */
function PendingPaymentBanner({
  amount, currency, days, formUrl, onCancel,
}: {
  amount:   number;
  currency: string;
  days:     number;
  formUrl:  string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
      <div className="flex-1 leading-snug">
        <p className="font-semibold">{t('license.pending.title')}</p>
        <p className="mt-0.5 text-[11px] text-sky-300/80">
          {t('license.pending.subtitle', { amount: formatMoney(amount), currency, days })}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <a
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium hover:bg-sky-500/25"
          >
            <ExternalLink className="h-3 w-3" />
            {t('license.pending.reopen')}
          </a>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border bg-secondary/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80 hover:bg-secondary"
          >
            {t('license.pending.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryList({ rows, loading }: { rows: ActivationRow[] | undefined; loading: boolean }) {
  const { t } = useTranslation();
  const { locale, isRtl } = useLocale();
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {t('license.history.loading')}
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-secondary/20 p-3 text-center text-[11px] text-muted-foreground">
        {t('license.history.empty')}
      </div>
    );
  }
  const cellAlign = isRtl ? 'text-right' : 'text-left';
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-[11px]">
        <thead className="bg-secondary/60 text-[10px] text-muted-foreground">
          <tr>
            <th className={cn('px-2 py-1 font-medium', cellAlign)}>{t('license.history.colDate')}</th>
            <th className={cn('px-2 py-1 font-medium', cellAlign)}>{t('license.history.colSource')}</th>
            <th className={cn('px-2 py-1 font-medium', cellAlign)}>{t('license.history.colDays')}</th>
            <th className={cn('px-2 py-1 font-medium', cellAlign)}>{t('license.history.colUntil')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-2 py-1 tnum text-muted-foreground">{formatDateShort(r.appliedAt, locale)}</td>
              <td className="px-2 py-1"><SourceBadge source={r.source} /></td>
              <td className="px-2 py-1 tnum font-medium">+{r.days}</td>
              <td className="px-2 py-1 tnum text-muted-foreground">{formatDateShort(r.endDate, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    Code:   'bg-primary/10 text-primary',
    Wallet: 'bg-emerald-500/10 text-emerald-400',
    Card:   'bg-sky-500/10 text-sky-400',
  };
  const label = t(`license.history.src.${source}`, { defaultValue: source });
  const cls = styles[source] ?? 'bg-secondary text-muted-foreground';
  return <span className={cn('rounded px-1.5 py-0 text-[10px] font-medium', cls)}>{label}</span>;
}

function FeedbackBanner({
  kind, text, onClose,
}: {
  kind: 'success' | 'error';
  text: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isSuccess = kind === 'success';
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        isSuccess
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
      )}
    >
      {isSuccess
        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        : <AlertCircle  className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <p className="flex-1 leading-snug">{text}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 opacity-60 hover:opacity-100"
        aria-label={t('license.closeAlert')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function formatDate(iso: string, locale: 'ar' | 'en'): string {
  const tag = locale === 'en' ? 'en-GB' : 'ar-IQ-u-nu-latn';
  try {
    return new Intl.DateTimeFormat(tag, {
      year: 'numeric', month: 'short', day: 'numeric',
      numberingSystem: 'latn',
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatDateShort(iso: string, locale: 'ar' | 'en'): string {
  const tag = locale === 'en' ? 'en-GB' : 'ar-IQ-u-nu-latn';
  try {
    return new Intl.DateTimeFormat(tag, {
      year: '2-digit', month: 'numeric', day: 'numeric',
      numberingSystem: 'latn',
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatMoney(n: number): string {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
  } catch { return n.toLocaleString(); }
}

function extractError(e: unknown, t: (k: string) => string): string {
  const anyErr = e as { response?: { data?: { errors?: string[]; message?: string } }; message?: string };
  return (
    anyErr?.response?.data?.errors?.[0]
    ?? anyErr?.response?.data?.message
    ?? anyErr?.message
    ?? t('license.errors.generic')
  );
}
