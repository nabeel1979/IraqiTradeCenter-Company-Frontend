/** Paper sizes in eSCL units (1/300 inch), matching common eSCL clients. */
export const PAPER_DIMENSIONS_300TH_INCH: Record<
  string,
  { width: number; height: number; xOffset?: number; yOffset?: number }
> = {
  A4: { width: 2480, height: 3508, xOffset: 0, yOffset: 0 },
  A3: { width: 3508, height: 4961, xOffset: 0, yOffset: 0 },
  Letter: { width: 2550, height: 3300, xOffset: 0, yOffset: 0 },
  '5x7 in.': { width: 1500, height: 2100, xOffset: 0, yOffset: 0 },
  '4x6 in.': { width: 1200, height: 1800, xOffset: 0, yOffset: 0 },
  '10x15 cm': { width: 1181, height: 1771, xOffset: 0, yOffset: 0 },
};

export const PAPER_SIZE_ORDER = ['A4', 'A3', 'Letter', '5x7 in.', '4x6 in.', '10x15 cm'] as const;

/** Map scanner/UI labels (e.g. Brother variants) to a known paper key. */
export function normalizePaperLabel(label: string): string | null {
  const trimmed = label.trim();
  if (PAPER_DIMENSIONS_300TH_INCH[trimmed]) {
    return trimmed;
  }
  const upper = trimmed.toUpperCase();
  if (upper.includes('A4')) return 'A4';
  if (upper.includes('A3')) return 'A3';
  if (upper.includes('LETTER')) return 'Letter';
  if (upper.includes('5X7')) return '5x7 in.';
  if (upper.includes('4X6')) return '4x6 in.';
  if (upper.includes('10X15')) return '10x15 cm';
  return null;
}

export function getPaperDimensions300ths(label: string) {
  const key = normalizePaperLabel(label);
  return key ? PAPER_DIMENSIONS_300TH_INCH[key] : null;
}

/** ISO page size in mm for PDF output. */
export const PAPER_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
  '5x7 in.': [127, 178],
  '4x6 in.': [101.6, 152.4],
  '10x15 cm': [100, 150],
};

export function paperMmSize(label: string): [number, number] {
  const key = normalizePaperLabel(label) ?? 'A4';
  return PAPER_MM[key] ?? PAPER_MM.A4;
}
