import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShortcutsPrefs } from '@/lib/shortcutsPreferences';
import { useAvailableNavItems, type AvailableNavItem } from '@/lib/nav/useAvailableNavItems';
import { ShortcutsSettingsDialog } from './ShortcutsSettingsDialog';

interface Props {
  className?: string;
}

// ✅ يجب أن تتطابق هذه القيمة مع MAX_SHORTCUTS داخل ShortcutsSettingsDialog.tsx
const MAX_SHORTCUTS = 32;
// عدد المختصرات لكل كارت — كلما امتلأ كارت يُفتح كارت جديد تلقائياً
const ITEMS_PER_CARD = 8;

const CARD_CLS = 'rounded-xl border border-border/60 bg-card/40 p-3.5 sm:p-4';
const GRID_CLS =
  'grid gap-2 sm:gap-2.5 grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8';

type Tile =
  | { kind: 'nav'; item: AvailableNavItem }
  | { kind: 'add' };

function NavTile({ item }: { item: AvailableNavItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        'group relative flex flex-col items-center justify-start gap-2 overflow-hidden rounded-lg border border-border/60 bg-card/70 px-2 py-3 text-center transition-all',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-md'
      )}
      title={`${item.groupTitle} — ${item.label}`}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors sm:h-10 sm:w-10',
          'group-hover:bg-primary/15'
        )}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-foreground/90 sm:text-xs">
        {item.label}
      </span>
    </Link>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/30 px-2 py-3 text-center transition-all',
        'hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary'
      )}
      title="إضافة مختصر"
      aria-label="إضافة مختصر"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/60 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary sm:h-10 sm:w-10">
        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="text-[11px] font-medium leading-tight text-muted-foreground transition-colors group-hover:text-primary sm:text-xs">
        إضافة
      </span>
    </button>
  );
}

/**
 * شريط المختصرات السريعة في لوحة القيادة.
 *
 * - الكارت الأول يحتوي الترويسة (عنوان + عدّاد + زرّ إعداد).
 *   ثم شبكة tiles بسعة {@link ITEMS_PER_CARD}.
 * - كلما تجاوز عدد المختصرات سعة كارت، يُفتح كارت جديد تحته
 *   يحتوي شبكة tiles فقط (بدون ترويسة) — حتى الحد الأقصى {@link MAX_SHORTCUTS}.
 * - tile «إضافة» يظهر تلقائياً في نهاية آخر كارت ما دامت المساحة متاحة.
 * - أي مختصر فقدت صلاحيته يُتخطّى دون حذفه من الإعدادات.
 */
export function ShortcutsBar({ className }: Props) {
  const { prefs } = useShortcutsPrefs();
  const available = useAvailableNavItems();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const byPath = new Map(available.map(i => [i.to, i]));
    return prefs.items
      .map(p => byPath.get(p))
      .filter((x): x is AvailableNavItem => Boolean(x));
  }, [prefs.items, available]);

  const hasItems = items.length > 0;
  const canAddMore = items.length < MAX_SHORTCUTS;

  // قائمة عناصر العرض = العناصر المختارة + tile «إضافة» في النهاية (لو في مساحة)
  const tiles = useMemo<Tile[]>(() => {
    const arr: Tile[] = items.map(item => ({ kind: 'nav', item }));
    if (hasItems && canAddMore) arr.push({ kind: 'add' });
    return arr;
  }, [items, hasItems, canAddMore]);

  // تقسيم إلى كروت بحجم ITEMS_PER_CARD
  const chunks = useMemo(() => {
    if (tiles.length === 0) return [] as Tile[][];
    const out: Tile[][] = [];
    for (let i = 0; i < tiles.length; i += ITEMS_PER_CARD) {
      out.push(tiles.slice(i, i + ITEMS_PER_CARD));
    }
    return out;
  }, [tiles]);

  const totalCards = Math.max(1, chunks.length);

  const renderTile = (t: Tile, i: number) =>
    t.kind === 'nav' ? (
      <NavTile key={t.item.to} item={t.item} />
    ) : (
      <AddTile key={`add-${i}`} onClick={() => setOpen(true)} />
    );

  return (
    <>
      <div className={cn('space-y-2.5', className)}>
        {/* ─── الكارت الرئيسي (دائماً موجود) ─── */}
        <section className={CARD_CLS} aria-label="المختصرات السريعة">
          <header className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="truncate font-display text-sm font-semibold text-foreground sm:text-base">
                المختصرات السريعة
              </h2>
              {hasItems && (
                <span
                  className="num-display shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title={`${items.length} مختصر`}
                >
                  {items.length}
                </span>
              )}
              {totalCards > 1 && (
                <span
                  className="hidden text-[10px] text-muted-foreground/70 sm:inline"
                  title={`${totalCards} كروت`}
                >
                  · {totalCards} كروت
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all',
                'hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
              )}
              title="إعداد المختصرات"
              aria-label="إعداد المختصرات"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">إعداد</span>
            </button>
          </header>

          {hasItems ? (
            <div className={GRID_CLS}>{chunks[0].map(renderTile)}</div>
          ) : (
            // حالة فارغة — empty state وسط الكارت
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                'group flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-6 text-center transition-all',
                'hover:border-primary/50 hover:bg-primary/[0.07]'
              )}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                إعداد المختصرات السريعة
              </span>
              <span className="max-w-md text-xs leading-relaxed text-muted-foreground">
                اختر الصفحات التي تستخدمها أكثر للوصول إليها بنقرة واحدة من لوحة القيادة
              </span>
            </button>
          )}
        </section>

        {/* ─── كروت إضافية — تُفتح تلقائياً كلما تجاوزت المختصرات سعة كارت ─── */}
        {hasItems &&
          chunks.slice(1).map((chunk, idx) => (
            <section
              key={`shortcuts-card-${idx + 1}`}
              className={CARD_CLS}
              aria-label={`المختصرات السريعة — كارت ${idx + 2}`}
            >
              <div className={GRID_CLS}>{chunk.map(renderTile)}</div>
            </section>
          ))}
      </div>

      {open && <ShortcutsSettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
