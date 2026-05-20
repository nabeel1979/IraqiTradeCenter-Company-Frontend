import { api } from './client';
import type { ApiResponse, AccountDto, AccountStatementDto, JournalEntryDto, PagedResult, TrialBalanceRowDto } from '@/types/api';

export interface AccountStatementParams {
  from: string;          // YYYY-MM-DD
  to: string;            // YYYY-MM-DD
  accountId?: number;    // null = all accounts
  currency?: string;     // null = all currencies
  includeDraft?: boolean;
}

export type JournalEntryType = 1 | 2; // 1=Normal, 2=Opening

export interface JournalLinePayload {
  accountId: number;
  isDebit: boolean;
  amount: number;
  description?: string | null;
}

export interface PostJournalEntryPayload {
  entryDate: string;
  description: string;
  entryType?: JournalEntryType;
  currency?: string;
  postImmediately?: boolean;
  voucherTypeId?: number | null;
  lines: JournalLinePayload[];
}

export interface UpdateJournalEntryPayload {
  entryDate: string;
  description: string;
  entryType: JournalEntryType;
  currency: string;
  postImmediately?: boolean;
  voucherTypeId?: number | null;
  lines: JournalLinePayload[];
}

/** تحديث سند مخصّص (سند قبض/دفع/…) — لا يحتاج entryType أو voucherTypeId (ثابتان) */
export interface UpdateVoucherEntryPayload {
  entryDate: string;
  description: string;
  currency: string;
  postImmediately?: boolean;
  lines: JournalLinePayload[];
}

export interface JournalEntriesListParams {
  pageNumber?: number; pageSize?: number; status?: string; search?: string;
  fromDate?: string; toDate?: string; voucherTypeId?: number;
}

export interface CreateAccountPayload {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  type: number;     // 1=Asset, 2=Liability, 3=Equity, 4=Revenue, 5=Expense
  nature?: number | null; // 1=Debit, 2=Credit (auto if null)
  parentId?: number | null;
  isLeaf: boolean;
  description?: string | null;
}

export interface UpdateAccountPayload {
  nameAr: string;
  nameEn?: string | null;
  type: number;
  nature: number;
  description?: string | null;
  isActive: boolean;
}

export const accountingApi = {
  getTree: async () => {
    const res = await api.get<ApiResponse<AccountDto[]>>('/accounts/tree');
    return res.data.data ?? [];
  },
  createAccount: async (data: CreateAccountPayload) => {
    const res = await api.post<ApiResponse<number>>('/accounts', data);
    return res.data;
  },
  updateAccount: async (id: number, data: UpdateAccountPayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/accounts/${id}`, { id, ...data });
    return res.data;
  },
  deleteAccount: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/${id}`);
    return res.data;
  },
  getTrialBalance: async (from: string, to: string) => {
    const res = await api.get<ApiResponse<TrialBalanceRowDto[]>>('/accounts/trial-balance', { params: { from, to } });
    return res.data.data ?? [];
  },
  getAccountStatement: async (params: AccountStatementParams) => {
    const res = await api.get<ApiResponse<AccountStatementDto>>('/accounts/statement', { params });
    return res.data.data!;
  },
  getJournalEntries: async (params: JournalEntriesListParams = {}) => {
    const res = await api.get<ApiResponse<PagedResult<JournalEntryDto>>>('/accounts/journal-entries', { params });
    return res.data.data!;
  },
  postJournalEntry: async (data: PostJournalEntryPayload) => {
    const res = await api.post<ApiResponse<number>>('/accounts/journal-entries', data);
    return res.data;
  },
  getJournalEntryById: async (id: number) => {
    const res = await api.get<ApiResponse<JournalEntryDto>>(`/accounts/journal-entries/${id}`);
    return res.data.data!;
  },
  updateJournalEntry: async (id: number, data: UpdateJournalEntryPayload) => {
    const res = await api.put<ApiResponse<number>>(`/accounts/journal-entries/${id}`, { id, ...data });
    return res.data;
  },
  deleteJournalEntry: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/journal-entries/${id}`);
    return res.data;
  },
  // ── سندات (تعديل/حذف القيود المولّدة من سندات مخصّصة)
  updateVoucherEntry: async (id: number, data: UpdateVoucherEntryPayload) => {
    const res = await api.put<ApiResponse<number>>(`/accounts/vouchers/${id}`, { id, ...data });
    return res.data;
  },
  deleteVoucherEntry: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/accounts/vouchers/${id}`);
    return res.data;
  },
};
