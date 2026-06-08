import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt, Settings2, FileStack, ChevronLeft, RefreshCw,
  CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { invoiceTypesApi, invoicesApi, type RegenerateEntriesResult } from '@/lib/api/invoiceTypes';
import { extractApiError } from '@/lib/utils';

export function InvoiceConstantsHubPage() {
  const [showModal, setShowModal]       = useState(false);
  const [selectedType, setSelectedType] = useState<number | ''>('');
  const [result, setResult]             = useState<RegenerateEntriesResult | null>(null);
  const [showErrors, setShowErrors]     = useState(false);

  const typesQ = useQuery({
    queryKey: ['invoice-types'],
    queryFn: () => invoiceTypesApi.list(),
    enabled: showModal,
  });

  const regenMut = useMutation({
    mutationFn: () => invoicesApi.regenerateEntries(selectedType === '' ? undefined : (selectedType as number)),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`تمت إعادة توليد ${data.processed} قيد`);
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
        <Link to="/invoices/sales">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ChevronLeft className="h-4 w-4" />
            الفواتير
          </Button>
        </Link>
        <Receipt className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-xl font-bold">إعدادات الفواتير</h1>
          <p className="text-sm text-muted-foreground">أنواع الفواتير والثوابت المرجعية</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/invoices/types">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileStack className="h-5 w-5 text-primary" />
                أنواع الفواتير
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">تخصيص أنواع الفواتير وحساباتها الافتراضية وخيارات الترحيل</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/invoices/settings">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5 text-primary" />
                ثوابت الفواتير
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">نوع الجرد وطريقة احتساب التكلفة</p>
            </CardContent>
          </Card>
        </Link>

        {/* كارت إعادة توليد القيود */}
        <Card
          className="h-full cursor-pointer transition-colors hover:border-amber-400/60 hover:bg-amber-50/30 dark:hover:bg-amber-900/10"
          onClick={() => setShowModal(true)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              إعادة توليد القيود
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              يُعيد توليد القيود المحاسبية لجميع الفواتير بالنموذج الحالي (كلفة + ربح/خسارة)
              من الأقدم إلى الأحدث
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-xl" dir="rtl">

            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <RefreshCw className="h-4 w-4 text-amber-600" />
                إعادة توليد القيود المحاسبية
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

            {/* Body */}
            <div className="px-4 py-4 space-y-4 text-sm">
              {!result ? (
                <>
                  <p className="text-muted-foreground leading-relaxed">
                    ستُحذف القيود الحالية للفواتير المحددة ويُعاد توليدها تلقائياً من الأقدم
                    إلى الأحدث بحسب تاريخ الفاتورة ثم رقم التسلسل. لا تتأثر حركات المخزون
                    ولا أرصدة العملاء.
                  </p>

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
                    تحذير: هذه العملية غير قابلة للتراجع. تأكد من صحة أرصدة المخزون قبل تشغيلها.
                  </div>
                </>
              ) : (
                /* نتيجة العملية */
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    {result.errors === 0
                      ? <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
                      : <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />}
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">
                        {result.errors === 0 ? 'اكتملت العملية بنجاح' : `اكتملت بـ ${result.errors} خطأ`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        تمت معالجة <span className="font-semibold text-foreground">{result.processed}</span> قيد
                        {result.skipped > 0 && <span> · تجاوز {result.skipped}</span>}
                        {' '}من أصل {result.total} فاتورة
                      </p>
                    </div>
                  </div>

                  {/* معلومات النسخة الاحتياطية */}
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

            {/* Footer */}
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
                    ? <><Loader2 className="h-4 w-4 animate-spin" />جارٍ المعالجة…</>
                    : <><RefreshCw className="h-4 w-4" />تشغيل</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
