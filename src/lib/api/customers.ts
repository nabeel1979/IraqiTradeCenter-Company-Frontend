import { api } from './client';
import type { ApiResponse, CustomerDto, CustomerStatementDto, PagedResult } from '@/types/api';

export const customersApi = {
  list: async (params: { pageNumber?: number; pageSize?: number; search?: string; activeOnly?: boolean } = {}) => {
    const res = await api.get<ApiResponse<PagedResult<CustomerDto>>>('/customers', { params });
    return res.data.data!;
  },
  getStatement: async (id: number, from: string, to: string) => {
    const res = await api.get<ApiResponse<CustomerStatementDto>>(`/customers/${id}/statement`, { params: { from, to } });
    return res.data.data!;
  },
};
