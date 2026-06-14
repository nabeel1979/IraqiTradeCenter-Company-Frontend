import { api, getApiBaseUrl } from './client';
import type { ApiResponse, PagedResult } from '@/types/api';
import type { AxiosError } from 'axios';

export type ItemPriceType = 1 | 2 | 3 | 4 | 5 | 6;

/** أسعار البيع المعروضة في بطاقة المادة */
export const ITEM_SALE_PRICE_TYPES: { value: ItemPriceType; label: string }[] = [
  { value: 4, label: 'سعر المفرد' },
  { value: 5, label: 'سعر خاص' },
  { value: 3, label: 'سعر جملة' },
  { value: 6, label: 'سعر تصدير' },
];

/** كل أنواع الأسعار (للتوافق مع البيانات القديمة) */
export const ITEM_PRICE_TYPES: { value: ItemPriceType; label: string }[] = [
  { value: 1, label: 'سعر شراء' },
  { value: 2, label: 'سعر كلفة' },
  ...ITEM_SALE_PRICE_TYPES,
];

export const ITEM_CURRENCIES = ['IQD', 'USD'] as const;

export interface ItemListDto {
  id: number;
  code: string;
  barcode: string;
  nameAr: string;
  indexName?: string | null;
  productCode?: string | null;
  categoryName?: string | null;
  mainImageStorageKey?: string | null;
  primaryImageId?: number | null;
  purchasePrice: number;
  baseSalesPrice: number;
  stockBaseQuantity: number;
  minimumStockLevel: number;
  isAvailableForSale: boolean;
  isActive: boolean;
  isLowStock: boolean;
}

export interface ItemUnitPriceDto {
  currency: string;
  priceType: ItemPriceType;
  amount: number;
}

export interface ItemUnitDto {
  id?: number;
  unitOfMeasureId: number;
  unitName?: string;
  unitCode?: string;
  sortOrder: number;
  conversionFactor: number;
  unitBarcode?: string | null;
  isBase: boolean;
  prices: ItemUnitPriceDto[];
}

export interface ItemImageDto {
  id: number;
  storageKey: string;
  originalFileName: string;
  contentType?: string | null;
  sizeBytes: number;
  displayOrder: number;
  isPrimary: boolean;
  caption?: string | null;
  url?: string | null;
}

export interface ItemDetailDto {
  id: number;
  code: string;
  barcode: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  indexId?: number | null;
  indexName?: string | null;
  indexCode?: string | null;
  originCountryId?: number | null;
  originCountryName?: string | null;
  productCode?: string | null;
  model?: string | null;
  colorIds?: number[];
  colors?: { id: number; code: string; nameAr: string; nameEn?: string | null; hexCode?: string | null }[];
  size?: string | null;
  cpmVolume?: number | null;
  cpmUnitOfMeasureId?: number | null;
  cpmUnitName?: string | null;
  cpmUnitCode?: string | null;
  manufacturer?: string | null;
  youTubeUrl?: string | null;
  mainImageStorageKey?: string | null;
  trackSerialNumbers: boolean;
  purchasePrice: number;
  baseSalesPrice: number;
  stockBaseQuantity: number;
  minimumStockLevel: number;
  maximumStockLevel: number;
  openingStock: number;
  isActive: boolean;
  isAvailableForSale: boolean;
  showInStore: boolean;
  units: ItemUnitDto[];
  images: ItemImageDto[];
  serialNumbers: { id: number; serialNumber: string; status: string }[];
}

export interface UnitOfMeasureDto {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  code: string;
  isDefault?: boolean;
}

export interface UnitOfMeasureManageDto extends UnitOfMeasureDto {
  isActive: boolean;
  isDefault: boolean;
}

export interface UpsertUnitPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
  isDefault?: boolean;
}

export interface WarehouseManageDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  branchId?: number | null;
  branchNameAr?: string | null;
  isActive: boolean;
  isDefault: boolean;
  accountId?: number | null;
  accountCode?: string | null;
  accountNameAr?: string | null;
}

