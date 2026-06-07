import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ITEM_CURRENCIES,
  ITEM_SALE_PRICE_TYPES,
  type ItemPriceType,
  type ItemUnitPayload,
} from '@/lib/api/inventory';

interface ItemPricesSectionProps {
  formUnits: ItemUnitPayload[];
  unitHeaders: string[];
  onChange: (units: ItemUnitPayload[]) => void;
}

export function ItemPricesSection({ formUnits, unitHeaders, onChange }: ItemPricesSectionProps) {
  const [currency, setCurrency] = useState<(typeof ITEM_CURRENCIES)[number]>('IQD');

  const getPrice = (unitIdx: number, priceType: ItemPriceType) => {
    const unit = formUnits[unitIdx];
    if (!unit) return '';
    return unit.prices.find(p => p.currency === currency && p.priceType === priceType)?.amount ?? '';
  };

  const setPrice = (unitIdx: number, priceType: ItemPriceType, value: string) => {
    const unitsCopy = formUnits.map(u => ({ ...u, prices: [...u.prices] }));
    const u = unitsCopy[unitIdx];
    if (!u) return;

    const idx = u.prices.findIndex(p => p.currency === currency && p.priceType === priceType);
    const amount = parseFloat(value) || 0;
    if (idx >= 0) {
      if (amount <= 0) u.prices.splice(idx, 1);
      else u.prices[idx] = { ...u.prices[idx], amount };
    } else if (amount > 0) {
      u.prices.push({ currency, priceType, amount });
    }
    onChange(unitsCopy);
  };

  if (formUnits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        عيّن الوحدة الأولى في تبويب «الوحدات» أولاً
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Label className="text-xs shrink-0">العملة</Label>
        <div className="flex gap-1">
          {ITEM_CURRENCIES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                currency === c
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted',
              )}
            >
              {c === 'IQD' ? 'دينار' : 'دولار'}
              <span className="mx-1 opacity-50">·</span>
              <span className="font-mono">{c}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-2 py-1.5 text-right w-[22%] font-medium">نوع السعر</th>
              {unitHeaders.map((h, i) => (
                <th key={i} className="px-1.5 py-1.5 text-center font-medium">
                  <span className="block text-[10px] text-muted-foreground font-normal leading-tight">
                    {i === 0 ? 'وحدة أولى' : i === 1 ? 'وحدة ثانية' : 'وحدة ثالثة'}
                  </span>
                  <span className="truncate block">{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ITEM_SALE_PRICE_TYPES.map(pt => (
              <tr key={pt.value} className="border-t">
                <td className="px-2 py-1 font-medium whitespace-nowrap">{pt.label}</td>
                {formUnits.map((_, unitIdx) => (
                  <td key={unitIdx} className="px-1 py-0.5">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      dir="ltr"
                      className="h-7 text-center font-mono text-sm px-1"
                      placeholder="0"
                      value={getPrice(unitIdx, pt.value)}
                      onChange={e => setPrice(unitIdx, pt.value, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
