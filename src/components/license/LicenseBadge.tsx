import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { licenseApi } from '@/lib/api/license';
import { LicenseDialog } from './LicenseDialog';

/**
 * شارة الترخيص في الـ TopBar — تُظهر عدّاداً تنازلياً بالأيام المتبقية.
 * تستبدل صندوق البحث القديم.
 *
 * الحالات اللونية:
 *   • أخضر  — أكثر من 30 يوماً متبقّياً (Healthy)
 *   • أصفر  — 7..30 يوماً (Warning)
 *   • أحمر  — أقلّ من 7 أيام أو منتهٍ (Critical)
 *
 * يُحدَّث كلّ دقيقة تلقائياً + عند رجوع التبويبة من الخلفية، كي يبقى العدّاد
 * متزامناً بدون F5.
 */
export function LicenseBadge() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  // ‎جلب الحالة — staleTime منخفض حتى يتجاوب مع تطبيق شفرة جديدة بسرعة.
  const statusQuery = useQuery({
    queryKey: ['license', 'status'],
    queryFn: licenseApi.status,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // ‎عند رصد LICENSE_EXPIRED من axios interceptor: أبطل الكاش لتُحدَّث الشارة
  // ‎فوراً، وافتح نافذة الترخيص لتسهيل التجديد.
  useEffect(() => {
    const onExpired = () => {
      qc.invalidateQueries({ queryKey: ['license', 'status'] });
      setOpen(true);
    };
    window.addEventListener('itc:license-expired', onExpired as EventListener);
    return () =>
      window.removeEventListener('itc:license-expired', onExpired as EventListener);
  }, [qc]);

  const view = useMemo(() => {
    const s = statusQuery.data;
    if (!s) {
      return {
        label: '...',
        tone: 'neutral' as const,
        title: 'جارٍ التحقق من الترخيص',
        Icon: ShieldCheck,
      };
    }
    if (s.isExpired && !s.isInGrace) {
      return {
        label: 'منتهٍ',
        tone: 'critical' as const,
        title: 'الترخيص منتهٍ — اضغط للتجديد',
        Icon: ShieldOff,
      };
    }
    const days = s.daysRemaining;
    const tone =
      s.isInGrace || days < 7 ? 'critical' :
      days <= 30              ? 'warning'  :
                                'healthy';
    const Icon = tone === 'healthy' ? ShieldCheck : tone === 'warning' ? ShieldAlert : ShieldOff;
    return {
      label: s.isInGrace ? 'فترة سماح' : `${days} يوم`,
      tone,
      title: s.isInGrace
        ? `الترخيص في فترة السماح — جدِّد قريباً`
        : `الترخيص نشط — ${days} يوماً متبقياً`,
      Icon,
    };
  }, [statusQuery.data]);

  const toneClasses: Record<string, string> = {
    healthy:  'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15',
    warning:  'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15',
    critical: 'border-rose-500/35 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15 animate-pulse',
    neutral:  'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={view.title}
        aria-label={view.title}
        className={cn(
          'flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
          toneClasses[view.tone],
        )}
      >
        <view.Icon className="h-4 w-4 shrink-0" />
        <span className="hidden tnum sm:inline">{view.label}</span>
      </button>

      <LicenseDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
