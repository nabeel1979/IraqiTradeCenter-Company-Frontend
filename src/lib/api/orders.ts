import { api } from './client';
import type { ApiResponse, IncomingOrderDto, PagedResult, SalesInvoiceDto } from '@/types/api';
import { ORDER_STATUS_API_VALUE, type OrderProcessingStatus } from '@/pages/orders/orderStatus';

export const ordersApi = {
  getPending: async (
    params: {
      pageNumber?: number;
      pageSize?: number;
      status?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
    } = {},
  ) => {
    const { status, search, fromDate, toDate, ...rest } = params;
    const apiParams = {
      ...rest,
      ...(status
        ? { status: ORDER_STATUS_API_VALUE[status as OrderProcessingStatus] ?? status }
        : {}),
      ...(search ? { search } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    };
    const res = await api.get<ApiResponse<PagedResult<IncomingOrderDto>>>('/incomingorders/pending', { params: apiParams });
    return res.data.data!;
  },

  getStatusCounts: async (
    params: { search?: string; fromDate?: string; toDate?: string } = {},
  ) => {
    const apiParams = {
      ...(params.search ? { search: params.search } : {}),
      ...(params.fromDate ? { fromDate: params.fromDate } : {}),
      ...(params.toDate ? { toDate: params.toDate } : {}),
    };
    const res = await api.get<ApiResponse<Record<string, number>>>(
      '/incomingorders/status-counts', { params: apiParams });
    return res.data.data ?? {};
  },

  getById: async (id: number) => {
    const res = await api.get<ApiResponse<IncomingOrderDto>>(`/incomingorders/${id}`);
    return res.data.data!;
  },

  open: async (id: number) => {
    const res = await api.post<ApiResponse<IncomingOrderDto>>(`/incomingorders/${id}/open`);
    return res.data.data!;
  },

  prepareInvoice: async (id: number) => {
    const res = await api.post<ApiResponse<SalesInvoiceDto>>(`/incomingorders/${id}/prepare-invoice`);
    return res.data.data!;
  },

  updateStatus: async (id: number, status: string, reason?: string) => {
    const res = await api.post<ApiResponse<IncomingOrderDto>>(`/incomingorders/${id}/status`, { status, reason });
    return res.data.data!;
  },

  confirm: async (orderId: number, data: { salesRepId: number; taxRate: number; discountPercentage: number }) => {
    const res = await api.post<ApiResponse<SalesInvoiceDto>>(`/incomingorders/${orderId}/confirm`, data);
    return res.data;
  },
};
