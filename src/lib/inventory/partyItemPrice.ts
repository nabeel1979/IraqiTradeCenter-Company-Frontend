import type { ItemDetailDto, ItemPriceType } from '@/lib/api/inventory';

const SALE_FALLBACK: ItemPriceType[] = [4, 5, 3, 6];

/** يستخرج سعر الوحدة حسب نوع السعر المرتبط بالطرف (مفرد/خاص/جملة/تصدير). */
export function resolveUnitPriceForParty(
  item: ItemDetailDto,
  unitOfMeasureId: number,
  priceType: ItemPriceType | null | undefined,
  currency = 'IQD',
): number {
  const unit = item.units.find(u => u.unitOfMeasureId === unitOfMeasureId)
    ?? item.units.find(u => u.isBase)
    ?? item.units[0];
  if (!unit) return item.baseSalesPrice;

  const pick = (t: ItemPriceType) =>
    unit.prices.find(p => p.priceType === t && p.currency === currency)?.amount ?? 0;

  const preferred = priceType ?? 4;
  const direct = pick(preferred);
  if (direct > 0) return direct;

  for (const t of SALE_FALLBACK) {
    const v = pick(t);
    if (v > 0) return v;
  }

  return item.baseSalesPrice;
}
