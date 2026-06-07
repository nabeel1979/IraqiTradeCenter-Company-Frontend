import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import type { ItemUnitPayload, UnitOfMeasureDto } from '@/lib/api/inventory';

const ROW_LABELS = ['الوحدة الأولى', 'الوحدة الثانية', 'الوحدة الثالثة'] as const;

interface ItemUnitsSectionProps {
  formUnits: ItemUnitPayload[];
  measureUnits: UnitOfMeasureDto[];
  onChange: (units: ItemUnitPayload[]) => void;
}

function emptySlot(sortOrder: number, baseUnitId: number): ItemUnitPayload {
  return {
    unitOfMeasureId: sortOrder === 0 ? baseUnitId : 0,
    sortOrder,
    conversionFactor: 1,
    unitBarcode: '',
    isBase: sortOrder === 0,
    prices: [],
  };
}

function slotAt(units: ItemUnitPayload[], sortOrder: number, baseUnitId: number): ItemUnitPayload {
  return units.find(u => u.sortOrder === sortOrder) ?? emptySlot(sortOrder, baseUnitId);
}

function normalizeUnits(units: ItemUnitPayload[]): ItemUnitPayload[] {
  const next = units
    .filter(u => u.sortOrder === 0 || u.unitOfMeasureId > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((u, i) => ({
      ...u,
      sortOrder: i,
      conversionFactor: i === 0 ? 1 : u.conversionFactor,
    }));

  const active = next.filter(u => u.unitOfMeasureId > 0);
  if (active.length === 0) return next;

  const marked = next.filter(u => u.isBase && u.unitOfMeasureId > 0);
  const defaultSort = marked.length === 1 ? marked[0].sortOrder : 0;
  return next.map(u => ({ ...u, isBase: u.sortOrder === defaultSort && u.unitOfMeasureId > 0 }));
}

export function unitLabel(measureUnits: UnitOfMeasureDto[], unitOfMeasureId: number): string {
  const u = measureUnits.find(m => m.id === unitOfMeasureId);
  if (!u) return '—';
  return u.nameAr;
}

export function ItemUnitsSection({ formUnits, measureUnits, onChange }: ItemUnitsSectionProps) {
  const baseUnitId = measureUnits[0]?.id ?? formUnits[0]?.unitOfMeasureId ?? 0;
  const hasExplicitDefault = formUnits.some(u => u.isBase && u.unitOfMeasureId > 0);

  const patchSlot = (sortOrder: number, patch: Partial<ItemUnitPayload>) => {
    const next = [...formUnits];
    const idx = next.findIndex(u => u.sortOrder === sortOrder);
    const current = slotAt(formUnits, sortOrder, baseUnitId);
    const updated: ItemUnitPayload = {
      ...current,
      ...patch,
      sortOrder,
      conversionFactor: sortOrder === 0 ? 1 : (patch.conversionFactor ?? current.conversionFactor),
    };

    if (sortOrder > 0 && patch.unitOfMeasureId === 0) {
      onChange(
        normalizeUnits(
          next
            .filter(u => u.sortOrder < sortOrder)
            .map((u, i) => ({ ...u, sortOrder: i, conversionFactor: i === 0 ? 1 : u.conversionFactor })),
        ),
      );
      return;
    }

    if (idx >= 0) next[idx] = updated;
    else next.push(updated);

    onChange(normalizeUnits(next));
  };

  const setDefaultUnit = (sortOrder: number) => {
    onChange(
      normalizeUnits(
        formUnits.map(u => ({
          ...u,
          isBase: u.sortOrder === sortOrder,
        })),
      ),
    );
  };

  const rowEnabled = (sortOrder: number) => {
    if (sortOrder === 0) return true;
    const prev = slotAt(formUnits, sortOrder - 1, baseUnitId);
    return prev.unitOfMeasureId > 0;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-xs text-muted-foreground leading-snug">
          الوحدة الأولى هي الأصغر (المعادل = 1). اختر الوحدة الافتراضية للفاتورة.
        </p>
        <Link to="/inventory/units" target="_blank" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
          إدارة وحدات القياس<ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="rounded-lg border">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-1.5 py-1 text-center w-12" title="الوحدة الافتراضية في الفاتورة">افتراضية</th>
              <th className="px-1.5 py-1 text-right w-24"></th>
              <th className="px-1.5 py-1 text-right">وحدة القياس</th>
              <th className="px-1.5 py-1 text-center w-20">المعادل</th>
              <th className="px-1.5 py-1 text-right w-[28%]">باركود</th>
            </tr>
          </thead>
          <tbody>
            {ROW_LABELS.map((label, sortOrder) => {
              const slot = slotAt(formUnits, sortOrder, baseUnitId);
              const enabled = rowEnabled(sortOrder);
              const hasUnit = sortOrder === 0 || slot.unitOfMeasureId > 0;
              const isDefault = hasUnit && (slot.isBase || (!hasExplicitDefault && sortOrder === 0));

              return (
                <tr key={sortOrder} className={`border-t ${!enabled ? 'opacity-50' : ''}`}>
                  <td className="px-1.5 py-1 text-center">
                    <input
                      type="radio"
                      name="defaultInvoiceUnit"
                      className="h-4 w-4 accent-primary"
                      checked={isDefault}
                      disabled={!hasUnit}
                      onChange={() => setDefaultUnit(sortOrder)}
                      title="وحدة افتراضية في الفاتورة"
                    />
                  </td>
                  <td className="px-1.5 py-1 font-medium text-muted-foreground whitespace-nowrap text-xs">{label}</td>
                  <td className="px-1.5 py-1">
                    <select
                      className="w-full rounded-md border bg-background px-2 py-1 text-xs sm:text-sm disabled:opacity-60"
                      value={sortOrder === 0 ? slot.unitOfMeasureId : (slot.unitOfMeasureId || '')}
                      disabled={!enabled || (sortOrder === 0 && !measureUnits.length)}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (sortOrder > 0 && !v) patchSlot(sortOrder, { unitOfMeasureId: 0 });
                        else patchSlot(sortOrder, { unitOfMeasureId: v });
                      }}
                    >
                      {sortOrder > 0 && <option value="">— بدون —</option>}
                      {measureUnits.map(u => (
                        <option key={u.id} value={u.id}>{u.nameAr}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <Input
                      type="number"
                      min={0.000001}
                      step="any"
                      dir="ltr"
                      className="h-7 text-center font-mono text-sm"
                      disabled={sortOrder === 0 || !hasUnit}
                      value={sortOrder === 0 ? 1 : slot.conversionFactor}
                      onChange={e => patchSlot(sortOrder, { conversionFactor: parseFloat(e.target.value) || 1 })}
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <Input
                      dir="ltr"
                      className="h-7 font-mono text-sm"
                      disabled={!hasUnit}
                      value={slot.unitBarcode ?? ''}
                      onChange={e => patchSlot(sortOrder, { unitBarcode: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground flex items-start gap-1 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-2 py-1 leading-snug">
        <span className="text-blue-600 shrink-0">ℹ</span>
        الوحدة «افتراضية» تُختار في الفاتورة. المعادل يربط بالوحدة الأولى (مثال: 1 كرتون = 48 قطعة → 48).
      </p>
    </div>
  );
}
