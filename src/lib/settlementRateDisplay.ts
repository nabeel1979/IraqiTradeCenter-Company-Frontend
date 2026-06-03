/**
 * عرض سعر الصرف بصيغة النشرة: «1500 * 1» أو «1500 / 1».
 * يُطابق منطق SettlementRateDisplay في الخادم.
 */
export function formatSettlementRateDisplay(crossRate: number | null | undefined): string {
  if (crossRate == null || !Number.isFinite(crossRate) || crossRate <= 0) return '—';
  if (Math.abs(crossRate - 1) < 1e-9) return '1 * 1';

  const fmt = (n: number) => {
    const rounded = Math.round(n * 1e6) / 1e6;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
      return Math.round(rounded).toLocaleString('en-US');
    }
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 6 });
  };

  if (crossRate >= 1) return `${fmt(crossRate)} * 1`;
  return `${fmt(1 / crossRate)} / 1`;
}

/** يعرض سعر النشرة من الـ preview إن وُجد، وإلا يُحوّل السعر العشري. */
export function formatSettlementBulletinRateDisplay(
  preview: {
    bulletinCrossRateDisplay?: string | null;
    bulletinCrossRate?: number;
  } | null | undefined,
): string {
  if (preview?.bulletinCrossRateDisplay?.trim()) return preview.bulletinCrossRateDisplay.trim();
  return formatSettlementRateDisplay(preview?.bulletinCrossRate);
}

/** يعرض سعر الصرف المُطبَّق من الـ preview إن وُجد، وإلا يُحوّل السعر العشري. */
export function formatSettlementExchangeRateDisplay(
  preview: {
    exchangeRateDisplay?: string | null;
    bulletinCrossRateDisplay?: string | null;
    bulletinCrossRate?: number;
  } | null | undefined,
  fallbackRate?: number | null,
): string {
  if (preview?.exchangeRateDisplay?.trim()) return preview.exchangeRateDisplay.trim();
  if (preview?.bulletinCrossRateDisplay?.trim()) return preview.bulletinCrossRateDisplay.trim();
  return formatSettlementRateDisplay(fallbackRate ?? preview?.bulletinCrossRate);
}
