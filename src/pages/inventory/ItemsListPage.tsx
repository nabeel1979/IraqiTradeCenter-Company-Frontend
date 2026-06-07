import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Search, Package, AlertTriangle, Filter, Pencil,
  ChevronLeft, ChevronRight, Upload, Download,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ItemImageThumb } from '@/components/inventory/ItemImageThumb';
import { ItemImageViewerDialog } from '@/components/inventory/ItemImageViewerDialog';
import {
  inventoryApi,
  type ItemCategoryDto,
  type ItemDetailDto,
  type ItemListDto,
  type ItemPriceType,
  type UpsertItemPayload,
} from '@/lib/api/inventory';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { useLocale } from '@/lib/i18n';
import { extractApiError } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000] as const;

const COL = {
  code: 'رمز المادة',
  nameAr: 'الاسم',
  nameEn: 'الاسم (إنجليزي)',
  barcode: 'الباركود',
  productCode: 'رمز المنتج',
  category: 'الصنف',
  unit: 'وحدة القياس',
  purchasePrice: 'سعر الشراء',
  retailPrice: 'سعر المفرد',
  stock: 'المخزون',
  minStock: 'حد المخزون الأدنى',
  status: 'الحالة',
} as const;

function flattenCategories(cats: ItemCategoryDto[]): { id: number; nameAr: string }[] {
  const out: { id: number; nameAr: string }[] = [];
  const walk = (nodes: ItemCategoryDto[]) => {
    for (const c of nodes) {
      if (c.parentId != null) out.push({ id: c.id, nameAr: c.nameAr });
      if (c.children?.length) walk(c.children);
    }
  };
  walk(cats);
  return out;
}

