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
  /** ‎الحساب المرتبط له سطور قيود — لا يُسمح بالحذف */
  hasMovements?: boolean;
  branchId?: number | null;
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
  branchId?: number | null;
}

export interface CashBoxBalanceDto {
  cashBoxId: number;
  code: string;
  nameAr: string;
  accountId: number;
  accountCode?: string | null;
  accountName?: string | null;
  currency: string;
  debit: number;
  credit: number;
  balance: number;
  debitLimit?: number | null;
  creditLimit?: number | null;
}

export type CashBoxTransferStatus = 'PendingReceive' | 'Received' | 'Cancelled';

export interface CashBoxTransferDto {
  id: number;
  transferNumber: string;
  fromCashBoxId: number;
  fromCashBoxCode: string;
  fromCashBoxName: string;
  toCashBoxId: number;
  toCashBoxCode: string;
  toCashBoxName: string;
  transitAccountId: number;
  transitAccountCode?: string | null;
  transitAccountName?: string | null;
  currency: string;
  amount: number;
  sendDate: string;
  receiveDate: string;
  description?: string | null;
  referenceNumber?: string | null;
  sendJournalEntryId: number;
  sendEntryNumber?: string | null;
  receiveJournalEntryId?: number | null;
  receiveEntryNumber?: string | null;
  reversalJournalEntryId?: number | null;
  reversalEntryNumber?: string | null;
  status: CashBoxTransferStatus;
  receivedByUserId?: string | null;
  receivedAt?: string | null;
  receiveNotes?: string | null;
  cancelledByUserId?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
}

export interface CreateCashBoxTransferPayload {
  fromCashBoxId: number;
  toCashBoxId: number;
  transitAccountId: number;
  currency: string;
  amount: number;
  /** ISO datetime — يدعم التاريخ والوقت معاً */
  sendDate: string;
  receiveDate: string;
  description?: string | null;
  referenceNumber?: string | null;
  postImmediately?: boolean;
}

export interface ListTransfersFilters {
  fromDate?: string;
  toDate?: string;
  cashBoxId?: number;
  currency?: string;
  status?: CashBoxTransferStatus;
  skip?: number;
  take?: number;
}

export interface ReceiveTransferPayload {
  actualReceiveDate?: string;
  notes?: string | null;
  postImmediately?: boolean;
}

export interface CancelTransferPayload {
  reason?: string | null;
  reversalDate?: string;
  postImmediately?: boolean;
}

export interface UnreceiveTransferPayload {
  reason?: string | null;
  reversalDate?: string;
  postImmediately?: boolean;
}

export interface UpdateCashBoxTransferPayload {
  amount: number;
  sendDate: string;
  transitAccountId: number;
  description?: string | null;
  referenceNumber?: string | null;
  postImmediately?: boolean;
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

  // ─────────────────────────────────────────────────────────────────
  // الأرصدة + المناقلات
  // ─────────────────────────────────────────────────────────────────

  getBalances: async (currency?: string): Promise<CashBoxBalanceDto[]> => {
    const res = await api.get<ApiResponse<CashBoxBalanceDto[]>>('/cash-boxes/balances', {
      params: currency ? { currency } : undefined,
    });
    return res.data.data ?? [];
  },

  getTransfers: async (filters: ListTransfersFilters = {}): Promise<CashBoxTransferDto[]> => {
    const res = await api.get<ApiResponse<CashBoxTransferDto[]>>('/cash-boxes/transfers', {
      params: filters,
    });
    return res.data.data ?? [];
  },

  createTransfer: async (payload: CreateCashBoxTransferPayload): Promise<{ id: number }> => {
    const res = await api.post<ApiResponse<{ id: number }>>('/cash-boxes/transfers', payload);
    return res.data.data!;
  },

  receiveTransfer: async (id: number, payload: ReceiveTransferPayload): Promise<void> => {
    await api.post(`/cash-boxes/transfers/${id}/receive`, payload);
  },

  cancelTransfer: async (id: number, payload: CancelTransferPayload): Promise<void> => {
    await api.post(`/cash-boxes/transfers/${id}/cancel`, payload);
  },

  unreceiveTransfer: async (id: number, payload: UnreceiveTransferPayload): Promise<void> => {
    await api.post(`/cash-boxes/transfers/${id}/unreceive`, payload);
  },

  updateTransfer: async (id: number, payload: UpdateCashBoxTransferPayload): Promise<void> => {
    await api.put(`/cash-boxes/transfers/${id}`, payload);
  },

  /**
   * حذف نهائي لمناقلة ملغاة + جميع قيودها المحاسبية. متاح فقط للحالة Cancelled.
   */
  deleteTransfer: async (id: number, reason?: string | null): Promise<void> => {
    await api.delete(`/cash-boxes/transfers/${id}`, { data: { reason: reason ?? null } });
  },
};
