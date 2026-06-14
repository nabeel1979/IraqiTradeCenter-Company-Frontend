import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings2, Plus, Sparkles, Wallet, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn, formatAmount } from '@/lib/utils';
import { useShortcutsPrefs } from '@/lib/shortcutsPreferences';
import { useAvailableNavItems, type AvailableNavItem } from '@/lib/nav/useAvailableNavItems';
import { ShortcutsSettingsDialog } from './ShortcutsSettingsDialog';
import { cashBoxesApi, type CashBoxBalanceDto } from '@/lib/api/cashBoxes';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { localizedAccountName } from '@/lib/i18n';
import { useLocale } from '@/lib/i18n/useLocale';
import { useActiveFiscalYear } from '@/hooks/useActiveFiscalYear';
import {
  writeSessionJson,
  ReportNavKeys,
  ACCOUNT_STATEMENT_PATH,
} from '@/lib/reportReturnState';

interface Props {
  className?: string;
}

// ✅ يجب أن تتطابق هذه القيمة مع MAX_SHORTCUTS داخل ShortcutsSettingsDialog.tsx
const MAX_SHORTCUTS = 32;
// عدد المختصرات لكل كارت — كلما امتلأ كارت يُفتح كارت جديد تلقائياً
const ITEMS_PER_CARD = 8;

const CARD_CLS = 'rounded-xl border border-border bg-card p-3.5 shadow-sm sm:p-4';
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
        'surface-tile group relative flex flex-col items-center justify-start gap-2 overflow-hidden rounded-lg px-2 py-3 text-center'
      )}
      title={`${item.groupTitle} — ${item.label}`}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20 transition-colors sm:h-10 sm:w-10',
          'group-hover:bg-primary/25 group-hover:ring-primary/35'
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
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/30 px-2 py-3 text-center transition-all',
        'hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary'
      )}
      title={t('shortcuts.addShortcut')}
      aria-label={t('shortcuts.addShortcut')}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/60 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary sm:h-10 sm:w-10">
        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="text-[11px] font-medium leading-tight text-muted-foreground transition-colors group-hover:text-primary sm:text-xs">
        {t('shortcuts.add')}
      </span>
    </button>
  );
}

// ─── قسم أرصدة الصناديق ─────────────────────────────────────────────────────