function pickRow(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseNum(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function fetchAllItems(params: {
  search?: string;
  lowStock?: boolean;
}): Promise<ItemListDto[]> {
  const pageSize = 1000;
  let pageNumber = 1;
  const all: ItemListDto[] = [];
  while (true) {
    const res = await inventoryApi.list({ ...params, pageNumber, pageSize });
    all.push(...res.items);
    if (pageNumber >= res.totalPages) break;
    pageNumber++;
  }
  return all;
}

async function fetchCodeMap(): Promise<Map<string, number>> {
  const items = await fetchAllItems({});
  return new Map(items.map(i => [i.code.toUpperCase(), i.id]));
}

function mergePrices(
  existing: ItemDetailDto['units'][0]['prices'],
  purchase: number,
  retail: number,
) {
  const prices = existing.map(p => ({ currency: p.currency, priceType: p.priceType, amount: p.amount }));
  const setPrice = (type: ItemPriceType, amount: number) => {
    if (amount <= 0) return;
    const idx = prices.findIndex(p => p.priceType === type && p.currency === 'IQD');
    if (idx >= 0) prices[idx] = { ...prices[idx], amount };
    else prices.push({ currency: 'IQD', priceType: type, amount });
  };
  setPrice(1, purchase);
  setPrice(4, retail);
  return prices;
}

function buildImportPayload(
  row: Record<string, unknown>,
  existing: ItemDetailDto | null,
  categoryId: number | null,
  unitId: number,
  code: string,
): UpsertItemPayload | null {
  const nameAr = pickRow(row, COL.nameAr, 'NameAr', 'name');
  if (!nameAr) return null;

  const nameEn = pickRow(row, COL.nameEn, 'NameEn') || null;
  const barcode = pickRow(row, COL.barcode, 'Barcode');
  const productCode = pickRow(row, COL.productCode, 'ProductCode', 'SKU');
  const purchase = parseNum(pickRow(row, COL.purchasePrice, 'PurchasePrice'));
  const retail = parseNum(pickRow(row, COL.retailPrice, 'RetailPrice', 'BaseSalesPrice'));
  const minStock = parseNum(pickRow(row, COL.minStock, 'MinimumStockLevel'));

  if (existing) {
    const baseUnit = existing.units.find(u => u.isBase) ?? existing.units[0];
    const units = existing.units.map(u => ({
      unitOfMeasureId: u.unitOfMeasureId === baseUnit?.unitOfMeasureId && unitId ? unitId : u.unitOfMeasureId,
      sortOrder: u.sortOrder,
      conversionFactor: u.conversionFactor,
      unitBarcode: u.unitBarcode,
      isBase: u.isBase,
      prices: u.unitOfMeasureId === baseUnit?.unitOfMeasureId
        ? mergePrices(u.prices, purchase, retail)
        : u.prices.map(p => ({ currency: p.currency, priceType: p.priceType, amount: p.amount })),
    }));

    return {
      id: existing.id,
      code: existing.code,
      barcode: barcode || existing.barcode,
      nameAr,
      nameEn: nameEn ?? existing.nameEn,
      description: existing.description,
      categoryId: categoryId ?? existing.categoryId,
      originCountryId: existing.originCountryId,
      productCode: productCode || existing.productCode,
      youTubeUrl: existing.youTubeUrl,
      trackSerialNumbers: existing.trackSerialNumbers,
      isActive: existing.isActive,
      isAvailableForSale: existing.isAvailableForSale,
      showInStore: existing.showInStore ?? false,
      minimumStockLevel: minStock > 0 ? minStock : existing.minimumStockLevel,
      maximumStockLevel: existing.maximumStockLevel,
      openingStock: 0,
      units,
      serialNumbers: existing.serialNumbers.map(s => s.serialNumber),
    };
  }

  if (!unitId) return null;

  const prices = [];
  if (purchase > 0) prices.push({ currency: 'IQD', priceType: 1 as ItemPriceType, amount: purchase });
  if (retail > 0) prices.push({ currency: 'IQD', priceType: 4 as ItemPriceType, amount: retail });

  return {
    code: code || undefined,
    barcode,
    nameAr,
    nameEn,
    description: '',
    categoryId,
    originCountryId: null,
    productCode: productCode || '',
    youTubeUrl: '',
    trackSerialNumbers: false,
    isActive: true,
    isAvailableForSale: true,
    showInStore: false,
    minimumStockLevel: minStock,
    maximumStockLevel: 0,
    openingStock: 0,
    units: [{
      unitOfMeasureId: unitId,
      sortOrder: 0,
      conversionFactor: 1,
      unitBarcode: '',
      isBase: true,
      prices,
    }],
    serialNumbers: [],
  };
}

export function ItemsListPage() {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const qc = useQueryClient();
  const { canAny } = usePermissions();
  const canImport = canAny(PERMS.Inventory.Items.Create, PERMS.Inventory.Items.Update);

  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [viewer, setViewer] = useState<{ itemId: number; imageId: number; title: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['items', search, lowStockOnly, pageNumber, pageSize],
    queryFn: () => inventoryApi.list({
      search: search || undefined,
      lowStock: lowStockOnly,
      pageNumber,
      pageSize,
    }),
  });

  const totalPages = data ? Math.max(1, data.totalPages) : 1;
  const total = data?.totalCount ?? 0;
  const from = total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
  const to = Math.min(total, pageNumber * pageSize);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllItems({ search: search || undefined, lowStock: lowStockOnly });
      const sheetData = rows.length > 0
        ? rows.map(item => ({
            [COL.code]: item.code,
            [COL.nameAr]: item.nameAr,
            [COL.barcode]: item.barcode ?? '',
            [COL.productCode]: item.productCode ?? '',
            [COL.category]: item.categoryName ?? '',
            [COL.purchasePrice]: item.purchasePrice,
            [COL.retailPrice]: item.baseSalesPrice,
            [COL.stock]: item.stockBaseQuantity,
            [COL.minStock]: item.minimumStockLevel,
            [COL.status]: !item.isAvailableForSale
              ? t('items.statusDisabled')
              : item.isLowStock
                ? t('items.statusLow')
                : t('items.statusAvailable'),
          }))
        : [Object.fromEntries(Object.values(COL).map(k => [k, '']))];

      const ws = XLSX.utils.json_to_sheet(sheetData);
      ws['!cols'] = Object.values(COL).map(() => ({ wch: 16 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'المواد');
      XLSX.writeFile(wb, `items_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(t('items.exportDone', { count: rows.length }));
    } catch (e) {
      toast.error(extractApiError(e) ?? t('items.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (rows.length === 0) {
        toast.error(t('items.importEmpty'));
        return;
      }

      const [categories, units, codeMap] = await Promise.all([
        inventoryApi.getCategories(),
        inventoryApi.getUnits(),
        fetchCodeMap(),
      ]);
      const categoryByName = new Map(
        flattenCategories(categories).map(c => [c.nameAr.trim(), c.id]),
      );
      const defaultUnit = units.find(u => u.isDefault) ?? units[0];
      const unitByName = new Map(units.map(u => [u.nameAr.trim(), u.id]));

      let ok = 0;
      let fail = 0;

      for (const row of rows) {
        const nameAr = pickRow(row, COL.nameAr, 'NameAr', 'name');
        if (!nameAr) { fail++; continue; }

        const code = pickRow(row, COL.code, 'Code');
        const categoryName = pickRow(row, COL.category, 'Category');
        const unitName = pickRow(row, COL.unit, 'Unit');
        const categoryId = categoryName ? (categoryByName.get(categoryName) ?? null) : null;
        const unitId = unitName ? (unitByName.get(unitName) ?? defaultUnit?.id ?? 0) : (defaultUnit?.id ?? 0);

        const existingId = code ? codeMap.get(code.toUpperCase()) : undefined;
        let existing: ItemDetailDto | null = null;
        if (existingId) existing = await inventoryApi.get(existingId);

        const payload = buildImportPayload(row, existing, categoryId, unitId, code);
        if (!payload) { fail++; continue; }

        try {
          if (!payload.code && !payload.id) {
            payload.code = await inventoryApi.generateCode();
          }
          const saved = await inventoryApi.upsert(payload);
          if (saved?.code) codeMap.set(saved.code.toUpperCase(), saved.id);
          ok++;
        } catch {
          fail++;
        }
      }

      qc.invalidateQueries({ queryKey: ['items'] });
      if (ok > 0) toast.success(t('items.importDone', { ok, fail }));
      else toast.error(t('items.importNone'));
    } catch (e) {
      toast.error(extractApiError(e) ?? t('items.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('items.searchPlaceholder')}
              value={search}
              onChange={e => { setSearch(e.target.value); setPageNumber(1); }}
              className="pr-10"
            />
          </div>
          <Button
            variant={lowStockOnly ? 'default' : 'outline'}
            onClick={() => { setLowStockOnly(!lowStockOnly); setPageNumber(1); }}
          >
            <AlertTriangle className="h-4 w-4" />
            {t('items.lowStockOnly')}
          </Button>
          <Button variant="outline">
            <Filter className="h-4 w-4" />
            {t('common.filters')}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? <LoadingSpinner className="h-4 w-4 py-0" /> : <Upload className="h-4 w-4" />}
            {t('items.export')}
          </Button>
          {canImport && (
            <>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <LoadingSpinner className="h-4 w-4 py-0" /> : <Download className="h-4 w-4" />}
                {t('items.import')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <Link to="/inventory/new" className="mr-auto">
            <Button>
              <Plus className="h-4 w-4" />
              {t('items.newItem')}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner text={t('items.loading')} />
      ) : error ? (
        <EmptyState
          icon={Package}
          title={t('items.loadError')}
          description={t('common.serverConnectionError')}
        />
      ) : !data?.items.length ? (
        <EmptyState
          icon={Package}
          title={t('items.emptyTitle')}
          description={t('items.emptyDescription')}
          action={
            <Link to="/inventory/new">
              <Button>
                <Plus className="h-4 w-4" />
                {t('items.addItem')}
              </Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-16"></th>
                  <th className="w-28">{t('items.colCode')}</th>
                  <th>{t('items.colName')}</th>
                  <th>{t('common.status')}</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.id} className="group">
                    <td className="w-16">
                      {item.primaryImageId ? (
                        <ItemImageThumb
                          itemId={item.id}
                          imageId={item.primaryImageId}
                          alt={item.nameAr}
                          className="h-14 w-14 rounded-lg border transition-opacity hover:opacity-90"
                          onClick={() => setViewer({
                            itemId: item.id,
                            imageId: item.primaryImageId!,
                            title: item.nameAr,
                          })}
                        />
                      ) : (
                        <div className="flex aspect-square h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted">
                          <Package className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="num-display text-xs font-medium">{item.code}</span>
                      {item.categoryName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.categoryName}</p>
                      )}
                      {item.productCode && (
                        <p className="text-[10px] text-muted-foreground num-display">SKU: {item.productCode}</p>
                      )}
                    </td>
                    <td>
                      <Link to={`/inventory/${item.id}`} className="font-medium hover:text-primary hover:underline">
                        {item.nameAr}
                      </Link>
                      {item.barcode && (
                        <p className="num-display text-xs text-muted-foreground">{item.barcode}</p>
                      )}
                    </td>
                    <td>
                      {!item.isAvailableForSale ? (
                        <Badge variant="muted">{t('items.statusDisabled')}</Badge>
                      ) : item.isLowStock ? (
                        <Badge variant="warning">{t('items.statusLow')}</Badge>
                      ) : (
                        <Badge variant="success">{t('items.statusAvailable')}</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-0.5 justify-end">
                        <Link to={`/inventory/${item.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="تعديل">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t('items.pageSize')}</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPageNumber(1); }}
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {isFetching && <span className="text-amber-500">⟳</span>}
            </div>

            <div className="text-xs text-muted-foreground num-display" dir="ltr">
              {t('items.pagination', {
                from: from.toLocaleString('en-US'),
                to: to.toLocaleString('en-US'),
                total: total.toLocaleString('en-US'),
              })}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
              >
                {isRtl ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                {t('items.previous')}
              </Button>
              <span className="num-display px-2 text-xs text-muted-foreground" dir="ltr">
                {pageNumber} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
                disabled={pageNumber >= totalPages}
              >
                {t('items.next')}
                {isRtl ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {viewer && (
        <ItemImageViewerDialog
          open
          onClose={() => setViewer(null)}
          itemId={viewer.itemId}
          imageId={viewer.imageId}
          title={viewer.title}
        />
      )}

    </div>
  );
}
