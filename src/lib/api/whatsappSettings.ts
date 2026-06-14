import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface WhatsAppSettingsDto {
  isEnabled: boolean;
  useEmailForOtp?: boolean;
  instanceId?: string | null;
  tokenMasked?: string | null;
  tokenSet?: boolean;
  otpTemplate?: string | null;
  invoiceTemplate?: string | null;
  reportTemplate?: string | null;
  generalTemplate?: string | null;
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
  instanceStatus?: string | null;
  instanceReady?: boolean;
  instanceStatusMessage?: string | null;
}

export interface UpdateWhatsAppSettingsRequest {
  isEnabled?: boolean;
  useEmailForOtp?: boolean;
  instanceId?: string | null;
  token?: string | null;
  otpTemplate?: string | null;
  invoiceTemplate?: string | null;
  reportTemplate?: string | null;
  generalTemplate?: string | null;
}

export const whatsappSettingsApi = {
  get: async (): Promise<WhatsAppSettingsDto> => {
    const res = await api.get<ApiResponse<WhatsAppSettingsDto>>('/settings/whatsapp');
    if (!res.data.success || !res.data.data) throw new Error('Failed to load WhatsApp settings');
    return res.data.data;
  },

  update: async (payload: UpdateWhatsAppSettingsRequest): Promise<WhatsAppSettingsDto> => {
    const res = await api.put<ApiResponse<WhatsAppSettingsDto>>('/settings/whatsapp', payload);
    if (!res.data.success || !res.data.data) {
      throw new Error((res.data as { errors?: string[] }).errors?.[0] ?? 'Save failed');
    }
    return res.data.data;
  },

  test: async (phone: string, message?: string) => {
    const res = await api.post<{ success: boolean; message?: string; phone?: string }>(
      '/settings/whatsapp/test',
      { phone, message },
    );
    return res.data;
  },
};
