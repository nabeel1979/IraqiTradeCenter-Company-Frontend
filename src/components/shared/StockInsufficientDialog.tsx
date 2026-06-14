import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PackageX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatStockQtyDisplay,
  parseStockInsufficientMessage,
  type StockInsufficientDetails,
} from '@/lib/stockErrors';

interface StockInsufficientDialogProps {
  open: boolean;
  message: string | null;
  onClose: () => void;
  locale?: 'ar' | 'en';
}

function buildDetails(message: string): StockInsufficientDetails {
  const parsed = parseStockInsufficientMessage(message);
  if (parsed.item || parsed.required || parsed.available) return parsed;
  return { raw: message };
}

export function StockInsufficientDialog({
  open,
  message,
  onClose,
  locale = 'ar',
}: StockInsufficientDialogProps) {
  const tt = (ar: string, en: string) => (locale === 'en' ? en : ar);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || !message) return null;

  const details = buildDetails(message);
  const required = formatStockQtyDisplay(details.required);
  const available = formatStockQtyDisplay(details.available);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-rose-200 bg-card shadow-2xl dark:border-rose-900/50">
        <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50/90 px-5 py-4 dark:border-rose-900/40 dark:bg-rose-950/40">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200">
            <PackageX className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-100">
              {tt('المخزون غير كافٍ', 'Insufficient stock')}
            </h2>
            <p className="mt-1 text-sm text-rose-800/80 dark:text-rose-200/80">
              {tt('الكمية المطلوبة تتجاوز الرصيد المتاح في المستودع المحدد.', 'Requested quantity exceeds available stock in the selected warehouse.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-rose-700/70 hover:bg-rose-100 hover:text-rose-900 dark:text-rose-200/70 dark:hover:bg-rose-900/50"
            aria-label={tt('إغلاق', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {details.item && (
            <div>
              <div className="text-xs font-medium text-muted-foreground">{tt('المادة', 'Item')}</div>
              <div className="mt-1 text-sm font-semibold">{details.item}</div>
            </div>
          )}

          {(required != null || available != null) && (
            <div className="grid grid-cols-2 gap-3">
              {required != null && (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center">
                  <div className="text-xs text-muted-foreground">{tt('المطلوب', 'Required')}</div>
                  <div className="mt-1 text-lg font-bold num-display text-rose-700 dark:text-rose-300">{required}</div>
                </div>
              )}
              {available != null && (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center">
                  <div className="text-xs text-muted-foreground">{tt('المتاح', 'Available')}</div>
                  <div className="mt-1 text-lg font-bold num-display">{available}</div>
                </div>
              )}
            </div>
          )}

          {details.date && (
            <p className="text-xs text-muted-foreground">
              {tt(`بتاريخ الفاتورة: ${details.date}`, `Invoice date: ${details.date}`)}
            </p>
          )}

          {!details.item && !required && !available && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{details.raw}</p>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button type="button" className="h-10 w-full" onClick={onClose}>
            {tt('حسناً', 'OK')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
