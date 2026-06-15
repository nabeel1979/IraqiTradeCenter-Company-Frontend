import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FileText, MoreVertical, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onStatement: () => void;
  onOpenCard: () => void;
}

/** قائمة إجراءات الصف (ثلاث نقاط): كشف حساب + فتح بطاقة العميل. */
export function WalletRowActions({ onStatement, onOpenCard }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 192) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'mx-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 192, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-border bg-card py-1 shadow-2xl"
        >
          <button
            type="button"
            onClick={() => { onStatement(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('wallets.statement')}
          </button>
          <button
            type="button"
            onClick={() => { onOpenCard(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <CreditCard className="h-4 w-4 text-primary" />
            {t('wallets.openCard')}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
