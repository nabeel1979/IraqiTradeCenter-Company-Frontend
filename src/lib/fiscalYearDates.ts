import type { FiscalYearDto } from '@/types/api';

/** YYYY-MM-DD بالتوقيت المحلي */
export function toIsoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIsoLocal(): string {
  return toIsoLocalDate(new Date());
}

/**
 * اختيار السنة المالية «العملية» لكل الشاشات والتقارير.
 * الأولوية: IsActive (الأحدث بدايةً عند تعدد نشط) → مفتوحة تحتوي اليوم → أحدث مفتوحة → مغلقة تحتوي اليوم → الأحدث.
 */
export function pickWorkingFiscalYear(years: FiscalYearDto[]): FiscalYearDto | null {
  if (years.length === 0) return null;

  const activeOnes = years.filter(fy => fy.isActive);
  if (activeOnes.length === 1) return activeOnes[0]!;
  if (activeOnes.length > 1) {
    return [...activeOnes].sort((a, b) =>
      (b.startDate ?? '').localeCompare(a.startDate ?? '')
    )[0]!;
  }

  const today = todayIsoLocal();
  const openContainsToday = years.find(fy => {
    const s = (fy.startDate ?? '').slice(0, 10);
    const e = (fy.endDate ?? '').slice(0, 10);
    return s && e && today >= s && today <= e && !fy.isClosed;
  });
  if (openContainsToday) return openContainsToday;

  const newestOpen = [...years]
    .filter(fy => !fy.isClosed)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
  if (newestOpen) return newestOpen;

  const closedContainsToday = years.find(fy => {
    const s = (fy.startDate ?? '').slice(0, 10);
    const e = (fy.endDate ?? '').slice(0, 10);
    return s && e && today >= s && today <= e;
  });
  if (closedContainsToday) return closedContainsToday;

  return [...years].sort((a, b) =>
    (b.startDate ?? '').localeCompare(a.startDate ?? '')
  )[0] ?? null;
}

/**
 * نهاية الفترة لعرض التقارير ضمن سنة مالية:
 * - سنة مغلقة أو اليوم بعد نهايتها → نهاية السنة المالية.
 * - سنة مفتوحة واليوم ضمنها → اليوم.
 */
export function fiscalYearReportEndDate(fy: FiscalYearDto | null | undefined): string {
  const today = todayIsoLocal();
  if (!fy) return today;
  const s = (fy.startDate ?? '').slice(0, 10);
  const e = (fy.endDate ?? '').slice(0, 10);
  if (!s || !e) return today;
  if (fy.isClosed || today > e) return e;
  if (today < s) return s;
  return today;
}

/** يقيّد نطاقاً زمنياً ليبقى داخل حدود السنة المالية. */
export function clipDateRangeToFiscalYear(
  from: string,
  to: string,
  fy: FiscalYearDto,
): { from: string; to: string } {
  const s = (fy.startDate ?? '').slice(0, 10);
  const e = (fy.endDate ?? '').slice(0, 10);
  if (!s || !e) return { from, to };
  let f = from;
  let t = to;
  if (f < s) f = s;
  if (t > e) t = e;
  if (t < f) t = f;
  return { from: f, to: t };
}

/** من بداية السنة المالية → اليوم التقويمي (الافتراضي للتقارير). */
export function fiscalYearStartToTodayRange(
  fy: FiscalYearDto | null | undefined,
): { from: string; to: string } {
  const today = todayIsoLocal();
  if (!fy) {
    const y = new Date().getFullYear();
    return { from: `${y}-01-01`, to: today };
  }
  const from = (fy.startDate ?? '').slice(0, 10) || today;
  let to = today;
  if (to < from) to = from;
  return { from, to };
}

/** من بداية السنة المالية → نهايتها (السنة المالية كاملة). */
export function fiscalYearFullRange(
  fy: FiscalYearDto | null | undefined,
): { from: string; to: string } {
  const today = todayIsoLocal();
  if (!fy) {
    const y = new Date().getFullYear();
    return { from: `${y}-01-01`, to: today };
  }
  const from = (fy.startDate ?? '').slice(0, 10) || today;
  const to = (fy.endDate ?? '').slice(0, 10) || today;
  return { from, to: to < from ? from : to };
}

/**
 * نطاق افتراضي للفلاتر:
 * - `capToToday !== false` (افتراضي): من بداية السنة → اليوم.
 * - `capToToday === false`: السنة المالية كاملة (بداية → نهاية).
 */
export function fiscalYearDateRange(
  fy: FiscalYearDto | null | undefined,
  opts?: { capToToday?: boolean }
): { from: string; to: string } {
  if (opts?.capToToday === false) return fiscalYearFullRange(fy);
  return fiscalYearStartToTodayRange(fy);
}

/** تاريخ افتراضي لقيد جديد: اليوم ضمن نطاق السنة النشطة، وإلا بداية السنة. */
export function defaultEntryDateForFiscalYear(fy: FiscalYearDto | null | undefined): string {
  const today = todayIsoLocal();
  if (!fy) return today;
  const s = (fy.startDate ?? '').slice(0, 10);
  const e = (fy.endDate ?? '').slice(0, 10);
  if (!s) return today;
  if (today < s) return s;
  if (e && today > e) return e;
  return today;
}
