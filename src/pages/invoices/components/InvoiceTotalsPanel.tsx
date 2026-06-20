import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/utils';

interface InvoiceTotalsPanelProps {
  currency: string;
  subTotal: number;
  discount: number;
  addition?: number;
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
  addition = 0,
  tax,
  total,
  paid,
  remaining,
  className,
  compact,
}: InvoiceTotalsPanelProps) {
  const { t } = useTranslation();
  const rowCls = compact ? 'text-xs' : 'text-sm';
  // ‎عرض رقمي بمرتبتين عشريتين ليطابق قيم القيد المحاسبي المولّد من الفاتورة.
  const money = (v: number | null | undefined) => formatMoney(v, currency, { decimals: 2 });

  return (
    <div className={cn('invoice-totals-panel', className)}>
      <div className={cn('flex justify-between gap-4', rowCls)}>
        <span className="text-muted-foreground">{t('common.subtotal')}</span>
        <span className="num-display font-medium">{money(subTotal)}</span>
      </div>
      {discount > 0 && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">{t('invoices.create.discount')}</span>
          <span className="num-display text-destructive">− {money(discount)}</span>
        </div>
      )}
      {addition > 0 && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">{t('invoices.create.addition')}</span>
          <span className="num-display text-emerald-600">+ {money(addition)}</span>
        </div>
      )}
      {tax > 0 && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">{t('invoices.create.tax')}</span>
          <span className="num-display">{money(tax)}</span>
        </div>
      )}
      <div className="invoice-totals-grand">
        <span>{t('invoices.create.grandTotal')}</span>
        <span className="num-display">{money(total)}</span>
      </div>
      {paid != null && (
        <div className={cn('flex justify-between gap-4 pt-1', rowCls)}>
          <span className="text-muted-foreground">{t('invoices.create.paid')}</span>
          <span className="num-display text-success">{money(paid)}</span>
        </div>
      )}
      {remaining != null && (
        <div className={cn('flex justify-between gap-4', rowCls)}>
          <span className="text-muted-foreground">{t('invoices.create.remaining')}</span>
          <span className="num-display">{money(remaining)}</span>
        </div>
      )}
    </div>
  );
}
