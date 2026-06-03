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

/** نطاق افتراضي: من بداية السنة المالية → نهاية الفترة المحاسبية (وليس دائماً «اليوم»). */
export function fiscalYearDateRange(
  fy: FiscalYearDto | null | undefined,
  opts?: { capToToday?: boolean }
): { from: string; to: string } {
  const today = todayIsoLocal();
  if (!fy) {
    const y = new Date().getFullYear();
    return {
      from: `${y}-01-01`,
      to: today,
    };
  }
  const from = (fy.startDate ?? '').slice(0, 10) || today;
  const fyEnd = (fy.endDate ?? '').slice(0, 10);
  const useFyEnd = opts?.capToToday === false;
  let to = useFyEnd ? (fyEnd || today) : fiscalYearReportEndDate(fy);
  if (to < from) to = from;
  return { from, to };
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
