import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  TrendingUp, Search, Printer, ExternalLink, Package, Warehouse as WarehouseIcon,
  ArrowDownLeft, ArrowUpRight, Activity, CalendarRange, Receipt, CalendarDays, ClipboardList,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangePresets } from '@/components/shared/DateRangePresets';
import { inventoryApi, effectiveMovements, movementLineCost, type ItemMovementDto, type ItemListDto } from '@/lib/api/inventory';
import { companySettingsApi } from '@/lib/api/companySettings';
import { fiscalYearsApi } from '@/lib/api/fiscalYears';
import { pickWorkingFiscalYear, fiscalYearStartToTodayRange } from '@/lib/fiscalYearDates';
import { formatAmountFixed2, formatDate, cn } from '@/lib/utils';
import { useLocale, localizedName } from '@/lib/i18n';
import { printItemMovements, type ItemMovementsPrintRow } from '@/lib/printUtils';
import { auditApi } from '@/lib/api/audit';
import { InvoiceInventoryBackButton } from '@/pages/invoices/components/InvoiceInventoryBackButton';
import { appendInvoiceReturnQuery } from '@/pages/invoices/invoiceRoutes';

const MOVEMENT_TYPE_LABELS: Record<number, { ar: string; en: string; out: boolean; color: string }> = {
  1: { ar: 'شراء وارد', en: 'Purchase In', out: false, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  2: { ar: 'بيع صادر', en: 'Sales Out', out: true, color: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
  3: { ar: 'مرتجع بيع', en: 'Sales Return', out: false, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  4: { ar: 'مرتجع شراء', en: 'Purchase Return', out: true, color: 'bg-rose-500/10 text-rose-500 border-rose-500/30' },
  5: { ar: 'تسوية', en: 'Adjustment', out: false, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  6: { ar: 'تحويل', en: 'Transfer', out: false, color: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  7: { ar: 'تالف', en: 'Damaged', out: true, color: 'bg-red-500/10 text-red-600 border-red-500/30' },
  8: { ar: 'رصيد افتتاحي', en: 'Opening', out: false, color: 'bg-primary/10 text-primary border-primary/30' },
};

const isReversal = (m: ItemMovementDto) => m.referenceType?.endsWith('Reversal') ?? false;
const isInvoiceRef = (m: ItemMovementDto) =>
  (m.referenceType?.includes('Invoice') ?? false) && !isReversal(m) && (m.referenceId ?? 0) > 0;

/** حركة مع رصيد جارٍ محسوب (قبل/بعد) ضمن الفترة. */
type MovementRow = ItemMovementDto & { runBefore: number; runAfter: number };

export function StockMovementsPage() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tt = (ar: string, en: string) => (locale === 'en' ? en : ar);
  const returnTo = searchParams.get('returnTo');
  const returnLabel = searchParams.get('returnLabel');

  // ── الفلاتر
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ id: number; code: string; name: string } | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // وحدة العرض/الجرد (عرض فقط — لا تؤثّر على وحدة الحركة المخزّنة في الفاتورة)
  const [displayUomId, setDisplayUomId] = useState<number | null>(null);
  // فلترة حسب الفاتورة (مخفية داخل أيقونة)
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [giftOnly, setGiftOnly] = useState(false);
  // popovers مخفية داخل أيقونات
  const [showPresets, setShowPresets] = useState(false);
  const [showInvoiceFilter, setShowInvoiceFilter] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);
  const invoiceFilterRef = useRef<HTMLDivElement>(null);

  // ── معايير التشغيل (لا يُجلب التقرير إلا بعد الضغط على «تشغيل»)
  const [runKey, setRunKey] = useState<{ itemId: number; warehouseId: number | ''; from: string; to: string } | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pickerRef.current && !pickerRef.current.contains(t)) setPickerOpen(false);
      if (presetsRef.current && !presetsRef.current.contains(t)) setShowPresets(false);
      if (invoiceFilterRef.current && !invoiceFilterRef.current.contains(t)) setShowInvoiceFilter(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ── السنة المالية: الافتراضي «من بداية السنة ولغاية اليوم»
  const fiscalYearsQuery = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  // اضبط الفترة الافتراضية + شغّل تلقائياً عند القدوم من بطاقة المادة
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || !fiscalYearsQuery.data) return;
    defaultsApplied.current = true;
    const fy = pickWorkingFiscalYear(fiscalYearsQuery.data);
    const range = fiscalYearStartToTodayRange(fy);
    setFrom(range.from);
    setTo(range.to);
    const qpId = Number(searchParams.get('itemId') || '');
    if (qpId > 0) {
      setRunKey({ itemId: qpId, warehouseId: '', from: range.from, to: range.to });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYearsQuery.data]);

  // ── ضبط اسم/رمز المادة عند القدوم من بطاقة المادة
  useEffect(() => {
    const qpId = searchParams.get('itemId');
    if (!qpId) return;
    const id = Number(qpId);
    if (!Number.isFinite(id) || id <= 0) return;
    setSelectedItem({
      id,
      code: searchParams.get('itemCode') ?? '',
      name: searchParams.get('itemName') ?? `#${id}`,
    });
  }, [searchParams]);

  // إعادة ضبط وحدة العرض وفلترة الفاتورة عند تغيير المادة
  useEffect(() => { setDisplayUomId(null); setInvoiceFilter(''); }, [selectedItem?.id]);

  // ── وحدات المادة (لاختيار وحدة الجرد/العرض)
  const itemDetailQuery = useQuery({
    queryKey: ['item-detail-units', selectedItem?.id],
    queryFn: () => inventoryApi.get(selectedItem!.id),
    enabled: !!selectedItem,
    staleTime: 60_000,
  });
  const units = itemDetailQuery.data?.units ?? [];
  const activeUom = useMemo(() => {
    if (units.length === 0) return null;
    const byId = displayUomId != null ? units.find(u => u.unitOfMeasureId === displayUomId) : null;
    return byId ?? units.find(u => u.conversionFactor === 1) ?? units.find(u => u.isBase) ?? units[0];
  }, [units, displayUomId]);
  const factor = activeUom?.conversionFactor ?? 1;
  const displayUnitName = activeUom?.unitName ?? '';
  const convertQty = (base: number) => base / factor;

  const itemSearchQuery = useQuery({
    queryKey: ['inv-items-search', search],
    queryFn: () => inventoryApi.list({ search: search.trim(), pageSize: 25 }),
    enabled: pickerOpen,
    staleTime: 60_000,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-manage'],
    queryFn: inventoryApi.listWarehousesManage,
    staleTime: 5 * 60 * 1000,
  });

  const companyQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: companySettingsApi.get,
    staleTime: 5 * 60 * 1000,
  });

  // نجلب كامل تاريخ الحركات (دون فلترة تاريخ) لاحتساب «الرصيد قبل بداية الفترة»
  // ثم نُصفّي ونُحسب الرصيد الجاري في الواجهة.
  const movementsQuery = useQuery({
    queryKey: ['item-movements-report', runKey?.itemId, runKey?.warehouseId],
    queryFn: () =>
      inventoryApi.getMovements(runKey!.itemId, {
        take: 5000,
        warehouseId: runKey!.warehouseId ? Number(runKey!.warehouseId) : undefined,
      }),
    enabled: !!runKey,
  });

  // السنة المالية الحالية (تُعرض بجانب الطباعة)
  const currentFy = useMemo(
    () => pickWorkingFiscalYear(fiscalYearsQuery.data ?? []),
    [fiscalYearsQuery.data],
  );

  // ── إخفاء حركات العكس + الحركات الأصلية المُلغاة بعد التعديل (نعتمد آخر تعديل فقط)
  //    تبقى كل الحركات محفوظة في قاعدة البيانات كسجل مراقبة.
  const allRows = useMemo(
    () => effectiveMovements(movementsQuery.data ?? []),
    [movementsQuery.data],
  );

  // جلب الفواتير المتاحة عند فتح أيقونة الفلترة (حتى قبل تشغيل التقرير)
  const invoiceListQuery = useQuery({
    queryKey: ['item-invoices', selectedItem?.id, from, to, warehouseId],
    queryFn: () =>
      inventoryApi.getMovements(selectedItem!.id, {
        take: 1000,
        fromDate: from || undefined,
        toDate: to || undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
      }),
    enabled: showInvoiceFilter && !!selectedItem,
    staleTime: 30_000,
  });

  // قائمة الفواتير المتاحة للفلترة (من بيانات التقرير إن وُجدت، وإلا من جلب الفلترة)
  const invoiceOptions = useMemo(() => {
    const source = allRows.length
      ? allRows
      : effectiveMovements(invoiceListQuery.data ?? []);
    const set = new Set<string>();
    for (const m of source) if (m.referenceNumber) set.add(m.referenceNumber);
    return Array.from(set).sort();
  }, [allRows, invoiceListQuery.data]);

  // ── احتساب الرصيد الجاري:
  //   «قبل» للصف الأول = صافي كل الحركات قبل تاريخ «من» (يشمل الرصيد الافتتاحي).
  //   ثم لكل صف: قبل = بعد الصف السابق، بعد = قبل + كمية الحركة (بالإشارة).
  //   القيم بالوحدة الأساسية، ويُحوّلها convertQty عند العرض.
  const { rows, openingBalanceBase } = useMemo(() => {
    if (!runKey) return { rows: [] as MovementRow[], openingBalanceBase: 0 };
    const sorted = effectiveMovements(movementsQuery.data ?? [])
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.movementDate).getTime();
        const tb = new Date(b.movementDate).getTime();
        return ta !== tb ? ta - tb : a.id - b.id;
      });
    const fromD = runKey.from || '';
    const toD = runKey.to || '';
    const dayOf = (iso: string) => iso.slice(0, 10);
    const signedOf = (m: ItemMovementDto) =>
      (MOVEMENT_TYPE_LABELS[m.type]?.out ? -m.quantityInBase : m.quantityInBase);

    let running = 0;
    let opening = 0;
    const inPeriod: MovementRow[] = [];
    for (const m of sorted) {
      const d = dayOf(m.movementDate);
      if (fromD && d < fromD) { running += signedOf(m); opening = running; continue; }
      if (toD && d > toD) continue;
      const before = running;
      running += signedOf(m);
      inPeriod.push({ ...m, runBefore: before, runAfter: running });
    }
    let filtered = invoiceFilter
      ? inPeriod.filter(m => m.referenceNumber === invoiceFilter)
      : inPeriod;
    if (giftOnly) filtered = filtered.filter(m => m.isGift);
    return { rows: filtered, openingBalanceBase: opening };
  }, [movementsQuery.data, runKey, invoiceFilter, giftOnly]);

  // الإجماليات تُحسب بالوحدة الأساسية (الأصغر) ثم تُحوَّل لوحدة العرض المختارة
  const baseTotals = useMemo(() => {
    let inB = 0, outB = 0;
    for (const m of rows) {
      const info = MOVEMENT_TYPE_LABELS[m.type];
      if (info?.out) outB += m.quantityInBase; else inB += m.quantityInBase;
    }
    return { inB, outB, net: inB - outB };
  }, [rows]);
  const totals = {
    totalIn: convertQty(baseTotals.inB),
    totalOut: convertQty(baseTotals.outB),
    net: convertQty(baseTotals.net),
    opening: convertQty(openingBalanceBase),
    closing: convertQty(openingBalanceBase + baseTotals.net),
  };

  const canRun = !!selectedItem;
  const handleRun = () => {
    if (!selectedItem) return;
    setRunKey({ itemId: selectedItem.id, warehouseId, from, to });
  };

  const warehouseLabel = useMemo(() => {
    if (!warehouseId) return tt('كل المستودعات', 'All warehouses');
    const w = warehousesQuery.data?.find(x => x.id === Number(warehouseId));
    return w ? (locale === 'en' ? w.nameEn || w.nameAr : w.nameAr) : '';
  }, [warehouseId, warehousesQuery.data, locale]);

  const handlePrint = () => {
    if (!selectedItem) return;
    const printRows: ItemMovementsPrintRow[] = rows.map(m => {
      const info = MOVEMENT_TYPE_LABELS[m.type];
      return {
        date: m.movementDate,
        typeLabel: info ? tt(info.ar, info.en) : String(m.type),
        party: m.partyName ?? '',
        warehouse: m.warehouseName,
        quantity: convertQty(m.quantityInBase),
        unit: displayUnitName || m.unitName,
        unitCost: movementLineCost(m),
        before: convertQty(m.runBefore),
        after: convertQty(m.runAfter),
        reference: m.referenceNumber ?? '',
        isOut: info?.out ?? false,
      };
    });
    printItemMovements(
      {
        itemCode: selectedItem.code,
        itemName: selectedItem.name,
        unitName: displayUnitName || rows[0]?.unitName,
        warehouseLabel,
        fromDate: runKey?.from,
        toDate: runKey?.to,
        rows: printRows,
        totalIn: totals.totalIn,
        totalOut: totals.totalOut,
        net: totals.net,
      },
      companyQuery.data ?? null,
      locale,
    );
    void auditApi.logPrint({
      entityType: 'ItemMovementReport',
      entityId: String(selectedItem.id),
      summary: tt(`طباعة حركة المادة — ${selectedItem.name}`, `Print item movements — ${selectedItem.name}`),
      details: { itemCode: selectedItem.code, warehouse: warehouseLabel, from: runKey?.from || null, to: runKey?.to || null, rowCount: rows.length },
    });
  };

  return (
    <div className="space-y-4">
      {/* ── الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{tt('تقرير حركة المادة', 'Item Movement Report')}</h1>
            <p className="text-xs text-muted-foreground">{tt('سجل الوارد والصادر لكل مادة خلال فترة محددة', 'In/out history per item for a selected period')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InvoiceInventoryBackButton returnTo={returnTo} returnLabel={returnLabel} />
          {currentFy && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              {tt('السنة المالية', 'Fiscal year')}
              <span className="font-semibold text-foreground">{localizedName(locale, currentFy.name, currentFy.nameEn)}</span>
            </span>
          )}
          <Button
            variant="outline" size="sm" className="h-9 gap-1.5"
            disabled={!selectedItem}
            title={tt('جرد المخزون لهذه المادة', 'Inventory count for this item')}
            onClick={() => {
              if (!selectedItem) return;
              const base = `/inventory/stock-count?itemId=${selectedItem.id}&itemName=${encodeURIComponent(selectedItem.name)}&itemCode=${encodeURIComponent(selectedItem.code)}`;
              navigate(appendInvoiceReturnQuery(base, searchParams));
            }}
          >
            <ClipboardList className="h-4 w-4" /> {tt('جرد المخزون', 'Inventory count')}
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handlePrint} disabled={!rows.length}>
            <Printer className="h-4 w-4" /> {tt('طباعة', 'Print')}
          </Button>
        </div>
      </div>

      {/* ── شريط الفلاتر */}
      <Card>
        <CardContent className="p-3">
          <div className="grid gap-2 md:grid-cols-[2fr_1.1fr_1.1fr_1fr_1fr_auto] md:items-end">
            {/* اختيار المادة */}
            <div className="relative" ref={pickerRef}>
              <Label className="mb-1 block text-xs">{tt('المادة', 'Item')}</Label>
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
              >
                <span className={cn('truncate', !selectedItem && 'text-muted-foreground')}>
                  {selectedItem ? `${selectedItem.code} — ${selectedItem.name}` : tt('اختر مادة…', 'Select an item…')}
                </span>
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {pickerOpen && (
                <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-lg">
                  <div className="border-b p-2">
                    <Input
                      autoFocus
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={tt('بحث بالاسم أو الرمز…', 'Search by name or code…')}
                      className="h-8"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {itemSearchQuery.isLoading ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">{tt('جارٍ التحميل…', 'Loading…')}</div>
                    ) : (itemSearchQuery.data?.items?.length ?? 0) === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">{tt('لا نتائج', 'No results')}</div>
                    ) : (
                      itemSearchQuery.data!.items.map((it: ItemListDto) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            setSelectedItem({ id: it.id, code: it.code, name: it.nameAr });
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm hover:bg-accent"
                        >
                          <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="num-display text-xs text-muted-foreground">{it.code}</span>
                          <span className="truncate">{it.nameAr}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* المستودع */}
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

            {/* وحدة الجرد/العرض (دروب داون) — بين المستودع والتاريخ */}
            <div>
              <Label className="mb-1 block text-xs">{tt('وحدة الجرد', 'Count unit')}</Label>
              <select
                value={activeUom?.unitOfMeasureId ?? ''}
                onChange={e => setDisplayUomId(e.target.value ? Number(e.target.value) : null)}
                disabled={units.length === 0}
                title={tt('عرض فقط — لا يغيّر وحدة الحركة في الفاتورة', 'Display only — does not change invoice unit')}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                {units.length === 0 && <option value="">—</option>}
                {units.map(u => (
                  <option key={u.unitOfMeasureId} value={u.unitOfMeasureId}>
                    {u.unitName ?? '—'}{u.conversionFactor !== 1 ? ` (×${u.conversionFactor})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* من */}
            <div>
              <Label className="mb-1 block text-xs">{tt('من', 'From')}</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" />
            </div>

            {/* إلى */}
            <div>
              <Label className="mb-1 block text-xs">{tt('إلى', 'To')}</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" />
            </div>

            {/* أدوات: فترات سريعة (أيقونة) + فلترة الفاتورة (أيقونة) + تشغيل */}
            <div className="flex items-end gap-1.5">
              {/* فترات سريعة مخفية داخل أيقونة */}
              <div className="relative" ref={presetsRef}>
                <button
                  type="button"
                  onClick={() => { setShowPresets(o => !o); setShowInvoiceFilter(false); }}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-accent"
                  title={tt('فترات سريعة', 'Quick ranges')}
                >
                  <CalendarRange className="h-4 w-4" />
                </button>
                {showPresets && (
                  <div className="absolute left-0 z-30 mt-1 w-[320px] rounded-md border bg-popover p-2 shadow-lg">
                    <DateRangePresets
                      from={from}
                      to={to}
                      onChange={(f, t) => { setFrom(f); setTo(t); }}
                      showFiscalYearBadge={false}
                      showLabel={false}
                    />
                  </div>
                )}
              </div>

              {/* تبديل عرض الهدايا فقط */}
              <button
                type="button"
                onClick={() => setGiftOnly(o => !o)}
                className={cn(
                  'flex h-9 items-center gap-1 rounded-md border px-2 text-xs font-medium',
                  giftOnly ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600' : 'border-input bg-background text-muted-foreground hover:bg-accent',
                )}
                title={tt('عرض الهدايا فقط', 'Show gifts only')}
              >
                {tt('هدايا فقط', 'Gifts only')}
              </button>

              {/* فلترة حسب الفاتورة مخفية داخل أيقونة */}
              <div className="relative" ref={invoiceFilterRef}>
                <button
                  type="button"
                  onClick={() => { setShowInvoiceFilter(o => !o); setShowPresets(false); }}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent',
                    invoiceFilter ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background',
                  )}
                  title={tt('فلترة حسب الفاتورة', 'Filter by invoice')}
                >
                  <Receipt className="h-4 w-4" />
                </button>
                {showInvoiceFilter && (
                  <div className="absolute left-0 z-30 mt-1 w-[240px] rounded-md border bg-popover p-2 shadow-lg">
                    <Label className="mb-1 block text-xs">{tt('فلترة حسب الفاتورة', 'Filter by invoice')}</Label>
                    {!selectedItem ? (
                      <p className="py-1 text-[11px] text-muted-foreground">{tt('اختر مادة أولاً لعرض فواتيرها', 'Select an item first to list its invoices')}</p>
                    ) : invoiceListQuery.isFetching && invoiceOptions.length === 0 ? (
                      <p className="py-1 text-[11px] text-muted-foreground">{tt('جارٍ تحميل الفواتير…', 'Loading invoices…')}</p>
                    ) : invoiceOptions.length === 0 ? (
                      <p className="py-1 text-[11px] text-muted-foreground">{tt('لا توجد فواتير ضمن الفترة المحددة', 'No invoices within the selected period')}</p>
                    ) : (
                      <>
                        <select
                          value={invoiceFilter}
                          onChange={e => setInvoiceFilter(e.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">{tt('كل الفواتير', 'All invoices')} ({invoiceOptions.length})</option>
                          {invoiceOptions.map(ref => (
                            <option key={ref} value={ref}>{ref}</option>
                          ))}
                        </select>
                        {invoiceFilter && (
                          <button
                            type="button"
                            onClick={() => setInvoiceFilter('')}
                            className="mt-1.5 text-[11px] text-destructive hover:underline"
                          >
                            {tt('إلغاء الفلترة', 'Clear filter')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* تشغيل التقرير */}
              <Button size="sm" className="h-9 gap-1.5" onClick={handleRun} disabled={!canRun}>
                <Activity className="h-4 w-4" /> {tt('تشغيل', 'Run')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── النتائج */}
      {!runKey ? (
        <Card><CardContent className="py-16">
          <EmptyState icon={TrendingUp} title={tt('اختر مادة ثم اضغط «تشغيل التقرير»', 'Pick an item then click “Run report”')} />
        </CardContent></Card>
      ) : movementsQuery.isLoading ? (
        <Card><CardContent className="py-16 text-center"><LoadingSpinner /></CardContent></Card>
      ) : (
        <>
          {/* بطاقات الملخص */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryBox icon={CalendarDays} label={tt('رصيد بداية الفترة', 'Opening balance')} value={formatAmountFixed2(totals.opening)} color="text-amber-600" />
            <SummaryBox icon={ArrowDownLeft} label={tt('إجمالي الوارد', 'Total In')} value={formatAmountFixed2(totals.totalIn)} color="text-emerald-600" />
            <SummaryBox icon={ArrowUpRight} label={tt('إجمالي الصادر', 'Total Out')} value={formatAmountFixed2(totals.totalOut)} color="text-rose-600" />
            <SummaryBox icon={Activity} label={tt('صافي الحركة', 'Net')} value={formatAmountFixed2(totals.net)} color="text-foreground" />
            <SummaryBox icon={Package} label={tt('رصيد نهاية الفترة', 'Closing balance')} value={formatAmountFixed2(totals.closing)} color="text-primary" />
          </div>

          <Card>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="py-16">
                  <EmptyState icon={WarehouseIcon} title={tt('لا توجد حركات ضمن الفترة المحددة', 'No movements in the selected period')} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr className="text-muted-foreground">
                        <Th>#</Th>
                        <Th>{tt('التاريخ', 'Date')}</Th>
                        <Th>{tt('النوع', 'Type')}</Th>
                        <Th>{tt('المورد/العميل', 'Party')}</Th>
                        <Th>{tt('المستودع', 'Warehouse')}</Th>
                        <Th center>{tt('الكمية', 'Qty')}</Th>
                        <Th center>{tt('وحدة الجرد', 'Unit')}</Th>
                        <Th center>{tt('قبل', 'Before')}</Th>
                        <Th center>{tt('بعد', 'After')}</Th>
                        <Th center>{tt('التكلفة', 'Cost')}</Th>
                        <Th>{tt('المرجع', 'Reference')}</Th>
                        <Th center>{tt('إجراءات', 'Actions')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m, idx) => {
                        const info = MOVEMENT_TYPE_LABELS[m.type];
                        const out = info?.out ?? false;
                        return (
                          <tr key={m.id} className="border-t border-border/40 hover:bg-accent/30">
                            <td className="px-2 py-1.5 text-center text-muted-foreground">{idx + 1}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground num-display">{formatDate(m.movementDate, { short: true })}</td>
                            <td className="px-2 py-1.5">
                              <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium', info?.color)}>
                                {info ? tt(info.ar, info.en) : m.type}
                              </span>
                              {m.isGift && (
                                <span className="ms-1 inline-block rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                                  {tt('هدية', 'Gift')}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">{m.partyName ?? '—'}</td>
                            <td className="px-2 py-1.5">{m.warehouseName}</td>
                            <td className={cn('px-2 py-1.5 text-center num-display font-bold', out ? 'text-rose-600' : 'text-emerald-600')}>
                              {out ? '-' : '+'}{formatAmountFixed2(convertQty(m.quantityInBase))}
                            </td>
                            <td className="px-2 py-1.5 text-center">{displayUnitName || m.unitName}</td>
                            <td className="px-2 py-1.5 text-center num-display text-muted-foreground">{formatAmountFixed2(convertQty(m.runBefore))}</td>
                            <td className="px-2 py-1.5 text-center num-display font-semibold">{formatAmountFixed2(convertQty(m.runAfter))}</td>
                            <td className="px-2 py-1.5 text-center num-display font-medium">
                              {movementLineCost(m) != null
                                ? formatAmountFixed2(movementLineCost(m)!)
                                : '—'}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">{m.referenceNumber ?? '—'}</td>
                            <td className="px-2 py-1.5 text-center">
                              {isInvoiceRef(m) ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/invoices/${m.referenceId}/edit`)}
                                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20"
                                  title={tt('فتح الفاتورة', 'Open invoice')}
                                >
                                  <ExternalLink className="h-3 w-3" /> {tt('الفاتورة', 'Invoice')}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
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
    </div>
  );
}

function SummaryBox({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg bg-muted', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={cn('text-lg font-bold num-display', color)}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th className={cn('px-2 py-2 font-medium', center ? 'text-center' : 'text-right')}>{children}</th>;
}
