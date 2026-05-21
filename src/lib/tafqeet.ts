/**
 * تفقيط (تحويل الأرقام إلى كلمات عربية) — يُستخدم في طباعة السندات والفواتير.
 *
 * يدعم: 0 .. 999,999,999,999 صحيحة + جزء كسري بثلاث منازل (للدينار العراقي).
 * يستخدم القواعد التقليدية: ميّز/مجرور حسب العدد، صياغة العشرات والمئات،
 * عطف الواو بين المراتب، وإضافة "فقط لا غير" تلقائياً.
 */

const ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة',
  'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
];

const ONES_FEM = [
  '', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس',
  'ست', 'سبع', 'ثماني', 'تسع', 'عشر',
];

const TEENS = [
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر',
  'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];

const TENS = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون',
  'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

const HUNDREDS = [
  '', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة',
  'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة',
];

/** صياغة عدد من 0 إلى 999 بالعربية، مع مراعاة التذكير/التأنيث */
function tafqeetSub999(n: number, feminine = false): string {
  if (n === 0) return '';
  const ones = feminine ? ONES_FEM : ONES;

  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];

  if (h > 0) parts.push(HUNDREDS[h]);

  if (r > 0) {
    if (r < 11) {
      parts.push(ones[r]);
    } else if (r < 20) {
      parts.push(TEENS[r - 10]);
    } else {
      const t = Math.floor(r / 10);
      const u = r % 10;
      if (u === 0) {
        parts.push(TENS[t]);
      } else {
        parts.push(`${ones[u]} و${TENS[t]}`);
      }
    }
  }

  return parts.join(' و');
}

/** أسماء المراتب المركّبة مع تمييزها (مذكّر) */
interface ScaleUnit {
  singular: string;
  dual: string;
  plural3to10: string;
  pluralBig: string;
}

const THOUSAND: ScaleUnit = {
  singular: 'ألف',
  dual: 'ألفان',
  plural3to10: 'آلاف',
  pluralBig: 'ألفاً',
};

const MILLION: ScaleUnit = {
  singular: 'مليون',
  dual: 'مليونان',
  plural3to10: 'ملايين',
  pluralBig: 'مليوناً',
};

const BILLION: ScaleUnit = {
  singular: 'مليار',
  dual: 'ملياران',
  plural3to10: 'مليارات',
  pluralBig: 'ملياراً',
};

/** يبني الجزء الخاص بمرتبة معينة (ألف/مليون/مليار) لعدد من 1 .. 999 */
function buildScale(n: number, unit: ScaleUnit): string {
  if (n === 0) return '';
  if (n === 1) return unit.singular;
  if (n === 2) return unit.dual;
  if (n >= 3 && n <= 10) {
    return `${tafqeetSub999(n, false)} ${unit.plural3to10}`;
  }
  // 11 .. 99 → تمييز منصوب (ألفاً/مليوناً/ملياراً)
  if (n >= 11 && n <= 99) {
    return `${tafqeetSub999(n, false)} ${unit.pluralBig}`;
  }
  // 100 .. 999 → مفرد مجرور (ألف/مليون/مليار)
  return `${tafqeetSub999(n, false)} ${unit.singular}`;
}

/** يقوم بصياغة عدد صحيح موجب بالعربية. الحد الأقصى الموصى به: 999,999,999,999. */
function tafqeetInteger(n: number, feminine = false): string {
  if (n === 0) return 'صفر';

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (billions > 0) parts.push(buildScale(billions, BILLION));
  if (millions > 0) parts.push(buildScale(millions, MILLION));
  if (thousands > 0) parts.push(buildScale(thousands, THOUSAND));
  if (rest > 0) parts.push(tafqeetSub999(rest, feminine));

  return parts.join(' و');
}

