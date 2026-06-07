import { api } from './client';
import type { ApiResponse, PagedResult, SalesInvoiceDto } from '@/types/api';

export interface CreateInvoicePayload {
  customerId?: number;
  financialPartyId?: number;
  salesRepId?: number; incomingOrderId?: number;
  invoiceTypeId?: number;
  warehouseId?: number;
  settlementType?: number;          // 1 = نقدي، 2 = آجل
  paymentMeansAccountId?: number;   // Id حساب وسيلة الدفع عند النقدي
  invoiceNumber?: string;           // رقم الفاتورة اليدوي (إن تُرك فارغاً يُولَّد تلقائياً)
  invoiceDate?: string;             // تاريخ الفاتورة (ISO yyyy-MM-dd)
  currency?: string;                // عملة الفاتورة (افتراضي IQD)
  taxRate: number; discountPercentage: number; discountAmount: number;
  additionAmount?: number;          // مصاريف/إضافة تُضاف لإجمالي الفاتورة
  notes?: string;
  lines: Array<{ itemId: number; unitOfMeasureId: number; quantity: number; unitPriceOverride?: number; lineDiscount: number; }>;
}

export interface RecordPaymentPayload {
  amount: number; paymentMethod: string; referenceNumber?: string; notes?: string;
}

export interface InvoicesListParams {
  pageNumber?: number; pageSize?: number; search?: string; status?: string;
  customerId?: number; fromDate?: string; toDate?: string;
  category?: number;
  invoiceTypeId?: number;
}

export interface LastItemPriceDto {
  found: boolean;
  unitPrice: number;
  unitOfMeasureId?: number | null;
  unitName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
}

export interface LastPriceParams {
  itemId: number;
  mode: 'purchase' | 'sale';
  financialPartyId?: number;
  unitOfMeasureId?: number;
}

export const invoicesApi = {
  list: async (params: InvoicesListParams = {}) => {
    const res = await api.get<ApiResponse<PagedResult<SalesInvoiceDto>>>('/salesinvoices', { params });
    return res.data.data!;
  },
  create: async (data: CreateInvoicePayload) => {
    const res = await api.post<ApiResponse<SalesInvoiceDto>>('/salesinvoices', data);
    return res.data;
  },
  getById: async (id: number) => {
    const res = await api.get<ApiResponse<SalesInvoiceDto>>(`/salesinvoices/${id}`);
    return res.data.data!;
  },
  update: async (id: number, data: CreateInvoicePayload) => {
    const res = await api.put<ApiResponse<SalesInvoiceDto>>(`/salesinvoices/${id}`, data);
    return res.data;
  },
  remove: async (id: number) => {
    const res = await api.delete<ApiResponse<boolean>>(`/salesinvoices/${id}`);
    return res.data;
  },
  recordPayment: async (invoiceId: number, data: RecordPaymentPayload) => {
    const res = await api.post<ApiResponse<number>>(`/salesinvoices/${invoiceId}/payments`, data);
    return res.data;
  },
  lastPrice: async (params: LastPriceParams) => {
    const res = await api.get<ApiResponse<LastItemPriceDto>>('/salesinvoices/last-price', { params });
    return res.data.data ?? { found: false, unitPrice: 0 };
  },
};
