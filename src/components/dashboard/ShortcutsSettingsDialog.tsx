import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, ArrowUp, ArrowDown, Check, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useShortcutsPrefs } from '@/lib/shortcutsPreferences';
import { useAvailableNavItems, type AvailableNavItem } from '@/lib/nav/useAvailableNavItems';

interface Props {
  onClose: () => void;
}

// ✅ يجب أن تتطابق هذه القيمة مع MAX_SHORTCUTS داخل ShortcutsBar.tsx
// تُعرض المختصرات في كروت بسعة 8 لكل كارت، فيتسع المجموع الأقصى لـ 4 كروت.
const MAX_SHORTCUTS = 32;

export function ShortcutsSettingsDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const { prefs, setItems, add, remove, move, has } = useShortcutsPrefs();
  const available = useAvailableNavItems();

  // الـ items المختارة بالترتيب الحالي للمستخدم، مع تخطّي مسارات لم تعد ضمن صلاحياته
  const selectedItems = useMemo(() => {
    const byPath = new Map(available.map(i => [i.to, i]));
    return prefs.items
      .map(p => byPath.get(p))
      .filter((x): x is AvailableNavItem => Boolean(x));
  }, [prefs.items, available]);

  // العناصر المتاحة مجمّعة حسب الـ group لاستعراض أسهل
  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; items: AvailableNavItem[] }>();
    for (const it of available) {
      const entry = map.get(it.groupKey);
      if (entry) entry.items.push(it);
      else map.set(it.groupKey, { title: it.groupTitle, items: [it] });
    }
    return Array.from(map.entries());
  }, [available]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const canAddMore = selectedItems.length < MAX_SHORTCUTS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('shortcuts.settingsTitle')}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {t('shortcuts.dialog.intro')}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 shrink-0 p-0" title={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-5 overflow-hidden p-5 md:flex-row">
          {/* المختارة (مرتّبة) */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t('shortcuts.dialog.selectedTitle')}
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  ({selectedItems.length} / {MAX_SHORTCUTS})
                </span>
              </h3>
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="text-xs text-destructive transition-colors hover:underline"
                  title={t('shortcuts.dialog.clearTitle')}
                >
                  {t('shortcuts.dialog.clear')}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-2">
              {selectedItems.length === 0 ? (
                <div className="flex h-full min-h-[140px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
                  {t('shortcuts.dialog.noneSelected')}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {selectedItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.to}
                        className="group flex items-center gap-2 rounded-md border border-border/40 bg-card/60 px-2.5 py-2 text-sm transition-colors hover:border-primary/30"
                      >
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        <Icon className="h-4 w-4 shrink-0 text-primary/80" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.label}</p>
                          <p className="truncate text-[10px] text-muted-foreground/70">{item.groupTitle}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => move(idx, idx - 1)}
                            disabled={idx === 0}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                            title={t('shortcuts.dialog.moveUp')}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(idx, idx + 1)}
                            disabled={idx === selectedItems.length - 1}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                            title={t('shortcuts.dialog.moveDown')}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.to)}
                            className="rounded p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title={t('shortcuts.dialog.removeItem')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* المتاحة (تصفّح) */}
          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-2 text-sm font-semibold text-foreground">{t('shortcuts.dialog.availableTitle')}</h3>
            <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-2">
              {grouped.length === 0 ? (
                <div className="flex h-full min-h-[140px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
                  {t('shortcuts.dialog.noneAvailable')}
                </div>
              ) : (
                grouped.map(([groupKey, { title, items }]) => (
                  <div key={groupKey}>
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {title}
                    </p>
                    <ul className="space-y-1">
                      {items.map(item => {
                        const Icon = item.icon;
                        const selected = has(item.to);
                        const disabled = !selected && !canAddMore;
                        return (
                          <li key={item.to}>
                            <button
                              type="button"
                              onClick={() => (selected ? remove(item.to) : add(item.to))}
                              disabled={disabled}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-right text-sm transition-colors',
                                selected
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border/40 bg-card/40 hover:border-primary/30 hover:bg-primary/5',
                                disabled && 'cursor-not-allowed opacity-40 hover:border-border/40 hover:bg-card/40'
                              )}
                              title={
                                disabled
                                  ? t('shortcuts.dialog.maxReached', { max: MAX_SHORTCUTS })
                                  : selected
                                  ? t('shortcuts.dialog.removeFromShortcuts')
                                  : t('shortcuts.dialog.addAsShortcut')
                              }
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="flex-1 truncate">{item.label}</span>
                              {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 bg-background/40 px-5 py-3">
          <p className="text-[11px] text-muted-foreground">
            {t('shortcuts.dialog.autoSaved')}
          </p>
          <Button onClick={onClose}>
            <Save className="h-4 w-4" />
            {t('shortcuts.dialog.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}
