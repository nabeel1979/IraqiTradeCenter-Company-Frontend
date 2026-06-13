import { useState, useRef, useEffect, useMemo } from 'react';

import { createPortal } from 'react-dom';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from 'sonner';

import {

  Building2, Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight,

  Globe, Database, Store,

  X, Save, RefreshCw, CheckCircle2, XCircle, Server, HardDrive,

  Link2, Shield, Play, AlertTriangle, MoreVertical, ExternalLink, Settings,

  Download, Clock, CalendarClock, CloudUpload, Phone,

} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

import {

  subscribersApi,

  type Subscriber,

  type SubscriberDto,

  type ProvisioningConfig,
  type DatabaseStatus,
  type PlatformSettings,
  type CompanyBackupFile,
} from '@/lib/api/subscribers';

import {
  buildAutoBackupCron,
  parseAutoBackupCron,
  WEEKDAY_OPTIONS,
  MAX_SCHEDULE_TIMES,
  type BackupScheduleKind,
} from '@/lib/backupSchedule';

import { usePermissions } from '@/lib/auth/usePermissions';

import { PERMS } from '@/lib/auth/permissions';

import { cn, extractApiError } from '@/lib/utils';



const EMPTY_FORM: SubscriberDto = {

  dscrp: '', databaseName: '', authKey: '', startDate: '', endDate: '',

  active: 1, adress: '', activity: 1, email: '', watsup: '', phone2: '', phone3: '',

  commissionRate: 5, apiBaseUrl: '', notes: '', googleMapUrl: '',

  companyCode: '', domain: '', dbDataPath: '', dbLogPath: '',

  feAppPool: '', feSiteName: '', fePath: '', feServer: '',

  beAppPool: '', beSiteName: '', bePath: '', beServer: '',

};



type DialogTab = 'basic' | 'contact' | 'database' | 'apppool' | 'backup' | 'license';



