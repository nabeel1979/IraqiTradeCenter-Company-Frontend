import { api } from './client';
import type { ApiResponse } from '@/types/api';

export type InvoiceMovementType = 1 | 2 | 3 | 4;
export type InvoiceCategory = 1 | 2 | 3 | 4;
export type InvoicePartyKind = 1 | 2;
export type InvoiceSettlementType = 1 | 2;
export type InvoicePaymentMethodKind = 1 | 2 | 3;
export type AutoPriceSource = 1 | 2 | 3 | 4;
export type InventoryMethod = 1 | 2;
export type CostCalculationMethod = 1 | 2;

export interface InvoiceTypeDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  movementType: InvoiceMovementType;
  category: InvoiceCategory;
  defaultPartyKind?: InvoicePartyKind | null;
  defaultWarehouseId?: number | null;
  defaultCashBoxId?: number | null;
  debitAccountId?: number | null;
  creditAccountId?: number | null;
  inventoryAccountId?: number | null;
  discountAccountId?: number | null;
  additionAccountId?: number | null;
  profitAccountId?: number | null;
  lossAccountId?: number | null;
  postDiscountAndAddition: boolean;
  generatesJournalEntry: boolean;
  affectsInventory: boolean;
  affectsCost: boolean;
  saveAndPostAtOnce: boolean;
  enableExpensesWindow: boolean;
  settlementType: InvoiceSettlementType;
  paymentMethodKind: InvoicePaymentMethodKind;
  paymentCashBoxId?: number | null;
  paymentCompanyId?: number | null;
  paymentBankId?: number | null;
  autoPriceSource: AutoPriceSource;
  isEnabled: boolean;
  isSystem: boolean;
  displayOrder: number;
}

export type UpsertInvoiceTypePayload = Omit<InvoiceTypeDto, 'id' | 'isSystem'> & { code: string };

export interface InvoiceSettingsDto {
  inventoryMethod: InventoryMethod;
  costCalculationMethod: CostCalculationMethod;
}

export const INVOICE_MOVEMENT_TYPES = [
  { value: 1 as const, label: 'ادخال' },
  { value: 2 as const, label: 'اخراج' },
  { value: 3 as const, label: 'مناقلة' },
  { value: 4 as const, label: 'طلبات' },
];

export const INVOICE_CATEGORIES = [
  { value: 1 as const, label: 'مبيع' },
  { value: 2 as const, label: 'شراء' },
  { value: 3 as const, label: 'مردود شراء' },
  { value: 4 as const, label: 'مردود مبيع' },
];

export const INVOICE_PARTY_KINDS = [
  { value: 1 as const, label: 'عملاء' },
  { value: 2 as const, label: 'موردون' },
];

export const INVOICE_SETTLEMENT_TYPES = [
  { value: 1 as const, label: 'نقدي' },
  { value: 2 as const, label: 'آجل' },
];

export const INVOICE_PAYMENT_METHODS = [
  { value: 1 as const, label: 'صندوق' },
  { value: 2 as const, label: 'شركة دفع' },
  { value: 3 as const, label: 'مصرف' },
];

export const AUTO_PRICE_SOURCES = [
  { value: 1 as const, label: 'آخر شراء للمورد' },
  { value: 2 as const, label: 'سعر بطاقة العميل' },
  { value: 3 as const, label: 'آخر بيع للعميل' },
  { value: 4 as const, label: 'بدون سعر' },
];

export const INVENTORY_METHODS = [
  { value: 1 as const, label: 'مستمر' },
  { value: 2 as const, label: 'دوري' },
];

export const COST_CALCULATION_METHODS = [
  { value: 1 as const, label: 'آخر شراء' },
  { value: 2 as const, label: 'متوسط الشراء' },
];

export const invoiceTypesApi = {
  list: async (enabledOnly?: boolean) => {
    const res = await api.get<ApiResponse<InvoiceTypeDto[]>>('/invoices/types', {
      params: enabledOnly ? { enabledOnly: true } : undefined,
    });
    return res.data.data ?? [];
  },
  get: async (id: number) => {
    const res = await api.get<ApiResponse<InvoiceTypeDto>>(`/invoices/types/${id}`);
    if (!res.data.data) throw new Error('Not found');
    return res.data.data;
  },
  create: async (payload: UpsertInvoiceTypePayload) => {
    const res = await api.post<ApiResponse<{ id: number }>>('/invoices/types', payload);
    return res.data;
  },
  update: async (id: number, payload: UpsertInvoiceTypePayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/invoices/types/${id}`, payload);
    return res.data;
  },
  toggle: async (id: number, isEnabled: boolean) => {
    const res = await api.put<ApiResponse<unknown>>(`/invoices/types/${id}/toggle`, { isEnabled });
    return res.data;
  },
  remove: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/invoices/types/${id}`);
    return res.data;
  },
};

export interface RegenerateEntriesResult {
  processed: number;
  errors: number;
  skipped: number;
  total: number;
  backupFile?: string | null;
  backupError?: string | null;
  errorDetails: { id: number; invoiceNumber: string; error: string }[];
}

export const invoicesApi = {
  regenerateEntries: async (invoiceTypeId?: number): Promise<RegenerateEntriesResult> => {
    const res = await api.post<{ success: boolean } & RegenerateEntriesResult>(
      '/salesinvoices/regenerate-entries',
      { invoiceTypeId: invoiceTypeId ?? null },
    );
    return res.data;
  },
};

export const invoiceSettingsApi = {
  get: async () => {
    const res = await api.get<ApiResponse<InvoiceSettingsDto>>('/invoices/settings');
    return res.data.data ?? { inventoryMethod: 1, costCalculationMethod: 1 };
  },
  update: async (payload: InvoiceSettingsDto) => {
    const res = await api.put<ApiResponse<unknown>>('/invoices/settings', payload);
    return res.data;
  },
};
