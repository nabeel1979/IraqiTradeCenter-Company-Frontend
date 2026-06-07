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

/** يقرأ رمز العملة العراقية بحسب اللغة المُختارة في localStorage (مزامن مع i18next). */
function getIqdSymbol(): string {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('itc-locale') : null;
    return stored?.startsWith('en') ? 'IQD' : 'د.ع';
  } catch {
    return 'د.ع';
  }
}

/** تنسيق العملة العراقية — يعرض "IQD" في الإنجليزية و"د.ع" في العربية. */
export function formatIQD(amount: number | null | undefined, opts: { decimals?: number; symbol?: boolean } = {}) {
  if (amount == null) return '—';
  const { decimals = 0, symbol = true } = opts;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  // ‎NBSP بين الرقم ورمز العملة لمنع الانكسار عبر سطرين على الشاشات الضيقة
  return symbol ? `${formatted}\u00A0${getIqdSymbol()}` : formatted;
}

/** تنسيق مبلغ مع رمز العملة — IQD يستخدم د.ع/‏IQD حسب اللغة، غير ذلك يُعرض كود العملة. */
export function formatMoney(amount: number | null | undefined, currency = 'IQD', opts: { decimals?: number } = {}) {
  if (amount == null) return '—';
  const { decimals = currency === 'IQD' ? 0 : 2 } = opts;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  if (currency === 'IQD') return `${formatted}\u00A0${getIqdSymbol()}`;
  return `${formatted}\u00A0${currency}`;
}

/** تنسيق مبلغ بدون رمز عملة، يعرض الكسور (افتراضياً 3 خانات عشرية مع إخفاء الأصفار اللاحقة) */
export function formatAmount(amount: number | null | undefined, decimals = 3) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/** المنطقة الزمنية الرسمية للنظام — بغداد UTC+3 */
export const SYSTEM_TIMEZONE = 'Asia/Baghdad';

/** تنسيق التاريخ بالعربية */
/**
 * يُرجع وسم BCP-47 المناسب لتنسيق التاريخ بناءً على لغة الواجهة الحالية.
 * في وضع EN نستخدم en-GB (يعطي صيغة "26 May 2026" بأرقام لاتينية).
 * في وضع AR نستخدم ar-IQ-u-nu-latn (أسماء الأشهر العربية + أرقام لاتينية).
 */
function dateLocaleTag(): string {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.getAttribute('lang');
    if (lang?.startsWith('en')) return 'en-GB';
  }
  return 'ar-IQ-u-nu-latn';
}

export function formatDate(d: string | Date | null | undefined, opts: { short?: boolean } = {}) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(dateLocaleTag(), {
    year: 'numeric',
    month: opts.short ? '2-digit' : 'short',
    day: '2-digit',
    numberingSystem: 'latn',
    timeZone: SYSTEM_TIMEZONE,
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
  return new Intl.DateTimeFormat(dateLocaleTag(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
    timeZone: SYSTEM_TIMEZONE,
  }).format(date);
}

/**
 * يُنسّق وقت UTC كتاريخ+وقت بتوقيت بغداد (UTC+3) بصيغة إنجليزية ثابتة.
 * مثال: "27 May 2026, 15:29" — يستخدم في سجلات المراقبة والأرشيف.
 */
export function formatBaghdadDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SYSTEM_TIMEZONE,
  }).format(d);
}

/** أحرف اسم → initials */
export function initials(name?: string | null) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map(p => p[0]).join('');
}

/** تأخير */
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
