import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { cn } from '@/lib/utils';

export interface DateRangePreset {
  id: string;
  label: string;
  from: string;
  to: string;
}

interface Props {
  /** التاريخ من (YYYY-MM-DD) */
  from: string;
  /** التاريخ إلى (YYYY-MM-DD) */
  to: string;
  /** يستدعى عند اختيار preset — يمرّر التواريخ الجديدة */
  onChange: (from: string, to: string) => void;
  /** إخفاء presets السنة المالية (افتراضي: false) */
  hideFiscalYear?: boolean;
  /** إظهار شارة اسم السنة المالية في النهاية */
  showFiscalYearBadge?: boolean;
  /** إظهار النص التعريفي "فترات سريعة:" */
  showLabel?: boolean;
  className?: string;
}

/** صياغة Date إلى YYYY-MM-DD بتوقيت محلي (وليس UTC) */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * مجموعة أزرار سريعة لاختيار فترة زمنية (اليوم، أمس، هذا الأسبوع، الشهر، الربع، السنة).
 * تدعم السنة المالية الحالية إن وُجدت.
 */
export function DateRangePresets({
  from,
  to,
  onChange,
  hideFiscalYear = false,
  showFiscalYearBadge = true,
  showLabel = true,
  className,
}: Props) {
  const fiscalYearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
    enabled: !hideFiscalYear,
  });

  const today = toISODate(new Date());

  const currentFiscalYear = useMemo(() => {
    if (hideFiscalYear) return null;
    const list = fiscalYearsQuery.data ?? [];
    if (list.length === 0) return null;
    // ‎الأولوية: السنة التي يقع التاريخ الحالي ضمنها
    const active = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e;
    });
    if (active) return active;
    // ‎ثم آخر سنة مفتوحة (غير مغلقة)
    const open = list.find(fy => !(fy as any).isClosed);
    if (open) return open;
    // ‎ثم أحدث سنة
    return [...list].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0] ?? null;
  }, [fiscalYearsQuery.data, today, hideFiscalYear]);

  const presets = useMemo<DateRangePreset[]>(() => {
    const list: DateRangePreset[] = [];
    const now = new Date();

    // ‎السنة المالية (إن وُجدت) — تأتي أولاً
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

    // ‎اليوم
    list.push({ id: 'today', label: 'اليوم', from: today, to: today });

    // ‎أمس
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestIso = toISODate(yest);
    list.push({ id: 'yesterday', label: 'أمس', from: yestIso, to: yestIso });

    // ‎هذا الأسبوع (بداية السبت — التقويم العربي/العراقي)
    const dow = now.getDay(); // 0=Sunday, 6=Saturday
    const daysSinceSat = (dow + 1) % 7; // Sat→0, Sun→1, ..., Fri→6
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysSinceSat);
    list.push({ id: 'this-week', label: 'هذا الأسبوع', from: toISODate(weekStart), to: today });

    // ‎الأسبوع الماضي
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    list.push({
      id: 'last-week',
      label: 'الأسبوع الماضي',
      from: toISODate(lastWeekStart),
      to: toISODate(lastWeekEnd),
    });

    // ‎هذا الشهر
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    list.push({ id: 'this-month', label: 'هذا الشهر', from: toISODate(monthStart), to: today });

    // ‎الشهر الماضي
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    list.push({
      id: 'last-month',
      label: 'الشهر الماضي',
      from: toISODate(lastMonthStart),
      to: toISODate(lastMonthEnd),
    });

    // ‎هذا الربع
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    list.push({ id: 'this-quarter', label: 'هذا الربع', from: toISODate(qStart), to: today });

    // ‎هذا العام (تقويمي)
    const yearStart = new Date(now.getFullYear(), 0, 1);
    list.push({ id: 'this-year', label: 'هذا العام', from: toISODate(yearStart), to: today });

    return list;
  }, [today, currentFiscalYear]);

  const isActive = (p: DateRangePreset) => p.from === from && p.to === to;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {showLabel && (
        <span className="text-[10.5px] font-medium text-muted-foreground">فترات سريعة:</span>
      )}
      {presets.map(p => {
        const active = isActive(p);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.from, p.to)}
            className={cn(
              'h-6 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
              active
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground'
            )}
            title={`${p.from} → ${p.to}`}
          >
            {p.label}
          </button>
        );
      })}
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange('', '')}
          className="h-6 rounded-full border border-border bg-secondary/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          title="مسح فلتر التاريخ"
        >
          الكل
        </button>
      )}
      {showFiscalYearBadge && currentFiscalYear && (
        <span className="ms-auto rounded-md bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          السنة المالية: <span className="font-semibold text-foreground">{currentFiscalYear.name}</span>
        </span>
      )}
    </div>
  );
}
