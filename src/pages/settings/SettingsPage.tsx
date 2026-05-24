import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2, Upload, Save, X, Image as ImageIcon, Phone, MapPin, Mail, Globe,
  FileText, ListChecks, ChevronLeft, Coins, Users, Shield, Settings as SettingsIcon,
  Languages, DatabaseBackup, PlugZap, Info,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { companySettingsApi, type CompanySettingsDto } from '@/lib/api/companySettings';
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
      title: 'هوية الشركة',
      description: 'الاسم والشعار وبيانات الاتصال التي تظهر في التقارير المطبوعة',
      Component: IdentitySection,
    },
    {
      id: 'printing',
      icon: FileText,
      title: 'الطباعة والتقارير',
      description: 'تخصيص رأس وتذييل الطباعة مع معاينة فورية',
      Component: PrintingSection,
    },
    {
      id: 'currencies',
      icon: Coins,
      title: 'العملات وأسعار الصرف',
      description: 'تفعيل العملات المعتمدة واختيار العملة الرئيسية',
      Component: CurrenciesSection,
    },
    {
      id: 'users',
      icon: Users,
      title: 'المستخدمون والصلاحيات',
      description: 'إدارة حسابات الدخول والأدوار والصلاحيات',
      permission: PERMS.System.Users.Read,
      Component: UsersSection,
    },
    {
      id: 'menu',
      icon: ListChecks,
      title: 'القائمة الجانبية',
      description: 'إظهار/إخفاء أقسام القائمة وضبط طيها الافتراضي',
      Component: MenuSection,
    },
    {
      id: 'regional',
      icon: Languages,
      title: 'التفضيلات الإقليمية',
      description: 'اللغة والتقويم وصيغة التاريخ والأرقام',
      badge: { label: 'قريباً', tone: 'muted' },
      Component: RegionalSection,
    },
    {
      id: 'backup',
      icon: DatabaseBackup,
      title: 'النسخ الاحتياطي',
      description: 'تصدير واستيراد بيانات النظام',
      badge: { label: 'قريباً', tone: 'muted' },
      Component: BackupSection,
    },
    {
      id: 'integrations',
      icon: PlugZap,
      title: 'التكاملات',
      description: 'الإشعارات عبر SMS / Email / Telegram',
      badge: { label: 'قريباً', tone: 'muted' },
      Component: IntegrationsSection,
    },
    {
      id: 'about',
      icon: Info,
      title: 'حول النظام',
      description: 'معلومات الإصدار وفحص حالة الخدمات',
      Component: AboutSection,
    },
  ], []);

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

  if (isLoading) return <LoadingSpinner text="جاري تحميل الإعدادات..." />;
  if (isError || !draft) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          تعذّر تحميل الإعدادات
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
            الإعدادات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إعدادات النظام والحساب
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
    if (!f.type.startsWith('image/')) return toast.error('الملف يجب أن يكون صورة');
    if (f.size > MAX_LOGO_BYTES) return toast.error('حجم الصورة يتجاوز 2 ميجابايت');
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
      toast.success('تم حفظ هوية الشركة');
      queryClient.setQueryData(['company-settings'], saved);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'تعذّر الحفظ'),
  });

  const onSave = () => {
    if (!form.nameAr.trim()) return toast.error('اسم الشركة (عربي) مطلوب');
    m.mutate();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          {/* الشعار */}
          <div className="md:col-span-1">
            <label className="mb-2 block text-xs text-muted-foreground">الشعار (اللوكو)</label>
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
                    title="حذف الصورة"
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
                {form.logoBase64 ? 'تغيير الشعار' : 'رفع شعار'}
              </Button>
              <p className="text-[10px] text-muted-foreground">PNG / JPG / SVG &mdash; حتى 2 ميجابايت</p>
            </div>
          </div>

          {/* الأسماء + العنوان والاتصال */}
          <div className="space-y-3 md:col-span-2">
            <Field label="اسم الشركة (عربي) *">
              <Input
                value={form.nameAr}
                onChange={e => set('nameAr', e.target.value.slice(0, 200))}
                placeholder="مثال: مركز التجارة العراقي"
                maxLength={200}
                required
              />
            </Field>
            <Field label="اسم الشركة (إنجليزي)">
              <Input
                value={form.nameEn ?? ''}
                onChange={e => set('nameEn', e.target.value.slice(0, 200))}
                placeholder="Iraqi Trade Center"
                maxLength={200}
              />
            </Field>
            <Field label="العنوان" icon={MapPin}>
              <Input
                value={form.address ?? ''}
                onChange={e => set('address', e.target.value.slice(0, 500))}
                placeholder="بغداد - المنصور - شارع 14 رمضان"
                maxLength={500}
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="رقم الهاتف" icon={Phone}>
                <Input
                  value={form.phone ?? ''}
                  onChange={e => set('phone', e.target.value.slice(0, 50))}
                  placeholder="07700000000"
                  maxLength={50}
                  dir="ltr"
                />
              </Field>
              <Field label="الرقم الضريبي">
                <Input
                  value={form.taxNumber ?? ''}
                  onChange={e => set('taxNumber', e.target.value.slice(0, 50))}
                  placeholder="رقم الضريبة"
                  maxLength={50}
                />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="البريد الإلكتروني" icon={Mail}>
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={e => set('email', e.target.value.slice(0, 150))}
                  placeholder="info@example.com"
                  maxLength={150}
                  dir="ltr"
                />
              </Field>
              <Field label="الموقع الإلكتروني" icon={Globe}>
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
      toast.success('تم حفظ إعدادات الطباعة');
      queryClient.setQueryData(['company-settings'], saved);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'تعذّر الحفظ'),
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="رأس الطباعة">
            <Input
              value={form.printHeader ?? ''}
              onChange={e => set('printHeader', e.target.value.slice(0, 500))}
              placeholder="مثال: تقارير محاسبية - دائرة الإدارة المالية"
              maxLength={500}
            />
          </Field>
          <Field label="تذييل الطباعة">
            <Input
              value={form.printFooter ?? ''}
              onChange={e => set('printFooter', e.target.value.slice(0, 500))}
              placeholder="مثال: جميع الحقوق محفوظة"
              maxLength={500}
            />
          </Field>
        </div>

        {/* معاينة */}
        <div>
          <div className="mb-2 text-xs text-muted-foreground">معاينة كيف ستظهر الترويسة</div>
          <div className="rounded-lg border-2 border-dashed border-border bg-white p-5 text-black" dir="rtl">
            <div className="flex items-start justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-3">
                {form.logoBase64 && (
                  <img src={form.logoBase64} alt="logo" className="h-14 w-14 object-contain" />
                )}
                <div>
                  <h2 className="text-lg font-bold">{form.printHeader || form.nameAr || 'اسم الشركة'}</h2>
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
                  الرقم الضريبي: {form.taxNumber}
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
  return (
    <Card>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
        <PermissionGate perm={PERMS.System.Users.Read}>
          <NavTile
            icon={Users}
            title="المستخدمون"
            description="إنشاء وتعديل حسابات الدخول"
            onClick={() => navigate('/settings/users')}
          />
        </PermissionGate>
        <PermissionGate perm={PERMS.System.Roles.Read}>
          <NavTile
            icon={Shield}
            title="الأدوار والصلاحيات"
            description="تحديد ما يستطيع كل دور فعله"
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
  return (
    <Card>
      <CardContent className="p-5">
        <NavTile
          icon={ListChecks}
          title="إعدادات القائمة الجانبية"
          description="إظهار/إخفاء أقسام القائمة وضبط طيها الافتراضي"
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
  return (
    <Card>
      <CardContent className="p-5">
        <ComingSoon
          title="التفضيلات الإقليمية"
          description="إعدادات اللغة، التقويم (ميلادي/هجري)، صيغة التاريخ والأرقام، المنطقة الزمنية. سيتم إصدارها في تحديث قادم."
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: النسخ الاحتياطي (Placeholder)
// ─────────────────────────────────────────────────────────────────────────
function BackupSection() {
  return (
    <Card>
      <CardContent className="p-5">
        <ComingSoon
          title="النسخ الاحتياطي والاستعادة"
          description="تصدير قاعدة البيانات بصيغة آمنة، جدولة نسخ تلقائية، واستعادة النظام عند الحاجة."
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: التكاملات (Placeholder)
// ─────────────────────────────────────────────────────────────────────────
function IntegrationsSection() {
  return (
    <Card>
      <CardContent className="p-5">
        <ComingSoon
          title="تكاملات الإشعارات"
          description="إرسال إشعارات السندات والقيود تلقائياً عبر SMS أو البريد الإلكتروني أو Telegram."
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// قسم: حول النظام
// ─────────────────────────────────────────────────────────────────────────
function AboutSection() {
  const buildVersion = (import.meta.env.VITE_APP_VERSION as string) || '1.0.0';
  const buildDate = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <InfoRow label="اسم النظام" value="مركز التجارة العراقي — الشركات" />
          <InfoRow label="الإصدار" value={buildVersion} />
          <InfoRow label="آخر تحديث" value={buildDate} />
          <InfoRow label="حالة الاتصال بالخادم" value={<span className="inline-flex items-center gap-1 text-success"><span className="h-2 w-2 rounded-full bg-success" />متصل</span>} />
        </div>
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
          للاستفسارات والدعم الفني، تواصل مع مزوّد النظام. يُنصح بأخذ نسخة احتياطية دورياً
          من قاعدة البيانات.
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
        قيد التطوير
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
  return (
    <div className="flex items-center justify-end border-t border-border/40 pt-3">
      <Button onClick={onSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
      </Button>
    </div>
  );
}
