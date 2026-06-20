import { api } from './client';
import type { ApiResponse } from '@/types/api';

/** ملخّص مطابقة كلفة المواد لكل مستودع: الرصيد المالي (الحساب) مقابل قيمة الجرد. */
export interface CostReconWarehouse {
  warehouseId: number;
  warehouseName: string;
  warehouseNameEn?: string | null;
  warehouseCode: string;
  accountId?: number | null;
  accountCode?: string | null;
  /** رصيد حساب المستودع المحاسبي (موجب = مدين) */
  financialBalance: number;
  /** قيمة الجرد = مجموع (الكمية × الكلفة) لمواد المستودع */
  inventoryValue: number;
  /** الفرق = المالي − المستودعي (المفروض = صفر) */
  difference: number;
}

/** صف مطابقة كلفة لكل (مادة × مستودع). */
export interface CostReconRow {
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
  inventoryValue: number;
}

export interface CostReconResult {
  warehouses: CostReconWarehouse[];
  rows: CostReconRow[];
}

export interface CostSettlementPayload {
  settlementAccountId: number;
  entryDate?: string;
  description?: string;
  currency?: string;
  /** المبلغ الموجب = جعل حساب المستودع مديناً (زيادة قيمة الأصل) */
  lines: { warehouseId: number; amount: number }[];
  /** إعادة تقييم كلفة المواد المثبّتة يدوياً — يرتفع متوسط كلفة المخزون للقيمة الجديدة */
  revaluations?: { itemId: number; warehouseId: number; newUnitCost: number }[];
}

/** ملخّص قيد تسوية كلفة المخزون. */
export interface CostSettlementEntrySummary {
  entryId: number;
  entryNumber: string;
  entryDate: string;
  description: string;
  currency: string;
  amount: number;
  status: string;
}

export const costReconciliationApi = {
  get: async (
    opts: { warehouseId?: number; categoryId?: number; search?: string; includeZero?: boolean } = {},
  ): Promise<CostReconResult> => {
    const params: Record<string, unknown> = {};
    if (opts.warehouseId) params.warehouseId = opts.warehouseId;
    if (opts.categoryId) params.categoryId = opts.categoryId;
    if (opts.search) params.search = opts.search;
    if (opts.includeZero) params.includeZero = true;
    const res = await api.get<ApiResponse<CostReconResult>>('/items/cost-reconciliation', { params });
    return res.data.data ?? { warehouses: [], rows: [] };
  },

  postSettlement: async (payload: CostSettlementPayload): Promise<{ entryId: number }> => {
    const res = await api.post<ApiResponse<{ entryId: number }>>(
      '/items/cost-reconciliation/settlement',
      payload,
    );
    return res.data.data!;
  },

  deleteSettlement: async (entryId: number): Promise<void> => {
    await api.delete<ApiResponse<unknown>>(`/items/cost-reconciliation/settlement/${entryId}`);
  },

  listSettlements: async (): Promise<CostSettlementEntrySummary[]> => {
    const res = await api.get<ApiResponse<CostSettlementEntrySummary[]>>(
      '/items/cost-reconciliation/settlements',
    );
    return res.data.data ?? [];
  },
};
