import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface EmailSettingsDto {
  isEnabled: boolean;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  securityMode: string;
  username?: string | null;
  appPasswordMasked?: string | null;
  appPasswordSet?: boolean;
  fromEmail?: string | null;
  fromDisplayName?: string | null;
  replyToEmail?: string | null;
  signatureHtml?: string | null;
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
}

export interface UpdateEmailSettingsRequest {
  isEnabled?: boolean;
  provider?: string;
  smtpHost?: string;
  smtpPort?: number;
  securityMode?: string;
  username?: string | null;
  appPassword?: string | null;
  fromEmail?: string | null;
  fromDisplayName?: string | null;
  replyToEmail?: string | null;
  signatureHtml?: string | null;
}

export interface TestEmailResult {
  success: boolean;
  message?: string;
  detail?: string | null;
  toEmail?: string;
}

export const ZOHO_SMTP_PRESET = {
  provider: 'Zoho',
  smtpHost: 'smtp.zoho.com',
  smtpPort: 587,
  securityMode: 'StartTls',
} as const;

export const emailSettingsApi = {
  get: async (): Promise<EmailSettingsDto> => {
    const res = await api.get<ApiResponse<EmailSettingsDto>>('/settings/email');
    if (!res.data.success || !res.data.data) throw new Error('Failed to load email settings');
    return res.data.data;
  },

  update: async (payload: UpdateEmailSettingsRequest): Promise<EmailSettingsDto> => {
    const res = await api.put<ApiResponse<EmailSettingsDto>>('/settings/email', payload);
    if (!res.data.success || !res.data.data) {
      throw new Error((res.data as { errors?: string[] }).errors?.[0] ?? 'Save failed');
    }
    return res.data.data;
  },

  test: async (toEmail?: string): Promise<TestEmailResult> => {
    const res = await api.post<TestEmailResult & { success: boolean }>('/settings/email/test', {
      toEmail: toEmail?.trim() || undefined,
    });
    return res.data;
  },
};
