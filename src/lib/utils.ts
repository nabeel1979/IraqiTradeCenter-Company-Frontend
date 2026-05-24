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
  // ‎NBSP بين الرقم ورمز العملة لمنع الانكسار عبر سطرين على الشاشات الضيقة
  return symbol ? `${formatted}\u00A0د.ع` : formatted;
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

/**
 * يُرجع تاريخ ISO محلياً (YYYY-MM-DD) بناءً على المنطقة الزمنية للجهاز.
 *
 * مهم لحقول `<input type="date">` التي تتوقع YYYY-MM-DD بدون توقيت:
 *   • الـ Backend قد يُرجع التاريخ كـ ISO بصيغة UTC (مثل "2026-05-19T21:00:00Z")
 *     والذي يمثّل في الحقيقة "2026-05-20 00:00 +03:00" بتوقيت بغداد.
 *   • استخدام `str.slice(0, 10)` يعطي "2026-05-19" (يومٌ سابق) — خطأ!
 *   • هذه الدالة تحوّل القيمة إلى Date ثم تستخرج Y/M/D بالتوقيت المحلي،
 *     فتُرجع "2026-05-20" بشكل صحيح.
 */
export function toIsoLocalDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * يحوّل تاريخ YYYY-MM-DD من حقل `<input type="date">` إلى ISO string آمن للإرسال للـ Backend.
 *
 * المشكلة:
 *   • `new Date("2026-05-20").toISOString()` يُنتج "2026-05-20T00:00:00.000Z" (منتصف ليل UTC)،
 *     وهذا يقع في يوم سابق بتوقيت بغداد (+03)، مما قد يُسبّب انزياحاً يوماً واحداً عند الحفظ.
 *   • هذه الدالة تُثبّت التاريخ على منتصف النهار (12:00) بالتوقيت المحلي،
 *     ثم تحوّله لـ ISO — وبذلك يبقى نفس التاريخ في كل التوقيتات المعقولة.
 */
export function isoDateForBackend(localDateYmd: string): string {
  if (!localDateYmd) return '';
  // ‎نمرّر مكوّنات السنة/الشهر/اليوم بشكل صريح لمُنشئ Date؛ هذا يُنشئ التاريخ
  // ‎بالتوقيت المحلي للجهاز عند منتصف النهار (12:00) لتجنّب انزياحات DST/UTC.
  const [y, m, d] = localDateYmd.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
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
