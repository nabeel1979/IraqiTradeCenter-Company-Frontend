import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Receipt, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n/useLocale';

interface Props {
  entryNumber: string;
  /** نص توضيحي لأصل القيد (يدوي/فاتورة بيع/...) */
  sourceLabel: string;
  /** وصف مختصر لنوع أصل القيد (يدوي / افتتاحي / فاتورة...) */
  sourceHref?: string | null;
  /** تعطيل «أصل القيد» — الافتراضي: مُفعَّل */
  sourceDisabled?: boolean;
  /** يُستدعى عند اختيار "عرض القيد" (popup) */
  onView: () => void;
  /** يُستدعى عند اختيار "أصل القيد" */
  onOpenSource: () => void;
  onOpenChange?: (open: boolean) => void;
}

/**
 * زر الإجراءات (⋮) الذي يفتح قائمة منبثقة:
 *   1) عرض القيد (نافذة منبثقة للقراءة فقط)
 *   2) أصل القيد (تنقّل إلى السند/الفاتورة/المناقلة المصدر للتحرير)
 */
export function StatementRowActionsMenu({
  entryNumber,
  sourceLabel,
  sourceHref: _sourceHref,
  sourceDisabled = false,
  onView,
  onOpenSource,
  onOpenChange,
}: Props) {
  const allowOpenSource = !sourceDisabled;
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
    const menuW = 220;
    const margin = 8;
    let left = isRtl ? rect.right - menuW : rect.left;
    left = Math.min(Math.max(left, margin), window.innerWidth - menuW - margin);
    setPos({ top: rect.bottom + 4, left });
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
    const onClick = (e: MouseEvent | TouchEvent) => {
      const target = ('touches' in e ? e.touches[0]?.target : e.target) as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      if (target && triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick as EventListener);
    document.addEventListener('touchstart', onClick as EventListener, { passive: true });
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick as EventListener);
      document.removeEventListener('touchstart', onClick as EventListener);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

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
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
          'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          open && 'bg-secondary/80 text-foreground',
        )}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 220, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-border bg-popover/95 shadow-2xl backdrop-blur-sm"
        >
          <div className="border-b border-border/50 px-3 py-1.5">
            <span className="num-display text-[11px] font-semibold text-muted-foreground">
              # {entryNumber}
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onView(); }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2.5 text-xs text-foreground transition-colors hover:bg-primary/10 hover:text-primary',
              isRtl ? 'text-right' : 'text-left',
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t('accountStatement.rowActions.viewEntry')}</div>
              <div className="truncate text-[10px] text-muted-foreground">{t('accountStatement.rowActions.viewEntryHint')}</div>
            </div>
          </button>
          <div className="h-px bg-border/50" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (!allowOpenSource) return;
              setOpen(false);
              onOpenSource();
            }}
            disabled={!allowOpenSource}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2.5 text-xs transition-colors',
              isRtl ? 'text-right' : 'text-left',
              allowOpenSource
                ? 'text-foreground hover:bg-amber-500/10 hover:text-amber-300'
                : 'cursor-not-allowed text-muted-foreground/40',
            )}
          >
            <Receipt className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t('accountStatement.rowActions.openSource')}</div>
              <div className="truncate text-[10px] text-muted-foreground">{sourceLabel}</div>
            </div>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
