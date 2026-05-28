import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Settings2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShortcutsPrefs } from '@/lib/shortcutsPreferences';
import { useAvailableNavItems, type AvailableNavItem } from '@/lib/nav/useAvailableNavItems';
import { ShortcutsSettingsDialog } from './ShortcutsSettingsDialog';

function NavTile({ item, onClose }: { item: AvailableNavItem; onClose: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClose}
      className={cn(
        'surface-tile group relative flex flex-col items-center justify-start gap-1.5 overflow-hidden rounded-lg px-1.5 py-2.5 text-center'
      )}
      title={`${item.groupTitle} — ${item.label}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20 transition-colors group-hover:bg-primary/25 group-hover:ring-primary/35">
        <Icon className="h-4 w-4" />
      </span>
      <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-foreground/90">
        {item.label}
      </span>
    </Link>
  );
}

/**
 * زر + Dropdown للمختصرات السريعة — يُوضع في TopBar.
 * الـ panel يعرض الشبكة كاملة + زر الإعداد.
 */
export function ShortcutsDropdown() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { prefs } = useShortcutsPrefs();
  const available = useAvailableNavItems();

  const items = useMemo(() => {
    const byPath = new Map(available.map(i => [i.to, i]));
    return prefs.items
      .map(p => byPath.get(p))
      .filter((x): x is AvailableNavItem => Boolean(x));
  }, [prefs.items, available]);

  // إغلاق عند النقر خارج الـ panel
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // إغلاق عند ضغط Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  return (
    <>
      <div ref={containerRef} className="relative">
        {/* ─── زر التفعيل ─── */}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          title={t('shortcuts.title')}
          aria-label={t('shortcuts.title')}
          aria-expanded={open}
          className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors',
            'hover:bg-secondary hover:text-primary',
            open && 'border-primary/40 bg-primary/10 text-primary'
          )}
        >
          <Sparkles className="h-4 w-4" />
          {items.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {items.length > 9 ? '9+' : items.length}
            </span>
          )}
        </button>

        {/* ─── Panel ─── */}
        {open && (
          <div
            className={cn(
              'absolute left-0 top-[calc(100%+8px)] z-50 w-72 sm:w-80',
              'rounded-xl border border-border bg-card shadow-xl shadow-black/10 dark:shadow-black/30',
              'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150'
            )}
          >
            {/* رأس الـ panel */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-semibold text-foreground">{t('shortcuts.title')}</span>
                {items.length > 0 && (
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {items.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setSettingsOpen(true); setOpen(false); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  title={t('shortcuts.settingsTitle')}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-secondary"
                  title={t('common.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* محتوى الـ panel */}
            <div className="p-3">
              {items.length > 0 ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {items.map(item => (
                    <NavTile key={item.to} item={item} onClose={() => setOpen(false)} />
                  ))}
                  {/* زر الإضافة دائماً في الآخر */}
                  <button
                    type="button"
                    onClick={() => { setSettingsOpen(true); setOpen(false); }}
                    className={cn(
                      'group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-card/30 px-1.5 py-2.5 text-center transition-all',
                      'hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary'
                    )}
                    title={t('shortcuts.addShortcut')}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                      <Plus className="h-4 w-4" />
                    </span>
                    <span className="text-[10px] font-medium leading-tight text-muted-foreground transition-colors group-hover:text-primary">
                      {t('shortcuts.add')}
                    </span>
                  </button>
                </div>
              ) : (
                /* حالة فارغة */
                <button
                  type="button"
                  onClick={() => { setSettingsOpen(true); setOpen(false); }}
                  className={cn(
                    'group flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-5 text-center transition-all',
                    'hover:border-primary/50 hover:bg-primary/[0.07]'
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{t('shortcuts.settingsTitle')}</span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('shortcuts.empty.description')}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {settingsOpen && <ShortcutsSettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