function CashBoxBalancesSection() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { cashBoxIds, isSuper, can } = usePermissions();
  const { defaultFromDate, defaultToDate } = useActiveFiscalYear();
  const canReadStatement = can(PERMS.Accounting.AccountStatement.Read);

  const balancesQuery = useQuery({
    queryKey: ['cash-box-balances-dashboard'],
    queryFn: () => cashBoxesApi.getBalances(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // جلب قائمة الصناديق للحصول على nameAr/nameEn
  const boxListQuery = useQuery({
    queryKey: ['cash-boxes', 'active'],
    queryFn: () => cashBoxesApi.getAll(true),
    staleTime: 60_000,
  });

  const rows = useMemo<CashBoxBalanceDto[]>(() => {
    if (!balancesQuery.data) return [];
    let src = balancesQuery.data;
    // فلترة بحسب صلاحيات المستخدم
    if (!isSuper && cashBoxIds.length > 0) {
      const allowed = new Set(cashBoxIds);
      src = src.filter(b => allowed.has(b.cashBoxId));
    }
    // ترتيب: بحسب cashBoxId ثم currency
    return [...src].sort((a, b) =>
      a.cashBoxId !== b.cashBoxId ? a.cashBoxId - b.cashBoxId : a.currency.localeCompare(b.currency)
    );
  }, [balancesQuery.data, cashBoxIds, isSuper]);

  // تجميع الأسطر بحسب الصندوق
  const grouped = useMemo(() => {
    const map = new Map<number, CashBoxBalanceDto[]>();
    for (const row of rows) {
      const list = map.get(row.cashBoxId) ?? [];
      list.push(row);
      map.set(row.cashBoxId, list);
    }
    return [...map.entries()];
  }, [rows]);

  if (grouped.length === 0) return null;

  const getBoxName = (cashBoxId: number): string => {
    const box = boxListQuery.data?.find(b => b.id === cashBoxId);
    if (!box) {
      // fallback: من nameAr في الصف الأول
      const row = rows.find(r => r.cashBoxId === cashBoxId);
      return row?.nameAr ?? String(cashBoxId);
    }
    return localizedAccountName(locale, box.nameAr, box.nameEn ?? '');
  };

  /** فتح كشف الحساب للصندوق المحدد مع تشغيل التقرير تلقائياً */
  const openStatement = (b: CashBoxBalanceDto) => {
    if (!canReadStatement) return;
    const today = new Date().toISOString().slice(0, 10);
    const accountName = localizedAccountName(locale, b.nameAr, b.accountName ?? '');
    writeSessionJson(ReportNavKeys.statementReturn, {
      from: defaultFromDate || '',
      to: defaultToDate || today,
      accountId: b.accountId,
      accountLabel: b.accountCode ? `${b.accountCode} - ${accountName}` : accountName,
      selectedCurrencies: b.currency ? [b.currency] : [],
      autoSubmit: true,
    });
    navigate(ACCOUNT_STATEMENT_PATH);
  };

  return (
    <section className={CARD_CLS} aria-label={t('dashboard.cashBoxBalances', { defaultValue: 'أرصدة الصناديق' })}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
            <Wallet className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-display text-sm font-semibold text-foreground sm:text-base">
            {t('dashboard.cashBoxBalances', { defaultValue: 'أرصدة الصناديق' })}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => balancesQuery.refetch()}
          disabled={balancesQuery.isFetching}
          className="rounded-lg border border-border/60 bg-card/60 p-1.5 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          title={t('common.refresh', { defaultValue: 'تحديث' })}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', balancesQuery.isFetching && 'animate-spin')} />
        </button>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {grouped.map(([cashBoxId, balances]) => (
          <div
            key={cashBoxId}
            className="rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
          >
            <div className="mb-1.5 text-xs font-semibold text-foreground/80 truncate" title={getBoxName(cashBoxId)}>
              {getBoxName(cashBoxId)}
            </div>
            <div className="space-y-1">
              {balances.map(b => {
                const isPos = b.balance > 0;
                const isNeg = b.balance < 0;
                const rowContent = (
                  <>
                    <span className="text-[11px] text-muted-foreground num-display">{b.currency}</span>
                    <div className="flex items-center gap-1">
                      {isPos
                        ? <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                        : isNeg
                          ? <TrendingDown className="h-3 w-3 text-rose-400 shrink-0" />
                          : <Minus className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                      <span className={cn(
                        'num-display text-sm font-bold',
                        isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-muted-foreground'
                      )}>
                        {isNeg && <span className="text-rose-400">−</span>}
                        {formatAmount(Math.abs(b.balance))}
                      </span>
                    </div>
                  </>
                );
                if (!canReadStatement) {
                  return (
                    <div key={b.currency} className="flex items-center justify-between gap-2">
                      {rowContent}
                    </div>
                  );
                }
                return (
                  <button
                    key={b.currency}
                    type="button"
                    onClick={() => openStatement(b)}
                    title={t('dashboard.openCashBoxStatement', { defaultValue: 'فتح كشف حساب الصندوق' })}
                    className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-primary/[0.06]"
                  >
                    {rowContent}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
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
  const { t } = useTranslation();
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
        <section className={CARD_CLS} aria-label={t('shortcuts.title')}>
          <header className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="truncate font-display text-sm font-semibold text-foreground sm:text-base">
                {t('shortcuts.title')}
              </h2>
              {hasItems && (
                <span
                  className="num-display shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title={t('shortcuts.itemsCount', { count: items.length })}
                >
                  {items.length}
                </span>
              )}
              {totalCards > 1 && (
                <span
                  className="hidden text-[10px] text-muted-foreground/70 sm:inline"
                  title={t('shortcuts.cardsCount', { count: totalCards })}
                >
                  {t('shortcuts.cardsCountDot', { count: totalCards })}
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
              title={t('shortcuts.settingsTitle')}
              aria-label={t('shortcuts.settingsTitle')}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('shortcuts.settings')}</span>
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
                {t('shortcuts.empty.title')}
              </span>
              <span className="max-w-md text-xs leading-relaxed text-muted-foreground">
                {t('shortcuts.empty.description')}
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
              aria-label={t('shortcuts.cardAriaLabel', { n: idx + 2 })}
            >
              <div className={GRID_CLS}>{chunk.map(renderTile)}</div>
            </section>
          ))}
      </div>

      {open && <ShortcutsSettingsDialog onClose={() => setOpen(false)} />}

      {/* ─── أرصدة الصناديق ─── */}
      <CashBoxBalancesSection />
    </>
  );
}