/** بيانات صياغة العملة (المفرد/التمييز للعملة وللجزء الكسري) */
interface CurrencyTafqeetSpec {
  /** اسم العملة الرئيسي (مذكّر/مؤنّث) */
  major: string;
  /** اسم الجزء الكسري (مثلاً: فلس/سنت/قرش) */
  minor: string;
  /** عدد الخانات في الجزء الكسري (3 للدينار العراقي، 2 لمعظم العملات) */
  minorDigits: number;
  /** هل اسم العملة مؤنث؟ يؤثر على صياغة العدد قبله */
  feminine?: boolean;
}

const CURRENCY_SPECS: Record<string, CurrencyTafqeetSpec> = {
  IQD: { major: 'دينار عراقي', minor: 'فلس', minorDigits: 3, feminine: false },
  USD: { major: 'دولار أمريكي', minor: 'سنت', minorDigits: 2, feminine: false },
  EUR: { major: 'يورو', minor: 'سنت', minorDigits: 2, feminine: false },
  SAR: { major: 'ريال سعودي', minor: 'هللة', minorDigits: 2, feminine: false },
  AED: { major: 'درهم إماراتي', minor: 'فلس', minorDigits: 2, feminine: false },
  JOD: { major: 'دينار أردني', minor: 'فلس', minorDigits: 3, feminine: false },
  KWD: { major: 'دينار كويتي', minor: 'فلس', minorDigits: 3, feminine: false },
  QAR: { major: 'ريال قطري', minor: 'درهم', minorDigits: 2, feminine: false },
  EGP: { major: 'جنيه مصري', minor: 'قرش', minorDigits: 2, feminine: false },
  TRY: { major: 'ليرة تركية', minor: 'كروش', minorDigits: 2, feminine: true },
  GBP: { major: 'جنيه إسترليني', minor: 'بنس', minorDigits: 2, feminine: false },
};

function getCurrencySpec(code?: string): CurrencyTafqeetSpec {
  if (!code) return CURRENCY_SPECS.IQD;
  return CURRENCY_SPECS[code.toUpperCase()] ?? {
    major: code.toUpperCase(),
    minor: '',
    minorDigits: 2,
    feminine: false,
  };
}

export interface TafqeetOptions {
  /** كود العملة (IQD, USD, ...) — يحدد صياغة العملة وعدد المنازل العشرية */
  currency?: string;
  /** هل نُلحق "فقط لا غير" في النهاية؟ — افتراضي true */
  withSuffix?: boolean;
}

/**
 * تحويل مبلغ رقمي إلى نص عربي مكتمل مع اسم العملة.
 * مثال: `tafqeet(100000, { currency: 'IQD' })` → "فقط مئة ألف دينار عراقي لا غير".
 */
export function tafqeet(amount: number, opts: TafqeetOptions = {}): string {
  const { currency = 'IQD', withSuffix = true } = opts;
  const spec = getCurrencySpec(currency);

  if (!Number.isFinite(amount)) return '';
  const isNegative = amount < 0;
  const abs = Math.abs(amount);

  // تقريب وفقاً للمنازل العشرية للعملة
  const factor = Math.pow(10, spec.minorDigits);
  const rounded = Math.round(abs * factor);
  const major = Math.floor(rounded / factor);
  const minor = rounded - major * factor;

  const parts: string[] = [];

  if (major > 0) {
    const majorWords = tafqeetInteger(major, spec.feminine);
    parts.push(`${majorWords} ${spec.major}`);
  }

  if (minor > 0 && spec.minor) {
    const minorWords = tafqeetInteger(minor, spec.feminine);
    if (parts.length) parts.push('و');
    parts.push(`${minorWords} ${spec.minor}`);
  }

  if (parts.length === 0) {
    parts.push(`صفر ${spec.major}`);
  }

  const body = parts.join(' ').replace(/\s+و\s+/g, ' و');

  if (!withSuffix) return body;

  const sign = isNegative ? 'سالب ' : '';
  return `فقط ${sign}${body} لا غير`;
}
