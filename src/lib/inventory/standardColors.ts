export interface StandardColor {
  key: string;
  nameAr: string;
  nameEn: string;
  hex: string;
}

export const STANDARD_COLORS: StandardColor[] = [
  { key: 'RED', nameAr: 'أحمر', nameEn: 'Red', hex: '#EF4444' },
  { key: 'GREEN', nameAr: 'أخضر', nameEn: 'Green', hex: '#22C55E' },
  { key: 'BLUE', nameAr: 'أزرق', nameEn: 'Blue', hex: '#3B82F6' },
  { key: 'YELLOW', nameAr: 'أصفر', nameEn: 'Yellow', hex: '#EAB308' },
  { key: 'WHITE', nameAr: 'أبيض', nameEn: 'White', hex: '#FFFFFF' },
  { key: 'BLACK', nameAr: 'أسود', nameEn: 'Black', hex: '#111827' },
  { key: 'ORANGE', nameAr: 'برتقالي', nameEn: 'Orange', hex: '#F97316' },
  { key: 'PURPLE', nameAr: 'بنفسجي', nameEn: 'Purple', hex: '#A855F7' },
  { key: 'PINK', nameAr: 'وردي', nameEn: 'Pink', hex: '#EC4899' },
  { key: 'BROWN', nameAr: 'بني', nameEn: 'Brown', hex: '#92400E' },
  { key: 'GRAY', nameAr: 'رمادي', nameEn: 'Gray', hex: '#6B7280' },
  { key: 'NAVY', nameAr: 'كحلي', nameEn: 'Navy', hex: '#1E3A5F' },
  { key: 'BEIGE', nameAr: 'بيج', nameEn: 'Beige', hex: '#D4C4A8' },
  { key: 'GOLD', nameAr: 'ذهبي', nameEn: 'Gold', hex: '#CA8A04' },
  { key: 'SILVER', nameAr: 'فضي', nameEn: 'Silver', hex: '#C0C0C0' },
  { key: 'CYAN', nameAr: 'سماوي', nameEn: 'Cyan', hex: '#06B6D4' },
  { key: 'MAROON', nameAr: 'خمري', nameEn: 'Maroon', hex: '#7F1D1D' },
  { key: 'OLIVE', nameAr: 'زيتي', nameEn: 'Olive', hex: '#65A30D' },
];

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

export function matchColorToStandard(color: {
  nameAr: string;
  nameEn?: string | null;
  code?: string;
}): StandardColor | undefined {
  const ar = norm(color.nameAr);
  const en = color.nameEn ? norm(color.nameEn) : '';
  const code = color.code?.trim().toUpperCase() ?? '';
  return STANDARD_COLORS.find(s =>
    norm(s.nameAr) === ar
    || norm(s.nameEn) === en
    || s.key === code
    || code === s.nameEn.toUpperCase(),
  );
}

export function getAvailableStandardColors(
  existing: { nameAr: string; nameEn?: string | null; code?: string }[],
  excludeKeys: Set<string> = new Set(),
): StandardColor[] {
  const taken = new Set<string>();
  for (const c of existing) {
    const std = matchColorToStandard(c);
    if (std) taken.add(std.key);
  }
  for (const k of excludeKeys) taken.add(k);
  return STANDARD_COLORS.filter(s => !taken.has(s.key));
}
