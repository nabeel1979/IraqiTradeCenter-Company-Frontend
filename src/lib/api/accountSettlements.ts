import { api } from './client';

export interface AccountSettlementSettingsDto {
  transitAccounts: Record<string, number>;
  fxGainAccountId?: number | null;
  fxLossAccountId?: number | null;
  fxDiscountAccountId?: number | null;
}

export interface AccountSettlementRowDto {
  id: number;
  settlementNumber: string;
  settlementDate: string;
  sourceAccountId: number;
  sourceAccountCode: string;
  sourceAccountName: string;
  sourceCurrency: string;
  sourceAmount: number;
  targetAccountId: number;
  targetAccountCode: string;
  targetAccountName: string;
  targetCurrency: string;
  targetAmount: number;
  exchangeRate: number;
  fxGainLossAmount: number;
  fxDiscountAmount: number;
  effectiveFxGainLossAmount: number;
  isCancelled: boolean;
  cancelReason?: string | null;
  sourceJournalEntryId: number;
  sourceEntryNumber?: string | null;
  targetJournalEntryId: number;
  targetEntryNumber?: string | null;
  sourceReversalJournalEntryId?: number | null;
  targetReversalJournalEntryId?: number | null;
  sourceReversalEntryNumber?: string | null;
  targetReversalEntryNumber?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface SettlementTransitMovementDto {
  settlementId: number;
  settlementNumber: string;
  settlementDate: string;
  transitAccountId: number;
  transitAccountCode: string;
  transitAccountName: string;
  currency: string;
  isDebit: boolean;
  amount: number;
  side: string;
  isCancelled: boolean;
  journalEntryId: number;
  entryNumber?: string | null;
}

export interface SettlementJournalLinePreviewDto {
  accountId: number;
  accountCode: string;
  accountName: string;
  isDebit: boolean;
  amount: number;
  currency: string;
  description?: string | null;
}

export interface SettlementPreviewDto {
  sourceBalance: number;
  targetBalance: number;
  bulletinCrossRate: number;
  computedTargetAmount: number;
  fxGainLossAmount: number;
  fxDiscountAmount: number;
  effectiveFxGainLossAmount: number;
  baseCurrency: string;
  bulletinName?: string | null;
  bulletinEffectiveAt?: string | null;
  exchangeRateDisplay?: string | null;
  bulletinCrossRateDisplay?: string | null;
}

export interface SettlementCreatePreviewDto {
  preview: SettlementPreviewDto;
  sourceEntryLines: SettlementJournalLinePreviewDto[];
  targetEntryLines: SettlementJournalLinePreviewDto[];
}

export interface CreateAccountSettlementPayload {
  sourceAccountId: number;
  sourceCurrency: string;
  sourceAmount: number;
  targetAccountId: number;
  targetCurrency: string;
  targetAmount?: number | null;
  exchangeRate?: number | null;
  fxDiscountAmount?: number | null;
  settlementDate: string;
  sourceTransitAccountId?: number | null;
  targetTransitAccountId?: number | null;
  description?: string | null;
}

export interface CancelAccountSettlementPayload {
  reversalDate?: string | null;
  reason?: string | null;
}

export const accountSettlementsApi = {
  getSettings: async () => {
    const res = await api.get<{ success: boolean; data: AccountSettlementSettingsDto }>(
      '/financial-management/account-settlements/settings',
    );
    return res.data.data!;
  },
  updateSettings: async (payload: AccountSettlementSettingsDto) => {
    const res = await api.put<{ success: boolean }>(
      '/financial-management/account-settlements/settings',
      {
        transitAccounts: payload.transitAccounts,
        fxGainAccountId: payload.fxGainAccountId ?? null,
        fxLossAccountId: payload.fxLossAccountId ?? null,
        fxDiscountAccountId: payload.fxDiscountAccountId ?? null,
      },
    );
    return res.data;
  },
  list: async (params?: { from?: string; to?: string }) => {
    const res = await api.get<{ success: boolean; data: AccountSettlementRowDto[] }>(
      '/financial-management/account-settlements',
      { params },
    );
    return res.data.data ?? [];
  },
  transitMovements: async (params?: {
    from?: string;
    to?: string;
    currency?: string;
    transitAccountId?: number;
  }) => {
    const res = await api.get<{ success: boolean; data: SettlementTransitMovementDto[] }>(
      '/financial-management/account-settlements/transit-movements',
      { params },
    );
    return res.data.data ?? [];
  },
  preview: async (payload: CreateAccountSettlementPayload) => {
    const res = await api.post<{ success: boolean; data: SettlementCreatePreviewDto }>(
      '/financial-management/account-settlements/preview',
      payload,
    );
    return res.data.data!;
  },
  create: async (payload: CreateAccountSettlementPayload) => {
    const res = await api.post<{ success: boolean; data: number }>(
      '/financial-management/account-settlements',
      payload,
    );
    return res.data.data!;
  },
  cancel: async (id: number, payload: CancelAccountSettlementPayload) => {
    const res = await api.post<{ success: boolean; data: number }>(
      `/financial-management/account-settlements/${id}/cancel`,
      payload,
    );
    return res.data.data!;
  },
  delete: async (id: number) => {
    await api.delete(`/financial-management/account-settlements/${id}`);
  },
};
