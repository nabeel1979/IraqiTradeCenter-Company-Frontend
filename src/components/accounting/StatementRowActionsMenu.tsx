import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Eye, FileText, Receipt, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/useLocale';

interface Props {
  entryNumber: string;
  /** نص توضيحي لأصل القيد (يدوي/فاتورة بيع/...) */
  sourceLabel: string;
  /** رابط أصل القيد. إذا كان null يُعطّل الخيار الثاني */
  sourceHref: string | null;
  /** يُستدعى عند اختيار "عرض القيد" (popup) */
  onView: () => void;
  /** يُستدعى عند اختيار "أصل القيد" — يوفّر href مع خيار التنقل */
  onOpenSource: () => void;
}

/**
 * زر العين الذي يفتح قائمة منبثقة فيها خياران:
 *   1) عرض القيد (نافذة منبثقة للقراءة فقط)
 *   2) أصل القيد (تنقّل إلى القيد نفسه أو الفاتورة المصدر للتحرير)
 *
 * يستخدم Portal لتجاوز قص العناصر بسبب overflow الجدول.
 */
export function StatementRowActionsMenu({
  entryNumber,
  sourceLabel,
  sourceHref,
  onView,
  onOpenSource,
}: Props) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const computePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = 200;
    const margin = 6;
    let left = isRtl ? rect.right - menuW : rect.left;
    if (left < margin) left = margin;
    if (left + menuW > window.innerWidth - margin) left = window.innerWidth - menuW - margin;
    const top = rect.bottom + 4;
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, isRtl]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleView = () => {
    setOpen(false);
    onView();
  };

  const handleSource = () => {
    if (!sourceHref) return;
    setOpen(false);
    onOpenSource();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title={t('accountStatement.rowActions.menuTitle', { num: entryNumber })}
        aria-label={t('accountStatement.rowActions.ariaLabel')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground transition-colors',
          'hover:bg-primary/10 hover:text-primary',
          open && 'bg-primary/10 text-primary'
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 200 }}
          className="z-[60] overflow-hidden rounded-md border border-border bg-popover/95 shadow-2xl backdrop-blur"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleView}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground transition-colors hover:bg-primary/10 hover:text-primary',
              isRtl ? 'text-right' : 'text-left'
            )}
          >
            <FileText className="h-3.5 w-3.5 text-primary" />
            <div className="flex-1">
              <div className="font-medium">{t('accountStatement.rowActions.viewEntry')}</div>
              <div className="text-[10px] text-muted-foreground">{t('accountStatement.rowActions.viewEntryHint')}</div>
            </div>
          </button>
          <div className="h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSource}
            disabled={!sourceHref}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors',
              isRtl ? 'text-right' : 'text-left',
              sourceHref
                ? 'text-foreground hover:bg-amber-500/10 hover:text-amber-300'
                : 'cursor-not-allowed text-muted-foreground/40'
            )}
          >
            <Receipt className="h-3.5 w-3.5 text-amber-400" />
            <div className="flex-1">
              <div className="font-medium">{t('accountStatement.rowActions.openSource')}</div>
              <div className="text-[10px] text-muted-foreground">{sourceLabel}</div>
            </div>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
