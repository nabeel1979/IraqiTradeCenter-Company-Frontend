import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customersApi } from '@/lib/api/customers';

interface Props {
  customerId: number;
  customerName: string;
  customerCode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivated: () => void;
}

export function CustomerActivateDialog({
  customerId, customerName, customerCode, open, onOpenChange, onActivated,
}: Props) {
  const { t } = useTranslation();
  const [storeUserCode, setStoreUserCode] = useState('');

  const mut = useMutation({
    mutationFn: () => customersApi.update(customerId, {
      isActive: true,
      storeUserCode: storeUserCode.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success(t('orders.activateSuccess'));
      onActivated();
      onOpenChange(false);
      setStoreUserCode('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? t('common.error'));
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserCheck className="h-4 w-4 text-primary" />
            {t('orders.activateAccount')}
          </h3>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">{t('orders.activateDesc')}</p>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">{customerName}</p>
            {customerCode && <p className="font-mono text-xs text-muted-foreground">{customerCode}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('orders.storeUserCode')}</label>
            <Input
              value={storeUserCode}
              onChange={(e) => setStoreUserCode(e.target.value.toUpperCase())}
              placeholder={t('orders.storeUserCodePlaceholder')}
              className="font-mono"
              dir="ltr"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('orders.storeUserCodeHint')}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? t('common.loading') : t('orders.activateNow')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
