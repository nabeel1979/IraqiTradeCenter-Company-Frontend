import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { OrderProcessingStatus } from '@/pages/orders/orderStatus';

const STATUS_MAP: Record<string, 'warning' | 'default' | 'success' | 'destructive' | 'muted'> = {
  Pending: 'warning',
  Received: 'default',
  InProcessing: 'default',
  InvoiceIssued: 'success',
  Shipping: 'default',
  Delivered: 'success',
  Rejected: 'destructive',
  // توافق مع بيانات قديمة قبل الترحيل
  Reviewed: 'default',
  Confirmed: 'success',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = `orders.status.${status}`;
  const label = t(key, { defaultValue: status });
  const variant = STATUS_MAP[status as OrderProcessingStatus] ?? 'muted';
  return <Badge variant={variant}>{label}</Badge>;
}
