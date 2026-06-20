import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface DatabasePurgePreview {
  fiscalYearId: number;
  fiscalYearName?: string | null;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  journalEntries: number;
  journalEntryLines: number;
  invoices: number;
  invoiceLines: number;
  orders: number;
  orderItems: number;
  attachments: number;
  stockMovements: number;
  accountsWithOpeningBalance: number;
  itemsWithBalance: number;
}

export interface DatabasePurgeOperations {
  purgeJournalEntries: boolean;
  purgeInvoices: boolean;
  purgeOrders: boolean;
  purgeAttachments: boolean;
  renumberJournalEntries: boolean;
  renumberInvoices: boolean;
  renumberOrders: boolean;
  renumberDocuments: boolean;
  zeroAccountBalances: boolean;
  zeroItemBalances: boolean;
}

export interface DatabasePurgeRunPayload extends DatabasePurgeOperations {
  fiscalYearId: number;
  confirm: boolean;
}

export interface DatabasePurgeResult {
  success: boolean;
  backupFile?: string | null;
  backupError?: string | null;
  affected: Record<string, number>;
}

export const databasePurgeApi = {
  preview: async (fiscalYearId: number): Promise<DatabasePurgePreview> => {
    const res = await api.get<ApiResponse<DatabasePurgePreview>>(
      '/settings/database-purge/preview',
      { params: { fiscalYearId } },
    );
    return res.data.data!;
  },
  run: async (payload: DatabasePurgeRunPayload): Promise<DatabasePurgeResult> => {
    const res = await api.post<ApiResponse<DatabasePurgeResult>>(
      '/settings/database-purge/run',
      payload,
      { timeout: 600_000, skipGlobalErrorHandler: true },
    );
    return res.data.data!;
  },
};
