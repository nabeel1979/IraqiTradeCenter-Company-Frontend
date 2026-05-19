import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * يستخرج رسالة خطأ مفهومة من response axios أو من Result.Failure من الـ Backend.
 * يدعم الأشكال:
 *  - { success: false, message: "..." }
 *  - { success: false, errors: ["...", "..."] }
 *  - { success: false, errors: "..." }
 *  - أو خطأ شبكة عام
 */
export function extractApiError(err: any, fallback = 'حدث خطأ غير متوقع'): string {
  const data = err?.response?.data;
  if (data) {
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors.filter((e: any) => typeof e === 'string').join('، ') || fallback;
    }
    if (typeof data.errors === 'string' && data.errors.trim()) return data.errors;
    if (typeof data === 'string' && data.trim()) return data;
  }
  if (typeof err?.message === 'string' && err.message && !err.message.includes('status code')) {
    return err.message;
  }
  return fallback;
}

/** تنسيق العملة العراقية */
export function formatIQD(amount: number | null | undefined, opts: { decimals?: number; symbol?: boolean } = {}) {
  if (amount == null) return '—';
  const { decimals = 0, symbol = true } = opts;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return symbol ? `${formatted} د.ع` : formatted;
}

/** تنسيق مبلغ بدون رمز عملة، يعرض الكسور (افتراضياً 3 خانات عشرية مع إخفاء الأصفار اللاحقة) */
export function formatAmount(amount: number | null | undefined, decimals = 3) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/** تنسيق التاريخ بالعربية */
export function formatDate(d: string | Date | null | undefined, opts: { short?: boolean } = {}) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: opts.short ? '2-digit' : 'long',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** أحرف اسم → initials */
export function initials(name?: string | null) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map(p => p[0]).join('');
}

/** تأخير */
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
