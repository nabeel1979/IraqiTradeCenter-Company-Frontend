import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const map: Record<string, { labelKey: string; variant: 'success' | 'warning' | 'default' | 'muted' | 'destructive' }> = {
    Paid: { labelKey: 'invoices.status.paid', variant: 'success' },
    PartiallyPaid: { labelKey: 'invoices.status.partiallyPaid', variant: 'warning' },
    Issued: { labelKey: 'invoices.status.issued', variant: 'default' },
    Draft: { labelKey: 'invoices.status.draft', variant: 'muted' },
    Cancelled: { labelKey: 'invoices.status.cancelled', variant: 'destructive' },
  };
  const cfg = map[status];
  return <Badge variant={cfg?.variant ?? 'muted'}>{cfg ? t(cfg.labelKey) : status}</Badge>;
}
