import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  X, Pencil, Ban, CheckCircle2, User, Trash2, AlertTriangle,
  ChevronsUpDown, Search, ExternalLink, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { storeParentApi, type StoreUserRow } from '@/lib/api/storeParent';
import { geographyApi } from '@/lib/api/geography';
import { api } from '@/lib/api/client';
import { localizedName } from '@/lib/i18n/localizedName';
import { useLocale } from '@/lib/i18n/useLocale';
import { extractApiError } from '@/lib/utils';

type AccountType = 'Customer' | 'Trader' | 'Company';
type Option = { value: number; label: string };

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
  const { locale } = useLocale();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(initialEdit);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [accountType, setAccountType] = useState<AccountType>(
    (user.accountType as AccountType) || 'Customer',
  );
  const [fullName, setFullName] = useState(user.fullName);
  const [fullNameEn, setFullNameEn] = useState(user.fullNameEn ?? '');
  const [contactPhone, setContactPhone] = useState(user.contactPhone ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [businessName, setBusinessName] = useState(user.businessName ?? '');
  const [businessNameEn, setBusinessNameEn] = useState(user.businessNameEn ?? '');
  const [countryId, setCountryId] = useState<number | null>(user.countryId ?? null);
  const [cityId, setCityId] = useState<number | null>(user.cityId ?? null);
  const [detailedAddress, setDetailedAddress] = useState(user.detailedAddress ?? '');
  const [detailedAddressEn, setDetailedAddressEn] = useState(user.detailedAddressEn ?? '');
  const [locationUrl, setLocationUrl] = useState(user.locationUrl ?? '');

  const isBusiness = accountType === 'Trader' || accountType === 'Company';

  const { data: countries = [] } = useQuery({
    queryKey: ['geo-countries'],
    queryFn: () => geographyApi.listCountries(),
    staleTime: 5 * 60_000,
  });
  const { data: cities = [] } = useQuery({
    queryKey: ['geo-cities'],
    queryFn: () => geographyApi.listCities(),
    staleTime: 5 * 60_000,
  });
  const { data: photos = [] } = useQuery({
    queryKey: ['store-user-photos', user.id],
    queryFn: () => storeParentApi.listUserPhotos(user.id),
  });

  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of photos) {
        try {
          const res = await api.get(`/parent/store/users/${user.id}/photos/${p.id}`, {
            responseType: 'blob',
          });
          if (!alive) return;
          next[p.id] = URL.createObjectURL(res.data as Blob);
        } catch { /* تجاهل */ }
      }
      if (alive && Object.keys(next).length > 0) {
        setPhotoUrls((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => { alive = false; };
  }, [photos, user.id]);

  const matchCountryId = (name?: string | null): number | null => {
    const n = (name ?? '').trim();
    if (!n) return null;
    const hit = countries.find((c) => c.nameAr === n || (c.nameEn ?? '') === n);
    return hit?.id ?? null;
  };

  useEffect(() => {
    setEditing(initialEdit);
    setConfirmingDelete(false);
    setAccountType((user.accountType as AccountType) || 'Customer');
    setFullName(user.fullName);
    setFullNameEn(user.fullNameEn ?? '');
    setContactPhone(user.contactPhone ?? '');
    setEmail(user.email ?? '');
    setBusinessName(user.businessName ?? '');
    setBusinessNameEn(user.businessNameEn ?? '');
    setCountryId(user.countryId ?? matchCountryId(user.country));
    setCityId(user.cityId ?? null);
    setDetailedAddress(user.detailedAddress ?? '');
    setDetailedAddressEn(user.detailedAddressEn ?? '');
    setLocationUrl(user.locationUrl ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, initialEdit, countries]);

  const countryCities = useMemo(
    () => cities.filter((c) => countryId != null && c.countryId === countryId),
    [cities, countryId],
  );

  const selectedCountry = useMemo(
    () => countries.find((c) => c.id === countryId),
    [countries, countryId],
  );
  const selectedCity = useMemo(
    () => cities.find((c) => c.id === cityId),
    [cities, cityId],
  );

  const countryLabel = selectedCountry
    ? localizedName(locale, selectedCountry.nameAr, selectedCountry.nameEn)
    : (user.country ?? '—');
  const cityLabel = selectedCity
    ? localizedName(locale, selectedCity.nameAr, selectedCity.nameEn)
    : (user.city ?? '—');

  const accountTypeLabel = t(`storeParent.accountType.${accountType.toLowerCase()}`);

  const updateMut = useMutation({
    mutationFn: () => storeParentApi.updateStoreUser(user.id, {
      fullName: fullName.trim(),
      fullNameEn: fullNameEn.trim() || null,
      contactPhone: contactPhone.trim() || null,
      email: email.trim() || null,
      businessName: isBusiness ? businessName.trim() || null : null,
      businessNameEn: isBusiness ? businessNameEn.trim() || null : null,
      accountType,
      country: selectedCountry ? selectedCountry.nameAr : (user.country ?? null),
      city: selectedCity ? selectedCity.nameAr : null,
      countryId: countryId ?? null,
      cityId: cityId ?? null,
      detailedAddress: detailedAddress.trim() || null,
      detailedAddressEn: detailedAddressEn.trim() || null,
      locationUrl: locationUrl.trim() || null,
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

  const deleteMut = useMutation({
    mutationFn: () => storeParentApi.deleteStoreUser(user.id),
    onSuccess: (res) => {
      toast.success(res.message ?? t('storeParent.userDeleted'));
      qc.invalidateQueries({ queryKey: ['parent-store-users'] });
      onClose();
    },
    onError: (e) => {
      toast.error(extractApiError(e));
      setConfirmingDelete(false);
    },
  });

  const regStatusLabel = !user.isVerified
    ? t('storeParent.badge.notVerified')
    : !user.isProfileCompleted
      ? t('storeParent.badge.profilePending')
      : t('storeParent.badge.profileDone');

  const countryOpts: Option[] = useMemo(
    () => countries
      .filter((c) => c.isActive || c.id === countryId)
      .map((c) => ({ value: c.id, label: localizedName(locale, c.nameAr, c.nameEn) })),
    [countries, countryId, locale],
  );
  const cityOpts: Option[] = useMemo(
    () => countryCities
      .filter((c) => c.isActive || c.id === cityId)
      .map((c) => ({ value: c.id, label: localizedName(locale, c.nameAr, c.nameEn) })),
    [countryCities, cityId, locale],
  );

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

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!editing ? (
            <>
              <Section title={t('storeParent.section.account')}>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <InfoRow label={t('storeParent.fields.accountType')} value={accountTypeLabel} />
                  <InfoRow label={t('storeParent.col.userCode')} value={user.userCode} mono />
                  <InfoRow
                    label={t('storeParent.col.status')}
                    value={user.isDisabled ? t('storeParent.badge.disabled') : t('storeParent.badge.active')}
                  />
                  <InfoRow label={t('storeParent.col.regStatus')} value={regStatusLabel} />
                  {accountType === 'Company' && (
                    <InfoRow
                      label={t('storeParent.fields.approval')}
                      value={user.isApproved ? t('storeParent.badge.approved') : t('storeParent.badge.pendingApproval')}
                    />
                  )}
                  <InfoRow
                    label={t('storeParent.col.financialLink')}
                    value={user.hasFinancialLink ? '✓' : '—'}
                  />
                </div>
              </Section>

              <Section title={t('storeParent.section.contact')}>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <InfoRow label={t('storeParent.fields.fullNameAr')} value={user.fullName} />
                  <InfoRow label={t('storeParent.fields.fullNameEn')} value={user.fullNameEn ?? '—'} />
                  <InfoRow label={t('storeParent.fields.contactPhone')} value={user.contactPhone ?? '—'} mono />
                  <InfoRow label={t('storeParent.fields.email')} value={user.email ?? '—'} mono />
                  <InfoRow label={t('storeParent.fields.whatsapp')} value={user.phone} mono />
                </div>
              </Section>

              {isBusiness && (
                <Section title={t('storeParent.section.business')}>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <InfoRow label={t('storeParent.fields.businessNameAr')} value={user.businessName ?? '—'} />
                    <InfoRow label={t('storeParent.fields.businessNameEn')} value={user.businessNameEn ?? '—'} />
                  </div>
                </Section>
              )}

              <Section title={t('storeParent.section.location')}>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <InfoRow label={t('storeParent.fields.country')} value={countryLabel} />
                  <InfoRow label={t('storeParent.fields.city')} value={cityLabel} />
                  <InfoRow label={t('storeParent.fields.detailedAddressAr')} value={user.detailedAddress ?? '—'} />
                  <InfoRow label={t('storeParent.fields.detailedAddressEn')} value={user.detailedAddressEn ?? '—'} />
                  {user.locationUrl ? (
                    <div className="sm:col-span-2">
                      <div className="text-xs text-muted-foreground">{t('storeParent.fields.locationUrl')}</div>
                      <a
                        href={user.locationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        dir="ltr"
                      >
                        {user.locationUrl}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ) : (
                    <InfoRow label={t('storeParent.fields.locationUrl')} value="—" />
                  )}
                </div>
              </Section>

              <Section title={t('storeParent.fields.photos')}>
                {photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map((p) => (
                      <div key={p.id} className="aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                        {photoUrls[p.id] ? (
                          <img src={photoUrls[p.id]} alt={p.fileName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title={t('storeParent.col.linkedCompanies')}>
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
                          {c.isActive ? t('storeParent.badge.linkActive') : t('storeParent.badge.linkPending')}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          ) : (
            <div className="space-y-4">
              <Section title={t('storeParent.section.account')}>
                <SelectField
                  label={t('storeParent.fields.accountType')}
                  value={accountType}
                  options={[
                    { value: 'Customer', label: t('storeParent.accountType.customer') },
                    { value: 'Trader', label: t('storeParent.accountType.trader') },
                    { value: 'Company', label: t('storeParent.accountType.company') },
                  ]}
                  onChange={(v) => setAccountType(v as AccountType)}
                />
              </Section>

              <Section title={t('storeParent.section.contact')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('storeParent.fields.fullNameAr')} value={fullName} onChange={setFullName} />
                  <Field label={t('storeParent.fields.fullNameEn')} value={fullNameEn} onChange={setFullNameEn} dir="ltr" />
                  <Field label={t('storeParent.fields.contactPhone')} value={contactPhone} onChange={setContactPhone} mono />
                  <Field label={t('storeParent.fields.email')} value={email} onChange={setEmail} mono />
                  <Field label={t('storeParent.fields.whatsapp')} value={user.phone} onChange={() => {}} disabled mono />
                </div>
              </Section>

              {isBusiness && (
                <Section title={t('storeParent.section.business')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('storeParent.fields.businessNameAr')} value={businessName} onChange={setBusinessName} />
                    <Field label={t('storeParent.fields.businessNameEn')} value={businessNameEn} onChange={setBusinessNameEn} dir="ltr" />
                  </div>
                </Section>
              )}

              <Section title={t('storeParent.section.location')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableSelect
                    label={t('storeParent.fields.country')}
                    value={countryId}
                    onChange={(v) => { setCountryId(v); setCityId(null); }}
                    options={countryOpts}
                    placeholder={t('storeParent.selectCountry')}
                  />
                  <SearchableSelect
                    label={t('storeParent.fields.city')}
                    value={cityId}
                    onChange={setCityId}
                    options={cityOpts}
                    placeholder={t('storeParent.selectCity')}
                    disabled={countryId == null}
                  />
                  <div className="sm:col-span-2">
                    <Field label={t('storeParent.fields.detailedAddressAr')} value={detailedAddress} onChange={setDetailedAddress} />
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={t('storeParent.fields.detailedAddressEn')} value={detailedAddressEn} onChange={setDetailedAddressEn} dir="ltr" />
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={t('storeParent.fields.locationUrl')} value={locationUrl} onChange={setLocationUrl} mono />
                  </div>
                </div>
              </Section>
            </div>
          )}
        </div>

        {confirmingDelete ? (
          <div className="border-t border-destructive/40 bg-destructive/5 px-5 py-4">
            <div className="mb-3 flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t('storeParent.deleteConfirm', { name: user.fullName })}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={deleteMut.isPending} onClick={() => setConfirmingDelete(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" variant="destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
                <Trash2 className="h-4 w-4" />
                {t('storeParent.confirmDeleteBtn')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
            <div className="flex gap-2">
              {canManage && !editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  {t('storeParent.editUser')}
                </Button>
              )}
              {canManage && !editing && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('storeParent.deleteUser')}
                </Button>
              )}
              {editing && (
                <>
                  <Button size="sm" disabled={updateMut.isPending || !fullName.trim()} onClick={() => updateMut.mutate()}>
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
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
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
  label, value, onChange, disabled, mono, dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  mono?: boolean;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={mono ? 'font-mono' : undefined}
        dir={dir ?? (mono ? 'ltr' : undefined)}
      />
    </div>
  );
}

function SelectField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function SearchableSelect({
  label, value, options, onChange, placeholder, disabled,
}: {
  label: string;
  value: number | null;
  options: Option[];
  onChange: (v: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtered = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? 'truncate text-start' : 'truncate text-start text-muted-foreground'}>
          {selected?.label ?? placeholder ?? '—'}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="relative p-2">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 ltr:left-3 rtl:right-3 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('storeParent.searchPlaceholder')}
              className="flex h-8 w-full rounded-md border border-input bg-background ltr:pl-9 rtl:pr-9 px-3 text-sm"
            />
          </div>
          <div className="max-h-48 overflow-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{t('common.noResults')}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}
                  className={`block w-full px-3 py-2 text-start text-sm hover:bg-accent ${
                    o.value === value ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
