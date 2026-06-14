import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface Props {
  returnTo: string | null;
  returnLabel: string | null;
}

export function InvoiceInventoryBackButton({ returnTo, returnLabel }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!returnTo) return null;

  const label = returnLabel
    ? t('invoices.list.backTo', { label: returnLabel })
    : t('invoices.list.back');

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 gap-1.5"
      onClick={() => navigate(returnTo)}
    >
      <ArrowRight className="h-4 w-4" />
      {label}
    </Button>
  );
}
