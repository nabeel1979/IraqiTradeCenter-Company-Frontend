import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/utils';

interface InvoiceTotalsPanelProps {
  currency: string;
  subTotal: number;
  discount: number;
  tax: number;
  total: number;
  paid?: number;
  remaining?: number;
  className?: string;
  compact?: boolean;
}

export function InvoiceTotalsPanel({
  currency,
  subTotal,
  discount,
  tax,
  total,
  paid,
  remaining,
  className,
  compact,
}: InvoiceTotalsPanelProps) {
  const rowCls = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={cn('invoice-totals-panel', className)}>
      <div className={cn('flex justify-between gap-4', rowCls)}>
        <span className="text-muted-foreground">المجموع الفرعي</span>
        <span className="num-display font-medium">{formatMoney(subTotal, currency)}</span>
      </div>
      {discount > 0 && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">الخصم</span>
          <span className="num-display text-destructive">− {formatMoney(discount, currency)}</span>
        </div>
      )}
      {tax > 0 && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">الضريبة</span>
          <span className="num-display">{formatMoney(tax, currency)}</span>
        </div>
      )}
      <div className="invoice-totals-grand">
        <span>الإجمالي</span>
        <span className="num-display">{formatMoney(total, currency)}</span>
      </div>
      {paid != null && (
        <div className={cn('flex justify-between gap-4 pt-1', rowCls)}>
          <span className="text-muted-foreground">المدفوع</span>
          <span className="num-display text-success">{formatMoney(paid, currency)}</span>
        </div>
      )}
      {remaining != null && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">المتبقي</span>
          <span className="num-display">{formatMoney(remaining, currency)}</span>
        </div>
      )}
    </div>
  );
}
