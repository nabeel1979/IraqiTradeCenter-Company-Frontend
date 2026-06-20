import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt, Settings2, FileStack, RefreshCw,
  CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, X,
  Warehouse, BookOpen, ShieldCheck, Scale,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { invoiceTypesApi, invoicesApi, type RegenerateEntriesResult } from '@/lib/api/invoiceTypes';
import { extractApiError } from '@/lib/utils';

const HUB_SECTIONS = [
  {
    to: '/invoices/types',
    title: 'أنواع الفواتير',
    description: 'تخصيص أنواع الفواتير، حساباتها الافتراضية، المستودع، وخيارات الترحيل والخصم والإضافة',
    icon: FileStack,
  },
  {
    to: '/invoices/settings',
    title: 'ثوابت الفواتير',
    description: 'نوع الجرد (دوري / مستمر) وطريقة احتساب التكلفة (متوسط مرجّح أو FIFO)',
    icon: Settings2,
  },
  {
    to: '/inventory/warehouses',
    title: 'المستودعات والفروع',
    description: 'ربط كل مستودع بفرعه — يُستخدم فرع المستودع تلقائياً في قيد الفاتورة المحاسبي',
    icon: Warehouse,
  },
  {
    to: '/invoices/cost-processing',
    title: 'معالجة تكاليف المواد',
    description: 'مطابقة رصيد حساب المستودع (المالي) مع قيمة الجرد (المستودعي) لكل مادة، وإعادة تقييم الكلفة يدوياً وتوليد قيد التسوية بالفروقات',
    icon: Scale,
  },
] as const;

const REGEN_STEPS = [
  'نسخة احتياطية لقاعدة البيانات قبل البدء',
  'إعادة احتساب أرصدة ومتوسط كلفة جميع المواد من سجل الحركات',
  'لكل فاتورة (من الأقدم للأحدث): إعادة ترحيل حركات المخزون بتاريخ الفاتورة',
  'توليد القيد المحاسبي (COGS + ربح/خسارة) مع فرع المستودع',
  'منع جعل حساب المستودع دائن — لا تُمسّ أرصدة العملاء',
] as const;

export function InvoiceConstantsHubPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState<number | ''>('');
  const [result, setResult] = useState<RegenerateEntriesResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const typesQ = useQuery({
    queryKey: ['invoice-types'],
    queryFn: () => invoiceTypesApi.list(),
    enabled: showModal,
  });

  const regenMut = useMutation({
    mutationFn: () => invoicesApi.regenerateEntries(selectedType === '' ? undefined : (selectedType as number)),
    onSuccess: (data) => {
      setResult(data);
      if (data.errors > 0) setShowErrors(true);
      if (data.processed > 0) toast.success(`تمت مزامنة ${data.processed} فاتورة`);
      else if (data.errors > 0) toast.error(`فشلت المزامنة — ${data.errors} خطأ`);
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشلت العملية'),
  });

  const handleClose = () => {
    if (regenMut.isPending) return;
    setShowModal(false);
    setResult(null);
    setSelectedType('');
    setShowErrors(false);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-xl font-bold">إعدادات الفواتير</h1>
          <p className="text-sm text-muted-foreground">مركز إعدادات الفواتير والمزامنة بين المخزون والمحاسبة</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_SECTIONS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="group block">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5 text-primary" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}

        <Card
          className="h-full cursor-pointer transition-colors hover:border-amber-400/60 hover:bg-amber-50/30 dark:hover:bg-amber-900/10"
          onClick={() => setShowModal(true)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              مزامنة المخزون والقيود
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              إعادة ترحيل حركات المخزون والقيود المحاسبية للفواتير — كلفة، COGS، فرع المستودع —
              ليتطابق رصيد حساب المستودع مع جرد المخزون
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              عملية حساسة — تُنشئ نسخة احتياطية تلقائياً
            </p>
          </CardContent>
        </Card>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative flex w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-xl" dir="rtl">

            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <RefreshCw className="h-4 w-4 text-amber-600" />
                مزامنة المخزون والقيود المحاسبية
              </h3>
              <button
                type="button"
                onClick={handleClose}
                disabled={regenMut.isPending}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4 text-sm">
              {!result ? (
                <>
                  <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      ماذا تفعل هذه العملية؟
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
                      {REGEN_STEPS.map(step => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-medium text-xs">نوع الفاتورة</label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={selectedType}
                      onChange={e => setSelectedType(e.target.value === '' ? '' : Number(e.target.value))}
                      disabled={regenMut.isPending || typesQ.isLoading}
                    >
                      <option value="">— جميع أنواع الفواتير —</option>
                      {(typesQ.data ?? []).map(t => (
                        <option key={t.id} value={t.id}>{t.nameAr}</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    تحذير: العملية غير قابلة للتراجع. تأكد من صحة أرصدة المخزون وتواريخ الفواتير قبل التشغيل.
                    الفواتير بتاريخ يسبق أول إدخال مخزون قد تفشل — عدّل التاريخ ثم أعد المحاولة.
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    {result.errors === 0
                      ? <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
                      : <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />}
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">
                        {result.errors === 0 ? 'اكتملت المزامنة بنجاح' : `اكتملت بـ ${result.errors} خطأ`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        تمت معالجة{' '}
                        <span className="font-semibold text-foreground">{result.processed}</span> فاتورة
                        {result.skipped > 0 && <span> · تجاوز {result.skipped}</span>}
                        {' '}من أصل {result.total}
                      </p>
                      {result.itemsRecomputed != null && result.itemsRecomputed > 0 && (
                        <p className="text-xs text-muted-foreground">
                          أُعيد احتساب{' '}
                          <span className="font-semibold text-foreground">{result.itemsRecomputed}</span> مادة
                        </p>
                      )}
                    </div>
                  </div>

                  {result.backupFile ? (
                    <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-xs text-green-800 dark:text-green-300">
                      <span className="font-medium">✓ نسخة احتياطية: </span>
                      <span className="font-mono">{result.backupFile}</span>
                    </div>
                  ) : result.backupError ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-medium">⚠ تعذّر إنشاء نسخة احتياطية: </span>
                      <span>{result.backupError}</span>
                    </div>
                  ) : null}

                  {result.errorDetails.length > 0 && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowErrors(v => !v)}
                      >
                        {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        تفاصيل الأخطاء ({result.errorDetails.length})
                      </button>
                      {showErrors && (
                        <div className="max-h-40 overflow-y-auto rounded border bg-muted/40 p-2 text-xs space-y-1">
                          {result.errorDetails.map(e => (
                            <div key={e.id} className="flex gap-2">
                              <span className="font-mono text-muted-foreground shrink-0">{e.invoiceNumber}</span>
                              <span className="text-destructive">{e.error}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={regenMut.isPending}>
                {result ? 'إغلاق' : 'إلغاء'}
              </Button>
              {!result && (
                <Button
                  size="sm"
                  className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => regenMut.mutate()}
                  disabled={regenMut.isPending}
                >
                  {regenMut.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" />جارٍ المزامنة…</>
                    : <><RefreshCw className="h-4 w-4" />تشغيل المزامنة</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
