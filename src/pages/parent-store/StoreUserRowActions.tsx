import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Eye, MoreVertical, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoreUserRow } from '@/lib/api/storeParent';

interface StoreUserRowActionsProps {
  onView: () => void;
  onEdit: () => void;
  canManage: boolean;
}

export function StoreUserRowActions({ onView, onEdit, canManage }: StoreUserRowActionsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 176) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node)
        || btnRef.current?.contains(e.target as Node)
      ) return;
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
        title={t('storeParent.col.action')}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 176, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl py-1 animate-slide-up"
        >
          <button
            type="button"
            onClick={() => { onView(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Eye className="h-4 w-4" />
            {t('storeParent.viewUser')}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => { onEdit(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Pencil className="h-4 w-4" />
              {t('storeParent.editUser')}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export type StoreUserDialogState =
  | { user: StoreUserRow; mode: 'view' | 'edit' }
  | null;