export interface UpsertWarehousePayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  branchId?: number | null;
  isActive: boolean;
  isDefault?: boolean;
  parentAccountId?: number | null;
}

export interface ItemIndexDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface OriginCountryDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface ItemColorDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  hexCode?: string | null;
  isActive: boolean;
}

export interface ItemColorManageDto extends ItemColorDto {
  isActive: boolean;
}

export interface UpsertColorPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  hexCode?: string | null;
  isActive: boolean;
}

export interface ItemCategoryFlatDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  parentId?: number | null;
  level: number;
  isActive: boolean;
  parentName?: string | null;
  hasChildren: boolean;
  hasItems: boolean;
}

export interface CategoryTreeItemDto {
  id: number;
  code: string;
  nameAr: string;
  categoryId: number;
  isActive: boolean;
}

export interface CategoryTreeDto {
  categories: ItemCategoryFlatDto[];
  items: CategoryTreeItemDto[];
}

export interface UpsertIndexPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface UpsertCategoryPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  parentId?: number | null;
  isActive: boolean;
}

export interface ItemCategoryDto {
  id: number;
  nameAr: string;
  parentId?: number | null;
  level: number;
  children: ItemCategoryDto[];
}

export interface ItemUnitPricePayload {
  currency: string;
  priceType: ItemPriceType;
  amount: number;
}

export interface ItemUnitPayload {
  unitOfMeasureId: number;
  sortOrder: number;
  conversionFactor: number;
  unitBarcode?: string | null;
  isBase?: boolean;
  prices: ItemUnitPricePayload[];
}

export interface UpsertItemPayload {
  id?: number | null;
  code?: string | null;
  barcode: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  categoryId?: number | null;
  indexId?: number | null;
  originCountryId?: number | null;
  productCode?: string | null;
  model?: string | null;
  colorIds?: number[];
  size?: string | null;
  cpmVolume?: number | null;
  cpmUnitOfMeasureId?: number | null;
  manufacturer?: string | null;
  youTubeUrl?: string | null;
  trackSerialNumbers: boolean;
  isActive: boolean;
  isAvailableForSale: boolean;
  showInStore: boolean;
  minimumStockLevel: number;
  maximumStockLevel: number;
  openingStock: number;
  units: ItemUnitPayload[];
  serialNumbers?: string[] | null;
}

export interface CreateItemPayload {
  code: string; barcode: string; nameAr: string; categoryId?: number;
  baseUnitId: number; purchasePrice: number; baseSalesPrice: number;
  mediumUnitId?: number; mediumUnitFactor?: number; mediumSalesPrice?: number;
  largeUnitId?: number; largeUnitFactor?: number; largeSalesPrice?: number;
  minimumStockLevel: number; openingStock: number;
}

export interface ItemMovementDto {
  id: number;
  movementDate: string;
  type: number;
  quantity: number;
  quantityInBase: number;
  quantityBefore: number;
  quantityAfter: number;
  unitName: string;
  warehouseId: number;
  warehouseName: string;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNumber?: string | null;
  unitCost?: number | null;
  totalValue?: number | null;
  unitPrice?: number | null;
  notes?: string | null;
  partyName?: string | null;
}

export interface ItemWarehouseStockDto {
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  netStock: number;
}

const stripReversalSuffix = (rt?: string | null) => (rt ?? '').replace(/Reversal$/, '');

/** هل الحركة حركة عكس (ناتجة عن تعديل/حذف مستند)؟ */
export function isReversalMovement(m: ItemMovementDto): boolean {
  return m.referenceType?.endsWith('Reversal') ?? false;
}

/**
 * يُرجع الحركات الفعّالة فقط لعرضها في التقارير:
 * - يُخفي حركات العكس (Reversal).
 * - يُخفي الحركات الأصلية المُلغاة بعد تعديل المستند، ويعتمد آخر تعديل فقط.
 * المنطق: لكل مستند (نوع المرجع + رقمه) إن وُجدت حركة عكس، تُعرض الحركات
 * المُسجّلة بعد آخر عملية عكس فقط (أي نتيجة آخر تعديل).
 */
