import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney } from '@/lib/utils';
import type { SalesInvoiceDto } from '@/types/api';
import { InvoiceTotalsPanel } from './InvoiceTotalsPanel';
import { StatusBadge } from './StatusBadge';

interface InvoiceViewDialogProps {
  invoice: SalesInvoiceDto;
  partyLabel: string;
  onClose: () => void;
}

export function InvoiceViewDialog({ invoice, partyLabel, onClose }: InvoiceViewDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = invoice.currency ?? 'IQD';

  const openJournal = () => {
    if (!invoice.journalEntryId) return;
    navigate(`/accounting/journal/${invoice.journalEntryId}/view`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:items-center"
      onClick={onClose}
    >
      <Card
        className="invoice-document invoice-view-dialog my-4 w-full max-w-4xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="invoice-document-accent" />

        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">فاتورة</CardTitle>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="num-display text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-5 pb-5">
          <div className="invoice-meta-grid">
            <div className="invoice-meta-cell">
              <span className="invoice-meta-label">التاريخ</span>
              <span>{formatDate(invoice.invoiceDate)}</span>
            </div>
            <div className="invoice-meta-cell">
              <span className="invoice-meta-label">{partyLabel}</span>
              <span className="font-medium">{invoice.customerName ?? '—'}</span>
            </div>
            <div className="invoice-meta-cell">
              <span className="invoice-meta-label">العملة</span>
              <span className="num-display font-medium">{currency}</span>
            </div>
          </div>

          <div className="table-scroll rounded-lg border">
            <table className="invoice-lines-table">
              <thead>
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th>{t('invoices.create.colItem')}</th>
                  <th>{t('invoices.create.colUom')}</th>
                  <th className="text-left">{t('invoices.create.colQty')}</th>
                  <th className="text-left">{t('invoices.create.colPrice')}</th>
                  <th className="text-left">{t('invoices.create.colTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="font-medium">{l.itemName}</td>
                    <td className="text-muted-foreground">{l.unitName}</td>
                    <td className="text-left num-display">{l.quantity}</td>
                    <td className="text-left num-display">{formatMoney(l.unitPrice, currency)}</td>
                    <td className="text-left num-display font-semibold">{formatMoney(l.lineTotal, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
            <InvoiceTotalsPanel
              currency={currency}
              subTotal={invoice.subTotal}
              discount={invoice.discountAmount}
              tax={invoice.taxAmount}
              total={invoice.totalAmount}
              paid={invoice.paidAmount}
              remaining={invoice.remainingAmount}
              className="w-full sm:max-w-xs"
            />
          </div>
        </CardContent>

        <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
          {invoice.journalEntryId && (
            <Button variant="outline" className="gap-1.5" onClick={openJournal}>
              <BookOpen className="h-4 w-4" />
              عرض القيد
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
