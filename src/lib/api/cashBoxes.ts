import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface CashBoxCurrencyDto {
  id: number;
  currency: string;
  debitLimit?: number | null;
  creditLimit?: number | null;
  isActive: boolean;
}

export interface CashBoxDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  accountId: number;
  accountCode?: string | null;
  accountName?: string | null;
  isActive: boolean;
  displayOrder: number;
  currencies: CashBoxCurrencyDto[];
}

export interface UpsertCashBoxCurrencyPayload {
  currency: string;
  debitLimit?: number | null;
  creditLimit?: number | null;
  isActive: boolean;
}

export interface UpsertCashBoxPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  accountId: number;
  isActive: boolean;
  displayOrder: number;
  currencies: UpsertCashBoxCurrencyPayload[];
}

export const cashBoxesApi = {
  getAll: async (activeOnly = false): Promise<CashBoxDto[]> => {
    const res = await api.get<ApiResponse<CashBoxDto[]>>('/cash-boxes', { params: { activeOnly } });
    return res.data.data ?? [];
  },

  getById: async (id: number): Promise<CashBoxDto | null> => {
    const res = await api.get<ApiResponse<CashBoxDto | null>>(`/cash-boxes/${id}`);
    return res.data.data ?? null;
  },

  create: async (payload: UpsertCashBoxPayload): Promise<{ id: number }> => {
    const res = await api.post<ApiResponse<{ id: number }>>('/cash-boxes', payload);
    return res.data.data!;
  },

  update: async (id: number, payload: UpsertCashBoxPayload): Promise<void> => {
    await api.put(`/cash-boxes/${id}`, payload);
  },

  toggle: async (id: number, isActive: boolean): Promise<void> => {
    await api.put(`/cash-boxes/${id}/toggle`, { isActive });
  },

  move: async (id: number, direction: 'up' | 'down'): Promise<void> => {
    await api.put(`/cash-boxes/${id}/move`, { direction });
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/cash-boxes/${id}`);
  },
};
