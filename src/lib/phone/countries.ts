export type PhoneCountry = {
  iso: string;
  dialCode: string;
};

/** Dial codes without leading +. Priority countries appear first in the picker. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'IQ', dialCode: '964' },
  { iso: 'AE', dialCode: '971' },
  { iso: 'SA', dialCode: '966' },
  { iso: 'KW', dialCode: '965' },
  { iso: 'JO', dialCode: '962' },
  { iso: 'LB', dialCode: '961' },
  { iso: 'EG', dialCode: '20' },
  { iso: 'SY', dialCode: '963' },
  { iso: 'TR', dialCode: '90' },
  { iso: 'IR', dialCode: '98' },
  { iso: 'US', dialCode: '1' },
  { iso: 'GB', dialCode: '44' },
  { iso: 'DE', dialCode: '49' },
  { iso: 'FR', dialCode: '33' },
  { iso: 'IN', dialCode: '91' },
  { iso: 'PK', dialCode: '92' },
  { iso: 'AF', dialCode: '93' },
  { iso: 'AL', dialCode: '355' },
  { iso: 'DZ', dialCode: '213' },
  { iso: 'AD', dialCode: '376' },
  { iso: 'AO', dialCode: '244' },
  { iso: 'AR', dialCode: '54' },
  { iso: 'AM', dialCode: '374' },
  { iso: 'AU', dialCode: '61' },
  { iso: 'AT', dialCode: '43' },
  { iso: 'AZ', dialCode: '994' },
  { iso: 'BH', dialCode: '973' },
  { iso: 'BD', dialCode: '880' },
  { iso: 'BY', dialCode: '375' },
  { iso: 'BE', dialCode: '32' },
  { iso: 'BR', dialCode: '55' },
  { iso: 'BG', dialCode: '359' },
  { iso: 'CA', dialCode: '1' },
  { iso: 'CL', dialCode: '56' },
  { iso: 'CN', dialCode: '86' },
  { iso: 'CO', dialCode: '57' },
  { iso: 'HR', dialCode: '385' },
  { iso: 'CY', dialCode: '357' },
  { iso: 'CZ', dialCode: '420' },
  { iso: 'DK', dialCode: '45' },
  { iso: 'EE', dialCode: '372' },
  { iso: 'FI', dialCode: '358' },
  { iso: 'GE', dialCode: '995' },
  { iso: 'GR', dialCode: '30' },
  { iso: 'HK', dialCode: '852' },
  { iso: 'HU', dialCode: '36' },
  { iso: 'IS', dialCode: '354' },
  { iso: 'ID', dialCode: '62' },
  { iso: 'IE', dialCode: '353' },
  { iso: 'IL', dialCode: '972' },
  { iso: 'IT', dialCode: '39' },
  { iso: 'JP', dialCode: '81' },
  { iso: 'KZ', dialCode: '7' },
  { iso: 'KE', dialCode: '254' },
  { iso: 'KR', dialCode: '82' },
  { iso: 'LY', dialCode: '218' },
  { iso: 'LT', dialCode: '370' },
  { iso: 'LU', dialCode: '352' },
  { iso: 'MY', dialCode: '60' },
  { iso: 'MX', dialCode: '52' },
  { iso: 'MA', dialCode: '212' },
  { iso: 'NL', dialCode: '31' },
  { iso: 'NZ', dialCode: '64' },
  { iso: 'NG', dialCode: '234' },
  { iso: 'NO', dialCode: '47' },
  { iso: 'OM', dialCode: '968' },
  { iso: 'PS', dialCode: '970' },
  { iso: 'PH', dialCode: '63' },
  { iso: 'PL', dialCode: '48' },
  { iso: 'PT', dialCode: '351' },
  { iso: 'QA', dialCode: '974' },
  { iso: 'RO', dialCode: '40' },
  { iso: 'RU', dialCode: '7' },
  { iso: 'RS', dialCode: '381' },
  { iso: 'SG', dialCode: '65' },
  { iso: 'SK', dialCode: '421' },
  { iso: 'SI', dialCode: '386' },
  { iso: 'ZA', dialCode: '27' },
  { iso: 'ES', dialCode: '34' },
  { iso: 'LK', dialCode: '94' },
  { iso: 'SD', dialCode: '249' },
  { iso: 'SE', dialCode: '46' },
  { iso: 'CH', dialCode: '41' },
  { iso: 'TH', dialCode: '66' },
  { iso: 'TN', dialCode: '216' },
  { iso: 'UA', dialCode: '380' },
  { iso: 'UZ', dialCode: '998' },
  { iso: 'VN', dialCode: '84' },
  { iso: 'YE', dialCode: '967' },
];

const byIso = new Map(PHONE_COUNTRIES.map(c => [c.iso, c]));
const byDialDesc = [...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

export function getCountryByIso(iso: string): PhoneCountry | undefined {
  return byIso.get(iso.toUpperCase());
}

export function flagEmoji(iso: string): string {
  const code = iso.toUpperCase();
  if (code.length !== 2) return '🌐';
  return String.fromCodePoint(
    ...[...code].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function buildFullNumber(dialCode: string, national: string): string {
  let n = national.replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (!n) return '';
  return dialCode + n;
}

export function parseFullNumber(full: string): { country: PhoneCountry; national: string } | null {
  const digits = full.replace(/\D/g, '');
  if (!digits) return null;

  for (const country of byDialDesc) {
    if (digits.startsWith(country.dialCode)) {
      return { country, national: digits.slice(country.dialCode.length) };
    }
  }

  return null;
}

/** يفكّك رقماً محفوظاً (E.164 أو صيغة محلية مثل 07...) لعرضه في الحقل. */
export function parsePhoneForInput(
  value: string,
  defaultIso = 'IQ',
): { country: PhoneCountry; national: string } {
  const trimmed = value.trim();
  const fallback = getCountryByIso(defaultIso) ?? getCountryByIso('IQ')!;
  if (!trimmed) return { country: fallback, national: '' };

  const parsed = parseFullNumber(trimmed);
  if (parsed) return parsed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length > 1) {
    return { country: fallback, national: digits.slice(1) };
  }

  return { country: fallback, national: digits };
}

