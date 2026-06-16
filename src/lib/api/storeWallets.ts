import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface WalletListItem {
  id: string;
  storeUserId: string;
  walletGroupId?: string | null;
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

/** محفظة مخصّصة (مجموعة) لها حساب أب وأعضاء. */
export interface WalletGroup {
  id: string;
  name: string;
  grandparentAccountId?: number | null;
  grandparentAccountCode?: string | null;
  grandparentAccountName?: string | null;
  grandparentIsDefault: boolean;
  intermediateAccountCode?: string | null;
  intermediateAccountName?: string | null;
  defaultTopupAccountCode?: string | null;
  defaultTopupAccountName?: string | null;
  defaultWithdrawAccountCode?: string | null;
  defaultWithdrawAccountName?: string | null;
  memberCount: number;
  totalBalance: number;
  isActive: boolean;
  isDefault: boolean;
  isLocked: boolean;
  createdAt: string;
}

export interface WalletGroupRequest {
  name: string;
  parentAccountCode: string;
  defaultTopupAccountCode?: string | null;
  defaultWithdrawAccountCode?: string | null;
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

export interface WalletCard {
  id: string;
  storeUserId: string;
  userCode: string;
  userName: string;
  phone?: string | null;
  email?: string | null;
  accountType: string;
  walletType: number;
  walletTypeName: string;
  accountCode: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  transactionCount: number;
  canDelete: boolean;
}

export interface WalletDocument {
  id: string;
  walletId: string;
  displayName: string;
  originalFileName: string;
  contentType?: string | null;
  sizeBytes: number;
  uploadedBy?: string | null;
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
  list: async (opts?: { groupId?: string; search?: string }) => {
    const params: Record<string, string> = {};
    if (opts?.groupId) params.groupId = opts.groupId;
    if (opts?.search) params.search = opts.search;
    const res = await api.get<ApiResponse<WalletListItem[]>>('/parent/wallets', {
      params: Object.keys(params).length ? params : undefined,
    });
    if (!res.data.success || !res.data.data) throw new Error('Failed to load wallets');
    return res.data.data;
  },

  groups: {
    list: async (): Promise<WalletGroup[]> => {
      const res = await api.get<ApiResponse<WalletGroup[]>>('/parent/wallet-groups');
      if (!res.data.success || !res.data.data) throw new Error('Failed to load wallet groups');
      return res.data.data;
    },
    get: async (id: string): Promise<WalletGroup> => {
      const res = await api.get<ApiResponse<WalletGroup>>(`/parent/wallet-groups/${id}`);
      if (!res.data.success || !res.data.data) throw new Error('Failed to load wallet group');
      return res.data.data;
    },
    create: async (body: WalletGroupRequest) => {
      const res = await api.post<ApiResponse<WalletGroup>>('/parent/wallet-groups', body, {
        skipGlobalErrorHandler: true,
      });
      return res.data;
    },
    update: async (id: string, body: WalletGroupRequest) => {
      const res = await api.put<ApiResponse<WalletGroup>>(`/parent/wallet-groups/${id}`, body, {
        skipGlobalErrorHandler: true,
      });
      return res.data;
    },
    remove: async (id: string) => {
      const res = await api.delete<{ success: boolean; message?: string }>(
        `/parent/wallet-groups/${id}`, { skipGlobalErrorHandler: true });
      return res.data;
    },
    backfill: async (id: string) => {
      const res = await api.post<{ success: boolean; created: number; message?: string }>(
        `/parent/wallet-groups/${id}/backfill`, {}, { skipGlobalErrorHandler: true });
      return res.data;
    },
    backfillCompanies: async (id: string) => {
      const res = await api.post<{ success: boolean; created: number; message?: string }>(
        `/parent/wallet-groups/${id}/backfill-companies`, {}, { skipGlobalErrorHandler: true });
      return res.data;
    },
    enrollCompany: async (id: string, companyCode: string, companyName?: string) => {
      const res = await api.post<{ success: boolean; message?: string }>(
        `/parent/wallet-groups/${id}/enroll-company`,
        { companyCode, companyName }, { skipGlobalErrorHandler: true });
      return res.data;
    },
    setDefault: async (id: string) => {
      const res = await api.post<ApiResponse<WalletGroup> & { message?: string }>(
        `/parent/wallet-groups/${id}/default`, {}, { skipGlobalErrorHandler: true });
      return res.data;
    },
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

  card: async (id: string) => {
    const res = await api.get<ApiResponse<WalletCard>>(`/parent/wallets/${id}/card`);
    if (!res.data.success || !res.data.data) throw new Error('Failed to load wallet card');
    return res.data.data;
  },

  setStatus: async (id: string, active: boolean) => {
    const res = await api.post<{ success: boolean; message?: string; isActive?: boolean }>(
      `/parent/wallets/${id}/status`, { active });
    return res.data;
  },

  remove: async (id: string) => {
    const res = await api.delete<{ success: boolean; message?: string }>(`/parent/wallets/${id}`);
    return res.data;
  },

  documents: {
    list: async (walletId: string): Promise<WalletDocument[]> => {
      const res = await api.get<ApiResponse<WalletDocument[]>>(`/parent/wallets/${walletId}/documents`);
      return res.data.data ?? [];
    },

    upload: async (
      walletId: string,
      file: File,
      opts?: { displayName?: string; onProgress?: (percent: number) => void },
    ): Promise<WalletDocument | null> => {
      const fd = new FormData();
      fd.append('file', file);
      if (opts?.displayName) fd.append('displayName', opts.displayName);
      const res = await api.post<ApiResponse<WalletDocument>>(
        `/parent/wallets/${walletId}/documents`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          skipGlobalErrorHandler: true,
          onUploadProgress: (evt) => {
            if (!opts?.onProgress || !evt.total) return;
            opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });
      return res.data.data ?? null;
    },

    download: async (walletId: string, doc: WalletDocument): Promise<void> => {
      const res = await api.get(`/parent/wallets/${walletId}/documents/${doc.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalFileName || doc.displayName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    remove: async (walletId: string, docId: string): Promise<void> => {
      await api.delete(`/parent/wallets/${walletId}/documents/${docId}`);
    },
  },
};
