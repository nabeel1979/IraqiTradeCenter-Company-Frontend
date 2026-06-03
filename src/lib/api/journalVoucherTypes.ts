import { api } from './client';
import type { ApiResponse } from '@/types/api';

/** طبيعة السند: Debit = الصندوق/الحساب يكون مديناً (مثل سند قبض)، Credit = دائناً (مثل سند دفع)، Mixed = يدوي بالكامل */
export type VoucherNature = 'Mixed' | 'Debit' | 'Credit';

export interface JournalVoucherTypeDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  defaultDebitAccountId?: number | null;
  defaultDebitAccountCode?: string | null;
  defaultDebitAccountName?: string | null;
  defaultCreditAccountId?: number | null;
  defaultCreditAccountCode?: string | null;
  defaultCreditAccountName?: string | null;
  isEnabled: boolean;
  isSystem: boolean;
  displayOrder: number;
  nature: VoucherNature;
  showInSidebar: boolean;
  linkedEntryCount: number;
  canDelete: boolean;
}

export interface UpsertJournalVoucherTypePayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  defaultDebitAccountId?: number | null;
  defaultCreditAccountId?: number | null;
  isEnabled: boolean;
  displayOrder: number;
  nature: VoucherNature;
  showInSidebar: boolean;
}

export const journalVoucherTypesApi = {
  getAll: async (enabledOnly = false, managementOnly = false): Promise<JournalVoucherTypeDto[]> => {
    const res = await api.get<ApiResponse<JournalVoucherTypeDto[]>>('/journal-voucher-types', {
      params: { enabledOnly, managementOnly },
    });
    return res.data.data ?? [];
  },

  getById: async (id: number): Promise<JournalVoucherTypeDto | null> => {
    const res = await api.get<ApiResponse<JournalVoucherTypeDto | null>>(`/journal-voucher-types/${id}`);
    return res.data.data ?? null;
  },

  create: async (payload: UpsertJournalVoucherTypePayload): Promise<{ id: number }> => {
    const res = await api.post<ApiResponse<{ id: number }>>('/journal-voucher-types', payload);
    return res.data.data!;
  },

  update: async (id: number, payload: UpsertJournalVoucherTypePayload): Promise<void> => {
    await api.put(`/journal-voucher-types/${id}`, payload);
  },

  toggle: async (id: number, isEnabled: boolean): Promise<void> => {
    await api.put(`/journal-voucher-types/${id}/toggle`, { isEnabled });
  },

  move: async (id: number, direction: 'up' | 'down'): Promise<void> => {
    await api.put(`/journal-voucher-types/${id}/move`, { direction });
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/journal-voucher-types/${id}`);
  },
};
