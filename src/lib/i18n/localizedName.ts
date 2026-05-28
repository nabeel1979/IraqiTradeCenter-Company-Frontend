import type { AppLocale } from './config';
import {
  ACCOUNT_NAME_EN_BY_AR,
  VOUCHER_NAME_EN_BY_AR,
  defaultEnglishName,
} from './accountNameEnDefaults';

/**
 * اسم معرّض بحسب لغة الواجهة مع fallback:
 *   - إنجليزي: nameEn ثم قاموس افتراضي (حسابات/سندات) ثم nameAr
 *   - عربي: nameAr ثم nameEn
 */
export function localizedName(
  locale: AppLocale,
  nameAr: string | null | undefined,
  nameEn?: string | null | undefined,
  defaultsMap?: Readonly<Record<string, string>>,
): string {
  const ar = (nameAr ?? '').trim();
  const en = (nameEn ?? '').trim();
  if (locale === 'en') {
    if (en) return en;
    const fromMap = defaultsMap ? defaultEnglishName(ar, defaultsMap) : undefined;
    if (fromMap) return fromMap;
    return ar;
  }
  return ar || en;
}

/** اسم حساب — يستخدم قاموس الدليل المحاسبي عند غياب NameEn. */
export function localizedAccountName(
  locale: AppLocale,
  nameAr: string | null | undefined,
  nameEn?: string | null | undefined,
): string {
  return localizedName(locale, nameAr, nameEn, ACCOUNT_NAME_EN_BY_AR);
}

/** اسم نوع سند — يستخدم قاموس السندات الافتراضية. */
export function localizedVoucherTypeName(
  locale: AppLocale,
  nameAr: string | null | undefined,
  nameEn?: string | null | undefined,
): string {
  return localizedName(locale, nameAr, nameEn, VOUCHER_NAME_EN_BY_AR);
}

/** نص قابل للبحث (الكود + الاسمان) — للفلاتر المحلية. */
export function accountSearchHaystack(
  code: string,
  nameAr: string | null | undefined,
  nameEn?: string | null | undefined,
): string {
  return `${code} ${nameAr ?? ''} ${nameEn ?? ''}`.toLowerCase();
}

/**
 * يترجم وصف قيد مولّد من سند بصيغة مركّبة مثل
 *   "سند قبض — صندوق نبيل"  →  "Receipt Voucher — Nabeel Box"
 * عبر تقسيم النص على الفواصل المعروفة (—، -، :) وترجمة كل قطعة بحسب:
 *   1) خريطة سياقية إضافية (مثل أسماء الصناديق/الحسابات من الصفحة).
 *   2) قاموس السندات.
 *   3) قاموس الحسابات.
 * لو لم تتطابق أي قطعة، تُعاد كما هي (نحافظ على نص المستخدم المخصّص).
 *
 * `contextMap` خريطة اختيارية (nameAr → nameEn) تُستخدم أولاً قبل القواميس
 * الافتراضية — تنفع لترجمة أسماء صناديق/حسابات مخصّصة لها NameEn في الـ DB.
 */
/**
 * كلمات/سوابق عربية شائعة في أوصاف القيود قابلة للترجمة الجزئية حتى لو لم يطابق
 * النص الكامل أي إدخال في القاموس (مثل "صندوق نبيل" → "Box: نبيل").
 *
 * المطابقة بدقّة على الكلمة الأولى من القطعة فقط، والباقي يُبقى كما هو
 * (يُحفَظ اسم المستخدم المخصّص بالعربي).
 */
const WORD_LEVEL_AR_EN: Readonly<Record<string, string>> = {
  'صندوق': 'Cash Box',
  'صناديق': 'Cash Boxes',
  'حساب': 'Account',
  'بنك': 'Bank',
  'مصرف': 'Bank',
  'فاتورة': 'Invoice',
  'فاتورة مبيعات': 'Sales Invoice',
  'فاتورة مشتريات': 'Purchase Invoice',
  'فاتورة شراء': 'Purchase Invoice',
  'عميل': 'Customer',
  'مورد': 'Supplier',
  'موظف': 'Employee',
  'تحصيل': 'Collection from',
  'تسديد': 'Payment to',
  'مناقلة': 'Transfer',
  'تحويل': 'Transfer',
  'عمولة': 'Commission for',
  'عكس قيد': 'Reverse of entry',
  'إعادة إلى': 'Return to',
  'إغلاق التحويل من': 'Closing transfer from',
};

/** يحاول مطابقة سابقة عربية وترجمتها مع الإبقاء على بقية النص. */
function translatePrefixWord(s: string): string | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  // ‎جرّب أطول مطابقة أولاً (sales invoice قبل invoice).
  const keys = Object.keys(WORD_LEVEL_AR_EN).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (trimmed === k) return WORD_LEVEL_AR_EN[k];
    if (trimmed.startsWith(k + ' ') || trimmed.startsWith(k + '\u00A0')) {
      const rest = trimmed.slice(k.length).trim();
      return rest ? `${WORD_LEVEL_AR_EN[k]} ${rest}` : WORD_LEVEL_AR_EN[k];
    }
  }
  return undefined;
}

export function localizedEntryDescription(
  locale: AppLocale,
  description: string | null | undefined,
  contextMap?: Readonly<Record<string, string>>,
): string {
  const text = (description ?? '').trim();
  if (!text || locale !== 'en') return text;

  const lookup = (s: string): string | undefined => {
    const k = s.trim();
    if (!k) return undefined;
    return (
      contextMap?.[k] ??
      defaultEnglishName(k, VOUCHER_NAME_EN_BY_AR) ??
      defaultEnglishName(k, ACCOUNT_NAME_EN_BY_AR) ??
      translatePrefixWord(k)
    );
  };

  // ‎فواصل شائعة: em-dash، en-dash، شُرطة عادية مع مسافات، نقطتان.
  const sep = /\s*[—–\-:]\s*/g;
  const parts = text.split(sep);
  if (parts.length <= 1) return lookup(text) ?? text;

  const separators = (text.match(sep) ?? []);
  const translated = parts.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return p;
    return lookup(trimmed) ?? trimmed;
  });

  let out = translated[0];
  for (let i = 1; i < translated.length; i++) {
    out += (separators[i - 1] ?? ' — ') + translated[i];
  }
  return out;
}
