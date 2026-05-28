import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { cn } from '@/lib/utils';
import { useLocale, localizedName } from '@/lib/i18n';

export interface DateRangePreset {
  id: string;
  labelKey: string;
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
  const { t } = useTranslation();
  const { locale } = useLocale();
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
    // ‎الأولوية 1: السنة المُعَلَّمة كنشطة (المصدر الأساسي)
    const explicit = list.find(fy => (fy as any).isActive);
    if (explicit) return explicit;
    // ‎الأولوية 2: السنة المفتوحة التي تحتوي تاريخ اليوم
    const openContainsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e && !(fy as any).isClosed;
    });
    if (openContainsToday) return openContainsToday;
    // ‎الأولوية 3: أحدث سنة مفتوحة
    const newestOpen = [...list]
      .filter(fy => !(fy as any).isClosed)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
    if (newestOpen) return newestOpen;
    // ‎الأولوية 4: السنة المغلقة التي تحتوي اليوم
    const closedContainsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e;
    });
    if (closedContainsToday) return closedContainsToday;
    // ‎الأولوية 5: الأحدث مطلقاً
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
        list.push({ id: 'fy-full', labelKey: 'dateRange.presets.fyFull', from: fyStart, to: fyEnd });
      }
      if (fyStart) {
        // ‎"من بداية السنة" = من بداية السنة المالية إلى اليوم دائماً
        list.push({
          id: 'fy-to-today',
          labelKey: 'dateRange.presets.fyToToday',
          from: fyStart,
          to: today,
        });
      }
    }

    list.push({ id: 'today', labelKey: 'dateRange.presets.today', from: today, to: today });

    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestIso = toISODate(yest);
    list.push({ id: 'yesterday', labelKey: 'dateRange.presets.yesterday', from: yestIso, to: yestIso });

    // ‎هذا الأسبوع (بداية السبت — التقويم العربي/العراقي)
    const dow = now.getDay(); // 0=Sunday, 6=Saturday
    const daysSinceSat = (dow + 1) % 7; // Sat→0, Sun→1, ..., Fri→6
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysSinceSat);
    list.push({ id: 'this-week', labelKey: 'dateRange.presets.thisWeek', from: toISODate(weekStart), to: today });

    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    list.push({
      id: 'last-week',
      labelKey: 'dateRange.presets.lastWeek',
      from: toISODate(lastWeekStart),
      to: toISODate(lastWeekEnd),
    });

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    list.push({ id: 'this-month', labelKey: 'dateRange.presets.thisMonth', from: toISODate(monthStart), to: today });

    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    list.push({
      id: 'last-month',
      labelKey: 'dateRange.presets.lastMonth',
      from: toISODate(lastMonthStart),
      to: toISODate(lastMonthEnd),
    });

    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    list.push({ id: 'this-quarter', labelKey: 'dateRange.presets.thisQuarter', from: toISODate(qStart), to: today });

    // ‎هذا العام (تقويمي) — يُعرض فقط حين لا تتوفر سنة مالية،
    // ‎لأنّ "بداية السنة" في سياقنا المحاسبي = بداية السنة المالية، لا الميلادية.
    if (!currentFiscalYear) {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      list.push({ id: 'this-year', labelKey: 'dateRange.presets.thisYear', from: toISODate(yearStart), to: today });
    }

    return list;
  }, [today, currentFiscalYear]);

  const isActive = (p: DateRangePreset) => p.from === from && p.to === to;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {showLabel && (
        <span className="text-[10.5px] font-medium text-muted-foreground">{t('dateRange.quickRanges')}</span>
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
            title={t('dateRange.tooltipRange', { from: p.from, to: p.to })}
          >
            {t(p.labelKey)}
          </button>
        );
      })}
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange('', '')}
          className="h-6 rounded-full border border-border bg-secondary/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          title={t('dateRange.clear')}
        >
          {t('dateRange.all')}
        </button>
      )}
      {showFiscalYearBadge && currentFiscalYear && (
        <span className="ms-auto rounded-md bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {t('dateRange.fiscalYear')} <span className="font-semibold text-foreground">{localizedName(locale, currentFiscalYear.name, currentFiscalYear.nameEn)}</span>
        </span>
      )}
    </div>
  );
}
