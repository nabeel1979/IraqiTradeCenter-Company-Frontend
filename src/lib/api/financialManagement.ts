import { api } from './client';
import type {
  ApiResponse,
  FinancialPartyCategoryDto,
  FinancialPartyDto,
  FinancialPartyKind,
  CreateFinancialPartyCategoryPayload,
  UpdateFinancialPartyCategoryPayload,
  CreateFinancialPartyPayload,
  UpdateFinancialPartyPayload,
} from '@/types/api';

export interface EligibleAccountDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
}

export const financialManagementApi = {
  /**
   * الحسابات الصالحة لربطها بنوع طرف:
   * ورقة + غير مقفلة + لا قيود محاسبية عليها.
   */
  getEligibleAccounts: async (): Promise<EligibleAccountDto[]> => {
    const res = await api.get<ApiResponse<EligibleAccountDto[]>>('/financial-management/eligible-accounts');
    return res.data.data ?? [];
  },

  // ── Categories ──────────────────────────────────────────────────
  getCategories: async (kind?: FinancialPartyKind, includeInactive = false) => {
    const res = await api.get<ApiResponse<FinancialPartyCategoryDto[]>>('/financial-management/categories', {
      params: { kind, includeInactive },
    });
    return res.data.data!;
  },

  createCategory: async (payload: CreateFinancialPartyCategoryPayload) => {
    const res = await api.post<ApiResponse<number>>('/financial-management/categories', payload);
    return res.data;
  },

  updateCategory: async (id: number, payload: UpdateFinancialPartyCategoryPayload) => {
    const res = await api.put<ApiResponse<boolean>>(`/financial-management/categories/${id}`, payload);
    return res.data;
  },

  deleteCategory: async (id: number) => {
    const res = await api.delete<ApiResponse<boolean>>(`/financial-management/categories/${id}`);
    return res.data;
  },

  // ── Parties ─────────────────────────────────────────────────────
  getParties: async (params: {
    kind?: FinancialPartyKind;
    categoryId?: number;
    includeInactive?: boolean;
    search?: string;
  } = {}) => {
    const res = await api.get<ApiResponse<FinancialPartyDto[]>>('/financial-management/parties', { params });
    return res.data.data!;
  },

  createParty: async (payload: CreateFinancialPartyPayload) => {
    const res = await api.post<ApiResponse<number>>('/financial-management/parties', payload);
    return res.data;
  },

  updateParty: async (id: number, payload: UpdateFinancialPartyPayload) => {
    const res = await api.put<ApiResponse<boolean>>(`/financial-management/parties/${id}`, payload);
    return res.data;
  },

  deleteParty: async (id: number) => {
    const res = await api.delete<ApiResponse<boolean>>(`/financial-management/parties/${id}`);
    return res.data;
  },
};
