import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface CurrencyDto {
  code: string;
  /** الرقم العالمي ISO 4217 (3 أرقام) */
  numericCode?: string | null;
  nameAr: string;
  nameEn?: string | null;
  symbol?: string | null;
  decimalPlaces: number;
  isEnabled: boolean;
  isBase: boolean;
  displayOrder: number;
}

export interface UpsertCurrencyPayload {
  numericCode?: string | null;
  nameAr: string;
  nameEn?: string | null;
  symbol?: string | null;
  decimalPlaces: number;
  isEnabled: boolean;
  displayOrder: number;
}

export const currenciesApi = {
  /** قائمة كل العملات مع حالات IsEnabled / IsBase */
  getAll: async (enabledOnly = false): Promise<CurrencyDto[]> => {
    const res = await api.get<ApiResponse<CurrencyDto[]>>('/currencies', {
      params: { enabledOnly },
    });
    return res.data.data ?? [];
  },

  /** العملة الأساسية الحالية */
  getBase: async (): Promise<CurrencyDto | null> => {
    const res = await api.get<ApiResponse<CurrencyDto | null>>('/currencies/base');
    return res.data.data ?? null;
  },

  /** تفعيل/تعطيل عملة */
  toggle: async (code: string, isEnabled: boolean): Promise<void> => {
    await api.put(`/currencies/${encodeURIComponent(code)}/toggle`, { isEnabled });
  },

  /** تغيير العملة الرئيسية (يُرفض إن كانت العملة الحالية مستخدمة في قيود) */
  setBase: async (code: string): Promise<void> => {
    await api.put('/currencies/base', { code });
  },

  /** تحريك العملة لأعلى/أسفل في تسلسل العرض */
  move: async (code: string, direction: 'up' | 'down'): Promise<void> => {
    await api.put(`/currencies/${encodeURIComponent(code)}/move`, { direction });
  },

  /** إنشاء/تعديل عملة */
  upsert: async (code: string, payload: UpsertCurrencyPayload): Promise<CurrencyDto> => {
    const res = await api.put<ApiResponse<CurrencyDto>>(
      `/currencies/${encodeURIComponent(code)}`,
      payload
    );
    return res.data.data!;
  },
};
