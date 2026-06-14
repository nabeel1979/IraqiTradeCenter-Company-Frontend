import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface WalletListItem {
  id: string;
  storeUserId: string;
  userCode: string;
  userName: string;
  accountType: string;
  walletType: number;
  walletTypeName: string;
  accountCode: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: number;
  typeName: string;
  isCredit: boolean;
  amount: number;
  balanceAfter: number;
  counterAccountCode?: string | null;
  counterAccountName?: string | null;
  counterpartyWalletId?: string | null;
  counterpartyName?: string | null;
  journalEntryId: number;
  description?: string | null;
  performedBy?: string | null;
  createdAt: string;
}

export interface FundingAccount {
  code: string;
  nameAr: string;
}

export interface CoaAccount {
  id: number;
  code: string;
  nameAr: string;
  level: number;
  isLeaf: boolean;
  parentId?: number | null;
}

export interface WalletSettings {
  grandparentAccountId?: number | null;
  grandparentAccountCode?: string | null;
  grandparentAccountName?: string | null;
  grandparentIsDefault: boolean;
  walletGroupName: string;
  intermediateAccountId?: number | null;
  intermediateAccountCode?: string | null;
  intermediateAccountName?: string | null;
  defaultTopupAccountCode?: string | null;
  defaultTopupAccountName?: string | null;
  defaultWithdrawAccountCode?: string | null;
  defaultWithdrawAccountName?: string | null;
}

export const storeWalletsApi = {
  list: async (search?: string) => {
    const res = await api.get<ApiResponse<WalletListItem[]>>('/parent/wallets', {
      params: search ? { search } : undefined,
    });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load wallets');
    return res.data.data;
  },

  get: async (id: string) => {
    const res = await api.get<ApiResponse<WalletListItem>>(`/parent/wallets/${id}`);
    if (!res.data.success || !res.data.data) throw new Error('Failed to load wallet');
    return res.data.data;
  },

  statement: async (id: string, params?: { from?: string; to?: string; type?: number }) => {
    const res = await api.get<ApiResponse<WalletTransaction[]>>(`/parent/wallets/${id}/statement`, { params });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load statement');
    return res.data.data;
  },

  fundingAccounts: async () => {
    const res = await api.get<ApiResponse<FundingAccount[]>>('/parent/wallets/funding-accounts');
    if (!res.data.success || !res.data.data) throw new Error('Failed to load funding accounts');
    return res.data.data;
  },

  coaAccounts: async () => {
    const res = await api.get<ApiResponse<CoaAccount[]>>('/parent/wallets/coa-accounts');
    if (!res.data.success || !res.data.data) throw new Error('Failed to load accounts');
    return res.data.data;
  },

  getSettings: async () => {
    const res = await api.get<ApiResponse<WalletSettings>>('/parent/wallets/settings');
    if (!res.data.success || !res.data.data) throw new Error('Failed to load settings');
    return res.data.data;
  },

  updateSettings: async (body: {
    parentAccountCode: string;
    walletGroupName?: string | null;
    defaultTopupAccountCode?: string | null;
    defaultWithdrawAccountCode?: string | null;
  }) => {
    const res = await api.put<ApiResponse<WalletSettings>>('/parent/wallets/settings', body);
    return res.data;
  },

  backfill: async () => {
    const res = await api.post<{ success: boolean; created: number }>('/parent/wallets/backfill');
    return res.data;
  },

  topup: async (id: string, body: { amount: number; fundingAccountCode?: string | null; description?: string | null }) => {
    const res = await api.post<ApiResponse<WalletTransaction>>(`/parent/wallets/${id}/topup`, body);
    return res.data;
  },

  withdraw: async (id: string, body: { amount: number; fundingAccountCode?: string | null; description?: string | null }) => {
    const res = await api.post<ApiResponse<WalletTransaction>>(`/parent/wallets/${id}/withdraw`, body);
    return res.data;
  },

  transfer: async (id: string, body: { toWalletId: string; amount: number; description?: string | null }) => {
    const res = await api.post<ApiResponse<WalletTransaction>>(`/parent/wallets/${id}/transfer`, body);
    return res.data;
  },
};
