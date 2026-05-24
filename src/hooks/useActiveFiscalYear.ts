import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import type { FiscalYearDto } from '@/types/api';

/**
 * Hook موحَّد لاستخراج السنة المالية النشطة (المُفَعَّلة من قِبل المستخدم).
 *
 * ترتيب الأولوية:
 *   1. السنة المُعَلَّمة بـ IsActive (المصدر الأساسي).
 *   2. كاحتياط: السنة المفتوحة التي تحتوي تاريخ اليوم.
 *   3. أحدث سنة مفتوحة.
 *   4. السنة المغلقة التي تحتوي اليوم.
 *   5. الأحدث مطلقاً.
 *
 * كل التقارير (ميزان المراجعة، كشف الحساب، القيود اليومية، إلخ) يجب أن
 * تستخدم هذا الـ hook بدلاً من حساب السنة الحالية محلياً.
 */
export function useActiveFiscalYear() {
  const yearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const activeFiscalYear = useMemo<FiscalYearDto | null>(() => {
    const list = yearsQuery.data ?? [];
    if (list.length === 0) return null;

    // ‎1) السنة المعلَّمة كنشطة من قِبل المستخدم
    const explicit = list.find(fy => fy.isActive);
    if (explicit) return explicit;

    // ‎احتياط: نطبق نفس منطق الترجيح المستخدم في الباك إند
    const today = new Date().toISOString().slice(0, 10);
    const openContainsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e && !fy.isClosed;
    });
    if (openContainsToday) return openContainsToday;

    const newestOpen = [...list]
      .filter(fy => !fy.isClosed)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
    if (newestOpen) return newestOpen;

    const closedContainsToday = list.find(fy => {
      const s = (fy.startDate ?? '').slice(0, 10);
      const e = (fy.endDate ?? '').slice(0, 10);
      return s && e && today >= s && today <= e;
    });
    if (closedContainsToday) return closedContainsToday;

    return [...list].sort(
      (a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '')
    )[0] ?? null;
  }, [yearsQuery.data]);

  return {
    activeFiscalYear,
    fiscalYears: yearsQuery.data ?? [],
    isLoading: yearsQuery.isLoading,
  };
}

/**
 * يتحقق هل تاريخ معين يقع ضمن نطاق سنة مالية معطاة.
 * يقارن الجزء `YYYY-MM-DD` فقط لتجنّب مشاكل المنطقة الزمنية.
 *
 * @param date تاريخ بصيغة ISO أو Date object
 * @param fy السنة المالية المرجعية
 * @returns true إذا كان التاريخ ضمن النطاق (شامل الطرفين)، false غير ذلك أو إن كانت المعطيات ناقصة.
 */
export function isDateInFiscalYear(
  date: string | Date | null | undefined,
  fy: FiscalYearDto | null | undefined
): boolean {
  if (!date || !fy) return false;
  const d = typeof date === 'string' ? date.slice(0, 10) : toIsoLocalDate(date);
  const s = (fy.startDate ?? '').slice(0, 10);
  const e = (fy.endDate ?? '').slice(0, 10);
  if (!d || !s || !e) return false;
  return d >= s && d <= e;
}

/** YYYY-MM-DD بالتوقيت المحلي للمتصفح */
function toIsoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
