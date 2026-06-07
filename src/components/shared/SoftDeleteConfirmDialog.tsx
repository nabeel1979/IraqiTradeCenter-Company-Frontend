import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SoftDeleteConfirmDialogProps {
  open: boolean;
  title?: string;
  label: string;
  note?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function SoftDeleteConfirmDialog({
  open,
  title = 'نقل إلى سلة المهملات',
  label,
  note,
  loading = false,
  error = null,
  onConfirm,
  onClose,
}: SoftDeleteConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 text-sm leading-relaxed">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
          <p>
            هل تريد نقل <span className="font-bold">{label}</span> إلى سلة المهملات؟
          </p>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>يمكن استعادته لاحقاً من <strong>النظام → سلة المهملات</strong>.</p>
            {note && <p className="text-amber-600 dark:text-amber-400">{note}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'جارٍ النقل...' : 'نقل إلى السلة'}
          </Button>
        </div>
      </div>
    </div>
  );
}
