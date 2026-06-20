import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Scale, Search, RefreshCw, MoreVertical, IdCard, TrendingUp, ClipboardList,
  Building2, Wallet, AlertTriangle, Loader2, CheckCircle2, X, Calculator,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { AccountPicker } from '@/components/accounting/AccountPicker';
import { inventoryApi } from '@/lib/api/inventory';
import { accountingApi } from '@/lib/api/accounting';
import { currenciesApi } from '@/lib/api/currencies';
import { costReconciliationApi, type CostReconRow, type CostReconWarehouse } from '@/lib/api/costReconciliation';
import { formatAmountFixed2, cn, extractApiError } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';
import type { AccountDto } from '@/types/api';
import { InvoiceInventoryBackButton } from '@/pages/invoices/components/InvoiceInventoryBackButton';

function flattenLeafAccounts(tree: AccountDto[]): AccountDto[] {
  const out: AccountDto[] = [];
  const walk = (nodes: AccountDto[]) => {
    for (const n of nodes) {
      if (n.isLeaf) out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

const rowKey = (r: { itemId: number; warehouseId: number }) => `${r.itemId}-${r.warehouseId}`;

interface AppliedFilters {
  warehouseId: number | '';
  categoryId: number | '';
  search: string;
  includeZero: boolean;
}

export function MaterialCostProcessingPage() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tt = (ar: string, en: string) => (locale === 'en' ? en : ar);

  // ── الفلاتر ──
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [includeZero, setIncludeZero] = useState(false);
  const [applied, setApplied] = useState<AppliedFilters>({ warehouseId: '', categoryId: '', search: '', includeZero: false });

  // ── رأس المعالجة ──
  const [currency, setCurrency] = useState('');
  const [settlementAccountId, setSettlementAccountId] = useState<number | null>(null);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editedCosts, setEditedCosts] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── قائمة إجراءات الصف (Portal) ──
  interface RowMenu { itemId: number; itemName: string; itemCode: string; x: number; y: number; }
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  const openRowMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>, itemId: number, itemName: string, itemCode: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    const spaceOnRight = window.innerWidth - rect.right;
    const x = spaceOnRight >= menuWidth ? rect.right - menuWidth : rect.left;
    setRowMenu({ itemId, itemName, itemCode, x, y: rect.bottom + 4 });
  }, []);
  const openItemCard = (itemId: number) => { setRowMenu(null); navigate(`/inventory/${itemId}`); };
  const openItemMovements = (itemId: number, itemName: string, itemCode: string) => {
    setRowMenu(null);
    navigate(`/inventory/movements?itemId=${itemId}&itemCode=${encodeURIComponent(itemCode)}&itemName=${encodeURIComponent(itemName)}`);
  };
  const openStockCount = (itemId: number, itemName: string, itemCode: string) => {
    setRowMenu(null);
    navigate(`/inventory/stock-count?itemId=${itemId}&itemCode=${encodeURIComponent(itemCode)}&itemName=${encodeURIComponent(itemName)}&returnTo=${encodeURIComponent('/invoices/cost-processing')}&returnLabel=${encodeURIComponent(tt('معالجة تكاليف المواد', 'Material cost processing'))}`);
  };

  // ── البيانات المرجعية ──
  const warehousesQuery = useQuery({ queryKey: ['warehouses-manage'], queryFn: inventoryApi.listWarehousesManage, staleTime: 5 * 60 * 1000 });
  const categoriesQuery = useQuery({ queryKey: ['categories-manage'], queryFn: inventoryApi.listCategoriesManage, staleTime: 5 * 60 * 1000 });
  const treeQuery = useQuery({ queryKey: ['accounts', 'tree'], queryFn: accountingApi.getTree, staleTime: 5 * 60 * 1000 });
  const leafAccounts = useMemo(() => (treeQuery.data ? flattenLeafAccounts(treeQuery.data) : []), [treeQuery.data]);
  const currenciesQuery = useQuery({
    queryKey: ['currencies', 'enabled'],
    queryFn: () => currenciesApi.getAll(true),
    staleTime: 10 * 60 * 1000,
  });
  const baseCurrency = useMemo(() => currenciesQuery.data?.find(c => c.isBase) ?? currenciesQuery.data?.[0] ?? null, [currenciesQuery.data]);
  const effectiveCurrency = currency || baseCurrency?.code || 'IQD';

  // ── بيانات المطابقة ──
  const reconQuery = useQuery({
    queryKey: ['cost-reconciliation', applied],
    queryFn: () => costReconciliationApi.get({
      warehouseId: applied.warehouseId ? Number(applied.warehouseId) : undefined,
      categoryId: applied.categoryId ? Number(applied.categoryId) : undefined,
      search: applied.search.trim() || undefined,
      includeZero: applied.includeZero,
    }),
  });

  const rows = reconQuery.data?.rows ?? [];
  const warehouses = reconQuery.data?.warehouses ?? [];

  const handleRun = () => setApplied({ warehouseId, categoryId, search, includeZero });

  const newCostFor = useCallback((r: CostReconRow) => {
    const raw = editedCosts[rowKey(r)];
    if (raw == null || raw.trim() === '') return r.unitCost;
    const n = Number(raw);
    return Number.isFinite(n) ? n : r.unitCost;
  }, [editedCosts]);

  // ── حساب التسوية لكل مستودع: القيمة المستهدفة (بعد إعادة التقييم) − الرصيد المالي ──
  const warehouseCalc = useMemo(() => {
    const targetByWh = new Map<number, number>();
    for (const r of rows) {
      const target = r.quantity * newCostFor(r);
      targetByWh.set(r.warehouseId, (targetByWh.get(r.warehouseId) ?? 0) + target);
    }
    return warehouses.map((w: CostReconWarehouse) => {
      const target = targetByWh.get(w.warehouseId) ?? w.inventoryValue;
      const settlement = target - w.financialBalance; // موجب ⇒ مدين على حساب المستودع
      return { ...w, targetValue: target, settlementAmount: settlement };
    });
  }, [rows, warehouses, newCostFor]);

  const settlementLines = useMemo(
    () => warehouseCalc
      .filter(w => Math.abs(w.settlementAmount) >= 0.0005 && w.accountId != null)
      .map(w => ({ warehouseId: w.warehouseId, amount: w.settlementAmount })),
    [warehouseCalc],
  );

  const missingAccountWarehouses = useMemo(
    () => warehouseCalc.filter(w => Math.abs(w.settlementAmount) >= 0.0005 && w.accountId == null),
    [warehouseCalc],
  );

  const settlementTotals = useMemo(() => {
    const net = settlementLines.reduce((s, l) => s + l.amount, 0);
    const debitWh = settlementLines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const creditWh = settlementLines.filter(l => l.amount < 0).reduce((s, l) => s - l.amount, 0);
    return { net, debitWh, creditWh };
  }, [settlementLines]);

  const settleMut = useMutation({
    mutationFn: () => costReconciliationApi.postSettlement({
      settlementAccountId: settlementAccountId!,
      entryDate,
      currency: effectiveCurrency,
      description: tt('تسوية كلفة المخزون', 'Inventory cost settlement'),
      lines: settlementLines,
    }),
    onSuccess: (data) => {
      toast.success(tt(`تم توليد قيد التسوية رقم ${data.entryId}`, `Settlement entry #${data.entryId} created`));
      setConfirmOpen(false);
      setEditedCosts({});
      void qc.invalidateQueries({ queryKey: ['cost-reconciliation'] });
      void reconQuery.refetch();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? tt('فشل توليد القيد', 'Failed to create entry')),
  });

  const handleOpenConfirm = () => {
    if (settlementAccountId == null) {
      toast.error(tt('اختر حساب التسوية أولاً', 'Select a settlement account first'));
      return;
    }
    if (settlementLines.length === 0) {
      toast.error(tt('لا توجد فروقات للتسوية', 'No differences to settle'));
      return;
    }
    setConfirmOpen(true);
  };

  const settlementAccountLabel = useMemo(() => {
    if (settlementAccountId == null) return '';
    const a = leafAccounts.find(x => x.id === settlementAccountId);
    return a ? `${a.code} - ${locale === 'en' ? a.nameEn || a.nameAr : a.nameAr}` : '';
  }, [settlementAccountId, leafAccounts, locale]);

  return (
    <div className="space-y-4">
      {/* ── الترويسة ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{tt('معالجة تكاليف المواد', 'Material Cost Processing')}</h1>
            <p className="text-xs text-muted-foreground">
              {tt('مطابقة رصيد حساب المستودع (المالي) مع قيمة الجرد (المستودعي) وتوليد قيد التسوية بالفروقات',
                'Reconcile the warehouse account (financial) with the stock value (inventory) and post a settlement entry')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InvoiceInventoryBackButton returnTo="/invoices/constants" returnLabel={tt('إعدادات الفواتير', 'Invoice settings')} />
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => reconQuery.refetch()} disabled={reconQuery.isFetching}>
            <RefreshCw className={cn('h-4 w-4', reconQuery.isFetching && 'animate-spin')} /> {tt('تحديث', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* ── رأس المعالجة: العملة + حساب التسوية + التاريخ ── */}
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_2fr_1fr]">
          <div>
            <Label className="mb-1 block text-xs">{tt('العملة', 'Currency')}</Label>
            <select
              value={effectiveCurrency}
              onChange={e => setCurrency(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {(currenciesQuery.data ?? []).map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} — {locale === 'en' ? c.nameEn || c.nameAr : c.nameAr}{c.isBase ? tt(' (أساسية)', ' (base)') : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">{tt('حساب التسوية (المقابل لحساب المخزون)', 'Settlement account (offsets inventory)')}</Label>
            <AccountPicker
              accounts={leafAccounts}
              value={settlementAccountId}
              onChange={(id) => setSettlementAccountId(id)}
              allowClear
              placeholder={tt('ابحث برقم أو اسم الحساب…', 'Search account by code or name…')}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">{tt('تاريخ القيد', 'Entry date')}</Label>
            <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="h-9 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* ── الفلاتر ── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <Label className="mb-1 block text-xs">{tt('بحث المادة', 'Item search')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRun(); }}
                  placeholder={tt('بحث بالاسم أو الرمز…', 'Search by name or code…')}
                  className="h-9 pr-8 text-sm"
                />
              </div>
            </div>
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
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={includeZero} onChange={e => setIncludeZero(e.target.checked)} className="h-3.5 w-3.5" />
              {tt('إظهار المواد ذات الرصيد صفر', 'Include zero-balance items')}
            </label>
            <Button size="sm" className="h-9 gap-1.5" onClick={handleRun}>
              <Search className="h-4 w-4" /> {tt('تطبيق', 'Apply')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {reconQuery.isLoading ? (
        <Card><CardContent className="py-16 text-center"><LoadingSpinner /></CardContent></Card>
      ) : (
        <>
          {/* ── ملخّص المستودعات: المالي مقابل المستودعي + الفرق ── */}
          {warehouseCalc.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {warehouseCalc.map(w => {
                const diff = w.settlementAmount;
                const balanced = Math.abs(diff) < 0.005;
                return (
                  <Card key={w.warehouseId} className={cn(!balanced && 'border-amber-400/50')}>
                    <CardContent className="space-y-2 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <Building2 className="h-4 w-4 text-primary" />
                          {locale === 'en' ? w.warehouseNameEn || w.warehouseName : w.warehouseName}
                        </span>
                        {w.accountCode
                          ? <span className="num-display text-[10px] text-muted-foreground">{w.accountCode}</span>
                          : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{tt('بلا حساب', 'No account')}</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                        <div>
                          <div className="text-muted-foreground">{tt('المالي', 'Financial')}</div>
                          <div className="num-display font-semibold">{formatAmountFixed2(w.financialBalance)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{tt('المستودعي', 'Inventory')}</div>
                          <div className="num-display font-semibold">{formatAmountFixed2(w.targetValue)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{tt('الفرق', 'Difference')}</div>
                          <div className={cn('num-display font-bold', balanced ? 'text-emerald-600' : 'text-amber-600')}>
                            {formatAmountFixed2(diff)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── شريط التسوية ── */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <Calculator className="h-4 w-4 text-primary" />
                  {tt('قيد التسوية المقترح', 'Proposed settlement')}
                </span>
                <span className="text-muted-foreground">
                  {tt('حساب المستودع مدين', 'Warehouse debit')}: <b className="num-display text-foreground">{formatAmountFixed2(settlementTotals.debitWh)}</b>
                </span>
                <span className="text-muted-foreground">
                  {tt('حساب المستودع دائن', 'Warehouse credit')}: <b className="num-display text-foreground">{formatAmountFixed2(settlementTotals.creditWh)}</b>
                </span>
                <span className="text-muted-foreground">
                  {tt('الطرف المقابل (التسوية)', 'Settlement side')}: <b className="num-display text-foreground">{formatAmountFixed2(Math.abs(settlementTotals.net))}</b> {settlementTotals.net > 0 ? tt('دائن', 'Cr') : settlementTotals.net < 0 ? tt('مدين', 'Dr') : ''}
                </span>
              </div>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={handleOpenConfirm}
                disabled={settlementLines.length === 0 || settleMut.isPending}
              >
                <Scale className="h-4 w-4" /> {tt('توليد قيد التسوية', 'Generate settlement entry')}
              </Button>
            </CardContent>
          </Card>

          {missingAccountWarehouses.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {tt('مستودعات بها فروقات لكن بلا حساب محاسبي (لن تُدرج في القيد): ', 'Warehouses with differences but no account (excluded): ')}
                {missingAccountWarehouses.map(w => (locale === 'en' ? w.warehouseNameEn || w.warehouseName : w.warehouseName)).join('، ')}
              </span>
            </div>
          )}

          {/* ── جدول المواد ── */}
          <Card>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="py-16"><EmptyState icon={ClipboardList} title={tt('لا توجد بيانات مطابقة', 'No matching data')} /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr className="text-muted-foreground">
                        <th className="px-2 py-2 text-center font-medium">#</th>
                        <th className="px-2 py-2 text-right font-medium">{tt('الرمز', 'Code')}</th>
                        <th className="px-2 py-2 text-right font-medium">{tt('المادة', 'Item')}</th>
                        <th className="px-2 py-2 text-right font-medium">{tt('المستودع', 'Warehouse')}</th>
                        <th className="px-2 py-2 text-center font-medium">{tt('الكمية', 'Qty')}</th>
                        <th className="px-2 py-2 text-center font-medium">{tt('الكلفة الحالية', 'Current cost')}</th>
                        <th className="px-2 py-2 text-center font-medium">{tt('القيمة المستودعية', 'Inventory value')}</th>
                        <th className="px-2 py-2 text-center font-medium">{tt('كلفة جديدة (يدوي)', 'New cost (manual)')}</th>
                        <th className="px-2 py-2 text-center font-medium">{tt('الفرق', 'Difference')}</th>
                        <th className="px-2 py-2 text-center font-medium">{tt('الإجراءات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const nc = newCostFor(r);
                        const target = r.quantity * nc;
                        const diff = target - r.inventoryValue;
                        const itemDisplayName = locale === 'en' ? r.itemNameEn || r.itemName : r.itemName;
                        return (
                          <tr key={rowKey(r)} className="border-t border-border/40 hover:bg-accent/30">
                            <td className="px-2 py-1.5 text-center text-muted-foreground">{idx + 1}</td>
                            <td className="px-2 py-1.5 num-display font-medium text-emerald-600">{r.itemCode}</td>
                            <td className="px-2 py-1.5">{itemDisplayName}</td>
                            <td className="px-2 py-1.5">{locale === 'en' ? r.warehouseNameEn || r.warehouseName : r.warehouseName}</td>
                            <td className={cn('px-2 py-1.5 text-center num-display font-bold', r.quantity < 0 && 'text-rose-600')}>{formatAmountFixed2(r.quantity)}</td>
                            <td className="px-2 py-1.5 text-center num-display text-muted-foreground">{formatAmountFixed2(r.unitCost)}</td>
                            <td className="px-2 py-1.5 text-center num-display font-medium">{formatAmountFixed2(r.inventoryValue)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <Input
                                type="number"
                                step="any"
                                value={editedCosts[rowKey(r)] ?? ''}
                                onChange={e => setEditedCosts(prev => ({ ...prev, [rowKey(r)]: e.target.value }))}
                                placeholder={formatAmountFixed2(r.unitCost)}
                                className="mx-auto h-7 w-24 text-center text-xs num-display"
                              />
                            </td>
                            <td className={cn('px-2 py-1.5 text-center num-display font-bold', Math.abs(diff) < 0.005 ? 'text-muted-foreground' : diff > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {Math.abs(diff) < 0.005 ? '—' : formatAmountFixed2(diff)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
                                onClick={e => openRowMenu(e, r.itemId, itemDisplayName, r.itemCode)}
                                title={tt('إجراءات', 'Actions')}
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── قائمة إجراءات الصف ── */}
      {rowMenu && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div className="fixed z-50 w-[200px] overflow-hidden rounded-lg border bg-popover py-1 shadow-xl" style={{ left: rowMenu.x, top: rowMenu.y }}>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent" onClick={() => openItemCard(rowMenu.itemId)}>
              <IdCard className="h-4 w-4 text-primary" /> {tt('عرض بطاقة المادة', 'View item card')}
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent" onClick={() => openItemMovements(rowMenu.itemId, rowMenu.itemName, rowMenu.itemCode)}>
              <TrendingUp className="h-4 w-4 text-primary" /> {tt('حركة المادة', 'Item movement')}
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-accent" onClick={() => openStockCount(rowMenu.itemId, rowMenu.itemName, rowMenu.itemCode)}>
              <ClipboardList className="h-4 w-4 text-primary" /> {tt('جرد المخزون', 'Stock count')}
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* ── نافذة تأكيد التسوية ── */}
      {confirmOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => !settleMut.isPending && setConfirmOpen(false)} />
          <div className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-xl" dir={locale === 'en' ? 'ltr' : 'rtl'}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Scale className="h-4 w-4 text-primary" />
                {tt('تأكيد قيد التسوية', 'Confirm settlement entry')}
              </h3>
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={settleMut.isPending} className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> {tt('حساب التسوية', 'Settlement account')}</span>
                <span className="text-xs font-medium">{settlementAccountLabel || '—'}</span>
              </div>
              <div className="space-y-1.5 rounded-md border p-3 text-xs">
                {settlementLines.map(l => {
                  const w = warehouseCalc.find(x => x.warehouseId === l.warehouseId);
                  return (
                    <div key={l.warehouseId} className="flex items-center justify-between gap-2">
                      <span className="truncate">{w ? (locale === 'en' ? w.warehouseNameEn || w.warehouseName : w.warehouseName) : `#${l.warehouseId}`}</span>
                      <span className={cn('num-display font-semibold', l.amount > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                        {l.amount > 0 ? tt('مدين', 'Dr') : tt('دائن', 'Cr')} {formatAmountFixed2(Math.abs(l.amount))}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-1 flex items-center justify-between border-t pt-1.5 font-semibold">
                  <span>{tt('حساب التسوية', 'Settlement')}</span>
                  <span className={cn('num-display', settlementTotals.net > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                    {settlementTotals.net > 0 ? tt('دائن', 'Cr') : tt('مدين', 'Dr')} {formatAmountFixed2(Math.abs(settlementTotals.net))}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {tt('سيُنشأ قيد محاسبي متوازن واحد بتاريخ ', 'A single balanced journal entry will be created on ')}
                <b>{entryDate}</b> {tt('بعملة', 'in')} <b>{effectiveCurrency}</b>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={settleMut.isPending}>{tt('إلغاء', 'Cancel')}</Button>
              <Button size="sm" className="gap-1.5" onClick={() => settleMut.mutate()} disabled={settleMut.isPending}>
                {settleMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> {tt('جارٍ التوليد…', 'Posting…')}</> : <><CheckCircle2 className="h-4 w-4" /> {tt('تأكيد وتوليد', 'Confirm & post')}</>}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
