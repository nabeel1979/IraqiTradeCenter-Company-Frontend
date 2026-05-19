import { api } from './client';
import type {
  ApiResponse,
  CurrencyRateBulletinDto,
  CurrencyRateLinePayload,
} from '@/types/api';

export interface CreateCurrencyRateBulletinPayload {
  name: string;
  baseCurrency: string;
  effectiveAt: string; // ISO datetime (UTC)
  notes?: string | null;
  publishImmediately: boolean;
  lines: CurrencyRateLinePayload[];
}

export interface UpdateCurrencyRateBulletinPayload {
  name: string;
  baseCurrency: string;
  effectiveAt: string;
  notes?: string | null;
  lines: CurrencyRateLinePayload[];
}

export const currencyRateBulletinsApi = {
  getAll: async (params?: { status?: number; includeArchived?: boolean }) => {
    const res = await api.get<ApiResponse<CurrencyRateBulletinDto[]>>(
      '/currency-rate-bulletins',
      { params }
    );
    return res.data.data ?? [];
  },
  getById: async (id: number) => {
    const res = await api.get<ApiResponse<CurrencyRateBulletinDto>>(
      `/currency-rate-bulletins/${id}`
    );
    return res.data.data!;
  },
  getActive: async (at?: string) => {
    const res = await api.get<ApiResponse<CurrencyRateBulletinDto | null>>(
      '/currency-rate-bulletins/active',
      { params: at ? { at } : undefined }
    );
    return res.data.data ?? null;
  },
  create: async (payload: CreateCurrencyRateBulletinPayload) => {
    const res = await api.post<ApiResponse<number>>(
      '/currency-rate-bulletins',
      payload
    );
    return res.data;
  },
  update: async (id: number, payload: UpdateCurrencyRateBulletinPayload) => {
    const res = await api.put<ApiResponse<unknown>>(
      `/currency-rate-bulletins/${id}`,
      payload
    );
    return res.data;
  },
  publish: async (id: number) => {
    const res = await api.post<ApiResponse<unknown>>(
      `/currency-rate-bulletins/${id}/publish`,
      {}
    );
    return res.data;
  },
  archive: async (id: number) => {
    const res = await api.post<ApiResponse<unknown>>(
      `/currency-rate-bulletins/${id}/archive`,
      {}
    );
    return res.data;
  },
  delete: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(
      `/currency-rate-bulletins/${id}`
    );
    return res.data;
  },
};
