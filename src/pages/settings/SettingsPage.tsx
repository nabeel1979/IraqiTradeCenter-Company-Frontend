import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2, Upload, Save, X, Image as ImageIcon, Phone, MapPin, Mail, Globe,
  FileText, ListChecks, ChevronLeft, Coins, Users, Shield, Settings as SettingsIcon,
  Languages, DatabaseBackup, PlugZap, Info, HardDrive, Cloud, KeyRound, FolderTree,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { companySettingsApi, type CompanySettingsDto } from '@/lib/api/companySettings';
import { attachmentSettingsApi } from '@/lib/api/attachmentSettings';
import { CurrenciesManager } from '@/components/settings/CurrenciesManager';
import { PermissionGate } from '@/lib/auth/PermissionGate';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

// ════════════════════════════════════════════════════════════════════════════
// إعدادات النظام — تصميم Sidebar Tabs احترافي قابل للتوسعة
//
// كيفية إضافة قسم جديد:
//   1. أنشئ مكوّن React (مثل MyNewSection) يعرض محتواه.
//   2. أضِف عنصراً جديداً إلى مصفوفة SECTIONS بالأيقونة والعنوان والمكوّن.
//   3. (اختياري) أضِف صلاحية مطلوبة لإظهار/إخفاء القسم.
//
// كل قسم يحوي محتواه الخاص — ولا حاجة للتعديل في أماكن أخرى.
// ════════════════════════════════════════════════════════════════════════════

interface SectionDef {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** رمز اختياري للحالة: قريباً، تجريبي... */
  badge?: { label: string; tone: 'info' | 'warning' | 'success' | 'muted' };
  /** صلاحية مطلوبة (واحدة) لظهور القسم — اختيارية. */
  permission?: string;
  /** مكوّن المحتوى — يَستلم لا شيء، يدير state حفظه بنفسه. */
  Component: React.FC<SectionContentProps>;
}

interface SectionContentProps {
  /** بيانات إعدادات الشركة الحالية (إن كانت محمَّلة) — تُمرَّر للأقسام المعتمِدة عليها. */
  settings: CompanySettingsDto | null;
  /** تحديث محلي فوري قبل الحفظ (اختياري — ليتزامن المحتوى عند تنقّل المستخدم بين الأقسام). */
  onLocalChange?: (next: Partial<CompanySettingsDto>) => void;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

// ─────────────────────────────────────────────────────────────────────────
// الصفحة الرئيسية
// ─────────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { can, isSuper } = usePermissions();

