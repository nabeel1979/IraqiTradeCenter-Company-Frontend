import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useBranchContext, useDefaultBranchId } from '@/lib/branches/useBranchContext';

interface BranchSelectProps {
  value: number | null;
  onChange: (id: number) => void;
  label?: string;
  className?: string;
  selectClassName?: string;
  required?: boolean;
}

export function BranchSelect({
  value,
  onChange,
  label = 'الفرع',
  className,
  selectClassName,
  required = true,
}: BranchSelectProps) {
  const { branches, hasBranches, isLoading } = useBranchContext();
  useDefaultBranchId(value, onChange);

  if (!hasBranches) return null;

  return (
    <div className={className}>
      <Label className="mb-1 block text-[11px] text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      <select
        className={cn(
          'h-9 w-full rounded-md border border-input bg-secondary/40 px-3 text-sm',
          selectClassName,
        )}
        value={value ?? ''}
        required={required}
        disabled={isLoading || branches.length === 0}
        onChange={e => onChange(Number(e.target.value))}
      >
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.nameAr}</option>
        ))}
      </select>
    </div>
  );
}

interface BranchFilterSelectProps {
  value: number | '';
  onChange: (v: number | '') => void;
  showAllOption?: boolean;
  className?: string;
  selectClassName?: string;
}

export function BranchFilterSelect({
  value,
  onChange,
  showAllOption = false,
  className,
  selectClassName,
}: BranchFilterSelectProps) {
  const { branches, hasBranches, viewAll, isLoading } = useBranchContext();

  if (!hasBranches) return null;

  const canShowAll = showAllOption && viewAll;

  return (
    <div className={className}>
      <select
        className={cn(
          'h-8 rounded-md border border-input bg-secondary/40 px-2 text-sm',
          selectClassName,
        )}
        value={value === '' ? '' : value}
        disabled={isLoading}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        title="فلتر حسب الفرع"
      >
        {canShowAll && <option value="">كل الفروع</option>}
        {branches.map(b => (
          <option key={b.id} value={b.id}>
            {b.nameAr}{b.isMain ? ' (رئيسي)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function useInitialBranchFilter(): number | '' {
  return '';
}