export function SubscribersPage() {

  const qc = useQueryClient();

  const { can } = usePermissions();



  const [search, setSearch] = useState('');

  const [filterActive, setFilterActive] = useState<'' | '1' | '0'>('');



  const [open, setOpen] = useState(false);

  const [dialogTab, setDialogTab] = useState<DialogTab>('basic');

  const [editing, setEditing] = useState<Subscriber | null>(null);

  const [form, setForm] = useState<SubscriberDto>(EMPTY_FORM);

  const [originalForm, setOriginalForm] = useState<SubscriberDto>(EMPTY_FORM);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);



  const { data, isLoading, refetch } = useQuery({

    queryKey: ['subscribers', search, filterActive],

    queryFn: () =>

      subscribersApi

        .list({

          search: search || undefined,

          active: filterActive !== '' ? Number(filterActive) : undefined,

        })

        .then(r => r.data.data),

  });



  const { data: provConfig } = useQuery({

    queryKey: ['subscribers-provisioning-config'],

    queryFn: () => subscribersApi.getProvisioningConfig().then(r => r.data.data),

    enabled: open,

  });



  const { data: dbStatus, refetch: refetchDbStatus } = useQuery({

    queryKey: ['subscriber-db-status', editing?.id],

    queryFn: () => subscribersApi.getDatabaseStatus(editing!.id).then(r => r.data.data),

    enabled: open && !!editing?.id,

  });



  const createMut = useMutation({

    mutationFn: (dto: SubscriberDto) => subscribersApi.create(dto),

    onSuccess: () => { toast.success('تم إضافة الشركة بنجاح'); qc.invalidateQueries({ queryKey: ['subscribers'] }); closeDialog(); },

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'خطأ في الإضافة'),

  });



  const updateMut = useMutation({

    mutationFn: ({ id, dto }: { id: number; dto: SubscriberDto }) => subscribersApi.update(id, dto),

    onSuccess: () => { toast.success('تم التعديل بنجاح'); qc.invalidateQueries({ queryKey: ['subscribers'] }); closeDialog(); },

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'خطأ في التعديل'),

  });



  const toggleMut = useMutation({

    mutationFn: (id: number) => subscribersApi.toggleActive(id),

    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscribers'] }),

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'خطأ'),

  });



  const deleteMut = useMutation({

    mutationFn: (id: number) => subscribersApi.delete(id),

    onSuccess: () => { toast.success('تم الحذف'); qc.invalidateQueries({ queryKey: ['subscribers'] }); setDeleteId(null); },

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'خطأ في الحذف'),

  });



  const generateMut = useMutation({

    mutationFn: () => subscribersApi.generateCode(),

    onSuccess: (res) => {

      const id = res.data.data;

      setForm(f => ({

        ...f,

        companyCode:  id.companyCode,

        databaseName: id.databaseName,

        domain:       id.domain,

        apiBaseUrl:   id.apiBaseUrl,

        dbDataPath:   id.dbDataPath,

        dbLogPath:    id.dbLogPath,

        authKey:      f.authKey || crypto.randomUUID().replace(/-/g, ''),

      }));

      toast.success('تم توليد كود الشركة');

    },

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'تعذّر توليد الكود'),

  });



  const provisionMut = useMutation({

    mutationFn: (id: number) => subscribersApi.provisionDatabase(id),

    onSuccess: (res) => {

      toast.success(res.data.data.message ?? 'تم إنشاء قاعدة البيانات');

      qc.invalidateQueries({ queryKey: ['subscribers'] });

      refetchDbStatus();

    },

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل إنشاء قاعدة البيانات'),

  });



  const linkDbMut = useMutation({

    mutationFn: (id: number) => subscribersApi.linkExistingDatabase(id),

    onSuccess: (res) => {

      toast.success(res.data.data.message ?? 'تم ربط قاعدة البيانات');

      qc.invalidateQueries({ queryKey: ['subscribers'] });

      refetchDbStatus();

    },

    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل ربط قاعدة البيانات'),

  });





  const openCreate = async () => {

    setEditing(null);

    setForm(EMPTY_FORM);

    setOriginalForm(EMPTY_FORM);

    setDialogTab('basic');

    setOpen(true);

    let base: SubscriberDto = { ...EMPTY_FORM };

    try {

      const id = (await subscribersApi.generateCode()).data.data;

      base = {

        ...base,

        companyCode:  id.companyCode,

        databaseName: id.databaseName,

        domain:       id.domain,

        apiBaseUrl:   id.apiBaseUrl,

        dbDataPath:   id.dbDataPath,

        dbLogPath:    id.dbLogPath,

        authKey:      crypto.randomUUID().replace(/-/g, ''),

      };

    } catch { /* يُولَّد عند الحفظ إن فشل */ }

    // تعبئة قيم App Pool الافتراضية للشركة الجديدة من الإعدادات

    try {

      const s = (await subscribersApi.getSettings()).data.data;

      base = {

        ...base,

        feAppPool: base.feAppPool || s.DefaultFeAppPool || '',

        feServer:  base.feServer  || s.DefaultFeServer  || '',

        beAppPool: base.beAppPool || s.DefaultBeAppPool || '',

        beServer:  base.beServer  || s.DefaultBeServer  || '',

      };

    } catch { /* تجاهل */ }

    // اللقطة المرجعية = القيم المولّدة، فلا يُفعَّل الحفظ إلا بعد تغيير المستخدم

    setForm(base);

    setOriginalForm(base);

  };



  const openEdit = (s: Subscriber) => {

    setEditing(s);

    const next: SubscriberDto = {

      dscrp: s.dscrp ?? '', databaseName: s.databaseName ?? '',

      authKey: s.authKey ?? '', startDate: s.startDate ?? '',

      endDate: s.endDate ?? '', active: s.active,

      adress: s.adress ?? '', activity: s.activity,

      email: s.email ?? '', watsup: s.watsup ?? '', phone2: s.phone2 ?? '', phone3: s.phone3 ?? '',

      commissionRate: s.commissionRate, apiBaseUrl: s.apiBaseUrl ?? '',

      notes: s.notes ?? '', googleMapUrl: s.googleMapUrl ?? '',

      companyCode: s.companyCode ?? '', domain: s.domain ?? '',

      dbDataPath: s.dbDataPath ?? '', dbLogPath: s.dbLogPath ?? '',

      feAppPool: s.feAppPool ?? '', feSiteName: s.feSiteName ?? '',

      fePath: s.fePath ?? '', feServer: s.feServer ?? '',

      beAppPool: s.beAppPool ?? '', beSiteName: s.beSiteName ?? '',

      bePath: s.bePath ?? '', beServer: s.beServer ?? '',

    };

    setForm(next);

    setOriginalForm(next);

    setDialogTab('basic');

    setOpen(true);

  };



  const closeDialog = () => { setOpen(false); setEditing(null); setForm(EMPTY_FORM); setOriginalForm(EMPTY_FORM); setDialogTab('basic'); };



  const handleSubmit = () => {

    if (!form.dscrp?.trim()) { toast.error('اسم الشركة مطلوب'); return; }

    if (!form.databaseName?.trim()) { toast.error('اسم قاعدة البيانات مطلوب'); return; }

    if (editing) updateMut.mutate({ id: editing.id, dto: form });

    else createMut.mutate(form);

  };



  const isBusy = createMut.isPending || updateMut.isPending;

  // الحفظ مُعطَّل حتى يُجري المستخدم تغييراً فعلياً على بيانات الشركة

  const isDirty = useMemo(

    () => JSON.stringify(form) !== JSON.stringify(originalForm),

    [form, originalForm],

  );

  const isProvisioned = editing?.dbProvisioned ?? false;



  return (

    <div className="space-y-4">

      {/* Header */}

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h1 className="text-xl font-bold flex items-center gap-2">

            <Building2 className="h-5 w-5 text-primary" />

            إدارة الشركات المشتركة

          </h1>

          <p className="text-sm text-muted-foreground mt-0.5">إدارة بيانات الشركات المسجّلة في المنصة</p>

        </div>

        <div className="flex items-center gap-2">

          <Button variant="outline" size="sm" onClick={() => refetch()}>

            <RefreshCw className="h-4 w-4" />

          </Button>

          {can(PERMS.Parent.Subscribers.Read) && (

            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}

              title="الإعدادات الافتراضية">

              <Settings className="h-4 w-4" />

            </Button>

          )}

          {can(PERMS.Parent.Subscribers.Create) && (

            <Button size="sm" onClick={openCreate}>

              <Plus className="h-4 w-4 me-1" />

              إضافة شركة

            </Button>

          )}

        </div>

      </div>



      {/* Filters */}

      <Card>

        <CardContent className="p-3">

          <div className="flex flex-wrap gap-3 items-center">

            <div className="relative flex-1 min-w-[200px]">

              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

              <Input

                className="ps-8 h-8 text-sm"

                placeholder="بحث باسم الشركة أو قاعدة البيانات أو الكود أو الإيميل..."

                value={search}

                onChange={e => setSearch(e.target.value)}

              />

            </div>

            <div className="flex gap-1">

              {(['', '1', '0'] as const).map(v => (

                <Button key={v} size="sm" variant={filterActive === v ? 'default' : 'outline'}

                  className="h-8 text-xs" onClick={() => setFilterActive(v)}>

                  {v === '' ? 'الكل' : v === '1' ? 'نشط' : 'موقوف'}

                </Button>

              ))}

            </div>

          </div>

        </CardContent>

      </Card>



      {/* Table */}

      <Card>

        <CardHeader className="p-4 pb-2">

          <CardTitle className="text-sm font-medium text-muted-foreground">

            {isLoading ? 'جارٍ التحميل...' : `${data?.length ?? 0} شركة`}

          </CardTitle>

        </CardHeader>

        <CardContent className="p-0">

          {isLoading ? (

            <div className="flex justify-center py-10"><LoadingSpinner /></div>

          ) : !data?.length ? (

            <div className="flex flex-col items-center py-16 text-center text-muted-foreground">

              <Building2 className="h-10 w-10 mb-3 opacity-30" />

              <p className="text-sm">لا توجد شركات{search ? ' تطابق البحث' : ''}</p>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="border-b bg-muted/40">

                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">#</th>

                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الشركة</th>

                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">قاعدة البيانات</th>

                    <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الحالة</th>

                    <th className="px-4 py-2.5 text-end font-medium text-muted-foreground">إجراءات</th>

                  </tr>

                </thead>

                <tbody className="divide-y">

                  {data.map(s => (

                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">

                      <td className="px-4 py-3 text-muted-foreground">{s.id}</td>

                      <td className="px-4 py-3">

                        <div className="flex items-center gap-2.5">

                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">

                            <Building2 className="h-4 w-4" />

                          </span>

                          <div className="min-w-0">

                            <div className="font-semibold text-foreground truncate">{s.dscrp ?? '—'}</div>

                            {s.companyCode && (

                              <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-bold tracking-widest text-primary">

                                {s.companyCode}

                              </span>

                            )}

                          </div>

                        </div>

                      </td>

                      <td className="px-4 py-3">

                        <div className="flex items-center gap-1 font-mono text-xs bg-muted px-2 py-1 rounded w-fit">

                          <Database className="h-3 w-3 text-muted-foreground" />

                          {s.databaseName ?? '—'}

                        </div>

                        {s.dbProvisioned ? (

                          <Badge className="text-[10px] mt-1 bg-green-100 text-green-700 hover:bg-green-100">قاعدة جاهزة</Badge>

                        ) : (

                          <Badge variant="outline" className="text-[10px] mt-1 text-amber-700 border-amber-300">بانتظار الإنشاء</Badge>

                        )}

                      </td>

                      <td className="px-4 py-3">

                        <Badge variant="outline"

                          className={cn('text-xs', s.active === 1 ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100')}>

                          {s.active === 1 ? <><CheckCircle2 className="h-3 w-3 me-1" />نشط</> : <><XCircle className="h-3 w-3 me-1" />موقوف</>}

                        </Badge>

                      </td>

                      <td className="px-4 py-3">

                        <div className="flex items-center justify-end gap-1">

                          {/* رابط الاتصال مضغوط كأيقونة */}

                          {s.domain && (

                            <a href={`https://${s.domain}`} target="_blank" rel="noreferrer"

                              title={s.domain}

                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">

                              <Globe className="h-4 w-4" />

                            </a>

                          )}

                          {s.companyCode && (

                            <a href={`https://iraqi-trade-center.iq/store/${s.companyCode.toUpperCase()}`} target="_blank" rel="noreferrer"

                              title={`متجر ${s.dscrp || s.companyCode}`}

                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-500/10 hover:text-brand-600">

                              <Store className="h-4 w-4" />

                            </a>

                          )}

                          {/* قائمة الإجراءات (ثلاث نقاط) */}

                          <RowActionsMenu

                            subscriber={s}

                            canUpdate={can(PERMS.Parent.Subscribers.Update)}

                            canDelete={can(PERMS.Parent.Subscribers.Delete)}

                            onToggle={() => toggleMut.mutate(s.id)}

                            onEdit={() => openEdit(s)}

                            onDelete={() => setDeleteId(s.id)}

                          />

                        </div>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </CardContent>

      </Card>



      {/* Add/Edit Dialog */}

      {open && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"

          onClick={e => { if (e.target === e.currentTarget) closeDialog(); }}>

          <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            <div className="flex items-center justify-between p-4 border-b">

              <h2 className="font-semibold flex items-center gap-2">

                <Building2 className="h-4 w-4 text-primary" />

                {editing ? 'تعديل الشركة' : 'إضافة شركة جديدة'}

              </h2>

              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeDialog}><X className="h-4 w-4" /></Button>

            </div>



            {/* Tabs */}

            <div className="flex border-b px-4 gap-1">

              {([

                { id: 'basic' as const, label: 'البيانات الأساسية', icon: Building2 },

                { id: 'contact' as const, label: 'معلومات الاتصال', icon: Phone },

                { id: 'database' as const, label: 'قاعدة البيانات', icon: Database },

                { id: 'apppool' as const, label: 'App Pool والنشر', icon: Server },

                { id: 'backup' as const, label: 'النسخ والأرشيف', icon: HardDrive },

                { id: 'license' as const, label: 'التفعيل', icon: Shield },

              ]).map(t => (

                <button key={t.id} type="button" onClick={() => setDialogTab(t.id)}

                  className={cn(

                    'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',

                    dialogTab === t.id

                      ? 'border-primary text-primary'

                      : 'border-transparent text-muted-foreground hover:text-foreground',

                  )}>

                  <t.icon className="h-3.5 w-3.5" />{t.label}

                </button>

              ))}

            </div>



            <div className="overflow-y-auto p-4 space-y-4 flex-1">

              {dialogTab === 'basic' && (

                <>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div className="space-y-1">

                      <Label>اسم الشركة <span className="text-destructive">*</span></Label>

                      <Input placeholder="مثال: شركة المثال للتجارة" value={form.dscrp ?? ''}

                        onChange={e => setForm(f => ({ ...f, dscrp: e.target.value }))} />

                    </div>

                    <div className="space-y-1">

                      <Label>كود الشركة (8 أحرف)</Label>

                      <div className="flex gap-1">

                        <Input dir="ltr" className="font-mono uppercase" readOnly

                          value={form.companyCode ?? ''} placeholder="XXXXXXXX" />

                        {!isProvisioned && can(PERMS.Parent.Subscribers.Create) && (

                          <Button type="button" variant="outline" size="icon" className="shrink-0"

                            disabled={generateMut.isPending} onClick={() => generateMut.mutate()}

                            title="توليد كود جديد">

                            <RefreshCw className={cn('h-4 w-4', generateMut.isPending && 'animate-spin')} />

                          </Button>

                        )}

                      </div>

                    </div>

                  </div>



                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div className="space-y-1">

                      <Label>مفتاح التكامل (Auth Key)</Label>

                      <Input dir="ltr" placeholder="يُولَّد تلقائياً" value={form.authKey ?? ''}

                        onChange={e => setForm(f => ({ ...f, authKey: e.target.value }))} />

                    </div>

                    <div className="space-y-1">

                      <Label>نسبة العمولة %</Label>

                      <Input type="number" min={0} max={100} value={form.commissionRate ?? 5}

                        onChange={e => setForm(f => ({ ...f, commissionRate: Number(e.target.value) }))} />

                    </div>

                  </div>



                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div className="space-y-1">

                      <Label>تاريخ البداية</Label>

                      <Input type="date" value={form.startDate ?? ''}

                        onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />

                    </div>

                    <div className="space-y-1">

                      <Label>تاريخ الانتهاء</Label>

                      <Input type="date" value={form.endDate ?? ''}

                        onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />

                    </div>

                  </div>



                  <div className="flex items-center gap-3 pt-1">

                    <Label>الحالة</Label>

                    <button type="button"

                      onClick={() => setForm(f => ({ ...f, active: f.active === 1 ? 0 : 1 }))}

                      className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors border',

                        form.active === 1 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200')}>

                      {form.active === 1 ? <><CheckCircle2 className="h-3.5 w-3.5" />نشط</> : <><XCircle className="h-3.5 w-3.5" />موقوف</>}

                    </button>

                  </div>

                </>

              )}



              {dialogTab === 'contact' && (

                <>

                  <p className="text-sm text-muted-foreground">

                    تُعرض هذه البيانات في متجر المنصة عند ضغط زر «معلومات التواصل» في صفحة الشركات.

                  </p>



                  <div className="space-y-1">

                    <Label>الإيميل</Label>

                    <Input type="email" dir="ltr" placeholder="info@company.iq" value={form.email ?? ''}

                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />

                  </div>



                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                    <div className="space-y-1">

                      <Label>هاتف 1 / واتساب</Label>

                      <Input dir="ltr" placeholder="+9647XXXXXXXXX" value={form.watsup ?? ''}

                        onChange={e => setForm(f => ({ ...f, watsup: e.target.value }))} />

                    </div>

                    <div className="space-y-1">

                      <Label>هاتف 2</Label>

                      <Input dir="ltr" placeholder="+9647XXXXXXXXX" value={form.phone2 ?? ''}

                        onChange={e => setForm(f => ({ ...f, phone2: e.target.value }))} />

                    </div>

                    <div className="space-y-1">

                      <Label>هاتف 3</Label>

                      <Input dir="ltr" placeholder="+9647XXXXXXXXX" value={form.phone3 ?? ''}

                        onChange={e => setForm(f => ({ ...f, phone3: e.target.value }))} />

                    </div>

                  </div>



                  <div className="space-y-1">

                    <Label>العنوان</Label>

                    <Input placeholder="بغداد، شارع فلان..." value={form.adress ?? ''}

                      onChange={e => setForm(f => ({ ...f, adress: e.target.value }))} />

                  </div>



                  <div className="space-y-1">

                    <Label>نبذة عن الشركة</Label>

                    <textarea

                      className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"

                      rows={4} placeholder="نبذة مختصرة تظهر في متجر المنصة..."

                      value={form.notes ?? ''}

                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}

                    />

                  </div>



                  <div className="space-y-1">

                    <Label>رابط خريطة Google</Label>

                    <Input dir="ltr" placeholder="https://maps.google.com/... أو رابط embed"

                      value={form.googleMapUrl ?? ''}

                      onChange={e => setForm(f => ({ ...f, googleMapUrl: e.target.value }))} />

                    <p className="text-xs text-muted-foreground">

                      يمكن لصق رابط مشاركة Google Maps أو رابط embed. إن تُرك فارغاً يُستخدم العنوان لعرض الخريطة.

                    </p>

                  </div>

                </>

              )}



              {dialogTab === 'database' && (

                <DatabaseTab

                  form={form}

                  setForm={setForm}

                  provConfig={provConfig}

                  dbStatus={dbStatus}

                  isProvisioned={isProvisioned}

                  editing={editing}

                  canProvision={can(PERMS.Parent.Subscribers.Create)}

                  onGenerate={() => generateMut.mutate()}

                  onProvision={() => editing && provisionMut.mutate(editing.id)}

                  onLinkExisting={() => editing && linkDbMut.mutate(editing.id)}

                  isGenerating={generateMut.isPending}

                  isProvisioning={provisionMut.isPending}

                  isLinking={linkDbMut.isPending}

                />

              )}



              {dialogTab === 'apppool' && (

                <AppPoolTab form={form} setForm={setForm} />

              )}



              {dialogTab === 'backup' && (

                <BackupArchiveTab subscriberId={editing?.id ?? null} canEdit={!!editing} />

              )}

              {dialogTab === 'license' && (

                <LicenseTab subscriberId={editing?.id ?? null} />

              )}

            </div>



            <div className="flex justify-end gap-2 p-4 border-t">

              <Button variant="outline" onClick={closeDialog} disabled={isBusy}>إلغاء</Button>

              <Button onClick={handleSubmit} disabled={isBusy || !isDirty}
                title={!isDirty ? 'لا توجد تغييرات للحفظ' : undefined}>

                {isBusy ? <><RefreshCw className="h-4 w-4 me-1 animate-spin" />جارٍ الحفظ...</> : <><Save className="h-4 w-4 me-1" />حفظ</>}

              </Button>

            </div>

          </div>

        </div>

      )}



      {deleteId !== null && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">

            <div className="flex items-center gap-3 text-destructive">

              <Trash2 className="h-5 w-5" />

              <h3 className="font-semibold">تأكيد الحذف</h3>

            </div>

            <p className="text-sm text-muted-foreground">هل تريد حذف هذه الشركة نهائياً؟ لا يمكن التراجع.</p>

            <div className="flex justify-end gap-2">

              <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>

              <Button variant="destructive" onClick={() => deleteMut.mutate(deleteId!)} disabled={deleteMut.isPending}>

                {deleteMut.isPending ? 'جارٍ الحذف...' : 'حذف'}

              </Button>

            </div>

          </div>

        </div>

      )}

      {settingsOpen && (

        <SettingsDialog

          canEdit={can(PERMS.Parent.Subscribers.Update)}

          onClose={() => setSettingsOpen(false)}

        />

      )}

    </div>

  );

}



// ─── Row Actions Menu (ثلاث نقاط) ─────────────────────────────────────────────

interface RowActionsMenuProps {
  subscriber: Subscriber;
  canUpdate: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function RowActionsMenu({ subscriber: s, canUpdate, canDelete, onToggle, onEdit, onDelete }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        const menuW = 176;
        setPos({ top: r.bottom + 4, left: Math.max(8, r.right - menuW) });
      }
    };
    update();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && btnRef.current && !btnRef.current.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener('scroll', () => setOpen(false), true);
    window.addEventListener('resize', update);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title="إجراءات"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 176, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl py-1 animate-slide-up"
        >
          {canUpdate && (
            <button
              type="button"
              onClick={() => { onToggle(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              {s.active === 1
                ? <><ToggleRight className="h-4 w-4 text-green-600" />إيقاف الشركة</>
                : <><ToggleLeft className="h-4 w-4 text-muted-foreground" />تفعيل الشركة</>}
            </button>
          )}
          {canUpdate && (
            <button
              type="button"
              onClick={() => { onEdit(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />فتح النافذة
            </button>
          )}
          {s.domain && (
            <a
              href={`https://${s.domain}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />فتح الرابط
            </a>
          )}
          {canDelete && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={() => { onDelete(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />حذف نهائي
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Default Settings Dialog ──────────────────────────────────────────────────

function SettingsDialog({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PlatformSettings>({});

  const { data, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => subscribersApi.getSettings().then(r => r.data.data),
  });

  // عند وصول البيانات، عبّئ النموذج
  useEffect(() => { if (data) setForm(data); }, [data]);

  const saveMut = useMutation({
    mutationFn: (s: PlatformSettings) => subscribersApi.updateSettings(s),
    onSuccess: () => {
      toast.success('تم حفظ الإعدادات الافتراضية');
      qc.invalidateQueries({ queryKey: ['platform-settings'] });
      qc.invalidateQueries({ queryKey: ['subscribers-provisioning-config'] });
      onClose();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'تعذّر حفظ الإعدادات'),
  });

  const set = (k: keyof PlatformSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            الإعدادات الافتراضية
          </h2>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {isLoading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                هذه القيم تُستخدم افتراضياً عند إنشاء شركة جديدة (المسارات، اللاحقة، رابط API، الـ App Pool الافتراضي).
                تُحفظ في قاعدة البيانات وتتجاوز إعدادات الخادم.
              </div>

              {/* التزويد */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Database className="h-4 w-4 text-primary" />قاعدة البيانات والتزويد
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="بادئة اسم القاعدة" value={form.DatabaseNamePrefix} onChange={set('DatabaseNamePrefix')} disabled={!canEdit} mono />
                  <Field label="قاعدة المصدر (Template)" value={form.TemplateSourceDatabase} onChange={set('TemplateSourceDatabase')} disabled={!canEdit} mono />
                  <Field label="مسار النسخة الاحتياطية" value={form.TemplateBackupPath} onChange={set('TemplateBackupPath')} disabled={!canEdit} mono />
                  <Field label="القاعدة الرئيسية (الأم)" value={form.ParentDatabaseName} onChange={set('ParentDatabaseName')} disabled={!canEdit} mono />
                  <Field label="مجلد البيانات (.mdf)" value={form.DbDataPath} onChange={set('DbDataPath')} disabled={!canEdit} mono />
                  <Field label="مجلد السجل (.ldf)" value={form.DbLogPath} onChange={set('DbLogPath')} disabled={!canEdit} mono />
                </div>
              </div>

              {/* النطاق والـ API */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Globe className="h-4 w-4 text-primary" />النطاق والـ API
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="لاحقة نطاق الشركات" value={form.DomainSuffix} onChange={set('DomainSuffix')} disabled={!canEdit} mono placeholder=".iraqi-trade-center.iq" />
                  <Field label="رابط API المشترك" value={form.CompanyApiBaseUrl} onChange={set('CompanyApiBaseUrl')} disabled={!canEdit} mono placeholder="https://api_iraqitradecenter_company.gcc.iq" />
                </div>
              </div>

              {/* App Pool الافتراضي */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Server className="h-4 w-4 text-primary" />App Pool الافتراضي (للشركات الجديدة)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="App Pool الواجهة" value={form.DefaultFeAppPool} onChange={set('DefaultFeAppPool')} disabled={!canEdit} mono />
                  <Field label="خادم الواجهة" value={form.DefaultFeServer} onChange={set('DefaultFeServer')} disabled={!canEdit} mono />
                  <Field label="App Pool الـ API" value={form.DefaultBeAppPool} onChange={set('DefaultBeAppPool')} disabled={!canEdit} mono />
                  <Field label="خادم الـ API" value={form.DefaultBeServer} onChange={set('DefaultBeServer')} disabled={!canEdit} mono />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>إغلاق</Button>
          {canEdit && (
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending || isLoading}>
              {saveMut.isPending ? <><RefreshCw className="h-4 w-4 me-1 animate-spin" />جارٍ الحفظ...</> : <><Save className="h-4 w-4 me-1" />حفظ</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, mono, placeholder }: {
  label: string;
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input dir="ltr" className={cn(mono && 'font-mono', disabled && 'bg-muted/40')}
        value={value ?? ''} placeholder={placeholder} readOnly={disabled} onChange={onChange} />
    </div>
  );
}

// ─── App Pool / Deployment Tab ────────────────────────────────────────────────

interface AppPoolTabProps {
  form: SubscriberDto;
  setForm: React.Dispatch<React.SetStateAction<SubscriberDto>>;
}

function AppPoolTab({ form, setForm }: AppPoolTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Server className="h-3.5 w-3.5 text-primary" />
          إعدادات النشر لكل شركة (ديناميكي)
        </div>
        <p>
          حدّد App Pool ومعلومات الخادم لكل من الواجهة والـ API. يدعم النظام أكثر من App Pool —
          فيمكن لكل شركة أن تُنشر على Pool/خادم مستقل عند الحاجة.
        </p>
      </div>

      {/* الواجهة (Frontend) */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Globe className="h-4 w-4 text-primary" />الواجهة (Frontend)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>اسم App Pool</Label>
            <Input dir="ltr" className="font-mono" value={form.feAppPool ?? ''}
              placeholder="iraqitradecenter_company"
              onChange={e => setForm(f => ({ ...f, feAppPool: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>اسم الموقع (IIS Site)</Label>
            <Input dir="ltr" className="font-mono" value={form.feSiteName ?? ''}
              placeholder="IraqiTradeCenter_Company"
              onChange={e => setForm(f => ({ ...f, feSiteName: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><HardDrive className="h-3 w-3" />المسار الفيزيائي</Label>
            <Input dir="ltr" className="font-mono" value={form.fePath ?? ''}
              placeholder="D:/iraqitradecenter/IraqiTradeCenter_Company"
              onChange={e => setForm(f => ({ ...f, fePath: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Server className="h-3 w-3" />الخادم (معلومات الاتصال)</Label>
            <Input dir="ltr" className="font-mono" value={form.feServer ?? ''}
              placeholder="65.20.159.30"
              onChange={e => setForm(f => ({ ...f, feServer: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* الـ API (Backend) */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="h-4 w-4 text-primary" />الـ API (Backend)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>اسم App Pool</Label>
            <Input dir="ltr" className="font-mono" value={form.beAppPool ?? ''}
              placeholder="api_IraqiTradeCenter_Company"
              onChange={e => setForm(f => ({ ...f, beAppPool: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>اسم الموقع (IIS Site)</Label>
            <Input dir="ltr" className="font-mono" value={form.beSiteName ?? ''}
              placeholder="api_IraqiTradeCenter_Company"
              onChange={e => setForm(f => ({ ...f, beSiteName: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><HardDrive className="h-3 w-3" />المسار الفيزيائي</Label>
            <Input dir="ltr" className="font-mono" value={form.bePath ?? ''}
              placeholder="D:/iraqitradecenter/api_IraqiTradeCenter_Company"
              onChange={e => setForm(f => ({ ...f, bePath: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Server className="h-3 w-3" />الخادم (معلومات الاتصال)</Label>
            <Input dir="ltr" className="font-mono" value={form.beServer ?? ''}
              placeholder="65.20.159.30"
              onChange={e => setForm(f => ({ ...f, beServer: e.target.value }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Backup & Attachments Archive Tab ─────────────────────────────────────────

interface BackupArchiveTabProps {
  subscriberId: number | null;
  canEdit: boolean;
}

type MediaDraft = {
  backupEnabled: boolean;
  includeDatabaseBackup: boolean;
  includeVoucherData: boolean;
  includeAttachments: boolean;
  syncDatabaseBackupToR2: boolean;
  serverDatabaseBackupKeepCount: number;
  r2DatabaseBackupKeepCount: number;
  backupPath: string;
  retentionYears: number;
  scheduleKind: BackupScheduleKind;
  scheduleDay: number;
  scheduleTimes: string[];
  attachProvider: string; // 'Local' | 'R2'
  attachLocalPath: string;
  r2AccountId: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
};

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', numberingSystem: 'latn' });
}

// ─── تبويب التفعيل: سجل تفعيلات الشركة + وقت الانتهاء (قراءة فقط) ──────────────
function LicenseTab({ subscriberId }: { subscriberId: number | null }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subscriber-license', subscriberId],
    queryFn: () => subscribersApi.getLicense(subscriberId!).then(r => r.data.data),
    enabled: !!subscriberId,
    staleTime: 0,
  });

  if (!subscriberId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        احفظ الشركة أولاً، ثم افتح نافذتها لعرض سجل التفعيلات.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />جارٍ تحميل سجل التفعيلات…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {extractApiError(error) ?? 'تعذّر قراءة سجل التفعيلات'}
      </div>
    );
  }
  if (!data) return null;
  if (!data.provisioned) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-center text-sm text-amber-800 flex flex-col items-center gap-2">
        <AlertTriangle className="h-5 w-5" />
        قاعدة بيانات هذه الشركة غير مُجهَّزة بعد — لا يوجد سجل تفعيلات.
      </div>
    );
  }

  const tone = data.isExpired ? 'expired' : data.daysRemaining <= 7 ? 'warning' : 'active';
  const toneCard: Record<string, string> = {
    active:  'border-emerald-300 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-300 bg-amber-50 text-amber-800',
    expired: 'border-rose-300 bg-rose-50 text-rose-800',
  };

  return (
    <div className="space-y-4">
      {/* بطاقة الحالة + وقت الانتهاء */}
      <div className={cn('rounded-lg border p-4 flex items-center justify-between gap-3', toneCard[tone])}>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 shrink-0" />
          <div>
            <div className="text-sm font-semibold">
              {data.isExpired ? 'الترخيص منتهٍ' : `متبقٍ ${data.daysRemaining} يوم`}
            </div>
            <div className="text-xs opacity-80">ينتهي بتاريخ: {fmtDate(data.endDateUtc)}</div>
          </div>
        </div>
        {data.lastCode && (
          <div className="text-left text-xs opacity-70">
            <div className="font-medium">آخر شفرة</div>
            <div className="font-mono">{data.lastCode}</div>
          </div>
        )}
      </div>

      {/* سجل التفعيلات */}
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          سجل التفعيلات ({data.activations.length})
        </div>
        {data.activations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد تفعيلات لهذه الشركة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">الشفرة</th>
                  <th className="px-3 py-2 text-center font-medium">الأيام</th>
                  <th className="px-3 py-2 text-center font-medium">البداية</th>
                  <th className="px-3 py-2 text-center font-medium">الانتهاء</th>
                  <th className="px-3 py-2 text-center font-medium">تاريخ التطبيق</th>
                  <th className="px-3 py-2 text-center font-medium">المصدر</th>
                </tr>
              </thead>
              <tbody>
                {data.activations.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2 text-center">{a.days}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">{fmtDate(a.startDateUtc)}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">{fmtDate(a.endDateUtc)}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">{fmtDate(a.appliedAtUtc)}</td>
                    <td className="px-3 py-2 text-center">{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BackupArchiveTab({ subscriberId, canEdit }: BackupArchiveTabProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  const [hasSecret, setHasSecret] = useState(false);
  const [hasAccessKey, setHasAccessKey] = useState(false);
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subscriber-media-settings', subscriberId],
    queryFn: () => subscribersApi.getMediaSettings(subscriberId!).then(r => r.data.data),
    enabled: !!subscriberId,
    staleTime: 0,
  });

  const backupsQuery = useQuery({
    queryKey: ['subscriber-backups', subscriberId],
    queryFn: () => subscribersApi.listBackupFiles(subscriberId!).then(r => r.data.data),
    enabled: !!subscriberId && !!data?.provisioned,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    setHasSecret(data.r2HasSecret);
    setHasAccessKey(data.r2HasAccessKey);
    const sched = parseAutoBackupCron(data.backupCron);
    setDraft({
      backupEnabled: data.backupEnabled,
      includeDatabaseBackup: data.includeDatabaseBackup,
      includeVoucherData: data.includeVoucherData,
      includeAttachments: data.includeAttachments,
      syncDatabaseBackupToR2: data.syncDatabaseBackupToR2,
      serverDatabaseBackupKeepCount: data.serverDatabaseBackupKeepCount,
      r2DatabaseBackupKeepCount: data.r2DatabaseBackupKeepCount,
      backupPath: data.backupPath ?? '',
      retentionYears: data.retentionYears,
      scheduleKind: sched.kind,
      scheduleDay: sched.day,
      scheduleTimes: sched.times.length ? sched.times : ['02:00'],
      attachProvider: data.attachProvider || 'Local',
      attachLocalPath: data.attachLocalPath ?? '',
      r2AccountId: data.r2AccountId ?? '',
      r2Bucket: data.r2Bucket ?? '',
      r2AccessKeyId: '',
      r2SecretAccessKey: '',
    });
    setFiscalYearId(prev => prev ?? (data.fiscalYears[0]?.id ?? null));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (d: MediaDraft) => subscribersApi.updateMediaSettings(subscriberId!, {
      backupEnabled: d.backupEnabled,
      includeDatabaseBackup: d.includeDatabaseBackup,
      includeVoucherData: d.includeVoucherData,
      includeAttachments: d.includeAttachments,
      syncDatabaseBackupToR2: d.syncDatabaseBackupToR2,
      serverDatabaseBackupKeepCount: d.serverDatabaseBackupKeepCount,
      r2DatabaseBackupKeepCount: d.r2DatabaseBackupKeepCount,
      backupPath: d.backupPath,
      backupCron: buildAutoBackupCron(d.scheduleKind, d.scheduleTimes, d.scheduleDay),
      retentionYears: d.retentionYears,
      attachProvider: d.attachProvider,
      attachLocalPath: d.attachLocalPath,
      r2AccountId: d.r2AccountId,
      r2Bucket: d.r2Bucket,
      ...(d.r2AccessKeyId ? { r2AccessKeyId: d.r2AccessKeyId } : {}),
      ...(d.r2SecretAccessKey ? { r2SecretAccessKey: d.r2SecretAccessKey } : {}),
    }),
    onSuccess: () => {
      toast.success('تم حفظ إعدادات الشركة');
      qc.invalidateQueries({ queryKey: ['subscriber-media-settings', subscriberId] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'تعذّر الحفظ'),
  });

  const runMut = useMutation({
    mutationFn: (fyId: number) => subscribersApi.runDatabaseBackup(subscriberId!, fyId).then(r => r.data.data),
    onSuccess: (res) => {
      toast.success(res.message ?? `تم إنشاء النسخة (${res.fileName})`);
      qc.invalidateQueries({ queryKey: ['subscriber-backups', subscriberId] });
      qc.invalidateQueries({ queryKey: ['subscriber-media-settings', subscriberId] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل إنشاء النسخة'),
  });

  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const downloadMut = useMutation({
    mutationFn: async (file: CompanyBackupFile) => {
      const key = `${file.yearFolder}/${file.fileName}`;
      setDownloadingKey(key);
      await subscribersApi.downloadBackupFile(subscriberId!, file);
    },
    onSuccess: () => toast.success('بدأ تنزيل النسخة الاحتياطية'),
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'تعذّر التنزيل'),
    onSettled: () => setDownloadingKey(null),
  });

  const runFullMut = useMutation({
    mutationFn: (fyId: number) => subscribersApi.runFullBackup(subscriberId!, fyId).then(r => r.data.data),
    onSuccess: (res) => {
      toast.success(res.message ?? 'تمت الأرشفة الكاملة بنجاح');
      qc.invalidateQueries({ queryKey: ['subscriber-backups', subscriberId] });
      qc.invalidateQueries({ queryKey: ['subscriber-media-settings', subscriberId] });
      qc.invalidateQueries({ queryKey: ['subscriber-r2-files', subscriberId] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل تشغيل الأرشفة الكاملة'),
  });

  const r2Query = useQuery({
    queryKey: ['subscriber-r2-files', subscriberId],
    queryFn: () => subscribersApi.listR2Files(subscriberId!).then(r => r.data.data),
    enabled: !!subscriberId && !!data?.provisioned && !!data?.syncDatabaseBackupToR2,
    staleTime: 0,
    retry: false,
  });

  const r2RetentionMut = useMutation({
    mutationFn: () => subscribersApi.applyR2Retention(subscriberId!).then(r => r.data),
    onSuccess: (res) => {
      toast.success(`تم تطبيق سياسة الاحتفاظ — حُذفت ${res.purgedCount} نسخة`);
      qc.invalidateQueries({ queryKey: ['subscriber-r2-files', subscriberId] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'تعذّر تطبيق سياسة الاحتفاظ'),
  });

  if (!subscriberId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        احفظ الشركة أولاً، ثم افتح تعديلها لضبط النسخ الاحتياطي وأرشيف المرفقات داخل قاعدتها.
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" />جارٍ تحميل إعدادات الشركة…
    </div>;
  }

  if (isError) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {extractApiError(error) ?? 'تعذّر قراءة إعدادات الشركة'}
    </div>;
  }

  if (data && !data.provisioned) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-center text-sm text-amber-800 flex flex-col items-center gap-2">
        <AlertTriangle className="h-5 w-5" />
        قاعدة بيانات هذه الشركة غير مُجهَّزة بعد. جهّز قاعدة البيانات من تبويب «قاعدة البيانات» ثم عُد لضبط هذه الإعدادات.
      </div>
    );
  }

  if (!draft) return null;
  const isR2 = (draft.attachProvider || 'Local').toUpperCase() === 'R2';
  const disabled = !canEdit;
  const statusColor = data?.lastRunStatus === 'Success' ? 'text-green-600'
    : data?.lastRunStatus === 'Failed' ? 'text-destructive'
    : data?.lastRunStatus === 'Running' ? 'text-amber-600' : 'text-muted-foreground';

  const setTime = (i: number, v: string) => setDraft(d => {
    if (!d) return d;
    const times = [...d.scheduleTimes]; times[i] = v; return { ...d, scheduleTimes: times };
  });
  const addTime = () => setDraft(d => d && d.scheduleTimes.length < MAX_SCHEDULE_TIMES
    ? ({ ...d, scheduleTimes: [...d.scheduleTimes, '02:00'] }) : d);
  const removeTime = (i: number) => setDraft(d => d && d.scheduleTimes.length > 1
    ? ({ ...d, scheduleTimes: d.scheduleTimes.filter((_, idx) => idx !== i) }) : d);

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5" />
        هذه الإعدادات تُحفَظ داخل قاعدة الشركة <span className="font-mono">{data?.databaseName}</span> وتُدار من هنا.
      </p>

      {/* النسخ الاحتياطية والاستعادة */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Database className="h-4 w-4 text-primary" />النسخ الاحتياطية والاستعادة
          </div>
          <EnableToggle on={draft.backupEnabled}
            onToggle={() => !disabled && setDraft(d => d && ({ ...d, backupEnabled: !d.backupEnabled }))} />
        </div>

        <div className="space-y-1">
          <Label className="flex items-center gap-1"><HardDrive className="h-3 w-3" />مسار أرشيف النسخ الاحتياطية</Label>
          <Input dir="ltr" className="font-mono" disabled={disabled} value={draft.backupPath}
            placeholder="D:/iraqitradecenter/api_IraqiTradeCenter_Company/backup"
            onChange={e => setDraft(d => d && ({ ...d, backupPath: e.target.value }))} />
          <p className="text-[11px] text-muted-foreground">
            مجلد لكل سنة، وملف/مجلد لكل نافذة (RV, PV, JV, JE) + قاعدة البيانات.
          </p>
        </div>

        {/* خيارات النسخ وقاعدة البيانات */}
        <div className="rounded-md bg-muted/40 p-2.5 space-y-2.5">
          <div className="text-xs font-medium text-muted-foreground">خيارات النسخ وقاعدة البيانات</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" disabled={disabled} checked={draft.includeDatabaseBackup}
                onChange={e => setDraft(d => d && ({ ...d, includeDatabaseBackup: e.target.checked }))} />
              نسخة قاعدة البيانات (.bak)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" disabled={disabled} checked={draft.includeVoucherData}
                onChange={e => setDraft(d => d && ({ ...d, includeVoucherData: e.target.checked }))} />
              بيانات السندات (JSON)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" disabled={disabled} checked={draft.includeAttachments}
                onChange={e => setDraft(d => d && ({ ...d, includeAttachments: e.target.checked }))} />
              مرفقات الملفات
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" disabled={disabled} checked={draft.syncDatabaseBackupToR2}
                onChange={e => setDraft(d => d && ({ ...d, syncDatabaseBackupToR2: e.target.checked }))} />
              <CloudUpload className="h-3 w-3" />مزامنة نسخة قاعدة البيانات مع R2
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">الاحتفاظ (سنوات)</Label>
              <Input type="number" min={1} max={50} disabled={disabled} value={draft.retentionYears}
                onChange={e => setDraft(d => d && ({ ...d, retentionYears: Number(e.target.value) || 1 }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نسخ .bak على السيرفر</Label>
              <Input type="number" min={0} max={100} disabled={disabled} value={draft.serverDatabaseBackupKeepCount}
                onChange={e => setDraft(d => d && ({ ...d, serverDatabaseBackupKeepCount: Math.max(0, Number(e.target.value) || 0) }))} />
              <p className="text-[10px] text-muted-foreground">عدد أحدث نسخ .bak المحفوظة محلياً (0 = بدون حد).</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نسخ R2</Label>
              <Input type="number" min={0} max={100} disabled={disabled} value={draft.r2DatabaseBackupKeepCount}
                onChange={e => setDraft(d => d && ({ ...d, r2DatabaseBackupKeepCount: Math.max(0, Number(e.target.value) || 0) }))} />
            </div>
          </div>
        </div>

        {/* جدولة النسخ الاحتياطي */}
        <div className={cn('rounded-md bg-muted/40 p-2.5 space-y-2.5', !draft.backupEnabled && 'opacity-60')}>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />جدولة النسخ الاحتياطي
            {!draft.backupEnabled && <span className="text-[10px]">(فعّل التبويب لتشغيلها)</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">التكرار</Label>
              <select disabled={disabled} value={draft.scheduleKind}
                onChange={e => setDraft(d => d && ({ ...d, scheduleKind: e.target.value as BackupScheduleKind }))}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                <option value="daily">يومياً</option>
                <option value="weekly">أسبوعياً</option>
                <option value="monthly">شهرياً</option>
              </select>
            </div>
            {draft.scheduleKind === 'weekly' && (
              <div className="space-y-1">
                <Label className="text-xs">يوم الأسبوع</Label>
                <select disabled={disabled} value={draft.scheduleDay}
                  onChange={e => setDraft(d => d && ({ ...d, scheduleDay: Number(e.target.value) }))}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                  {WEEKDAY_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
            )}
            {draft.scheduleKind === 'monthly' && (
              <div className="space-y-1">
                <Label className="text-xs">يوم الشهر (1–28)</Label>
                <Input type="number" min={1} max={28} disabled={disabled} value={draft.scheduleDay || 1}
                  onChange={e => setDraft(d => d && ({ ...d, scheduleDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) }))} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" />المواعيد (توقيت بغداد)</Label>
            <div className="flex flex-wrap gap-2">
              {draft.scheduleTimes.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input type="time" disabled={disabled} value={t} className="w-28"
                    onChange={e => setTime(i, e.target.value)} />
                  {!disabled && draft.scheduleTimes.length > 1 && (
                    <button type="button" onClick={() => removeTime(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {!disabled && draft.scheduleTimes.length < MAX_SCHEDULE_TIMES && (
                <button type="button" onClick={addTime}
                  className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  <Plus className="h-3 w-3" />موعد
                </button>
              )}
            </div>
          </div>
          {data?.scheduleDescription && (
            <p className="text-[11px] text-muted-foreground">
              {data.scheduleDescription}
              {data.nextRunAtUtc && draft.backupEnabled && <> — التشغيل القادم: <span className="font-medium">{fmtDate(data.nextRunAtUtc)}</span></>}
            </p>
          )}
        </div>

        {/* آخر تشغيل + إنشاء أرشيف الآن */}
        <div className="rounded-md border p-2.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">آخر تشغيل:</span>
            <span className={cn('font-medium', statusColor)}>
              {data?.lastRunStatus ?? 'Idle'}{data?.lastRunYearFolder ? ` — ${data.lastRunYearFolder}` : ''}
              {data?.lastRunAtUtc ? ` (${fmtDate(data.lastRunAtUtc)})` : ''}
            </span>
          </div>
          {data?.lastRunError && <p className="text-[11px] text-destructive">{data.lastRunError}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">السنة المالية</Label>
              <select disabled={disabled || !data?.fiscalYears.length} value={fiscalYearId ?? ''}
                onChange={e => setFiscalYearId(Number(e.target.value))}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                {data?.fiscalYears.length
                  ? data.fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)
                  : <option value="">لا توجد سنوات مالية</option>}
              </select>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button type="button"
                  disabled={runFullMut.isPending || runMut.isPending || !fiscalYearId || !data?.fiscalYears.length}
                  onClick={() => fiscalYearId && runFullMut.mutate(fiscalYearId)}>
                  {runFullMut.isPending ? <RefreshCw className="h-4 w-4 ml-1 animate-spin" /> : <Play className="h-4 w-4 ml-1" />}
                  أرشفة كاملة (سندات + مرفقات)
                </Button>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            «أرشفة كاملة» تُشغّل أرشفة الشركة الفعلية (قاعدة + سندات JSON + مرفقات + مزامنة R2) وفق خيارات النسخ المحددة أعلاه عبر منطق نظامها.
          </p>
        </div>

        {/* نسخ R2 */}
        {data?.syncDatabaseBackupToR2 && (
          <div className="rounded-md border p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CloudUpload className="h-3.5 w-3.5" />نسخ قاعدة البيانات على Cloudflare R2
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button type="button" disabled={r2RetentionMut.isPending}
                    onClick={() => r2RetentionMut.mutate()}
                    className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
                    تطبيق سياسة الاحتفاظ
                  </button>
                )}
                <button type="button" onClick={() => r2Query.refetch()} className="text-muted-foreground hover:text-foreground">
                  <RefreshCw className={cn('h-3.5 w-3.5', r2Query.isFetching && 'animate-spin')} />
                </button>
              </div>
            </div>
            {r2Query.isError ? (
              <p className="text-[11px] text-destructive">{extractApiError(r2Query.error) ?? 'تعذّر قراءة نسخ R2'}</p>
            ) : r2Query.data && r2Query.data.length > 0 ? (
              <div className="max-h-40 overflow-auto divide-y">
                {r2Query.data.map(f => (
                  <div key={f.r2Key} className="py-1.5 text-xs">
                    <div className="font-mono truncate" dir="ltr">{f.fileName}</div>
                    <div className="text-[10px] text-muted-foreground">{f.yearFolder} · {fmtBytes(f.sizeBytes)} · {fmtDate(f.createdAtUtc)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{r2Query.isLoading ? 'جارٍ التحميل…' : 'لا توجد نسخ على R2 بعد.'}</p>
            )}
          </div>
        )}

        {/* نسخ قاعدة البيانات المتوفرة */}
        <div className="rounded-md border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">نسخ قاعدة البيانات المتوفرة على السيرفر</div>
            <button type="button" onClick={() => backupsQuery.refetch()} className="text-muted-foreground hover:text-foreground">
              <RefreshCw className={cn('h-3.5 w-3.5', backupsQuery.isFetching && 'animate-spin')} />
            </button>
          </div>
          {backupsQuery.data && backupsQuery.data.length > 0 ? (
            <div className="max-h-44 overflow-auto divide-y">
              {backupsQuery.data.map(f => (
                <div key={`${f.yearFolder}/${f.fileName}`} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono truncate" dir="ltr">{f.fileName}</div>
                    <div className="text-[10px] text-muted-foreground">{f.yearFolder} · {fmtBytes(f.sizeBytes)} · {fmtDate(f.createdAtUtc)}</div>
                  </div>
                  {(() => {
                    const key = `${f.yearFolder}/${f.fileName}`;
                    const isDownloading = downloadingKey === key;
                    return (
                      <button type="button" disabled={downloadMut.isPending}
                        onClick={() => downloadMut.mutate(f)}
                        className="shrink-0 rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted flex items-center gap-1 disabled:opacity-70">
                        {isDownloading
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />}
                        تنزيل
                      </button>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">{backupsQuery.isLoading ? 'جارٍ التحميل…' : 'لا توجد نسخ بعد.'}</p>
          )}
        </div>
      </div>

      {/* أرشيف المرفقات */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <HardDrive className="h-4 w-4 text-primary" />أرشيف المرفقات
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>مزوّد التخزين</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'Local', label: 'تخزين محلي على الخادم' },
                { id: 'R2', label: 'Cloudflare R2' },
              ] as const).map(opt => (
                <button key={opt.id} type="button" disabled={disabled}
                  onClick={() => setDraft(d => d && ({ ...d, attachProvider: opt.id }))}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-start',
                    (draft.attachProvider || 'Local').toUpperCase() === opt.id.toUpperCase()
                      ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {!isR2 && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><HardDrive className="h-3 w-3" />مسار التخزين المحلي</Label>
              <Input dir="ltr" className="font-mono" disabled={disabled} value={draft.attachLocalPath}
                placeholder="D:/iraqitradecenter/api_IraqiTradeCenter_Company/attachments"
                onChange={e => setDraft(d => d && ({ ...d, attachLocalPath: e.target.value }))} />
            </div>
          )}

          {isR2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>R2 Account ID</Label>
                <Input dir="ltr" className="font-mono" disabled={disabled} value={draft.r2AccountId}
                  placeholder="cloudflare account id"
                  onChange={e => setDraft(d => d && ({ ...d, r2AccountId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>R2 Bucket</Label>
                <Input dir="ltr" className="font-mono" disabled={disabled} value={draft.r2Bucket}
                  placeholder="company-attachments"
                  onChange={e => setDraft(d => d && ({ ...d, r2Bucket: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>R2 Access Key ID {hasAccessKey && <span className="text-[10px] text-green-600">(محفوظ)</span>}</Label>
                <Input dir="ltr" className="font-mono" disabled={disabled} value={draft.r2AccessKeyId}
                  placeholder={hasAccessKey ? '••••••••  (اتركه فارغاً للإبقاء)' : ''}
                  onChange={e => setDraft(d => d && ({ ...d, r2AccessKeyId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>R2 Secret Access Key {hasSecret && <span className="text-[10px] text-green-600">(محفوظ)</span>}</Label>
                <Input dir="ltr" type="password" className="font-mono" disabled={disabled} value={draft.r2SecretAccessKey}
                  placeholder={hasSecret ? '••••••••  (اتركه فارغاً للإبقاء)' : ''}
                  onChange={e => setDraft(d => d && ({ ...d, r2SecretAccessKey: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end sticky bottom-0 bg-background/80 backdrop-blur py-1">
          <Button type="button" onClick={() => draft && saveMut.mutate(draft)} disabled={saveMut.isPending}>
            {saveMut.isPending ? <RefreshCw className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
            حفظ إعدادات الشركة
          </Button>
        </div>
      )}
    </div>
  );
}

function EnableToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border',
        on ? 'bg-green-50 text-green-700 border-green-200' : 'bg-muted text-muted-foreground border-border')}>
      {on ? <><CheckCircle2 className="h-3.5 w-3.5" />مُفعَّل</> : <><XCircle className="h-3.5 w-3.5" />مُعطَّل</>}
    </button>
  );
}

// ─── Database Tab ────────────────────────────────────────────────────────────



interface DatabaseTabProps {

  form: SubscriberDto;

  setForm: React.Dispatch<React.SetStateAction<SubscriberDto>>;

  provConfig?: ProvisioningConfig;

  dbStatus?: DatabaseStatus;

  isProvisioned: boolean;

  editing: Subscriber | null;

  canProvision: boolean;

  onGenerate: () => void;

  onProvision: () => void;

  onLinkExisting: () => void;

  isGenerating: boolean;

  isProvisioning: boolean;

  isLinking: boolean;

}



function DatabaseTab({

  form, setForm, provConfig, dbStatus, isProvisioned, editing,

  canProvision, onGenerate, onProvision, onLinkExisting, isGenerating, isProvisioning, isLinking,

}: DatabaseTabProps) {

  const mdfPath = form.dbDataPath && form.databaseName

    ? `${form.dbDataPath.replace(/\\/g, '/')}/${form.databaseName}.mdf`

    : '';

  const ldfPath = form.dbLogPath && form.databaseName

    ? `${form.dbLogPath.replace(/\\/g, '/')}/${form.databaseName}_log.ldf`

    : '';



  return (

    <div className="space-y-4">

      {/* Info banner */}

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">

        <div className="flex items-center gap-1.5 font-medium text-foreground">

          <Shield className="h-3.5 w-3.5 text-primary" />

          آلية الإنشاء: استعادة من النسخة الاحتياطية المعتمدة

        </div>

        <p>كل شركة تحصل على قاعدة بيانات مستقلة بكود 8 أحرف، ودومين خاص، مع App Pool مشترك وربط بالقاعدة الرئيسية.</p>

      </div>



      {/* Identity fields */}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <div className="space-y-1">

          <Label>كود الشركة <span className="text-destructive">*</span></Label>

          <div className="flex gap-1">

            <Input dir="ltr" className="font-mono uppercase" readOnly={isProvisioned}

              value={form.companyCode ?? ''} placeholder="XXXXXXXX"

              onChange={e => setForm(f => ({ ...f, companyCode: e.target.value.toUpperCase() }))} />

            {!isProvisioned && (

              <Button type="button" variant="outline" size="icon" className="shrink-0"

                disabled={isGenerating} onClick={onGenerate}>

                <RefreshCw className={cn('h-4 w-4', isGenerating && 'animate-spin')} />

              </Button>

            )}

          </div>

        </div>

        <div className="space-y-1">

          <Label>اسم قاعدة البيانات <span className="text-destructive">*</span></Label>

          <Input dir="ltr" className="font-mono" readOnly={isProvisioned}

            value={form.databaseName ?? ''} placeholder="IraqiTradeCenter_XXXXXXXX"

            onChange={e => setForm(f => ({ ...f, databaseName: e.target.value }))} />

        </div>

      </div>



      <div className="space-y-3">

        <div className="space-y-1">

          <Label className="flex items-center gap-1"><Globe className="h-3 w-3" />دومين الشركة</Label>

          <Input dir="ltr" value={form.domain ?? ''} placeholder="ali.iraqi-trade-center.iq"

            onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />

        </div>

        <div className="space-y-1">

          <Label className="flex items-center gap-1"><Store className="h-3 w-3" />متجر الشركة</Label>

          <p className="text-[11px] text-muted-foreground">

            يُفتح ضمن المتجر الرئيسي عبر الرابط
            {form.companyCode ? ` iraqi-trade-center.iq/store/${form.companyCode.toUpperCase()}` : ' iraqi-trade-center.iq/store/{الكود}'}.

          </p>

        </div>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <div className="space-y-1 sm:col-span-2">

          <Label className="flex items-center gap-1"><Link2 className="h-3 w-3" />رابط API</Label>

          <Input dir="ltr" value={form.apiBaseUrl ?? ''} placeholder="https://api-iraqitradecenter.gcc.iq/api"

            onChange={e => setForm(f => ({ ...f, apiBaseUrl: e.target.value }))} />

          <p className="text-[11px] text-muted-foreground">

            افتراضياً API مشترك لكل الشركات يحلّ القاعدة حسب النطاق — يمكنك تغييره عند تغيير السيرفر أو الدومين.

          </p>

        </div>

      </div>



      {/* File paths */}

      <div className="space-y-2">

        <Label className="flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" />مسارات ملفات القاعدة</Label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          <div className="space-y-1">

            <Label className="text-xs text-muted-foreground">مجلد البيانات (.mdf)</Label>

            <Input dir="ltr" readOnly={isProvisioned} value={form.dbDataPath ?? ''}

              placeholder="D:/MSSQL/Data"

              onChange={e => setForm(f => ({ ...f, dbDataPath: e.target.value }))} />

          </div>

          <div className="space-y-1">

            <Label className="text-xs text-muted-foreground">مجلد السجل (.ldf)</Label>

            <Input dir="ltr" readOnly={isProvisioned} value={form.dbLogPath ?? ''}

              placeholder="D:/MSSQL/Data"

              onChange={e => setForm(f => ({ ...f, dbLogPath: e.target.value }))} />

          </div>

        </div>

        {mdfPath && (

          <div className="text-xs font-mono text-muted-foreground space-y-0.5 bg-muted/40 rounded p-2">

            <div>MDF: {mdfPath}</div>

            <div>LDF: {ldfPath}</div>

          </div>

        )}

      </div>



      {/* Server config (readonly) */}

      {provConfig && (

        <div className="rounded-lg border p-3 space-y-2">

          <div className="text-sm font-medium flex items-center gap-1.5">

            <Server className="h-4 w-4 text-primary" />إعدادات السيرفر

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">

            <ConfigRow label="القاعدة الرئيسية" value={provConfig.parentDatabaseName} />

            <ConfigRow label="App Pool المشترك" value={provConfig.sharedAppPool} />

            <ConfigRow label="النسخة الاحتياطية" value={provConfig.templateBackupPath} mono

              warn={!provConfig.backupFileExists} />

            {provConfig.resolvedTemplateBackupPath && provConfig.backupFileExists && (

              <ConfigRow label="المسار الفعلي" value={provConfig.resolvedTemplateBackupPath} mono />

            )}

            <ConfigRow label="قاعدة المصدر" value={provConfig.templateSourceDatabase} />

          </div>

        </div>

      )}



      {/* Status + Provision */}

      {editing && (

        <div className="rounded-lg border p-3 space-y-3">

          <div className="text-sm font-medium">حالة قاعدة البيانات</div>

          {dbStatus ? (

            <div className="flex flex-wrap gap-2">

              <StatusBadge ok={dbStatus.dbProvisioned} label={dbStatus.dbProvisioned ? 'مُجهَّزة' : 'غير مُجهَّزة'} />

              <StatusBadge ok={dbStatus.databaseExists} label={dbStatus.databaseExists ? 'موجودة على SQL' : 'غير موجودة'} />

              <StatusBadge ok={dbStatus.backupFileExists} label={dbStatus.backupFileExists ? 'النسخة الاحتياطية جاهزة' : 'النسخة الاحتياطية مفقودة'} />

            </div>

          ) : (

            <LoadingSpinner />

          )}



          {!isProvisioned && canProvision && (

            <div className="space-y-2">

              {dbStatus?.canLinkExisting && (

                <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">

                  <Link2 className="h-4 w-4 shrink-0 mt-0.5" />

                  <span>قاعدة البيانات موجودة على SQL Server لكن غير مربوطة في السجل — يمكنك ربطها مباشرة.</span>

                </div>

              )}



              {!provConfig?.backupFileExists && !dbStatus?.canLinkExisting && (

                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">

                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />

                  <span>

                    ملف النسخة الاحتياطية غير موجود على السيرفر. ضع الملف في المسار المحدّد في الإعدادات أولاً

                    {provConfig?.templateBackupPath ? ` (${provConfig.templateBackupPath})` : ''}.

                  </span>

                </div>

              )}



              {dbStatus?.canLinkExisting ? (

                <Button type="button" variant="secondary" className="w-full sm:w-auto"

                  disabled={isLinking}

                  onClick={onLinkExisting}>

                  {isLinking

                    ? <><RefreshCw className="h-4 w-4 me-1 animate-spin" />جارٍ الربط...</>

                    : <><Link2 className="h-4 w-4 me-1" />ربط القاعدة الموجودة</>}

                </Button>

              ) : (

                <Button type="button" className="w-full sm:w-auto"

                  disabled={isProvisioning || !provConfig?.backupFileExists}

                  onClick={onProvision}>

                  {isProvisioning

                    ? <><RefreshCw className="h-4 w-4 me-1 animate-spin" />جارٍ إنشاء القاعدة...</>

                    : <><Play className="h-4 w-4 me-1" />إنشاء قاعدة البيانات (استعادة من النسخة الاحتياطية)</>}

                </Button>

              )}

              <p className="text-xs text-muted-foreground">احفظ بيانات الشركة أولاً ثم أنشئ أو اربط القاعدة.</p>

            </div>

          )}



          {isProvisioned && dbStatus?.dbProvisionedAt && (

            <p className="text-xs text-muted-foreground">

              تم الإنشاء: {new Date(dbStatus.dbProvisionedAt).toLocaleString('ar-IQ-u-nu-latn', { numberingSystem: 'latn' })}

            </p>

          )}

        </div>

      )}



      {!editing && (

        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">

          احفظ الشركة أولاً، ثم عد للتعديل لإنشاء قاعدة البيانات.

        </div>

      )}

    </div>

  );

}



function ConfigRow({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {

  return (

    <div>

      <div className="text-muted-foreground mb-0.5">{label}</div>

      <div className={cn('break-all', mono && 'font-mono', warn ? 'text-amber-700' : 'text-foreground')} title={value}>

        {warn && <AlertTriangle className="h-3 w-3 inline me-1" />}{value}

      </div>

    </div>

  );

}



function StatusBadge({ ok, label }: { ok: boolean; label: string }) {

  return (

    <Badge variant="outline" className={cn('text-xs',

      ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>

      {ok ? <CheckCircle2 className="h-3 w-3 me-1" /> : <AlertTriangle className="h-3 w-3 me-1" />}

      {label}

    </Badge>

  );

}


