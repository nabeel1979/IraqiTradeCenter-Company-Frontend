import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Mail, Phone, Smartphone, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { contactPointsApi } from '@/lib/api/contactPoints';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { extractApiError } from '@/lib/utils';

export function ContactPointsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDelete = can(PERMS.System.CompanySettings.Update);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['contact-points', search],
    queryFn: () => contactPointsApi.list({ search: search || undefined }),
  });

  const removeM = useMutation({
    mutationFn: (id: number) => contactPointsApi.remove(id),
    onSuccess: () => {
      toast.success(t('settings.contacts.deleted'));
      qc.invalidateQueries({ queryKey: ['contact-points'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e)),
  });

  const kindIcon = (kind: string) => {
    if (kind === 'Email') return <Mail className="h-3.5 w-3.5" />;
    if (kind === 'Mobile') return <Smartphone className="h-3.5 w-3.5" />;
    return <Phone className="h-3.5 w-3.5" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.contacts.title')}</CardTitle>
        <CardDescription>{t('settings.contacts.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('settings.contacts.searchPlaceholder')}
            className="pr-8"
          />
        </div>
        {isLoading ? (
          <LoadingSpinner />
        ) : isError ? (
          <p className="text-sm text-destructive">{t('settings.contacts.loadError')}</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.contacts.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/20 text-right text-muted-foreground">
                  <th className="px-3 py-2">{t('settings.contacts.cols.kind')}</th>
                  <th className="px-3 py-2">{t('settings.contacts.cols.value')}</th>
                  <th className="px-3 py-2">{t('settings.contacts.cols.owner')}</th>
                  {canDelete && <th className="px-3 py-2 text-left">{t('users.cols.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {data!.map(row => (
                  <tr key={row.id} className="border-b border-border/30">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {kindIcon(row.kind)}
                        {t(`settings.contacts.kinds.${row.kind}`, { defaultValue: row.kind })}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">{row.displayValue}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        {t(`settings.contacts.ownerTypes.${row.ownerType}`, { defaultValue: row.ownerType })}
                      </span>
                      {row.ownerLabel && <span className="mx-1">—</span>}
                      <span className="font-medium">{row.ownerLabel ?? row.ownerId}</span>
                    </td>
                    {canDelete && (
                      <td className="px-3 py-2 text-left">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={removeM.isPending}
                          onClick={() => {
                            if (!confirm(t('settings.contacts.deleteConfirm', { value: row.displayValue }))) return;
                            removeM.mutate(row.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
