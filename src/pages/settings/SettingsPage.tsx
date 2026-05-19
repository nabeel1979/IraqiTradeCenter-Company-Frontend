import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Upload, Save, X, Image as ImageIcon, Phone, MapPin, Mail, Globe, FileText, ListChecks, ChevronLeft, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { companySettingsApi, type CompanySettingsDto } from '@/lib/api/companySettings';
import { CurrenciesManager } from '@/components/settings/CurrenciesManager';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

function emptySettings(): CompanySettingsDto {
  return {
    id: 1, nameAr: '', nameEn: '', address: '', phone: '', email: '',
    website: '', taxNumber: '', currency: 'IQD', exchangeRatesJson: null, logoBase64: '',
    printHeader: '', printFooter: '',
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
  });

  const [form, setForm] = useState<CompanySettingsDto>(emptySettings);

  useEffect(() => {
    if (data) setForm({ ...emptySettings(), ...data });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: CompanySettingsDto) => companySettingsApi.update({
      nameAr: payload.nameAr,
      nameEn: payload.nameEn || null,
      address: payload.address || null,
      phone: payload.phone || null,
      email: payload.email || null,
      website: payload.website || null,
      taxNumber: payload.taxNumber || null,
      // العملة تُدار من بطاقة "العملات" — نُعيد إرسال القيمة الحالية كما هي
      currency: payload.currency || 'IQD',
      exchangeRatesJson: payload.exchangeRatesJson?.trim() ? payload.exchangeRatesJson.trim() : null,
      logoBase64: payload.logoBase64 || null,
      printHeader: payload.printHeader || null,
      printFooter: payload.printFooter || null,
    }),
    onSuccess: (saved) => {
      toast.success('تم حفظ إعدادات الشركة');
      queryClient.setQueryData(['company-settings'], saved);
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'تعذّر حفظ الإعدادات');
    },
  });

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('الملف يجب أن يكون صورة');
      return;
    }
    if (f.size > MAX_LOGO_BYTES) {
      toast.error('حجم الصورة يتجاوز 2 ميجابايت');
      return;
    }
    const dataUrl = await fileToDataUrl(f);
    setForm(s => ({ ...s, logoBase64: dataUrl }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr.trim()) {
      toast.error('اسم الشركة مطلوب');
      return;
    }
    saveMutation.mutate(form);
  };

  const set = <K extends keyof CompanySettingsDto>(k: K, v: CompanySettingsDto[K]) =>
    setForm(s => ({ ...s, [k]: v }));

  if (isLoading) return <LoadingSpinner text="جاري تحميل الإعدادات..." />;
  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          تعذّر تحميل الإعدادات
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* الهوية */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>هوية الشركة</CardTitle>
          </div>
          <CardDescription>الاسم والشعار الذي يظهر في جميع التقارير المطبوعة</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
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
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {form.logoBase64 ? 'تغيير الشعار' : 'رفع شعار'}
              </Button>
              <p className="text-[10px] text-muted-foreground">PNG / JPG / SVG &mdash; حتى 2 ميجابايت</p>
            </div>
          </div>

          {/* الأسماء + العنوان والهاتف */}
          <div className="space-y-3 md:col-span-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">اسم الشركة (عربي) *</label>
              <Input
                value={form.nameAr}
                onChange={e => set('nameAr', e.target.value.slice(0, 200))}
                placeholder="مثال: مركز التجارة العراقي"
                maxLength={200}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">اسم الشركة (إنجليزي)</label>
              <Input
                value={form.nameEn ?? ''}
                onChange={e => set('nameEn', e.target.value.slice(0, 200))}
                placeholder="Iraqi Trade Center"
                maxLength={200}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> العنوان
              </label>
              <Input
                value={form.address ?? ''}
                onChange={e => set('address', e.target.value.slice(0, 500))}
                placeholder="بغداد - المنصور - شارع 14 رمضان"
                maxLength={500}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" /> رقم الهاتف
                </label>
                <Input
                  value={form.phone ?? ''}
                  onChange={e => set('phone', e.target.value.slice(0, 50))}
                  placeholder="07700000000"
                  maxLength={50}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">الرقم الضريبي</label>
                <Input
                  value={form.taxNumber ?? ''}
                  onChange={e => set('taxNumber', e.target.value.slice(0, 50))}
                  placeholder="رقم الضريبة"
                  maxLength={50}
                />
              </div>
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              لإدارة العملات (تفعيل/تعطيل/اختيار العملة الرئيسية) — استخدم بطاقة <span className="font-bold text-foreground">العملات</span> أدناه.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* إدارة العملات */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle>العملات</CardTitle>
          </div>
          <CardDescription>
            تفعيل العملات المستخدمة في الشركة واختيار العملة الرئيسية. لا يمكن تغيير العملة الرئيسية إذا كانت مستخدمة في قيود محاسبية.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CurrenciesManager />
        </CardContent>
      </Card>

      {/* رابط لإعدادات القائمة الجانبية */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <ListChecks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">القائمة الجانبية</div>
              <div className="text-xs text-muted-foreground">
                إظهار / إخفاء أقسام القائمة وضبط طيها الافتراضي
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/menu')}
            className="gap-1"
          >
            فتح إعدادات المنيو
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      {/* بيانات اتصال إضافية */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات اتصال إضافية</CardTitle>
          <CardDescription>تظهر اختيارياً في رأس التقارير المطبوعة</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" /> البريد الإلكتروني
            </label>
            <Input
              type="email"
              value={form.email ?? ''}
              onChange={e => set('email', e.target.value.slice(0, 150))}
              placeholder="info@example.com"
              maxLength={150}
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" /> الموقع الإلكتروني
            </label>
            <Input
              value={form.website ?? ''}
              onChange={e => set('website', e.target.value.slice(0, 200))}
              placeholder="https://www.example.com"
              maxLength={200}
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      {/* رؤوس وتذييل الطباعة */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>عناوين الطباعة</CardTitle>
          </div>
          <CardDescription>نص اختياري يظهر أعلى/أسفل التقارير المطبوعة (إن لم يُعبَّأ يُستخدم اسم الشركة)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">رأس الطباعة</label>
            <Input
              value={form.printHeader ?? ''}
              onChange={e => set('printHeader', e.target.value.slice(0, 500))}
              placeholder="مثال: تقارير محاسبية - دائرة الإدارة المالية"
              maxLength={500}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">تذييل الطباعة</label>
            <Input
              value={form.printFooter ?? ''}
              onChange={e => set('printFooter', e.target.value.slice(0, 500))}
              placeholder="مثال: جميع الحقوق محفوظة - مركز التجارة العراقي"
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      {/* معاينة */}
      <Card>
        <CardHeader>
          <CardTitle>معاينة رأس الطباعة</CardTitle>
          <CardDescription>هكذا سيظهر الرأس في التقارير</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
        <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </Button>
      </div>
    </form>
  );
}

