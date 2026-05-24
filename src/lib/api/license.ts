import { api } from './client';
import type { ApiResponse } from '@/types/api';

/**
 * حالة الترخيص الحالية للنظام — تأتي من `GET /license/status`.
 * تعمل حتى عند انتهاء الترخيص (مسموح بها في `LicenseEnforcementMiddleware`).
 */
export interface LicenseStatus {
  companyKey: string;
  /** ISO datetime لانتهاء آخر تفعيل. null لو لم يفعَّل أبداً. */
  endDateUtc: string | null;
  daysRemaining: number;
  isActive: boolean;
  isInGrace: boolean;
  isExpired: boolean;
  lastCode: string | null;
  pricePerDay: number;
  currency: string;
  walletBalance: number;
}

export interface ActivationRow {
  id: number;
  code: string;
  days: number;
  startDate: string;
  endDate: string;
  appliedAt: string;
  appliedBy: string | null;
  source: 'Code' | 'Wallet' | 'Card' | string;
  note: string | null;
}

export interface BuyResult {
  method: 'Card' | 'Wallet';
  amount: number;
  currency: string;
  days: number;
  status: string;
  message?: string;
}

export const licenseApi = {
  status: async (): Promise<LicenseStatus> => {
    const res = await api.get<ApiResponse<LicenseStatus>>('/license/status');
    return res.data.data!;
  },
  history: async (take = 50): Promise<ActivationRow[]> => {
    const res = await api.get<ApiResponse<ActivationRow[]>>(`/license/history?take=${take}`);
    return res.data.data ?? [];
  },
  apply: async (code: string): Promise<ActivationRow> => {
    const res = await api.post<ApiResponse<ActivationRow>>('/license/apply', { code });
    return res.data.data!;
  },
  buyWithWallet: async (days: number): Promise<ActivationRow> => {
    const res = await api.post<ApiResponse<ActivationRow>>('/license/buy-with-wallet', { days });
    return res.data.data!;
  },
  buyWithCard: async (days: number): Promise<BuyResult> => {
    const res = await api.post<ApiResponse<BuyResult>>('/license/buy-with-card', { days });
    return res.data.data!;
  },
  generate: async (days: number): Promise<{ code: string; days: number }> => {
    const res = await api.post<ApiResponse<{ code: string; days: number }>>('/license/generate', { days });
    return res.data.data!;
  },
};
