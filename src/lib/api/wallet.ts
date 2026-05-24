import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface WalletStatus {
  balance: number;
  currency: string;
}

export interface WalletTxnRow {
  id: number;
  delta: number;
  balance: number;
  reason: string;
  refId: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

export const walletApi = {
  status: async (): Promise<WalletStatus> => {
    const res = await api.get<ApiResponse<WalletStatus>>('/wallet/status');
    return res.data.data!;
  },
  transactions: async (take = 50): Promise<WalletTxnRow[]> => {
    const res = await api.get<ApiResponse<WalletTxnRow[]>>(`/wallet/transactions?take=${take}`);
    return res.data.data ?? [];
  },
  topup: async (amount: number, reference?: string, note?: string): Promise<{ balance: number }> => {
    const res = await api.post<ApiResponse<{ balance: number }>>('/wallet/topup', {
      amount,
      reference: reference ?? null,
      note: note ?? null,
    });
    return res.data.data!;
  },
};
