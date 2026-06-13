import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { financialManagementApi } from '@/lib/api/financialManagement';
import { cn } from '@/lib/utils';
import type { FinancialPartyKind } from '@/types/api';

interface Props {
  open: boolean;
  kind: FinancialPartyKind;
  categoryId: number;
  storeUserCode: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (partyId: number) => void;
}

export function LinkExistingPartyDialog({
  open, kind, categoryId, storeUserCode, onOpenChange, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const partiesQuery = useQuery({
    queryKey: ['financial-parties', kind, categoryId, 'link-existing'],
    queryFn: () => financialManagementApi.getParties({ kind, categoryId, includeInactive: true }),
    enabled: open,
  });

  const parties = useMemo(() => {
    const list = partiesQuery.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(p =>
      p.nameAr.toLowerCase().includes(s)
      || (p.nameEn ?? '').toLowerCase().includes(s)
      || p.accountCode.toLowerCase().includes(s),
    );
  }, [partiesQuery.data, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative flex w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-xl max-h-[85vh]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t('orders.linkExistingParty')}</h3>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4 overflow-hidden flex flex-col min-h-0">
          <p className="text-sm text-muted-foreground">{t('orders.linkExistingPartyDesc')}</p>
          <p className="rounded-md bg-muted/50 px-2 py-1 font-mono text-xs" dir="ltr">{storeUserCode}</p>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="ps-9"
            />
          </div>
          {partiesQuery.isLoading && (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {parties.map(party => (
              <button
                key={party.id}
                type="button"
                onClick={() => setSelectedId(party.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                  selectedId === party.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <p className="font-medium">{party.nameAr}</p>
                <p className="font-mono text-xs text-muted-foreground" dir="ltr">{party.accountCode}</p>
              </button>
            ))}
            {!partiesQuery.isLoading && parties.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button disabled={selectedId == null} onClick={() => selectedId != null && onConfirm(selectedId)}>
              {t('orders.openPartyStoreTab')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
