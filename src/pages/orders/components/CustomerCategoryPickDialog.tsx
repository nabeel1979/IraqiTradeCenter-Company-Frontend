import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { cn } from '@/lib/utils';
import type { FinancialPartyKind } from '@/types/api';

interface Props {
  open: boolean;
  kind: FinancialPartyKind;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (categoryId: number) => void;
}

export function CustomerCategoryPickDialog({
  open, kind, title, description, onOpenChange, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['financial-categories', kind, 'activate-pick'],
    queryFn: () => financialManagementApi.getCategories(kind),
    enabled: open,
  });

  if (!open) return null;

  const categories = (categoriesQuery.data ?? []).filter(c => c.isActive);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          {categoriesQuery.isLoading && (
            <div className="flex justify-center py-6"><LoadingSpinner /></div>
          )}
          {!categoriesQuery.isLoading && categories.length === 0 && (
            <p className="text-sm text-destructive">{t('orders.noCustomerCategories')}</p>
          )}
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedId(cat.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                  selectedId === cat.id
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                {cat.nameAr}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={selectedId == null}
              onClick={() => {
                if (selectedId != null) onConfirm(selectedId);
              }}
            >
              {t('orders.continue')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