const displayNamesEn = typeof Intl !== 'undefined'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;
const displayNamesAr = typeof Intl !== 'undefined'
  ? new Intl.DisplayNames(['ar'], { type: 'region' })
  : null;

/** أسماء واختصارات شائعة للبحث (مثل CAN → كندا). */
const COUNTRY_SEARCH_ALIASES: Record<string, string[]> = {
  CA: ['canada', 'can'],
  US: ['usa', 'america', 'united states'],
  GB: ['uk', 'britain', 'england', 'united kingdom'],
  AE: ['uae', 'emirates'],
  SA: ['ksa', 'saudi'],
};

export function getCountryDisplayName(iso: string, locale: string): string {
  const code = iso.toUpperCase();
  try {
    const dn = locale.startsWith('ar') ? displayNamesAr : displayNamesEn;
    return dn?.of(code) ?? code;
  } catch {
    return code;
  }
}

function countrySearchHaystack(country: PhoneCountry): string {
  const iso = country.iso.toLowerCase();
  const en = (displayNamesEn?.of(country.iso) ?? country.iso).toLowerCase();
  const ar = (displayNamesAr?.of(country.iso) ?? country.iso).toLowerCase();
  const aliases = (COUNTRY_SEARCH_ALIASES[country.iso] ?? []).join(' ');
  return `${iso} +${country.dialCode} ${en} ${ar} ${aliases}`;
}

function countrySearchScore(country: PhoneCountry, q: string): number {
  const iso = country.iso.toLowerCase();
  const en = (displayNamesEn?.of(country.iso) ?? '').toLowerCase();
  const ar = (displayNamesAr?.of(country.iso) ?? '').toLowerCase();
  const aliases = COUNTRY_SEARCH_ALIASES[country.iso] ?? [];

  if (iso === q) return 100;
  if (aliases.some(a => a === q || a.startsWith(q))) return 90;
  if (en.startsWith(q) || ar.startsWith(q)) return 80;
  if (iso.startsWith(q)) return 70;
  if (en.includes(q) || ar.includes(q)) return 60;
  if (aliases.some(a => a.includes(q))) return 55;
  if (country.dialCode.startsWith(q.replace(/\D/g, ''))) return 50;
  if (countrySearchHaystack(country).includes(q)) return 40;
  return 0;
}

/** يبحث بالعربية والإنجليزية ورمز ISO والمفتاح. */
export function filterPhoneCountries(query: string): PhoneCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return PHONE_COUNTRIES;

  const digits = q.replace(/\D/g, '');
  const scored = PHONE_COUNTRIES
    .map(c => ({ c, score: countrySearchScore(c, q) || (digits && c.dialCode.includes(digits) ? 45 : 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(x => x.c);
}
