import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Pencil, Ban, CheckCircle2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { storeParentApi, type StoreUserRow } from '@/lib/api/storeParent';
import { extractApiError } from '@/lib/utils';

interface StoreUserDetailDialogProps {
  user: StoreUserRow;
  canManage: boolean;
  initialEdit?: boolean;
  onClose: () => void;
}

export function StoreUserDetailDialog({
  user,
  canManage,
  initialEdit = false,
  onClose,
}: StoreUserDetailDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(initialEdit);
  const [fullName, setFullName] = useState(user.fullName);
  const [contactPhone, setContactPhone] = useState(user.contactPhone ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [country, setCountry] = useState(user.country ?? '');
  const [city, setCity] = useState(user.city ?? '');
  const [address, setAddress] = useState(user.address ?? '');
  const [detailedAddress, setDetailedAddress] = useState(user.detailedAddress ?? '');

  useEffect(() => {
    setEditing(initialEdit);
    setFullName(user.fullName);
    setContactPhone(user.contactPhone ?? '');
    setEmail(user.email ?? '');
    setCountry(user.country ?? '');
    setCity(user.city ?? '');
    setAddress(user.address ?? '');
    setDetailedAddress(user.detailedAddress ?? '');
  }, [user, initialEdit]);

  const updateMut = useMutation({
    mutationFn: () => storeParentApi.updateStoreUser(user.id, {
      fullName: fullName.trim(),
      contactPhone: contactPhone.trim() || null,
      email: email.trim() || null,
      country: country.trim() || null,
      city: city.trim() || null,
      address: address.trim() || null,
      detailedAddress: detailedAddress.trim() || null,
    }),
    onSuccess: (res) => {
      toast.success(res.message ?? t('storeParent.userUpdated'));
      qc.invalidateQueries({ queryKey: ['parent-store-users'] });
      setEditing(false);
      onClose();
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const statusMut = useMutation({
    mutationFn: (disabled: boolean) => storeParentApi.setStoreUserStatus(user.id, disabled),
    onSuccess: (res) => {
      toast.success(res.message ?? t('common.success'));
      qc.invalidateQueries({ queryKey: ['parent-store-users'] });
      onClose();
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const formatAddress = () => {
    const parts = [user.country, user.city, user.address, user.detailedAddress].filter(Boolean);
    return parts.length ? parts.join(' — ') : '—';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-base font-semibold">{t('storeParent.viewUser')}</h2>
              <p className="font-mono text-xs text-muted-foreground" dir="ltr">{user.userCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!editing ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 text-sm">
                <InfoRow label={t('storeParent.col.name')} value={user.fullName} />
                <InfoRow label={t('storeParent.col.userCode')} value={user.userCode} mono />
                <InfoRow label={t('storeParent.fields.phone')} value={user.phone} mono />
                <InfoRow label={t('storeParent.fields.contactPhone')} value={user.contactPhone ?? '—'} mono />
                <InfoRow label={t('storeParent.fields.email')} value={user.email ?? '—'} mono />
                <InfoRow
                  label={t('storeParent.col.status')}
                  value={
                    user.isDisabled
                      ? t('storeParent.badge.disabled')
                      : t('storeParent.badge.active')
                  }
                />
                <InfoRow
                  label={t('storeParent.col.financialLink')}
                  value={user.hasFinancialLink ? '✓' : '—'}
                />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('storeParent.col.location')}
                </h3>
                <p className="text-sm">{formatAddress()}</p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('storeParent.col.linkedCompanies')}
                </h3>
                {user.linkedCompanies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-2">
                    {user.linkedCompanies.map((c) => (
                      <li key={`${user.id}-${c.companyCode}`} className="rounded-lg border border-border p-3 text-sm">
                        <div className="font-medium">{c.companyName}</div>
                        <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                          {c.companyCode}
                          {c.customerCode ? ` · ${c.customerCode}` : ''}
                        </div>
                        <Badge variant={c.isActive ? 'success' : 'outline'} className="mt-1">
                          {c.isActive
                            ? t('storeParent.badge.linkActive')
                            : t('storeParent.badge.linkPending')}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('storeParent.col.name')} value={fullName} onChange={setFullName} />
              <Field label={t('storeParent.fields.phone')} value={user.phone} onChange={() => {}} disabled mono />
              <Field label={t('storeParent.fields.contactPhone')} value={contactPhone} onChange={setContactPhone} mono />
              <Field label={t('storeParent.fields.email')} value={email} onChange={setEmail} mono />
              <Field label={t('storeParent.fields.country')} value={country} onChange={setCountry} />
              <Field label={t('storeParent.fields.city')} value={city} onChange={setCity} />
              <div className="sm:col-span-2">
                <Field label={t('storeParent.fields.address')} value={address} onChange={setAddress} />
              </div>
              <div className="sm:col-span-2">
                <Field label={t('storeParent.fields.detailedAddress')} value={detailedAddress} onChange={setDetailedAddress} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          <div className="flex gap-2">
            {canManage && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                {t('storeParent.editUser')}
              </Button>
            )}
            {editing && (
              <>
                <Button
                  size="sm"
                  disabled={updateMut.isPending || !fullName.trim()}
                  onClick={() => updateMut.mutate()}
                >
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  {t('common.cancel')}
                </Button>
              </>
            )}
          </div>

          {canManage && !editing && (
            <Button
              size="sm"
              variant={user.isDisabled ? 'outline' : 'destructive'}
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate(!user.isDisabled)}
            >
              {user.isDisabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {t('storeParent.enableUser')}
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  {t('storeParent.disableUser')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'} dir={mono ? 'ltr' : undefined}>{value}</div>
    </div>
  );
}

function Field({
  label, value, onChange, disabled, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={mono ? 'font-mono' : undefined}
        dir={mono ? 'ltr' : undefined}
      />
    </div>
  );
}
