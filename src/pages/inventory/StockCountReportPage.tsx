import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ClipboardList, Printer, Search, Activity, Boxes, Package, Warehouse as WarehouseIcon, RefreshCw,
  MoreVertical, IdCard, TrendingUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { inventoryApi, type ItemStockCountRowDto } from '@/lib/api/inventory';
import { companySettingsApi } from '@/lib/api/companySettings';
import { formatAmount, cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';
import { printStockCount, type StockCountPrintRow } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';

interface RunKey {
  warehouseId: number | '';
  categoryId: number | '';
  search: string;
  includeZero: boolean;
  itemId?: number;
}

export function StockCountReportPage() {
  const { locale } = useLocale();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [recalcing, setRecalcing] = useState(false);
  const tt = (ar: string, en: string) => (locale === 'en' ? en : ar);

  // ── قائمة الإجراءات (Portal) ──
  interface RowMenu { itemId: number; itemName: string; itemCode: string; x: number; y: number; }
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);

  const openRowMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>, itemId: number, itemName: string, itemCode: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const spaceOnRight = window.innerWidth - rect.right;
    const x = spaceOnRight >= menuWidth ? rect.right - menuWidth : rect.left;
    setRowMenu({ itemId, itemName, itemCode, x, y: rect.bottom + 4 });
  }, []);

  const openItemCard = (itemId: number) => { setRowMenu(null); navigate(`/inventory/${itemId}`); };
  const openItemMovements = (itemId: number, itemName: string, itemCode: string) => {
    setRowMenu(null);
    navigate(`/inventory/movements?itemId=${itemId}&itemCode=${encodeURIComponent(itemCode)}&itemName=${encodeURIComponent(itemName)}`);
  };

  // ── وضع «مادة واحدة» عند القدوم من بطاقة المادة (?itemId=&itemName=)
  const scopedItemId = useMemo(() => {
    const v = Number(searchParams.get('itemId'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }, [searchParams]);
  const scopedItemName = searchParams.get('itemName') ?? undefined;

  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [includeZero, setIncludeZero] = useState(false);
  const [runKey, setRunKey] = useState<RunKey | null>(null);

  // تشغيل تلقائي عند تحديد مادة من بطاقة المادة
  useEffect(() => {
    if (scopedItemId) {
      setIncludeZero(true);
      setRunKey({ warehouseId: '', categoryId: '', search: '', includeZero: true, itemId: scopedItemId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedItemId]);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-manage'],
    queryFn: inventoryApi.listWarehousesManage,
    staleTime: 5 * 60 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories-manage'],
    queryFn: inventoryApi.listCategoriesManage,
    staleTime: 5 * 60 * 1000,
  });

  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  const countQuery = useQuery({
    queryKey: ['stock-count-report', runKey],
    queryFn: () =>
      inventoryApi.getStockCount({
        warehouseId: runKey!.warehouseId ? Number(runKey!.warehouseId) : undefined,
        categoryId: runKey!.categoryId ? Number(runKey!.categoryId) : undefined,
        search: runKey!.search.trim() || undefined,
        includeZero: runKey!.includeZero,
        itemId: runKey!.itemId,
      }),
    enabled: !!runKey,
  });

  const rows = countQuery.data ?? [];

  const summary = useMemo(() => {
    const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
    const totalCost = rows.reduce((s, r) => s + (r.totalCost ?? 0), 0);
    const itemCount = new Set(rows.map(r => r.itemId)).size;
    return { totalQuantity, totalCost, itemCount };
  }, [rows]);

  const warehouseLabel = useMemo(() => {
    if (!warehouseId) return tt('كل المستودعات', 'All warehouses');
    const w = warehousesQuery.data?.find(x => x.id === Number(warehouseId));
    return w ? (locale === 'en' ? w.nameEn || w.nameAr : w.nameAr) : '';
  }, [warehouseId, warehousesQuery.data, locale]);

  const categoryLabel = useMemo(() => {
    if (!categoryId) return undefined;
    const c = categoriesQuery.data?.categories.find(x => x.id === Number(categoryId));
    return c ? (locale === 'en' ? c.nameEn || c.nameAr : c.nameAr) : undefined;
  }, [categoryId, categoriesQuery.data, locale]);

  const handleRun = () => setRunKey({ warehouseId, categoryId, search, includeZero, itemId: scopedItemId });

  const handleRecalc = async () => {
    if (!window.confirm(tt(
      'سيُعاد احتساب أرصدة جميع المواد من سجل الحركات (الفواتير). هل تريد المتابعة؟',
      'All item balances will be recalculated from the movement ledger (invoices). Continue?',
    ))) return;
    setRecalcing(true);
    try {
      const r = await inventoryApi.recalcStock();
      await qc.invalidateQueries({ queryKey: ['stock-count-report'] });
      if (runKey) await countQuery.refetch();
      window.alert(tt(
        `تمت المعالجة. إجمالي المواد: ${r?.totalItems ?? 0} — المواد المُصحّحة: ${r?.changedCount ?? 0}`,
        `Done. Total items: ${r?.totalItems ?? 0} — Corrected: ${r?.changedCount ?? 0}`,
      ));
    } catch {
      window.alert(tt('فشلت معالجة الأرصدة', 'Balance recalculation failed'));
    } finally {
      setRecalcing(false);
    }
  };

  const handlePrint = () => {
    const printRows: StockCountPrintRow[] = rows.map(r => ({
      code: r.itemCode,
      name: locale === 'en' ? r.itemNameEn || r.itemName : r.itemName,
      category: locale === 'en' ? r.categoryNameEn || r.categoryName || null : r.categoryName || null,
      warehouse: locale === 'en' ? r.warehouseNameEn || r.warehouseName : r.warehouseName,
      unit: locale === 'en' ? r.baseUnitNameEn || r.baseUnitName : r.baseUnitName,
      quantity: r.quantity,
    }));
    printStockCount(
      {
        warehouseLabel,
        categoryLabel,
        search: runKey?.search.trim() || undefined,
        rows: printRows,
        totalQuantity: summary.totalQuantity,
        itemCount: summary.itemCount,
      },
      companyQuery.data ?? null,
      locale,
    );
    void auditApi.logPrint({
      entityType: 'StockCountReport',
      entityId: '*',
      summary: tt('طباعة جرد المخزون', 'Print inventory count'),
      details: { warehouse: warehouseLabel, category: categoryLabel || null, rowCount: rows.length },
    });
  };

  return (
    <div className="space-y-4">
      {/* ── الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{tt('تقرير جرد المخزون', 'Inventory Count Report')}</h1>
            <p className="text-xs text-muted-foreground">
              {scopedItemName
                ? tt(`جرد المادة: ${scopedItemName}`, `Stock for: ${scopedItemName}`)
                : tt('أرصدة المواد الحالية موزّعة على المستودعات بوحدة الجرد', 'Current item balances per warehouse, in inventory units')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleRecalc} disabled={recalcing}
            title={tt('إعادة احتساب أرصدة كل المواد من سجل الحركات', 'Recalculate all item balances from the ledger')}>
            <RefreshCw className={cn('h-4 w-4', recalcing && 'animate-spin')} /> {tt('معالجة الأرصدة', 'Recalc balances')}
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handlePrint} disabled={!rows.length}>
            <Printer className="h-4 w-4" /> {tt('طباعة', 'Print')}
          </Button>
        </div>
      </div>

      {/* ── شريط الفلاتر */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
            <div>
              <Label className="mb-1 block text-xs">{tt('المستودع', 'Warehouse')}</Label>
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : '')}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{tt('كل المستودعات', 'All warehouses')}</option>
                {warehousesQuery.data?.map(w => (
                  <option key={w.id} value={w.id}>{locale === 'en' ? w.nameEn || w.nameAr : w.nameAr}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1 block text-xs">{tt('التصنيف', 'Category')}</Label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{tt('كل التصنيفات', 'All categories')}</option>
                {categoriesQuery.data?.categories.map(c => (
                  <option key={c.id} value={c.id}>{locale === 'en' ? c.nameEn || c.nameAr : c.nameAr}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="mb-1 block text-xs">{tt('بحث (اسم/رمز المادة)', 'Search (name/code)')}</Label>
              <div className="relative">
                <Search className="absolute top-1/2 -translate-y-1/2 text-muted-foreground ltr:left-2.5 rtl:right-2.5 h-4 w-4" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRun(); }}
                  placeholder={tt('بحث…', 'Search…')}
                  className="h-9 ltr:pl-8 rtl:pr-8"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={includeZero} onChange={e => setIncludeZero(e.target.checked)} className="h-3.5 w-3.5" />
              {tt('إظهار المواد ذات الرصيد صفر', 'Include zero-balance items')}
            </label>
            <Button size="sm" className="h-9 gap-1.5" onClick={handleRun}>
              <Activity className="h-4 w-4" /> {tt('تشغيل التقرير', 'Run report')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── النتائج */}
      {!runKey ? (
        <Card><CardContent className="py-16">
          <EmptyState icon={ClipboardList} title={tt('حدّد الفلاتر ثم اضغط «تشغيل التقرير»', 'Set filters then click “Run report”')} />
        </CardContent></Card>
      ) : countQuery.isLoading ? (
        <Card><CardContent className="py-16 text-center"><LoadingSpinner /></CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryBox icon={Boxes} label={tt('عدد السطور', 'Rows')} value={String(rows.length)} />
            <SummaryBox icon={Package} label={tt('عدد المواد', 'Items')} value={String(summary.itemCount)} />
            <SummaryBox icon={Activity} label={tt('إجمالي الكمية', 'Total Qty')} value={formatAmount(summary.totalQuantity, 2)} />
          </div>

          <Card>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="py-16">
                  <EmptyState icon={WarehouseIcon} title={tt('لا توجد بيانات مطابقة', 'No matching data')} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr className="text-muted-foreground">
                        <Th>#</Th>
                        <Th>{tt('الرمز', 'Code')}</Th>
                        <Th>{tt('المادة', 'Item')}</Th>
                        <Th>{tt('التصنيف', 'Category')}</Th>
                        <Th>{tt('المستودع', 'Warehouse')}</Th>
                        <Th center>{tt('الكمية', 'Quantity')}</Th>
                        <Th center>{tt('وحدة الجرد', 'Unit')}</Th>
                        <Th center>{tt('التكلفة', 'Cost')}</Th>
                        <Th center>{tt('الإجراءات', 'Actions')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r: ItemStockCountRowDto, idx) => (
                        <tr key={`${r.itemId}-${r.warehouseId}`} className="border-t border-border/40 hover:bg-accent/30">
                          <td className="px-2 py-1.5 text-center text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-1.5 num-display font-medium text-emerald-600">{r.itemCode}</td>
                          <td className="px-2 py-1.5">{locale === 'en' ? r.itemNameEn || r.itemName : r.itemName}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{(locale === 'en' ? r.categoryNameEn || r.categoryName : r.categoryName) ?? '—'}</td>
                          <td className="px-2 py-1.5">{locale === 'en' ? r.warehouseNameEn || r.warehouseName : r.warehouseName}</td>
                          <td className={cn('px-2 py-1.5 text-center num-display font-bold', r.quantity < 0 && 'text-rose-600')}>{formatAmount(r.quantity, 2)}</td>
                          <td className="px-2 py-1.5 text-center">{locale === 'en' ? r.baseUnitNameEn || r.baseUnitName : r.baseUnitName}</td>
                          <td className="px-2 py-1.5 text-center num-display" title={tt(`تكلفة الوحدة: ${formatAmount(r.unitCost, 2)}`, `Unit cost: ${formatAmount(r.unitCost, 2)}`)}>{formatAmount(r.totalCost, 2)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
                              onClick={e => openRowMenu(e, r.itemId, locale === 'en' ? r.itemNameEn || r.itemName : r.itemName, r.itemCode)}
                              title={tt('إجراءات', 'Actions')}
                            >
                              <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 font-semibold">
                        <td className="px-2 py-2 text-center" colSpan={5}>{tt('الإجمالي', 'Total')}</td>
                        <td className="px-2 py-2 text-center num-display">{formatAmount(summary.totalQuantity, 2)}</td>
                        <td />
                        <td className="px-2 py-2 text-center num-display">{formatAmount(summary.totalCost, 2)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {rowMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div
            className="fixed z-50 w-[190px] overflow-hidden rounded-lg border bg-popover py-1 shadow-xl"
            style={{ left: rowMenu.x, top: rowMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
              onClick={() => openItemCard(rowMenu.itemId)}
            >
              <IdCard className="h-4 w-4 text-primary" /> {tt('فتح بطاقة المادة', 'Open item card')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
              onClick={() => openItemMovements(rowMenu.itemId, rowMenu.itemName, rowMenu.itemCode)}
            >
              <TrendingUp className="h-4 w-4 text-primary" /> {tt('حركة المادة', 'Item movement')}
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function SummaryBox({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold num-display">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th className={cn('px-2 py-2 font-medium', center ? 'text-center' : 'text-right')}>{children}</th>;
}
