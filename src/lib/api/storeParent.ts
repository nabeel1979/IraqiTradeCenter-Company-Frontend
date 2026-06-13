import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface TraderSaleRow {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  customerName: string;
  traderId?: string | null;
  companyCode: string;
  companyName: string;
  traderName?: string | null;
  traderPhone?: string | null;
  traderCode?: string | null;
  traderEmail?: string | null;
}

export interface CompanyRequestRow {
  id: string;
  userCode: string;
  fullName: string;
  phone: string;
  contactPhone?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  detailedAddress?: string | null;
  isVerified: boolean;
  isProfileCompleted: boolean;
  isApproved: boolean;
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

export interface ActiveCartRow {
  id: string;
  userCode: string;
  fullName: string;
  phone: string;
  cartRevision: number;
  itemCount: number;
  totalAmount: number;
  updatedAt: string;
}

export interface StoreUserLinkedCompany {
  companyCode: string;
  companyName: string;
  customerCode?: string | null;
  isActive: boolean;
  linkedAt: string;
}

export interface StoreUserRow {
  id: string;
  userCode: string;
  fullName: string;
  phone: string;
  contactPhone?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  detailedAddress?: string | null;
  accountType: string;
  isVerified: boolean;
  isProfileCompleted: boolean;
  isApproved: boolean;
  isDisabled: boolean;
  hasFinancialLink: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  linkedCompanies: StoreUserLinkedCompany[];
}

export const storeParentApi = {
  traderSales: async (params?: { pageNumber?: number; pageSize?: number; search?: string }) => {
    const res = await api.get<ApiResponse<PagedResult<TraderSaleRow>>>('/parent/store/trader-sales', { params });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load trader sales');
    return res.data.data;
  },

  companyRequests: async (params?: { pageNumber?: number; pageSize?: number; search?: string; pendingOnly?: boolean }) => {
    const res = await api.get<ApiResponse<PagedResult<CompanyRequestRow>>>('/parent/store/company-requests', { params });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load company requests');
    return res.data.data;
  },

  approveCompanyRequest: async (id: string) => {
    const res = await api.post<{ success: boolean; message?: string }>(`/parent/store/company-requests/${id}/approve`);
    return res.data;
  },

  activeCarts: async (params?: { pageNumber?: number; pageSize?: number; search?: string }) => {
    const res = await api.get<ApiResponse<PagedResult<ActiveCartRow>>>('/parent/store/carts', { params });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load carts');
    return res.data.data;
  },

  clearCart: async (body: { userId?: string; userCode?: string }) => {
    const res = await api.post<{ success: boolean; message?: string }>('/parent/store/clear-cart', body);
    return res.data;
  },

  flushCartCache: async () => {
    const res = await api.post<{
      success: boolean;
      message?: string;
      cartEpoch?: number;
      clearedCarts?: number;
      affectedUsers?: number;
    }>('/parent/store/flush-cart-cache');
    return res.data;
  },

  storeUsers: async (params?: { pageNumber?: number; pageSize?: number; search?: string; disabledOnly?: boolean }) => {
    const res = await api.get<ApiResponse<PagedResult<StoreUserRow>>>('/parent/store/users', { params });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load store users');
    return res.data.data;
  },

  setStoreUserStatus: async (id: string, disabled: boolean) => {
    const res = await api.post<{ success: boolean; message?: string; isDisabled?: boolean }>(
      `/parent/store/users/${id}/status`,
      { disabled },
    );
    return res.data;
  },

  updateStoreUser: async (id: string, body: {
    fullName: string;
    contactPhone?: string | null;
    email?: string | null;
    country?: string | null;
    city?: string | null;
    address?: string | null;
    detailedAddress?: string | null;
  }) => {
    const res = await api.put<{ success: boolean; message?: string }>(
      `/parent/store/users/${id}`,
      body,
    );
    return res.data;
  },
};
