function slugFromEnglish(nameEn: string, maxLen = 20): string {
  return nameEn
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen);
}

/** يُولّد رمز مرجعي من الاسم الإنجليزي أو العربي */
export function generateLookupCode(fallbackPrefix: string, nameEn: string, nameAr: string): string {
  const slug = slugFromEnglish(nameEn);
  if (slug.length >= 2) return slug;

  const ar = nameAr.trim();
  if (!ar) return '';

  const words = ar.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('').slice(0, 6);
    return `${fallbackPrefix}_${initials}`.toUpperCase();
  }
  return `${fallbackPrefix}_${ar.slice(0, 8).replace(/\s+/g, '')}`;
}

/** رمز وحدة قياس */
export function generateUnitCode(nameEn: string, nameAr: string): string {
  return generateLookupCode('U', nameEn, nameAr);
}

/** رمز لون */
export function generateColorCode(nameEn: string, nameAr: string): string {
  return generateLookupCode('C', nameEn, nameAr);
}

/** رمز صنف مادة */
export function generateCategoryCode(nameEn: string, nameAr: string): string {
  return generateLookupCode('CAT', nameEn, nameAr);
}

/** رمز مستودع */
export function generateWarehouseCode(nameEn: string, nameAr: string): string {
  return generateLookupCode('WH', nameEn, nameAr);
}
