import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2, Upload, Save, X, Image as ImageIcon, Phone, MapPin, Mail, Globe,
  FileText, ListChecks, ChevronLeft, Coins, Users, Shield, Settings as SettingsIcon,
  Languages, DatabaseBackup, PlugZap, Info, HardDrive, Cloud, KeyRound, FolderTree,
  ChevronDown, ChevronRight, PlugZap as TestIcon, CheckCircle2, XCircle, AlertTriangle, Loader2, Download, Plus, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { companySettingsApi, type CompanySettingsDto } from '@/lib/api/companySettings';
import { attachmentSettingsApi, type R2ConnectionTestResultDto } from '@/lib/api/attachmentSettings';
import { mediaBackupSettingsApi, type DatabaseBackupFileDto, type MediaBackupSettingsDto, type R2DatabaseBackupFileDto } from '@/lib/api/mediaBackupSettings';
import { buildAutoBackupCron, parseAutoBackupCron, WEEKDAY_OPTIONS, MAX_SCHEDULE_TIMES, type BackupScheduleKind } from '@/lib/backupSchedule';
import { formatFileSize } from '@/lib/api/attachments';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { Label } from '@/components/ui/label';
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
      permission: PERMS.System.CompanySettings.Update,
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

function CollapsibleSettingsPanel({
  icon: Icon,
  title,
  hint,
  open,
  onToggle,
  children,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/10 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-secondary/20"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {trailing}
          {open ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </div>
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

  const isDirty = useMemo(() => {
    if (!settings) return false;
    const keys: (keyof CompanySettingsDto)[] = [
      'nameAr', 'nameEn', 'address', 'addressEn', 'phone', 'email', 'website', 'taxNumber', 'logoBase64',
    ];
    return keys.some(k => String(form[k] ?? '') !== String(settings[k] ?? ''));
  }, [form, settings]);

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

        <SectionFooter onSave={onSave} saving={m.isPending} dirty={isDirty} />
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

  const isDirty = useMemo(() => {
    if (!settings) return false;
    return (form.printHeader ?? '') !== (settings.printHeader ?? '')
      || (form.printFooter ?? '') !== (settings.printFooter ?? '');
  }, [form, settings]);

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

        <SectionFooter onSave={() => m.mutate()} saving={m.isPending} dirty={isDirty} />
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
// قسم: أرشيف الميديا والنسخ الاحتياطي
// ─────────────────────────────────────────────────────────────────────────
function BackupSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['media-backup-settings'],
    queryFn: mediaBackupSettingsApi.get,
  });

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
  });

  const { data: dbFiles = [], refetch: refetchDbFiles, isFetching: dbFilesLoading } = useQuery({
    queryKey: ['media-backup-database-files'],
    queryFn: mediaBackupSettingsApi.listDatabaseFiles,
    enabled: !!data?.mediaRootPath,
  });

  const r2SyncEnabled = !!(data?.syncDatabaseBackupToR2 && data?.includeDatabaseBackup);
  const { data: r2DbFiles = [], refetch: refetchR2DbFiles, isFetching: r2DbFilesLoading } = useQuery({
    queryKey: ['media-backup-r2-database-files'],
    queryFn: mediaBackupSettingsApi.listR2DatabaseFiles,
    enabled: r2SyncEnabled,
  });

  const [archivePathOpen, setArchivePathOpen] = useState(false);
  const [backupOptionsOpen, setBackupOptionsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dbFilesOpen, setDbFilesOpen] = useState(false);
  const [r2PanelOpen, setR2PanelOpen] = useState(false);

  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const [form, setForm] = useState<{
    mediaRootPath: string;
    includeDatabaseBackup: boolean;
    syncDatabaseBackupToR2: boolean;
    serverDatabaseBackupKeepCount: number;
    r2DatabaseBackupKeepCount: number;
    includeVoucherData: boolean;
    includeAttachments: boolean;
    retentionYears: number;
    fiscalYearId: number | '';
    autoBackupEnabled: boolean;
    scheduleKind: BackupScheduleKind;
    scheduleTimes: string[];
    scheduleDay: number;
  } | null>(null);

  useEffect(() => {
    if (!data) return;
    const schedule = parseAutoBackupCron(data.autoBackupCron);
    setForm({
      mediaRootPath: data.mediaRootPath ?? '',
      includeDatabaseBackup: data.includeDatabaseBackup,
      syncDatabaseBackupToR2: data.syncDatabaseBackupToR2,
      serverDatabaseBackupKeepCount: data.serverDatabaseBackupKeepCount ?? 3,
      r2DatabaseBackupKeepCount: data.r2DatabaseBackupKeepCount ?? 10,
      includeVoucherData: data.includeVoucherData,
      includeAttachments: data.includeAttachments,
      retentionYears: data.retentionYears || 5,
      fiscalYearId: fiscalYears.find(f => f.isActive)?.id ?? fiscalYears[0]?.id ?? '',
      autoBackupEnabled: data.autoBackupEnabled,
      scheduleKind: schedule.kind,
      scheduleTimes: schedule.times,
      scheduleDay: schedule.day,
    });
  }, [data, fiscalYears]);

  const saveMut = useMutation({
    mutationFn: () => mediaBackupSettingsApi.update({
      mediaRootPath: form!.mediaRootPath.trim(),
      includeDatabaseBackup: form!.includeDatabaseBackup,
      syncDatabaseBackupToR2: form!.includeDatabaseBackup && form!.syncDatabaseBackupToR2,
      serverDatabaseBackupKeepCount: form!.serverDatabaseBackupKeepCount,
      r2DatabaseBackupKeepCount: form!.r2DatabaseBackupKeepCount,
      includeVoucherData: form!.includeVoucherData,
      includeAttachments: form!.includeAttachments,
      retentionYears: form!.retentionYears,
      autoBackupEnabled: form!.autoBackupEnabled,
      autoBackupCron: form!.autoBackupEnabled
        ? buildAutoBackupCron(form!.scheduleKind, form!.scheduleTimes, form!.scheduleDay)
        : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media-backup-settings'] });
      if (form?.includeDatabaseBackup && form?.syncDatabaseBackupToR2) {
        qc.invalidateQueries({ queryKey: ['media-backup-r2-database-files'] });
      }
      toast.success(t('common.saved'));
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? t('common.error')),
  });

  const isDirty = useMemo(() => {
    if (!data || !form) return false;
    return backupSettingsSnapshot(form) !== backupSettingsSnapshotFromData(data);
  }, [form, data]);

  const testPathMut = useMutation({
    mutationFn: () => mediaBackupSettingsApi.testPath(form?.mediaRootPath.trim() || undefined),
    onSuccess: (res) => {
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? t('common.error')),
  });

  const runMut = useMutation({
    mutationFn: async () => {
      if (!form?.fiscalYearId) throw new Error(t('settings.backup.selectYear', { defaultValue: 'اختر سنة مالية' }));
      await saveMut.mutateAsync();
      return mediaBackupSettingsApi.run(Number(form.fiscalYearId));
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['media-backup-settings'] });
      qc.invalidateQueries({ queryKey: ['media-backup-database-files'] });
      refetchDbFiles();
      if (form?.syncDatabaseBackupToR2) refetchR2DbFiles();
      const parts = [res.message ?? t('settings.backup.runSuccess', { defaultValue: 'تم إنشاء الأرشيف' })];
      if (res.databaseSyncedToR2 && res.databaseR2Key) {
        parts.push(t('settings.backup.r2Synced', { defaultValue: 'تم رفع نسخة قاعدة البيانات إلى R2' }));
      }
      if (res.localDatabaseBackupsPurged && res.localDatabaseBackupsPurged > 0) {
        parts.push(t('settings.backup.localPurged', {
          defaultValue: `حُذفت ${res.localDatabaseBackupsPurged} نسخة قديمة من السيرفر`,
          count: res.localDatabaseBackupsPurged,
        }));
      }
      if (res.r2DatabaseBackupsPurged && res.r2DatabaseBackupsPurged > 0) {
        parts.push(t('settings.backup.r2Purged', {
          defaultValue: `حُذفت ${res.r2DatabaseBackupsPurged} نسخة قديمة من R2`,
          count: res.r2DatabaseBackupsPurged,
        }));
      }
      toast.success(parts.join(' · '));
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? t('common.error')),
  });

  const applyR2RetentionMut = useMutation({
    mutationFn: () => mediaBackupSettingsApi.applyR2Retention(),
    onSuccess: (res) => {
      refetchR2DbFiles();
      toast.success(t('settings.backup.r2RetentionApplied', {
        defaultValue: `تم تطبيق سياسة الاحتفاظ — حُذفت ${res.purgedCount} نسخة من R2`,
        count: res.purgedCount,
      }));
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? t('common.error')),
  });

  const handleDownloadDb = async (file: DatabaseBackupFileDto) => {
    const key = `${file.yearFolder}/${file.fileName}`;
    setDownloadingKey(key);
    try {
      await mediaBackupSettingsApi.downloadDatabaseFile(file);
      toast.success(t('settings.backup.downloadStarted', { defaultValue: 'بدأ تنزيل النسخة الاحتياطية' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.backup.downloadFailed', { defaultValue: 'تعذّر تنزيل النسخة' });
      toast.error(msg);
    } finally {
      setDownloadingKey(null);
    }
  };

  if (isLoading) {
    return (
      <Card><CardContent className="p-8 flex justify-center"><LoadingSpinner /></CardContent></Card>
    );
  }

  if (isError) {
    return (
      <Card><CardContent className="p-5 text-destructive">{t('common.error')}</CardContent></Card>
    );
  }

  if (!form) {
    return (
      <Card><CardContent className="p-8 flex justify-center"><LoadingSpinner /></CardContent></Card>
    );
  }

  const statusTone = data?.lastRunStatus === 'Success' ? 'text-green-600'
    : data?.lastRunStatus === 'Failed' ? 'text-destructive'
    : data?.lastRunStatus === 'Running' ? 'text-primary' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderTree className="h-4 w-4 text-primary" />
          {t('settings.sections.backup.title')}
        </CardTitle>
        <CardDescription>{t('settings.backup.subtitle', {
          defaultValue: 'مسار واحد تحدده أنت — تحته مجلد لكل سنة، وملف/مجلد لكل نافذة (RV, PV, JV, JE) + قاعدة البيانات.',
        })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CollapsibleSettingsPanel
          icon={FolderTree}
          title={t('settings.backup.archivePathPanelTitle', { defaultValue: 'مسار أرشيف الميديا' })}
          hint={form.mediaRootPath.trim() || t('settings.backup.pathNotSet', { defaultValue: 'لم يُحدَّد مسار بعد' })}
          open={archivePathOpen}
          onToggle={() => setArchivePathOpen(v => !v)}
        >
          <div className="space-y-2">
            <Label>{t('settings.backup.rootPath', { defaultValue: 'مسار أرشيف الميديا (كامل)' })}</Label>
            <div className="flex gap-2">
              <Input
                value={form.mediaRootPath}
                onChange={e => setForm(f => f ? { ...f, mediaRootPath: e.target.value } : f)}
                placeholder="D:/ITC-Media"
                className="font-mono text-sm"
                dir="ltr"
              />
              <Button type="button" variant="outline" onClick={() => testPathMut.mutate()} disabled={testPathMut.isPending}>
                {testPathMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestIcon className="h-4 w-4" />}
                {t('settings.backup.testPath', { defaultValue: 'اختبار' })}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.backup.pathHint', {
              defaultValue: 'يجب أن يكون المسار على قرص يصل إليه IIS و SQL Server (لملفات .bak).',
            })}</p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-3 font-mono text-xs leading-relaxed" dir="ltr">
            {`{Root}/2024/database/*.bak\n{Root}/2024/RV/data/*.json + attachments/\n{Root}/2024/PV/ ...\n{Root}/2024/JV/ ...\n{Root}/2024/JE/ ...`}
          </div>
        </CollapsibleSettingsPanel>

        <CollapsibleSettingsPanel
          icon={DatabaseBackup}
          title={t('settings.backup.optionsPanelTitle', { defaultValue: 'خيارات النسخ وقاعدة البيانات' })}
          hint={t('settings.backup.optionsPanelHint', {
            defaultValue: 'محتوى الأرشيف، الاحتفاظ، ونسخ .bak على السيرفر و R2.',
          })}
          open={backupOptionsOpen}
          onToggle={() => setBackupOptionsOpen(v => !v)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.includeDatabaseBackup}
                onChange={e => setForm(f => f ? {
                  ...f,
                  includeDatabaseBackup: e.target.checked,
                  syncDatabaseBackupToR2: e.target.checked ? f.syncDatabaseBackupToR2 : false,
                } : f)} />
              {t('settings.backup.includeDb', { defaultValue: 'نسخة قاعدة البيانات (.bak)' })}
            </label>
            <label className={`flex items-center gap-2 text-sm ${form.includeDatabaseBackup ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input type="checkbox" checked={form.syncDatabaseBackupToR2} disabled={!form.includeDatabaseBackup}
                onChange={e => setForm(f => f ? { ...f, syncDatabaseBackupToR2: e.target.checked } : f)} />
              {t('settings.backup.syncDbToR2', { defaultValue: 'مزامنة نسخة قاعدة البيانات مع R2' })}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.includeVoucherData}
                onChange={e => setForm(f => f ? { ...f, includeVoucherData: e.target.checked } : f)} />
              {t('settings.backup.includeData', { defaultValue: 'بيانات السندات (JSON)' })}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.includeAttachments}
                onChange={e => setForm(f => f ? { ...f, includeAttachments: e.target.checked } : f)} />
              {t('settings.backup.includeAttachments', { defaultValue: 'مرفقات الملفات' })}
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>{t('settings.backup.fiscalYear', { defaultValue: 'السنة المالية' })}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.fiscalYearId}
                onChange={e => setForm(f => f ? { ...f, fiscalYearId: e.target.value ? Number(e.target.value) : '' } : f)}
              >
                <option value="">{t('settings.backup.selectYear', { defaultValue: '— اختر —' })}</option>
                {fiscalYears.map(fy => (
                  <option key={fy.id} value={fy.id}>{fy.name}{fy.isActive ? ' ★' : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t('settings.backup.retention', { defaultValue: 'الاحتفاظ (سنوات)' })}</Label>
              <Input type="number" min={1} max={50} value={form.retentionYears}
                onChange={e => setForm(f => f ? { ...f, retentionYears: Number(e.target.value) || 5 } : f)} />
            </div>
            <div className="space-y-1">
              <Label>{t('settings.backup.serverKeepCount', { defaultValue: 'نسخ .bak على السيرفر' })}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.serverDatabaseBackupKeepCount}
                disabled={!form.includeDatabaseBackup}
                onChange={e => setForm(f => f ? { ...f, serverDatabaseBackupKeepCount: Math.max(0, Number(e.target.value) || 0) } : f)}
              />
              <p className="text-xs text-muted-foreground">{t('settings.backup.serverKeepHint', {
                defaultValue: 'عدد أحدث نسخ .bak المحفوظة محلياً لكل سنة (0 = بدون حد).',
              })}</p>
            </div>
          </div>

          {form.includeDatabaseBackup && form.syncDatabaseBackupToR2 && (
            <div className="rounded-lg border border-border bg-secondary/10 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-secondary/20"
                onClick={() => setR2PanelOpen(v => !v)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Cloud className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{t('settings.backup.r2PanelTitle', { defaultValue: 'إدارة نسخ R2' })}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.backup.r2PanelHint', {
                      defaultValue: 'عدد النسخ المحفوظة على Cloudflare R2 لكل سنة مالية.',
                    })}</p>
                  </div>
                </div>
                {r2PanelOpen ? (
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
              </button>

              {r2PanelOpen && (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>{t('settings.backup.r2KeepCount', { defaultValue: 'نسخ .bak على R2' })}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={form.r2DatabaseBackupKeepCount}
                        onChange={e => setForm(f => f ? {
                          ...f,
                          r2DatabaseBackupKeepCount: Math.max(0, Number(e.target.value) || 0),
                        } : f)}
                      />
                      <p className="text-xs text-muted-foreground">{t('settings.backup.r2KeepHint', {
                        defaultValue: 'عدد أحدث نسخ .bak المحفوظة على R2 لكل سنة (0 = بدون حد).',
                      })}</p>
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={applyR2RetentionMut.isPending}
                        onClick={() => applyR2RetentionMut.mutate()}
                      >
                        {applyR2RetentionMut.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                        {t('settings.backup.applyR2Retention', { defaultValue: 'تطبيق الاحتفاظ الآن' })}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-semibold">
                        {t('settings.backup.r2AvailableFiles', { defaultValue: 'نسخ R2 المتوفرة' })}
                      </Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => refetchR2DbFiles()} disabled={r2DbFilesLoading}>
                        {r2DbFilesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {t('common.refresh', { defaultValue: 'تحديث' })}
                      </Button>
                    </div>

                    {r2DbFilesLoading && r2DbFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
                    )}

                    {!r2DbFilesLoading && r2DbFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t('settings.backup.noR2DbFiles', {
                        defaultValue: 'لا توجد نسخ .bak على R2 — أنشئ أرشيفاً مع تفعيل المزامنة.',
                      })}</p>
                    )}

                    {r2DbFiles.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {r2DbFiles.map((file: R2DatabaseBackupFileDto) => (
                          <div
                            key={file.r2Key}
                            className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                          >
                            <Cloud className="h-4 w-4 text-sky-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate font-mono" dir="ltr">{file.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {file.yearFolder} · {formatFileSize(file.sizeBytes)} · {new Date(file.createdAtUtc).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CollapsibleSettingsPanel>

        <CollapsibleSettingsPanel
          icon={ListChecks}
          title={t('settings.backup.scheduleTitle', { defaultValue: 'جدولة النسخ الاحتياطي' })}
          hint={form.autoBackupEnabled
            ? t('settings.backup.scheduleEnabledHint', { defaultValue: 'الجدولة مفعّلة' })
            : t('settings.backup.scheduleHint', {
              defaultValue: 'تُنفَّذ تلقائياً على السنة المالية النشطة ★ (توقيت بغداد).',
            })}
          open={scheduleOpen}
          onToggle={() => setScheduleOpen(v => !v)}
          trailing={form.autoBackupEnabled ? (
            <SectionBadge label={t('settings.backup.scheduleEnabledBadge', { defaultValue: 'مفعّل' })} tone="success" />
          ) : undefined}
        >
          <p className="text-xs text-muted-foreground">{t('settings.backup.scheduleHint', {
            defaultValue: 'تُنفَّذ تلقائياً على السنة المالية النشطة ★ بحسب الخيارات المفعّلة أعلاه (توقيت بغداد).',
          })}</p>

          <label className={`flex items-center gap-2 text-sm w-fit ${form.includeDatabaseBackup && form.mediaRootPath.trim() ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="checkbox"
              checked={form.autoBackupEnabled}
              disabled={!form.includeDatabaseBackup || !form.mediaRootPath.trim()}
              onChange={e => setForm(f => f ? { ...f, autoBackupEnabled: e.target.checked } : f)}
            />
            {t('settings.backup.scheduleEnabled', { defaultValue: 'تفعيل الجدولة' })}
          </label>

          {form.autoBackupEnabled && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('settings.backup.scheduleKind', { defaultValue: 'نوع الجدولة' })}</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.scheduleKind}
                    onChange={e => setForm(f => f ? { ...f, scheduleKind: e.target.value as BackupScheduleKind } : f)}
                  >
                    <option value="daily">{t('settings.backup.scheduleDaily', { defaultValue: 'يومي' })}</option>
                    <option value="weekly">{t('settings.backup.scheduleWeekly', { defaultValue: 'أسبوعي' })}</option>
                    <option value="monthly">{t('settings.backup.scheduleMonthly', { defaultValue: 'شهري' })}</option>
                  </select>
                </div>
                {form.scheduleKind === 'weekly' && (
                  <div className="space-y-1">
                    <Label>{t('settings.backup.scheduleWeekDay', { defaultValue: 'يوم الأسبوع' })}</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.scheduleDay}
                      onChange={e => setForm(f => f ? { ...f, scheduleDay: Number(e.target.value) } : f)}
                    >
                      {WEEKDAY_OPTIONS.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {form.scheduleKind === 'monthly' && (
                  <div className="space-y-1">
                    <Label>{t('settings.backup.scheduleMonthDay', { defaultValue: 'يوم الشهر' })}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={form.scheduleDay || 1}
                      onChange={e => setForm(f => f ? { ...f, scheduleDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) } : f)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('settings.backup.scheduleTimes', { defaultValue: 'الأوقات (بغداد)' })}</Label>
                {form.scheduleTimes.map((time, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="max-w-[180px]"
                      value={time}
                      onChange={e => setForm(f => {
                        if (!f) return f;
                        const next = [...f.scheduleTimes];
                        next[idx] = e.target.value || '02:00';
                        return { ...f, scheduleTimes: next };
                      })}
                    />
                    {form.scheduleTimes.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setForm(f => f ? {
                          ...f,
                          scheduleTimes: f.scheduleTimes.filter((_, i) => i !== idx),
                        } : f)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {form.scheduleTimes.length < MAX_SCHEDULE_TIMES && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setForm(f => f ? {
                      ...f,
                      scheduleTimes: [...f.scheduleTimes, '02:00'],
                    } : f)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('settings.backup.addScheduleTime', { defaultValue: 'إضافة وقت' })}
                  </Button>
                )}
              </div>
            </div>
          )}

          {form.autoBackupEnabled && data?.autoBackupScheduleDescription && (
            <p className="text-xs text-muted-foreground">{data.autoBackupScheduleDescription}</p>
          )}
          {form.autoBackupEnabled && data?.nextAutoBackupAtUtc && (
            <p className="text-xs text-primary">
              {t('settings.backup.nextRun', { defaultValue: 'الموعد القادم' })}: {new Date(data.nextAutoBackupAtUtc).toLocaleString()}
            </p>
          )}
          {data?.lastScheduledRunAtUtc && (
            <p className="text-xs text-muted-foreground">
              {t('settings.backup.lastScheduledRun', { defaultValue: 'آخر تشغيل مجدول' })}: {new Date(data.lastScheduledRunAtUtc).toLocaleString()}
            </p>
          )}
        </CollapsibleSettingsPanel>

        {(data?.lastRunAtUtc || data?.lastRunStatus) && (
          <div className="rounded-lg border border-border p-3 text-sm space-y-1">
            <p className={statusTone}>
              {t('settings.backup.lastRun', { defaultValue: 'آخر تشغيل' })}: {data?.lastRunStatus}
              {data?.lastRunYearFolder ? ` — ${data.lastRunYearFolder}` : ''}
            </p>
            {data?.lastRunAtUtc && (
              <p className="text-xs text-muted-foreground">{new Date(data.lastRunAtUtc).toLocaleString()}</p>
            )}
            {data?.lastRunError && (
              <p className="text-xs text-destructive">{data.lastRunError}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isDirty}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
            {t('common.save')}
          </Button>
          <Button
            variant="default"
            className="gap-2"
            disabled={runMut.isPending || data?.isRunning || !form.fiscalYearId}
            onClick={() => runMut.mutate()}
          >
            {runMut.isPending || data?.isRunning
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <DatabaseBackup className="h-4 w-4" />}
            {t('settings.backup.runNow', { defaultValue: 'إنشاء أرشيف الآن' })}
          </Button>
        </div>

        <CollapsibleSettingsPanel
          icon={HardDrive}
          title={t('settings.backup.availableDbFiles', { defaultValue: 'نسخ قاعدة البيانات المتوفرة' })}
          hint={dbFiles.length > 0
            ? t('settings.backup.dbFilesCount', { defaultValue: '{{count}} نسخة', count: dbFiles.length })
            : t('settings.backup.noDbFilesShort', { defaultValue: 'لا توجد نسخ محلية' })}
          open={dbFilesOpen}
          onToggle={() => setDbFilesOpen(v => !v)}
          trailing={dbFiles.length > 0 ? (
            <SectionBadge label={String(dbFiles.length)} tone="info" />
          ) : undefined}
        >
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => refetchDbFiles()} disabled={dbFilesLoading}>
              {dbFilesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('common.refresh', { defaultValue: 'تحديث' })}
            </Button>
          </div>

          {!form.mediaRootPath.trim() && (
            <p className="text-xs text-muted-foreground">
              {t('settings.backup.setPathFirst', { defaultValue: 'حدّد مسار الأرشيف أولاً لعرض النسخ.' })}
            </p>
          )}

          {form.mediaRootPath.trim() && !dbFilesLoading && dbFiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('settings.backup.noDbFiles', { defaultValue: 'لا توجد ملفات .bak — أنشئ أرشيفاً يتضمن نسخة قاعدة البيانات.' })}
            </p>
          )}

          {dbFiles.length > 0 && (
            <div className="space-y-2">
              {dbFiles.map(file => {
                const key = `${file.yearFolder}/${file.fileName}`;
                const isDownloading = downloadingKey === key;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
                  >
                    <DatabaseBackup className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate font-mono" dir="ltr">{file.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.yearFolder} · {formatFileSize(file.sizeBytes)} · {new Date(file.createdAtUtc).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1 shrink-0"
                      disabled={isDownloading}
                      onClick={() => handleDownloadDb(file)}
                    >
                      {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {t('settings.backup.download', { defaultValue: 'تنزيل' })}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSettingsPanel>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: أرشيف المرفقات (مسار محلي / Cloudflare R2)
//   • السرّ (SecretAccessKey) لا يُعاد كاملاً — نعرض القناع فقط. لتركه دون تغيير
//     يُترك حقله فارغاً عند الحفظ.
//   • الحدّ الأقصى للحجم بالميجابايت مفصول عن بايتات الـ DTO لتسهيل الإدخال.
// ─────────────────────────────────────────────────────────────────────────
function normalizeR2AccountIdInput(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  // ‎رابط كامل أو host: https://{id}.r2.cloudflarestorage.com/...
  const urlMatch = s.match(/https?:\/\/([0-9a-fA-F]{32})(?:\.(?:eu\.)?r2\.cloudflarestorage\.com)?/i);
  if (urlMatch) return urlMatch[1].toLowerCase();

  const hostMatch = s.match(/^([0-9a-fA-F]{32})\.(?:eu\.)?r2\.cloudflarestorage\.com/i);
  if (hostMatch) return hostMatch[1].toLowerCase();

  const embedded = s.match(/([0-9a-fA-F]{32})/);
  if (embedded) return embedded[1].toLowerCase();

  return s.replace(/\s/g, '');
}

/** يستخرج اسم الـ bucket إذا لُصق رابط S3 كامل يتضمن /bucket */
function extractR2BucketFromUrl(raw: string): string | null {
  const m = raw.trim().match(/r2\.cloudflarestorage\.com\/([^/?#\s]+)/i);
  const name = m?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

function buildR2Endpoint(accountId: string, jurisdiction: string): string {
  const id = normalizeR2AccountIdInput(accountId);
  if (!id || !isValidR2AccountId(id)) return '';
  const host = jurisdiction === 'eu'
    ? `${id}.eu.r2.cloudflarestorage.com`
    : `${id}.r2.cloudflarestorage.com`;
  return `https://${host}`;
}

function isValidR2AccountId(accountId: string): boolean {
  const id = normalizeR2AccountIdInput(accountId);
  return id.length === 32 && /^[0-9a-f]+$/.test(id);
}

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
    r2Jurisdiction: 'default' | 'eu';
    r2PublicBaseUrl: string;
    maxFileSizeMb: number;
  } | null>(null);

  // ‎بطاقة معلومات R2 مطوية افتراضياً — تُكشف فقط عند الحاجة لتعديل المفاتيح.
  const [r2DetailsOpen, setR2DetailsOpen] = useState(false);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);

  // ‎نتيجة آخر اختبار اتصال (تُمسح عند تعديل أي حقل من حقول R2 لتفادي الإشارة لقيم قديمة).
  const [r2TestResult, setR2TestResult] = useState<R2ConnectionTestResultDto | null>(null);

  const testR2Mutation = useMutation({
    mutationFn: attachmentSettingsApi.testR2Connection,
    onSuccess: (res) => {
      setR2TestResult(res);
      if (res.success) {
        toast.success(t('settings.storage.r2.test.success', { defaultValue: 'الاتصال مع R2 ناجح' }));
      } else {
        toast.error(t('settings.storage.r2.test.failed', { defaultValue: 'فشل الاتصال مع R2' }));
      }
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.message ?? 'unknown error';
      setR2TestResult({ success: false, message: msg });
      toast.error(msg);
    },
  });

  // ‎هيدرجة الـ form من السيرفر مرة واحدة عند توفر البيانات.
  useEffect(() => {
    if (!data) return;
    setForm({
      provider: (data.provider === 'R2' ? 'R2' : 'Local') as 'Local' | 'R2',
      localRootPath: data.localRootPath ?? '',
      r2AccountId: normalizeR2AccountIdInput(data.r2AccountId ?? ''),
      r2AccessKeyId: data.r2AccessKeyId ?? '',
      r2SecretAccessKey: '', // لا نعرض السرّ — يُملأ فقط للاستبدال
      r2Bucket: data.r2Bucket ?? '',
      r2Jurisdiction: data.r2Jurisdiction === 'eu' ? 'eu' : 'default',
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
        r2Jurisdiction: form.r2Jurisdiction,
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

  const isDirty = useMemo(() => {
    if (!data || !form) return false;
    if (form.r2SecretAccessKey.trim()) return true;
    const savedMb = Math.max(1, Math.round((data.maxFileSizeBytes || 25 * 1024 * 1024) / (1024 * 1024)));
    return form.provider !== (data.provider === 'R2' ? 'R2' : 'Local')
      || form.localRootPath !== (data.localRootPath ?? '')
      || form.r2AccountId !== normalizeR2AccountIdInput(data.r2AccountId ?? '')
      || form.r2AccessKeyId !== (data.r2AccessKeyId ?? '')
      || form.r2Bucket !== (data.r2Bucket ?? '')
      || form.r2Jurisdiction !== (data.r2Jurisdiction === 'eu' ? 'eu' : 'default')
      || form.r2PublicBaseUrl !== (data.r2PublicBaseUrl ?? '')
      || form.maxFileSizeMb !== savedMb;
  }, [form, data]);

  if (isLoading || !form) return (
    <Card><CardContent className="p-5"><LoadingSpinner text={t('common.loading')} /></CardContent></Card>
  );
  if (isError || !data) return (
    <Card><CardContent className="p-5 text-sm text-muted-foreground">
      {t('settings.storage.loadError', { defaultValue: 'تعذّر تحميل الإعدادات' })}
    </CardContent></Card>
  );

  const isR2 = form.provider === 'R2';
  const computedEndpoint = buildR2Endpoint(form.r2AccountId, form.r2Jurisdiction);
  const accountIdOk = !form.r2AccountId.trim() || isValidR2AccountId(form.r2AccountId);

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
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setLocalSettingsOpen(v => !v)}
            aria-expanded={localSettingsOpen}
            className="w-full text-start"
          >
            <CardHeader className="cursor-pointer transition-colors hover:bg-secondary/40">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">
                    {t('settings.storage.local.title', { defaultValue: 'إعدادات التخزين المحلي' })}
                  </CardTitle>
                  <CardDescription className="truncate font-mono" dir="ltr">
                    {form.localRootPath.trim()
                      ? form.localRootPath
                      : t('settings.storage.local.description', { defaultValue: 'مسار كامل على الخادم — يجب أن يملك المستخدم الذي يشغّل IIS صلاحية الكتابة عليه.' })}
                  </CardDescription>
                </div>
                {localSettingsOpen ? (
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </button>
          {localSettingsOpen && (
          <CardContent className="space-y-3 border-t border-border p-5 pt-4">
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
              <div className="mt-2 rounded-lg border border-border bg-secondary/20 p-3 font-mono text-xs leading-relaxed" dir="ltr">
                {`{Root}/2026/RV/attachments/RV-16_56/*.pdf\n{Root}/2026/PV/attachments/PV-3_42/*\n{Root}/2026/JV/attachments/...\n{Root}/2026/JE/attachments/...`}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.storage.local.structureHint', {
                  defaultValue: 'لكل سنة مالية مجلد، وبداخله RV / PV / JV / JE — مثل هيكل النسخ الاحتياطي.',
                })}
              </p>
            </Field>
          </CardContent>
          )}
        </Card>
      )}

      {/* مفاتيح R2 — قابلة للطيّ، تظهر دائماً (المزامنة لـ R2 تحدث تلقائياً) */}
      <Card>
        {/* الرأس قابل للنقر لفتح/طي البطاقة بأكملها */}
        <button
          type="button"
          onClick={() => setR2DetailsOpen(v => !v)}
          aria-expanded={r2DetailsOpen}
          className="w-full text-start"
        >
          <CardHeader className="cursor-pointer transition-colors hover:bg-secondary/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cloud className="h-4 w-4 text-primary" />
                  {t('settings.storage.r2.title', { defaultValue: 'إعدادات Cloudflare R2' })}
                  {data.r2SecretAccessKeySet && data.r2Bucket ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                      {t('settings.storage.r2.statusConfigured', { defaultValue: 'مهيّأ' })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                      {t('settings.storage.r2.statusMissing', { defaultValue: 'غير مكتمل' })}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {t('settings.storage.r2.descriptionDual', {
                    defaultValue: 'الملفات تُحفظ محلياً ثم تُزامن مع R2 كل دقيقة، وتُمسح من الخادم بعد 24 ساعة. اضغط لتعديل المفاتيح.',
                  })}
                </CardDescription>
              </div>
              {r2DetailsOpen ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </button>
        {r2DetailsOpen && (
          <CardContent className="space-y-3 p-5 pt-0">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t('settings.storage.r2.accountId', { defaultValue: 'Account ID' })} icon={KeyRound}>
                <Input
                  value={form.r2AccountId}
                  onChange={(e) => setForm({ ...form, r2AccountId: normalizeR2AccountIdInput(e.target.value) })}
                  onBlur={() => setForm(f => {
                    if (!f) return f;
                    const bucketFromUrl = extractR2BucketFromUrl(f.r2AccountId);
                    return {
                      ...f,
                      r2AccountId: normalizeR2AccountIdInput(f.r2AccountId),
                      r2Bucket: bucketFromUrl && !f.r2Bucket.trim() ? bucketFromUrl : f.r2Bucket,
                    };
                  })}
                  placeholder="e.g. a1b2c3d4..."
                  dir="ltr"
                />
                {!accountIdOk && (
                  <p className="mt-1 text-xs text-destructive">
                    {t('settings.storage.r2.accountIdInvalid', { defaultValue: 'Account ID يجب أن يكون 32 حرف hex من لوحة R2 Overview.' })}
                  </p>
                )}
              </Field>
              <Field label={t('settings.storage.r2.bucket', { defaultValue: 'Bucket' })} icon={Cloud}>
                <Input
                  value={form.r2Bucket}
                  onChange={(e) => setForm({ ...form, r2Bucket: e.target.value })}
                  placeholder="goldencastle"
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.storage.r2.jurisdiction', { defaultValue: 'الاختصاص (Jurisdiction)' })} icon={Globe}>
                <select
                  className="h-10 w-full rounded-md border border-input bg-secondary/40 px-3 text-sm"
                  value={form.r2Jurisdiction}
                  onChange={(e) => setForm({ ...form, r2Jurisdiction: e.target.value as 'default' | 'eu' })}
                >
                  <option value="default">{t('settings.storage.r2.jurisdictionDefault', { defaultValue: 'عالمي (default)' })}</option>
                  <option value="eu">{t('settings.storage.r2.jurisdictionEu', { defaultValue: 'الاتحاد الأوروبي (eu)' })}</option>
                </select>
              </Field>
              <Field label={t('settings.storage.r2.endpoint', { defaultValue: 'S3 Endpoint (تلقائي)' })} icon={PlugZap}>
                <Input
                  value={computedEndpoint || data.r2Endpoint || ''}
                  readOnly
                  dir="ltr"
                  className="bg-muted/40 font-mono text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('settings.storage.r2.endpointHint', { defaultValue: 'يُبنى تلقائياً من Account ID — لا حاجة لإدخاله يدوياً.' })}
                </p>
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
                  placeholder="https://pub-xxxxxxxx.r2.dev"
                  dir="ltr"
                />
              </Field>
            </div>

            {/* اختبار الاتصال مع R2 */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary/30 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TestIcon className="h-4 w-4 text-primary" />
                  {t('settings.storage.r2.test.title', { defaultValue: 'اختبار الاتصال مع Cloudflare R2' })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('settings.storage.r2.test.description', {
                    defaultValue: 'يقوم بإجراء عملية رفع وقراءة وحذف لكائن صغير (~100 بايت) للتحقق من المفاتيح والاتصال.',
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => testR2Mutation.mutate()}
                disabled={testR2Mutation.isPending || !data.r2SecretAccessKeySet || !data.r2Bucket}
              >
                {testR2Mutation.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t('settings.storage.r2.test.running', { defaultValue: 'جارٍ الاختبار...' })}
                  </>
                ) : (
                  <>
                    <TestIcon className="me-2 h-4 w-4" />
                    {t('settings.storage.r2.test.run', { defaultValue: 'اختبار الاتصال' })}
                  </>
                )}
              </Button>
            </div>

            {/* نتيجة آخر اختبار */}
            {r2TestResult && (
              <div
                className={cn(
                  'mt-2 rounded-lg border p-3 text-sm',
                  r2TestResult.success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive',
                )}
              >
                <div className="flex items-start gap-2">
                  {r2TestResult.success ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium">{r2TestResult.message}</div>
                    {r2TestResult.timings && (
                      <div className="flex flex-wrap gap-3 text-xs opacity-90">
                        <span>↑ {r2TestResult.timings.uploadMs}ms</span>
                        <span>↓ {r2TestResult.timings.readMs}ms</span>
                        <span>✕ {r2TestResult.timings.deleteMs}ms</span>
                        <span className="font-semibold">Σ {r2TestResult.timings.totalMs}ms</span>
                      </div>
                    )}
                    {r2TestResult.hint && (
                      <div className="flex items-start gap-1 rounded bg-amber-500/15 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{r2TestResult.hint}</span>
                      </div>
                    )}
                    {r2TestResult.endpoint && (
                      <div className="break-all font-mono text-[11px] opacity-80" dir="ltr">
                        Endpoint: {r2TestResult.endpoint}
                      </div>
                    )}
                    {r2TestResult.checks && r2TestResult.checks.length > 0 && (
                      <ul className="space-y-1 text-xs">
                        {r2TestResult.checks.map((c) => (
                          <li key={c.stage} className="flex flex-wrap items-center gap-2">
                            {c.ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            <span className="font-medium">{c.stage}</span>
                            {c.host && <span className="font-mono opacity-70" dir="ltr">{c.host}</span>}
                            {c.detail && <span className="opacity-70">{c.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r2TestResult.inner && (
                      <div className="break-words font-mono text-[11px] opacity-70">{r2TestResult.inner}</div>
                    )}
                    {r2TestResult.missing && r2TestResult.missing.length > 0 && (
                      <div className="text-xs">
                        {t('settings.storage.r2.test.missingFields', { defaultValue: 'حقول مفقودة:' })}{' '}
                        <span className="font-mono">{r2TestResult.missing.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

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
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isDirty}>
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

function SectionFooter({ onSave, saving, dirty = false }: { onSave: () => void; saving: boolean; dirty?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end border-t border-border/40 pt-3">
      <Button onClick={onSave} disabled={saving || !dirty} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? t('common.saving') : t('common.saveChanges')}
      </Button>
    </div>
  );
}

type BackupFormSnapshot = {
  mediaRootPath: string;
  includeDatabaseBackup: boolean;
  syncDatabaseBackupToR2: boolean;
  serverDatabaseBackupKeepCount: number;
  r2DatabaseBackupKeepCount: number;
  includeVoucherData: boolean;
  includeAttachments: boolean;
  retentionYears: number;
  autoBackupEnabled: boolean;
  scheduleKind: BackupScheduleKind;
  scheduleTimes: string[];
  scheduleDay: number;
};

function backupSettingsSnapshot(form: BackupFormSnapshot): string {
  return JSON.stringify({
    mediaRootPath: form.mediaRootPath.trim(),
    includeDatabaseBackup: form.includeDatabaseBackup,
    syncDatabaseBackupToR2: form.includeDatabaseBackup && form.syncDatabaseBackupToR2,
    serverDatabaseBackupKeepCount: form.serverDatabaseBackupKeepCount,
    r2DatabaseBackupKeepCount: form.r2DatabaseBackupKeepCount,
    includeVoucherData: form.includeVoucherData,
    includeAttachments: form.includeAttachments,
    retentionYears: form.retentionYears,
    autoBackupEnabled: form.autoBackupEnabled,
    autoBackupCron: form.autoBackupEnabled
      ? buildAutoBackupCron(form.scheduleKind, form.scheduleTimes, form.scheduleDay)
      : null,
  });
}

function backupSettingsSnapshotFromData(data: MediaBackupSettingsDto): string {
  const schedule = parseAutoBackupCron(data.autoBackupCron);
  return JSON.stringify({
    mediaRootPath: (data.mediaRootPath ?? '').trim(),
    includeDatabaseBackup: data.includeDatabaseBackup,
    syncDatabaseBackupToR2: data.syncDatabaseBackupToR2,
    serverDatabaseBackupKeepCount: data.serverDatabaseBackupKeepCount ?? 3,
    r2DatabaseBackupKeepCount: data.r2DatabaseBackupKeepCount ?? 10,
    includeVoucherData: data.includeVoucherData,
    includeAttachments: data.includeAttachments,
    retentionYears: data.retentionYears || 5,
    autoBackupEnabled: data.autoBackupEnabled,
    autoBackupCron: data.autoBackupEnabled
      ? buildAutoBackupCron(schedule.kind, schedule.times, schedule.day)
      : null,
  });
}
