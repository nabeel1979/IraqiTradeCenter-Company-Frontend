import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface CompanySettingsDto {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxNumber?: string | null;
  currency?: string | null;
  /** أسعار تقويم: {"USD":1320,"EUR":1400} = وحدة واحدة بالعملة الأجنبية = N بالعملة الأساسية */
  exchangeRatesJson?: string | null;
  logoBase64?: string | null;
  printHeader?: string | null;
  printFooter?: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
}

export type UpdateCompanySettingsPayload = Omit<
  CompanySettingsDto,
  'id' | 'updatedAt' | 'updatedBy'
>;

export const companySettingsApi = {
  get: async (): Promise<CompanySettingsDto> => {
    const res = await api.get<ApiResponse<CompanySettingsDto>>('/company-settings');
    return res.data.data!;
  },
  update: async (payload: UpdateCompanySettingsPayload): Promise<CompanySettingsDto> => {
    const res = await api.put<ApiResponse<CompanySettingsDto>>('/company-settings', payload);
    return res.data.data!;
  },
};