  // ‎جلب إعدادات الشركة مرة واحدة على مستوى الصفحة لمشاركتها مع كل قسم
  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
  });
  const [draft, setDraft] = useState<CompanySettingsDto | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  // ‎كل الأقسام المعرّفة. لإضافة قسم جديد: أضف هنا فقط.
  const ALL_SECTIONS: SectionDef[] = useMemo(() => [
    {
      id: 'identity',
      icon: Building2,
      title: t('settings.sections.identity.title', { defaultValue: 'Company Identity' }),
      description: t('settings.sections.identity.description', { defaultValue: 'Name, logo and contact info shown in printed reports' }),
      Component: IdentitySection,
    },
    {
      id: 'printing',
      icon: FileText,
      title: t('settings.sections.printing.title', { defaultValue: 'Printing & Reports' }),
      description: t('settings.sections.printing.description', { defaultValue: 'Customize print header and footer with live preview' }),
      Component: PrintingSection,
    },
    {
      id: 'currencies',
      icon: Coins,
      title: t('settings.sections.currencies.title', { defaultValue: 'Currencies & Exchange Rates' }),
      description: t('settings.sections.currencies.description', { defaultValue: 'Enable supported currencies and choose the base currency' }),
      Component: CurrenciesSection,
    },
    {
      id: 'users',
      icon: Users,
      title: t('settings.sections.users.title'),
      description: t('settings.sections.users.description'),
      permission: PERMS.System.Users.Read,
      Component: UsersSection,
    },
    {
      id: 'menu',
      icon: ListChecks,
      title: t('settings.sections.menu.title'),
      description: t('settings.sections.menu.description'),
      Component: MenuSection,
    },
    {
      id: 'regional',
      icon: Languages,
      title: t('settings.sections.locale.title'),
      description: t('settings.sections.locale.description'),
      badge: { label: t('common.comingSoon', { defaultValue: 'Soon' }), tone: 'muted' as const },
      Component: RegionalSection,
    },
    {
      id: 'backup',
      icon: DatabaseBackup,
      title: t('settings.sections.backup.title'),
      description: t('settings.sections.backup.description'),
      badge: { label: t('common.comingSoon', { defaultValue: 'Soon' }), tone: 'muted' as const },
      Component: BackupSection,
    },
    {
      id: 'storage',
      icon: HardDrive,
      title: t('settings.sections.storage.title', { defaultValue: 'أرشيف المرفقات' }),
      description: t('settings.sections.storage.description', { defaultValue: 'مسار حفظ ملفات السندات أو ربط Cloudflare R2' }),
      permission: PERMS.System.CompanySettings.Update,
      Component: StorageSection,
    },
    {
      id: 'integrations',
      icon: PlugZap,
      title: t('settings.sections.notifications.title'),
      description: t('settings.sections.notifications.description'),
      badge: { label: t('common.comingSoon', { defaultValue: 'Soon' }), tone: 'muted' as const },
      Component: IntegrationsSection,
    },
    {
      id: 'about',
      icon: Info,
      title: t('settings.sections.about.title', { defaultValue: 'About the system' }),
      description: t('settings.sections.about.description', { defaultValue: 'Version info and service health check' }),
      Component: AboutSection,
    },
  ], [t]);

  // ‎تصفية حسب الصلاحيات (SuperAdmin يرى الكل)
  const sections = useMemo(
    () => ALL_SECTIONS.filter(s => !s.permission || isSuper || can(s.permission)),
    [ALL_SECTIONS, isSuper, can]
  );

  // ‎ربط القسم النشط بـ URL hash (لـ deep-link و رجوع/تقدم المتصفح)
  const activeId = (location.hash || '').replace('#', '') || sections[0]?.id;
  const setActive = (id: string) => navigate({ hash: `#${id}` }, { replace: false });

  // ‎التأكّد من وجود hash افتراضي
  useEffect(() => {
    if (!location.hash && sections.length > 0) {
      navigate({ hash: `#${sections[0].id}` }, { replace: true });
    }
  }, [location.hash, sections, navigate]);

  if (isLoading) return <LoadingSpinner text={t('settings.loading')} />;
  if (isError || !draft) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t('settings.loadError')}
        </CardContent>
      </Card>
    );
  }

  const active = sections.find(s => s.id === activeId) ?? sections[0];
  const ActiveComponent = active.Component;

  return (
    <div className="space-y-4">
      {/* الترويسة */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('settings.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.subtitle')}
          </p>
        </div>
      </div>

      {/* تخطيط Sidebar + محتوى */}
      <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
        {/* قائمة الأقسام */}
        <SettingsSidebar
          sections={sections}
          activeId={active.id}
          onSelect={setActive}
        />

        {/* محتوى القسم النشط */}
        <div className="min-w-0 space-y-4">
          {/* ترويسة القسم */}
          <Card>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <active.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{active.title}</CardTitle>
                  {active.badge && <SectionBadge {...active.badge} />}
                </div>
                <CardDescription className="mt-0.5">{active.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <ActiveComponent
            settings={draft}
            onLocalChange={(patch) => setDraft(s => s ? { ...s, ...patch } : s)}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قائمة الأقسام (Sidebar)
// ─────────────────────────────────────────────────────────────────────────
function SettingsSidebar({
  sections, activeId, onSelect,
}: {
  sections: SectionDef[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="lg:sticky lg:top-4 lg:self-start">
      <CardContent className="space-y-1 p-2">
        {sections.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-right text-sm transition-colors',
              activeId === s.id
                ? 'bg-primary/15 text-foreground ring-1 ring-primary/40'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            )}
          >
            <s.icon className={cn(
              'h-4 w-4 shrink-0',
              activeId === s.id ? 'text-primary' : 'text-muted-foreground'
            )} />
            <span className="flex-1 truncate">{s.title}</span>
            {s.badge && <SectionBadge {...s.badge} />}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function SectionBadge({ label, tone }: { label: string; tone: 'info' | 'warning' | 'success' | 'muted' }) {
  const cls = {
    info: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    success: 'bg-success/15 text-success border-success/30',
    muted: 'bg-muted/30 text-muted-foreground border-muted/40',
  }[tone];
  return (
    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-medium', cls)}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: هوية الشركة
// ─────────────────────────────────────────────────────────────────────────
function IdentitySection({ settings, onLocalChange }: SectionContentProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<CompanySettingsDto>(settings!);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const set = <K extends keyof CompanySettingsDto>(k: K, v: CompanySettingsDto[K]) => {
    setForm(s => ({ ...s, [k]: v }));
    onLocalChange?.({ [k]: v } as Partial<CompanySettingsDto>);
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error(t('settings.logoNotImage'));
    if (f.size > MAX_LOGO_BYTES) return toast.error(t('settings.logoTooLarge'));
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    set('logoBase64', dataUrl);
  };

  const m = useMutation({
    mutationFn: () => companySettingsApi.update({
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      address: form.address || null,
      addressEn: form.addressEn || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      taxNumber: form.taxNumber || null,
      currency: form.currency || 'IQD',
      exchangeRatesJson: form.exchangeRatesJson?.trim() ? form.exchangeRatesJson.trim() : null,
      logoBase64: form.logoBase64 || null,
      printHeader: form.printHeader || null,
      printFooter: form.printFooter || null,
    }),
    onSuccess: (saved) => {
      toast.success(t('settings.identitySaved'));
      queryClient.setQueryData(['company-settings'], saved);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('common.error')),
  });

  const onSave = () => {
    if (!form.nameAr.trim()) return toast.error(t('settings.nameArRequired'));
    m.mutate();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          {/* الشعار */}
          <div className="md:col-span-1">
            <label className="mb-2 block text-xs text-muted-foreground">{t('settings.logoLabel')}</label>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-4">
              {form.logoBase64 ? (
                <div className="relative w-full">
                  <img
                    src={form.logoBase64}
                    alt="logo"
                    className="mx-auto max-h-40 max-w-full rounded-md bg-white object-contain p-2"
                  />
                  <button
                    type="button"
                    onClick={() => set('logoBase64', '')}
                    title={t('settings.logoDeleteTip')}
                    className="absolute -top-2 -left-2 rounded-full bg-destructive p-1 text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-md bg-secondary/40 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                {form.logoBase64 ? t('settings.logoChange') : t('settings.logoUpload')}
              </Button>
              <p className="text-[10px] text-muted-foreground">{t('settings.logoHint')}</p>
            </div>
          </div>

          {/* الأسماء + العنوان والاتصال */}
          <div className="space-y-3 md:col-span-2">
            <Field label={t('settings.companyNameAr')}>
              <Input
                value={form.nameAr}
                onChange={e => set('nameAr', e.target.value.slice(0, 200))}
                placeholder={t('settings.companyNameArPlaceholder', { defaultValue: 'مركز التجارة العراقي' })}
                maxLength={200}
                required
                dir="rtl"
              />
            </Field>
            <Field label={t('settings.companyNameEn')}>
              <Input
                value={form.nameEn ?? ''}
                onChange={e => set('nameEn', e.target.value.slice(0, 200))}
                placeholder="Iraqi Trade Center"
                maxLength={200}
                dir="ltr"
              />
            </Field>
            <Field label={t('settings.address')} icon={MapPin}>
              <Input
                value={form.address ?? ''}
                onChange={e => set('address', e.target.value.slice(0, 500))}
                placeholder={t('settings.addressPlaceholder')}
                maxLength={500}
                dir="rtl"
              />
            </Field>
            <Field label={t('settings.addressEn')} icon={MapPin}>
              <Input
                value={form.addressEn ?? ''}
                onChange={e => set('addressEn', e.target.value.slice(0, 500))}
                placeholder={t('settings.addressEnPlaceholder')}
                maxLength={500}
                dir="ltr"
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t('settings.phone')} icon={Phone}>
                <Input
                  value={form.phone ?? ''}
                  onChange={e => set('phone', e.target.value.slice(0, 50))}
                  placeholder="07700000000"
                  maxLength={50}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.taxId')}>
                <Input
                  value={form.taxNumber ?? ''}
                  onChange={e => set('taxNumber', e.target.value.slice(0, 50))}
                  placeholder={t('settings.taxIdPlaceholder')}
                  maxLength={50}
                />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t('settings.email')} icon={Mail}>
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={e => set('email', e.target.value.slice(0, 150))}
                  placeholder="info@example.com"
                  maxLength={150}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.website')} icon={Globe}>
                <Input
                  value={form.website ?? ''}
                  onChange={e => set('website', e.target.value.slice(0, 200))}
                  placeholder="https://www.example.com"
                  maxLength={200}
                  dir="ltr"
                />
              </Field>
            </div>
          </div>
        </div>

        <SectionFooter onSave={onSave} saving={m.isPending} />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: الطباعة والتقارير (رأس + تذييل + معاينة)
// ─────────────────────────────────────────────────────────────────────────
function PrintingSection({ settings, onLocalChange }: SectionContentProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanySettingsDto>(settings!);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const set = <K extends keyof CompanySettingsDto>(k: K, v: CompanySettingsDto[K]) => {
    setForm(s => ({ ...s, [k]: v }));
    onLocalChange?.({ [k]: v } as Partial<CompanySettingsDto>);
  };

  const m = useMutation({
    mutationFn: () => companySettingsApi.update({
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      address: form.address || null,
      addressEn: form.addressEn || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      taxNumber: form.taxNumber || null,
      currency: form.currency || 'IQD',
      exchangeRatesJson: form.exchangeRatesJson?.trim() ? form.exchangeRatesJson.trim() : null,
      logoBase64: form.logoBase64 || null,
      printHeader: form.printHeader || null,
      printFooter: form.printFooter || null,
    }),
    onSuccess: (saved) => {
      toast.success(t('settings.printingSaved'));
      queryClient.setQueryData(['company-settings'], saved);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('common.error')),
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('settings.printHeader')}>
            <Input
              value={form.printHeader ?? ''}
              onChange={e => set('printHeader', e.target.value.slice(0, 500))}
              placeholder={t('settings.printHeaderPlaceholder')}
              maxLength={500}
            />
          </Field>
          <Field label={t('settings.printFooter')}>
            <Input
              value={form.printFooter ?? ''}
              onChange={e => set('printFooter', e.target.value.slice(0, 500))}
              placeholder={t('settings.printFooterPlaceholder')}
              maxLength={500}
            />
          </Field>
        </div>

        {/* معاينة */}
        <div>
          <div className="mb-2 text-xs text-muted-foreground">{t('settings.previewLabel')}</div>
          <div className="rounded-lg border-2 border-dashed border-border bg-white p-5 text-black" dir="rtl">
            <div className="flex items-start justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-3">
                {form.logoBase64 && (
                  <img src={form.logoBase64} alt="logo" className="h-14 w-14 object-contain" />
                )}
                <div>
                  <h2 className="text-lg font-bold">{form.printHeader || form.nameAr || t('settings.companyNameAr')}</h2>
                  {form.nameEn && <div className="text-xs text-gray-600">{form.nameEn}</div>}
                  <div className="mt-1 space-x-3 text-[11px] text-gray-700">
                    {form.address && <span>{form.address}</span>}
                    {form.phone && <span> • {form.phone}</span>}
                    {form.email && <span> • {form.email}</span>}
                  </div>
                </div>
              </div>
              {form.taxNumber && (
                <div className="text-[10px] text-gray-600">
                  {t('settings.taxId')}: {form.taxNumber}
                </div>
              )}
            </div>
            {form.printFooter && (
              <div className="mt-3 border-t border-dashed border-gray-400 pt-2 text-center text-[10px] text-gray-600">
                {form.printFooter}
              </div>
            )}
          </div>
        </div>

        <SectionFooter onSave={() => m.mutate()} saving={m.isPending} />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: العملات (يستخدم CurrenciesManager الموجود)
// ─────────────────────────────────────────────────────────────────────────
function CurrenciesSection() {
  return (
    <Card>
      <CardContent className="p-5">
        <CurrenciesManager />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: المستخدمون والصلاحيات
// ─────────────────────────────────────────────────────────────────────────
function UsersSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
        <PermissionGate perm={PERMS.System.Users.Read}>
          <NavTile
            icon={Users}
            title={t('settings.sections.users.title')}
            description={t('settings.sections.users.description')}
            onClick={() => navigate('/settings/users')}
          />
        </PermissionGate>
        <PermissionGate perm={PERMS.System.Roles.Read}>
          <NavTile
            icon={Shield}
            title={t('settings.sections.roles.title')}
            description={t('settings.sections.roles.description')}
            onClick={() => navigate('/settings/roles')}
          />
        </PermissionGate>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: القائمة الجانبية
// ─────────────────────────────────────────────────────────────────────────
function MenuSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-5">
        <NavTile
          icon={ListChecks}
          title={t('settings.sections.menu.title')}
          description={t('settings.sections.menu.description')}
          onClick={() => navigate('/settings/menu')}
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: التفضيلات الإقليمية (Placeholder قابل للتطوير)
// ─────────────────────────────────────────────────────────────────────────
function RegionalSection() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-5">
        <ComingSoon
          title={t('settings.sections.locale.title')}
          description={t('settings.sections.locale.description')}
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: النسخ الاحتياطي (Placeholder)
// ─────────────────────────────────────────────────────────────────────────
function BackupSection() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-5">
        <ComingSoon
          title={t('settings.sections.backup.title')}
          description={t('settings.sections.backup.description')}
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: أرشيف المرفقات (مسار محلي / Cloudflare R2)
//   • القيم تُحفظ في DB (جدول auth.AttachmentStorageSettings) لا في appsettings.
//   • السرّ (SecretAccessKey) لا يُعاد كاملاً — نعرض القناع فقط. لتركه دون تغيير
//     يُترك حقله فارغاً عند الحفظ.
//   • الحدّ الأقصى للحجم بالميجابايت مفصول عن بايتات الـ DTO لتسهيل الإدخال.
// ─────────────────────────────────────────────────────────────────────────
function StorageSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['attachment-settings'],
    queryFn: attachmentSettingsApi.get,
  });

  const [form, setForm] = useState<{
    provider: 'Local' | 'R2';
    localRootPath: string;
    r2AccountId: string;
    r2AccessKeyId: string;
    r2SecretAccessKey: string;
    r2Bucket: string;
    r2PublicBaseUrl: string;
    maxFileSizeMb: number;
  } | null>(null);

  // ‎هيدرجة الـ form من السيرفر مرة واحدة عند توفر البيانات.
  useEffect(() => {
    if (!data) return;
    setForm({
      provider: (data.provider === 'R2' ? 'R2' : 'Local') as 'Local' | 'R2',
      localRootPath: data.localRootPath ?? '',
      r2AccountId: data.r2AccountId ?? '',
      r2AccessKeyId: data.r2AccessKeyId ?? '',
      r2SecretAccessKey: '', // لا نعرض السرّ — يُملأ فقط للاستبدال
      r2Bucket: data.r2Bucket ?? '',
      r2PublicBaseUrl: data.r2PublicBaseUrl ?? '',
      maxFileSizeMb: Math.max(1, Math.round((data.maxFileSizeBytes || 25 * 1024 * 1024) / (1024 * 1024))),
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('no_form');
      return attachmentSettingsApi.update({
        provider: form.provider,
        localRootPath: form.localRootPath || null,
        r2AccountId: form.r2AccountId || null,
        r2AccessKeyId: form.r2AccessKeyId || null,
        // ‎فارغ ⇒ Backend يُبقي السرّ القديم. غير فارغ ⇒ يستبدله.
        r2SecretAccessKey: form.r2SecretAccessKey || null,
        r2Bucket: form.r2Bucket || null,
        r2PublicBaseUrl: form.r2PublicBaseUrl || null,
        maxFileSizeBytes: Math.max(1, form.maxFileSizeMb) * 1024 * 1024,
      });
    },
    onSuccess: (res) => {
      if (res.warning) toast.warning(res.warning);
      else toast.success(t('settings.storage.saveSuccess', { defaultValue: 'تم حفظ الإعدادات' }));
      qc.invalidateQueries({ queryKey: ['attachment-settings'] });
      // ‎بعد الحفظ، أفرغ خانة السرّ كي لا يبقى معروضاً.
      setForm(f => f ? { ...f, r2SecretAccessKey: '' } : f);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? t('settings.storage.saveError', { defaultValue: 'تعذّر الحفظ' }));
    },
  });

  if (isLoading || !form) return (
    <Card><CardContent className="p-5"><LoadingSpinner text={t('common.loading')} /></CardContent></Card>
  );
  if (isError || !data) return (
    <Card><CardContent className="p-5 text-sm text-muted-foreground">
      {t('settings.storage.loadError', { defaultValue: 'تعذّر تحميل الإعدادات' })}
    </CardContent></Card>
  );

  const isR2 = form.provider === 'R2';

  return (
    <div className="space-y-4">
      {/* اختيار المزوّد */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('settings.storage.providerTitle', { defaultValue: 'مزوّد التخزين' })}
          </CardTitle>
          <CardDescription>
            {t('settings.storage.providerDescription', { defaultValue: 'حدّد أين تُحفظ ملفات السندات الجديدة. الملفات القديمة تبقى مرتبطة بمزوّدها الأصلي.' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <ProviderRadio
              icon={HardDrive}
              label={t('settings.storage.providers.local', { defaultValue: 'تخزين محلي على الخادم' })}
              hint={t('settings.storage.providers.localHint', { defaultValue: 'يحفظ الملفات في مجلد على الخادم نفسه.' })}
              selected={form.provider === 'Local'}
              onClick={() => setForm({ ...form, provider: 'Local' })}
            />
            <ProviderRadio
              icon={Cloud}
              label={t('settings.storage.providers.r2', { defaultValue: 'Cloudflare R2 (للنشر الفعلي)' })}
              hint={t('settings.storage.providers.r2Hint', { defaultValue: 'يحفظ في bucket على R2 ويُتاح من أيّ مكان.' })}
              selected={form.provider === 'R2'}
              onClick={() => setForm({ ...form, provider: 'R2' })}
            />
          </div>
        </CardContent>
      </Card>

      {/* المسار المحلي */}
      {!isR2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('settings.storage.local.title', { defaultValue: 'إعدادات التخزين المحلي' })}
            </CardTitle>
            <CardDescription>
              {t('settings.storage.local.description', { defaultValue: 'مسار كامل على الخادم — يجب أن يملك المستخدم الذي يشغّل IIS صلاحية الكتابة عليه.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            <Field
              label={t('settings.storage.local.rootPath', { defaultValue: 'مسار الجذر' })}
              icon={FolderTree}
            >
              <Input
                value={form.localRootPath}
                onChange={(e) => setForm({ ...form, localRootPath: e.target.value })}
                placeholder="D:/iraqitradecenter/attachments"
                dir="ltr"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.storage.local.rootPathHint', {
                  defaultValue: 'مثال: D:/iraqitradecenter/attachments — يُنشأ تلقائياً إن لم يكن موجوداً.',
                })}
              </p>
            </Field>
          </CardContent>
        </Card>
      )}

      {/* مفاتيح R2 */}
      {isR2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('settings.storage.r2.title', { defaultValue: 'إعدادات Cloudflare R2' })}
            </CardTitle>
            <CardDescription>
              {t('settings.storage.r2.description', { defaultValue: 'املأ معلومات الـ R2 bucket. مفتاح السرّ يُحفَظ مرّة واحدة ولا يُعرض لاحقاً.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t('settings.storage.r2.accountId', { defaultValue: 'Account ID' })} icon={KeyRound}>
                <Input
                  value={form.r2AccountId}
                  onChange={(e) => setForm({ ...form, r2AccountId: e.target.value })}
                  placeholder="e.g. a1b2c3d4..."
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.storage.r2.bucket', { defaultValue: 'Bucket' })} icon={Cloud}>
                <Input
                  value={form.r2Bucket}
                  onChange={(e) => setForm({ ...form, r2Bucket: e.target.value })}
                  placeholder="iraqitradecenter-attachments"
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.storage.r2.accessKeyId', { defaultValue: 'Access Key ID' })} icon={KeyRound}>
                <Input
                  value={form.r2AccessKeyId}
                  onChange={(e) => setForm({ ...form, r2AccessKeyId: e.target.value })}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.storage.r2.secretAccessKey', { defaultValue: 'Secret Access Key' })} icon={KeyRound}>
                <Input
                  type="password"
                  value={form.r2SecretAccessKey}
                  onChange={(e) => setForm({ ...form, r2SecretAccessKey: e.target.value })}
                  placeholder={data.r2SecretAccessKeySet
                    ? (data.r2SecretAccessKeyMasked ?? '••••••••')
                    : t('settings.storage.r2.secretPlaceholder', { defaultValue: 'لم يُحفظ بعد' })}
                  dir="ltr"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.r2SecretAccessKeySet
                    ? t('settings.storage.r2.secretHintSaved', { defaultValue: 'اتركه فارغاً للإبقاء على المفتاح القديم.' })
                    : t('settings.storage.r2.secretHintNew', { defaultValue: 'أدخل المفتاح السرّي من لوحة Cloudflare.' })}
                </p>
              </Field>
              <Field
                label={t('settings.storage.r2.publicBaseUrl', { defaultValue: 'Public Base URL (اختياري)' })}
                icon={Globe}
              >
                <Input
                  value={form.r2PublicBaseUrl}
                  onChange={(e) => setForm({ ...form, r2PublicBaseUrl: e.target.value })}
                  placeholder="https://files.example.com"
                  dir="ltr"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* الحد الأقصى لحجم الملف */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('settings.storage.limits.title', { defaultValue: 'حدود الرفع' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <Field label={t('settings.storage.limits.maxSize', { defaultValue: 'الحد الأعلى للملف الواحد (ميجابايت)' })} icon={FileText}>
            <Input
              type="number"
              min={1}
              max={1024}
              value={form.maxFileSizeMb}
              onChange={(e) => setForm({ ...form, maxFileSizeMb: Math.max(1, Number(e.target.value) || 25) })}
              dir="ltr"
            />
          </Field>
          {data.updatedAtUtc && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {new Date(data.updatedAtUtc).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' })}
              {data.updatedBy ? ` — ${data.updatedBy}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          <Save className="me-2 h-4 w-4" />
          {saveMut.isPending
            ? t('common.saving', { defaultValue: 'جارٍ الحفظ…' })
            : t('common.save', { defaultValue: 'حفظ' })}
        </Button>
      </div>
    </div>
  );
}

function ProviderRadio({
  icon: Icon,
  label,
  hint,
  selected,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-start transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
          : 'border-border bg-card hover:border-primary/40 hover:bg-secondary/30',
      )}
    >
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-md', selected ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground')}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={cn('mt-1 h-3.5 w-3.5 rounded-full border', selected ? 'border-primary bg-primary' : 'border-border')} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: التكاملات (Placeholder)
// ─────────────────────────────────────────────────────────────────────────
function IntegrationsSection() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-5">
        <ComingSoon
          title={t('settings.sections.notifications.title')}
          description={t('settings.sections.notifications.description')}
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: حول النظام
// ─────────────────────────────────────────────────────────────────────────
function AboutSection() {
  const { t } = useTranslation();
  const buildVersion = (import.meta.env.VITE_APP_VERSION as string) || '1.0.0';
  const buildDate = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <InfoRow label={t('settings.about.systemName')} value={t('settings.about.systemValue')} />
          <InfoRow label={t('settings.about.version')} value={buildVersion} />
          <InfoRow label={t('settings.about.lastUpdate')} value={buildDate} />
          <InfoRow label={t('settings.about.connectionStatus')} value={<span className="inline-flex items-center gap-1 text-success"><span className="h-2 w-2 rounded-full bg-success" />{t('settings.about.connected')}</span>} />
        </div>
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
          {t('settings.about.support')}
        </div>
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// مكوّنات مساعدة
// ════════════════════════════════════════════════════════════════════════════

function Field({
  label, icon: Icon, children,
}: {
  label: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
    </div>
  );
}

function NavTile({
  icon: Icon, title, description, onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 p-4 text-right transition hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ComingSoon({ title, description }: { title: string; description: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-secondary/20 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
        <SettingsIcon className="h-6 w-6 text-warning" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 max-w-md text-xs text-muted-foreground">{description}</div>
      </div>
      <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-[11px] text-warning">
        {t('common.comingSoon')}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/40 bg-secondary/20 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function SectionFooter({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end border-t border-border/40 pt-3">
      <Button onClick={onSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? t('common.saving') : t('common.saveChanges')}
      </Button>
    </div>
  );
}
