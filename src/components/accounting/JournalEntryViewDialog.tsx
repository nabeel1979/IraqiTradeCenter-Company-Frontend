import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, BookOpen, Printer, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { accountingApi } from '@/lib/api/accounting';
import { companySettingsApi } from '@/lib/api/companySettings';
import { cashBoxesApi } from '@/lib/api/cashBoxes';
import { printSingleJournalEntry } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import { formatAmount, formatDate, cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/useLocale';
import { localizedAccountName, localizedVoucherTypeName, localizedEntryDescription } from '@/lib/i18n';

interface Props {
  /** معرف القيد المراد عرضه — null لإغلاق الـ Dialog */
  entryId: number | null;
  onClose: () => void;
  /** هل يُسمح بزر "تعديل" يقلب الصفحة لوضع التحرير؟ افتراضياً true */
  allowEdit?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variantMap: Record<string, any> = {
    Posted: 'success',
    Draft: 'muted',
    Reversed: 'destructive',
  };
  const variant = variantMap[status] ?? 'muted';
  const label = t(`journalEntries.status.${status}`, { defaultValue: status });
  return <Badge variant={variant}>{label}</Badge>;
}

export function JournalEntryViewDialog({ entryId, onClose, allowEdit = true }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { locale, isRtl, direction } = useLocale();

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

  // ‎نجلب الصناديق لاستعمالها كخريطة سياق في ترجمة وصف القيد المُولّد تلقائياً.
  const cashBoxesQuery = useQuery({
    queryKey: ['cash-boxes', 'all-for-translation'],
    queryFn: () => cashBoxesApi.getAll(false),
    enabled: entryId !== null,
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

  // ‎خريطة (اسم عربي → إنجليزي) لاستعمالها في ترجمة وصف القيد المركّب.
  const descriptionContextMap: Record<string, string> = {};
  for (const cb of cashBoxesQuery.data ?? []) {
    const ar = (cb.nameAr ?? '').trim();
    const en = (cb.nameEn ?? '').trim();
    if (ar && en) descriptionContextMap[ar] = en;
  }
  for (const ln of data?.lines ?? []) {
    const ar = (ln.accountNameAr ?? '').trim();
    const en = (ln.accountNameEn ?? '').trim();
    if (ar && en) descriptionContextMap[ar] = en;
  }
  if (data?.voucherTypeName && data?.voucherTypeNameEn) {
    descriptionContextMap[data.voucherTypeName] = data.voucherTypeNameEn;
  }

  const handlePrint = () => {
    if (!data) return;
    printSingleJournalEntry(data, companyQuery.data ?? null);
    // ‎سجّل عملية الطباعة في سجل المراقبة (لا يُفشل الطباعة إن فشل التسجيل).
    void auditApi.logPrint({
      entityType: data.voucherTypeId ? 'Voucher' : 'JournalEntry',
      entityId: data.id,
      summary: data.voucherNumber
        ? `طباعة سند ${data.voucherNumber} — ${data.description}`
        : `طباعة قيد ${data.entryNumber} — ${data.description}`,
      details: {
        entryNumber: data.entryNumber,
        voucherNumber: data.voucherNumber,
        manualNumber: data.manualNumber,
      },
    });
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
        dir={direction}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">{t('journalEntries.view.title')}</h2>
            {data?.entryNumber && (
              <>
                {data.voucherNumber ? (
                  <>
                    <span className="num-display rounded border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      {data.voucherNumber}
                    </span>
                    <span
                      className="num-display rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title={t('journalEntries.view.internalNumberTip')}
                    >
                      #{data.entryNumber}
                    </span>
                  </>
                ) : (
                  <span className="num-display rounded bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">
                    #{data.entryNumber}
                  </span>
                )}
                {/* الرقم اليدوي إن وُجد — يميّز السندات المرتبطة بمستندات خارجية */}
                {data.manualNumber && (
                  <span
                    className="num-display rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                    title={t('journalEntries.entry.manualNumberTip', { number: data.manualNumber, defaultValue: 'Manual no.: {{number}}' })}
                    dir="ltr"
                  >
                    <span className="opacity-70">#</span>
                    {data.manualNumber}
                  </span>
                )}
              </>
            )}
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              {t('journalEntries.view.readOnly')}
            </span>
            {data?.entryType === 'Opening' && (
              <span className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
                {t('journalEntries.entry.opening')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {data && (
              <Button variant="outline" size="sm" onClick={handlePrint} className="h-7 gap-1 px-2 text-xs">
                <Printer className="h-3.5 w-3.5" />
                {t('journalEntries.view.print')}
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
                {t('journalEntries.view.edit')}
              </Button>
            )}
            {data
              && (data.referenceType === 'CashBoxTransfer'
                || data.referenceType === 'CashBoxTransferReversal') && (
              <span
                className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[10px] font-medium text-amber-500"
                title={t('journalEntries.view.transferLockedTip')}
              >
                {t('journalEntries.view.transferLocked')}
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
              <LoadingSpinner text={t('journalEntries.view.loading')} />
            </div>
          ) : entryQuery.isError || !data ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
              {t('journalEntries.view.loadFailed')}
            </div>
          ) : (
            <div className="space-y-3">
              {/* بيانات الرأس */}
              <div className="grid gap-2 rounded-md border border-border bg-card/50 p-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">{t('journalEntries.view.header.date')}</div>
                  <div className="num-display text-sm font-semibold">{formatDate(data.entryDate)}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">{t('journalEntries.view.header.currency')}</div>
                  <div className="text-sm font-semibold">{data.currency || 'IQD'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">{t('journalEntries.view.header.status')}</div>
                  <StatusBadge status={data.status} />
                </div>
                <div className="md:col-span-5">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">{t('journalEntries.view.header.description')}</div>
                  <div className="text-sm">
                    {data.description?.trim()
                      ? localizedEntryDescription(locale, data.description, descriptionContextMap)
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                {data.voucherTypeId && (data.voucherTypeName || data.voucherTypeCode) && (
                  <div className="md:col-span-12">
                    <div className="mb-0.5 text-[10px] text-muted-foreground">{t('journalEntries.view.header.voucherType')}</div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {data.voucherTypeCode && (
                        <span className="num-display text-[10px] opacity-80">{data.voucherTypeCode}</span>
                      )}
                      <span>
                        {localizedVoucherTypeName(locale, data.voucherTypeName ?? '', data.voucherTypeNameEn)
                          || data.voucherTypeCode}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* جدول البنود */}
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-10 p-1.5 text-center">{t('journalEntries.cols.idx')}</th>
                      <th className={cn('p-1.5', isRtl ? 'text-right' : 'text-left')}>{t('journalEntries.cols.account')}</th>
                      <th className={cn('p-1.5', isRtl ? 'text-right' : 'text-left')}>{t('journalEntries.cols.desc')}</th>
                      <th className={cn('w-32 p-1.5', isRtl ? 'text-left' : 'text-right')}>{t('journalEntries.cols.debit')}</th>
                      <th className={cn('w-32 p-1.5', isRtl ? 'text-left' : 'text-right')}>{t('journalEntries.cols.credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line, idx) => {
                      // ‎GetJournalEntryByIdQuery يُرسل AccountName كصيغة "Code - NameAr".
                      // ‎نستخرج اللاحقة (الاسم العربي) لنُمرّرها لـ localizedAccountName.
                      const fallbackName = line.accountName || `#${line.accountId}`;
                      const arName = (line.accountNameAr ?? '').trim();
                      let codePrefix = '';
                      let displayCore = '';
                      if (arName && line.accountName) {
                        const m = /^(\d+)\s*-\s*/.exec(line.accountName);
                        if (m) codePrefix = `${m[1]} - `;
                      }
                      displayCore = localizedAccountName(locale, arName || fallbackName, line.accountNameEn);
                      const accountLabel = codePrefix ? `${codePrefix}${displayCore}` : (displayCore || fallbackName);
                      return (
                        <tr key={line.id} className="border-t border-border/60 hover:bg-secondary/20">
                          <td className="p-1.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                          <td className={cn('p-1.5 text-sm', isRtl ? 'text-right' : 'text-left')}>
                            {accountLabel}
                          </td>
                          <td className={cn('p-1.5 text-xs text-muted-foreground', isRtl ? 'text-right' : 'text-left')}>
                            {line.description?.trim() ? localizedEntryDescription(locale, line.description, descriptionContextMap) : '—'}
                          </td>
                          <td className={cn('num-display p-1.5 text-sm', isRtl ? 'text-left' : 'text-right')}>
                            {line.isDebit ? (
                              <span className="font-semibold text-emerald-400">{formatAmount(line.amount)}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className={cn('num-display p-1.5 text-sm', isRtl ? 'text-left' : 'text-right')}>
                            {!line.isDebit ? (
                              <span className="font-semibold text-amber-400">{formatAmount(line.amount)}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-secondary/40 text-xs">
                    <tr className="border-t-2 border-border">
                      <td colSpan={3} className={cn('p-1.5 font-semibold', isRtl ? 'text-right' : 'text-left')}>
                        {t('journalEntries.entry.total')}
                      </td>
                      <td className={cn('num-display p-1.5 font-bold text-emerald-400', isRtl ? 'text-left' : 'text-right')}>{formatAmount(totalD)}</td>
                      <td className={cn('num-display p-1.5 font-bold text-amber-400', isRtl ? 'text-left' : 'text-right')}>{formatAmount(totalC)}</td>
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
                  ? t('journalEntries.view.balanced', { total: formatAmount(totalD) })
                  : t('journalEntries.view.unbalanced', { diff: formatAmount(Math.abs(totalD - totalC)) })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