export function effectiveMovements(movements: ItemMovementDto[]): ItemMovementDto[] {
  const lastReversalByGroup = new Map<string, number>();
  for (const m of movements) {
    if (!isReversalMovement(m)) continue;
    const key = `${stripReversalSuffix(m.referenceType)}#${m.referenceId ?? 0}`;
    const t = new Date(m.movementDate).getTime();
    if (t > (lastReversalByGroup.get(key) ?? 0)) lastReversalByGroup.set(key, t);
  }
  return movements.filter(m => {
    if (isReversalMovement(m)) return false;
    const key = `${stripReversalSuffix(m.referenceType)}#${m.referenceId ?? 0}`;
    const lr = lastReversalByGroup.get(key);
    if (lr == null) return true;
    return new Date(m.movementDate).getTime() >= lr;
  });
}

/** إجمالي تكلفة/قيمة الحركة — من TotalValue أو unitCost × الكمية الأساسية */
export function movementLineCost(m: Pick<ItemMovementDto, 'totalValue' | 'unitCost' | 'quantityInBase'>): number | null {
  if (m.totalValue != null) return m.totalValue;
  if (m.unitCost != null) return m.unitCost * m.quantityInBase;
  return null;
}

export interface ItemStockCountRowDto {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemNameEn?: string | null;
  categoryName?: string | null;
  categoryNameEn?: string | null;
  baseUnitName: string;
  baseUnitNameEn?: string | null;
  warehouseId: number;
  warehouseName: string;
  warehouseNameEn?: string | null;
  warehouseCode: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export const inventoryApi = {
  list: async (params: { pageNumber?: number; pageSize?: number; search?: string; categoryId?: number; lowStock?: boolean } = {}) => {
    const res = await api.get<ApiResponse<PagedResult<ItemListDto>>>('/items', { params });
    return res.data.data!;
  },

  get: async (id: number) => {
    const res = await api.get<ApiResponse<ItemDetailDto>>(`/items/${id}`);
    return res.data.data!;
  },

  upsert: async (payload: UpsertItemPayload) => {
    if (payload.id) {
      const res = await api.put<ApiResponse<ItemDetailDto>>(`/items/${payload.id}`, payload);
      return res.data.data!;
    }
    const res = await api.post<ApiResponse<ItemDetailDto>>('/items/upsert', payload);
    return res.data.data!;
  },

  delete: async (id: number) => {
    await api.delete(`/items/${id}`);
  },

  getUnits: async () => {
    const res = await api.get<ApiResponse<UnitOfMeasureDto[]>>('/items/units');
    return res.data.data ?? [];
  },

  listUnitsManage: async () => {
    const res = await api.get<ApiResponse<UnitOfMeasureManageDto[]>>('/items/units/manage');
    return res.data.data ?? [];
  },

  createUnitManage: async (payload: UpsertUnitPayload) => {
    const res = await api.post<ApiResponse<UnitOfMeasureManageDto>>('/items/units/manage', payload);
    return res.data.data!;
  },

  updateUnitManage: async (id: number, payload: UpsertUnitPayload) => {
    await api.put(`/items/units/manage/${id}`, payload);
  },

  deleteUnitManage: async (id: number) => {
    await api.delete(`/items/units/manage/${id}`);
  },

  listWarehousesManage: async () => {
    const res = await api.get<ApiResponse<WarehouseManageDto[]>>('/items/warehouses/manage');
    return res.data.data ?? [];
  },

  createWarehouseManage: async (payload: UpsertWarehousePayload) => {
    const res = await api.post<ApiResponse<WarehouseManageDto>>('/items/warehouses/manage', payload);
    return res.data.data!;
  },

  updateWarehouseManage: async (id: number, payload: UpsertWarehousePayload) => {
    await api.put(`/items/warehouses/manage/${id}`, payload);
  },

  deleteWarehouseManage: async (id: number) => {
    await api.delete(`/items/warehouses/manage/${id}`);
  },

  getWarehouseEligibleParentAccounts: async () => {
    const res = await api.get<ApiResponse<{ id: number; code: string; nameAr: string; isLockedForWarehouse: boolean }[]>>('/items/warehouses/manage/eligible-parent-accounts');
    return res.data.data ?? [];
  },

  createWarehouseAccount: async (id: number, parentAccountId: number) => {
    const res = await api.post<ApiResponse<{ accountId: number; accountCode: string; accountNameAr: string }>>(`/items/warehouses/manage/${id}/create-account`, { parentAccountId });
    return res.data.data!;
  },

  deleteWarehouseAccount: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/items/warehouses/manage/${id}/account`);
    return res.data;
  },

  getCategories: async () => {
    const res = await api.get<ApiResponse<ItemCategoryDto[]>>('/items/categories');
    return res.data.data ?? [];
  },

  generateCode: async () => {
    const res = await api.get<ApiResponse<{ code: string }>>('/items/generate-code');
    return res.data.data!.code;
  },

  getCountries: async () => {
    const res = await api.get<ApiResponse<OriginCountryDto[]>>('/items/countries');
    return res.data.data ?? [];
  },

  getColors: async () => {
    const res = await api.get<ApiResponse<ItemColorDto[]>>('/items/colors');
    return res.data.data ?? [];
  },

  listColorsManage: async () => {
    const res = await api.get<ApiResponse<ItemColorManageDto[]>>('/items/colors/manage');
    return res.data.data ?? [];
  },

  createColorManage: async (payload: UpsertColorPayload) => {
    const res = await api.post<ApiResponse<ItemColorManageDto>>('/items/colors/manage', payload);
    return res.data.data!;
  },

  updateColorManage: async (id: number, payload: UpsertColorPayload) => {
    await api.put(`/items/colors/manage/${id}`, payload);
  },

  deleteColorManage: async (id: number) => {
    await api.delete(`/items/colors/manage/${id}`);
  },

  listIndexes: async () => {
    const res = await api.get<ApiResponse<ItemIndexDto[]>>('/items/indexes');
    return res.data.data ?? [];
  },

  createIndex: async (payload: UpsertIndexPayload) => {
    const res = await api.post<ApiResponse<ItemIndexDto>>('/items/indexes', payload);
    return res.data.data!;
  },

  updateIndex: async (id: number, payload: UpsertIndexPayload) => {
    const res = await api.put<ApiResponse<ItemIndexDto>>(`/items/indexes/${id}`, payload);
    return res.data.data!;
  },

  deleteIndex: async (id: number) => {
    await api.delete(`/items/indexes/${id}`);
  },

  listCategoriesManage: async () => {
    const res = await api.get<ApiResponse<CategoryTreeDto>>('/items/categories/manage');
    return res.data.data ?? { categories: [], items: [] };
  },

  createCategoryManage: async (payload: UpsertCategoryPayload) => {
    await api.post('/items/categories/manage', payload);
  },

  updateCategoryManage: async (id: number, payload: UpsertCategoryPayload) => {
    await api.put(`/items/categories/manage/${id}`, payload);
  },

  deleteCategoryManage: async (id: number) => {
    await api.delete(`/items/categories/manage/${id}`);
  },

  listImages: async (itemId: number) => {
    const res = await api.get<ApiResponse<ItemImageDto[]>>(`/items/${itemId}/images`);
    return res.data.data ?? [];
  },

  getImageBlobUrl: async (itemId: number, imageId: number): Promise<string> => {
    try {
      const res = await api.get<Blob>(`/items/${itemId}/images/${imageId}/file`, {
        responseType: 'blob',
        timeout: 120_000,
        skipGlobalErrorHandler: true,
      });
      const ct = String(res.headers['content-type'] ?? res.data.type ?? '').toLowerCase();
      if (ct.includes('json')) {
        const text = await res.data.text();
        throw new Error(JSON.parse(text).message ?? 'تعذّر تحميل الصورة');
      }
      if (res.data.size === 0) throw new Error('الصورة فارغة');
      return URL.createObjectURL(res.data);
    } catch (err: unknown) {
      const ax = err as AxiosError<Blob>;
      if (ax.response?.data instanceof Blob) {
        const text = await ax.response.data.text();
        try {
          const body = JSON.parse(text) as { message?: string };
          throw new Error(body.message ?? 'تعذّر تحميل الصورة');
        } catch {
          throw new Error('تعذّر تحميل الصورة');
        }
      }
      throw err instanceof Error ? err : new Error('تعذّر تحميل الصورة');
    }
  },

  uploadImage: async (itemId: number, file: File, opts: { isPrimary?: boolean; displayOrder?: number; caption?: string } = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts.isPrimary) fd.append('isPrimary', 'true');
    if (opts.displayOrder != null) fd.append('displayOrder', String(opts.displayOrder));
    if (opts.caption) fd.append('caption', opts.caption);
    await api.post(`/items/${itemId}/images`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  uploadImagesBatch: async (itemId: number, files: File[]) => {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    await api.post(`/items/${itemId}/images/batch`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  moveImage: async (itemId: number, imageId: number, direction: -1 | 1) => {
    await api.post(`/items/${itemId}/images/${imageId}/move`, null, { params: { direction } });
  },

  deleteImage: async (itemId: number, imageId: number) => {
    await api.delete(`/items/${itemId}/images/${imageId}`);
  },

  /** @deprecated استخدم getImageBlobUrl — الملف يتطلب JWT */
  imageUrl: (itemId: number, imageId: number) =>
    `${getApiBaseUrl()}/items/${itemId}/images/${imageId}/file`,

  create: async (data: CreateItemPayload) => {
    const res = await api.post<ApiResponse<ItemListDto>>('/items', data);
    return res.data;
  },

  recordMovement: async (data: Record<string, unknown>) => {
    const res = await api.post<ApiResponse<number>>('/items/stock-movements', data);
    return res.data;
  },

  getMovements: async (
    itemId: number,
    opts: { take?: number; fromDate?: string; toDate?: string; warehouseId?: number } = {},
  ) => {
    const params: Record<string, unknown> = { take: opts.take ?? 500 };
    if (opts.fromDate) params.fromDate = opts.fromDate;
    if (opts.toDate) params.toDate = opts.toDate;
    if (opts.warehouseId) params.warehouseId = opts.warehouseId;
    const res = await api.get<ApiResponse<ItemMovementDto[]>>(`/items/${itemId}/movements`, { params });
    return res.data.data ?? [];
  },

  getStockPerWarehouse: async (itemId: number) => {
    const res = await api.get<ApiResponse<ItemWarehouseStockDto[]>>(`/items/${itemId}/stock`);
    return res.data.data ?? [];
  },

  getStockCount: async (
    opts: { warehouseId?: number; categoryId?: number; search?: string; includeZero?: boolean; itemId?: number } = {},
  ) => {
    const params: Record<string, unknown> = {};
    if (opts.warehouseId) params.warehouseId = opts.warehouseId;
    if (opts.categoryId) params.categoryId = opts.categoryId;
    if (opts.search) params.search = opts.search;
    if (opts.includeZero) params.includeZero = true;
    if (opts.itemId) params.itemId = opts.itemId;
    const res = await api.get<ApiResponse<ItemStockCountRowDto[]>>('/items/stock-count', { params });
    return res.data.data ?? [];
  },

  /** معالجة/إعادة احتساب أرصدة جميع المواد من سجل الحركات */
  recalcStock: async () => {
    const res = await api.post<ApiResponse<{ totalItems: number; changedCount: number; changed: { id: number; code: string; nameAr: string; oldBalance: number; newBalance: number }[] }>>(
      '/items/recalculate-stock',
    );
    return res.data.data;
  },
};

export type ItemDto = ItemListDto;
