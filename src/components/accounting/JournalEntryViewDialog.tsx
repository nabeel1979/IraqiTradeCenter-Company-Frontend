import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, BookOpen, Printer, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { printSingleJournalEntry } from '@/lib/printUtils';
import { formatAmount, formatDate, cn } from '@/lib/utils';

interface Props {
  /** معرف القيد المراد عرضه — null لإغلاق الـ Dialog */
  entryId: number | null;
  onClose: () => void;
  /** هل يُسمح بزر "تعديل" يقلب الصفحة لوضع التحرير؟ افتراضياً true */
  allowEdit?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    Posted: { label: 'مرحَّل', variant: 'success' },
    Draft: { label: 'غير مرحَّل', variant: 'muted' },
    Reversed: { label: 'معكوس', variant: 'destructive' },
  };
  const cfg = map[status] ?? { label: status, variant: 'muted' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function JournalEntryViewDialog({ entryId, onClose, allowEdit = true }: Props) {
  const navigate = useNavigate();

  const entryQuery = useQuery({
    queryKey: ['journal-entry-view', entryId],
    queryFn: () => accountingApi.getJournalEntryById(entryId as number),
    enabled: entryId !== null,
    staleTime: 30_000,
  });

  const companyQuery = useQuery({
    queryKey: ['company-settings-print'],
    queryFn: () => companySettingsApi.get(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (entryId === null) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [entryId, onClose]);

  if (entryId === null) return null;

  const data = entryQuery.data;
  const totalD = data?.lines.reduce((s, l) => s + (l.isDebit ? Number(l.amount || 0) : 0), 0) ?? 0;
  const totalC = data?.lines.reduce((s, l) => s + (!l.isDebit ? Number(l.amount || 0) : 0), 0) ?? 0;
  const balanced = Math.abs(totalD - totalC) < 0.005;

  const handlePrint = () => {
    if (!data) return;
    printSingleJournalEntry(data, companyQuery.data ?? null);
  };

  const handleEdit = () => {
    if (!data) return;
    onClose();
    navigate(`/accounting/journal/${data.id}/edit`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">عرض القيد</h2>
            {data?.entryNumber && (
              <>
                {data.voucherNumber ? (
                  <>
                    <span className="num-display rounded border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      {data.voucherNumber}
                    </span>
                    <span
                      className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title="رقم القيد الداخلي"
                    >
                      #{data.entryNumber}
                    </span>
                  </>
                ) : (
                  <span className="num-display rounded bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">
                    #{data.entryNumber}
                  </span>
                )}
              </>
            )}
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              للقراءة فقط
            </span>
            {data?.entryType === 'Opening' && (
              <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
                افتتاحي
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {data && (
              <Button variant="outline" size="sm" onClick={handlePrint} className="h-7 gap-1 px-2 text-xs">
                <Printer className="h-3.5 w-3.5" />
                طباعة
              </Button>
            )}
            {/*
              • قيود مناقلات الصناديق (CashBoxTransfer / CashBoxTransferReversal)
                لا تُعدَّل من هنا — مقفولة على نافذة المناقلات.
            */}
            {allowEdit && data
              && data.referenceType !== 'CashBoxTransfer'
              && data.referenceType !== 'CashBoxTransferReversal' && (
              <Button variant="outline" size="sm" onClick={handleEdit} className="h-7 gap-1 px-2 text-xs">
                <Pencil className="h-3.5 w-3.5" />
                تعديل
              </Button>
            )}
            {data
              && (data.referenceType === 'CashBoxTransfer'
                || data.referenceType === 'CashBoxTransferReversal') && (
              <span
                className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[10px] font-medium text-amber-500"
                title="يُعدَّل من صفحة الصناديق ⇒ تبويب المناقلات"
              >
                مناقلة صناديق · مقفول
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {entryQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner text="جاري تحميل القيد..." />
            </div>
          ) : entryQuery.isError || !data ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
              تعذّر تحميل القيد
            </div>
          ) : (
            <div className="space-y-3">
              {/* بيانات الرأس */}
              <div className="grid gap-2 rounded-md border border-border bg-card/50 p-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">التاريخ</div>
                  <div className="num-display text-sm font-semibold">{formatDate(data.entryDate)}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">العملة</div>
                  <div className="text-sm font-semibold">{data.currency || 'IQD'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">الحالة</div>
                  <StatusBadge status={data.status} />
                </div>
                <div className="md:col-span-5">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">البيان</div>
                  <div className="text-sm">
                    {data.description?.trim() ? data.description : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                {data.voucherTypeId && (data.voucherTypeName || data.voucherTypeCode) && (
                  <div className="md:col-span-12">
                    <div className="mb-0.5 text-[10px] text-muted-foreground">نوع السند</div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {data.voucherTypeCode && (
                        <span className="num-display text-[10px] opacity-80">{data.voucherTypeCode}</span>
                      )}
                      <span>{data.voucherTypeName ?? data.voucherTypeCode}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* جدول البنود */}
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-10 p-1.5 text-center">#</th>
                      <th className="p-1.5 text-right">الحساب</th>
                      <th className="p-1.5 text-right">البيان</th>
                      <th className="w-32 p-1.5 text-left">مدين</th>
                      <th className="w-32 p-1.5 text-left">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line, idx) => (
                      <tr key={line.id} className="border-t border-border/60 hover:bg-secondary/20">
                        <td className="p-1.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="p-1.5 text-right text-sm">
                          {line.accountName || `#${line.accountId}`}
                        </td>
                        <td className="p-1.5 text-right text-xs text-muted-foreground">
                          {line.description?.trim() ? line.description : '—'}
                        </td>
                        <td className="num-display p-1.5 text-left text-sm">
                          {line.isDebit ? (
                            <span className="font-semibold text-emerald-400">{formatAmount(line.amount)}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="num-display p-1.5 text-left text-sm">
                          {!line.isDebit ? (
                            <span className="font-semibold text-amber-400">{formatAmount(line.amount)}</span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-secondary/40 text-xs">
                    <tr className="border-t-2 border-border">
                      <td colSpan={3} className="p-1.5 text-right font-semibold">الإجمالي</td>
                      <td className="num-display p-1.5 text-left font-bold text-emerald-400">{formatAmount(totalD)}</td>
                      <td className="num-display p-1.5 text-left font-bold text-amber-400">{formatAmount(totalC)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* تنبيه التوازن */}
              <div
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs',
                  balanced
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                    : 'border-destructive/40 bg-destructive/10 text-destructive'
                )}
              >
                {balanced
                  ? `القيد متوازن — مجموع المدين = مجموع الدائن = ${formatAmount(totalD)}`
                  : `القيد غير متوازن — الفرق ${formatAmount(Math.abs(totalD - totalC))}`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
