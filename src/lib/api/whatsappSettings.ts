import { api } from './client';
import type { ApiResponse } from '@/types/api';

export type WhatsAppProvider = 'UltraMsg' | 'MetaCloud';

export interface WhatsAppSettingsDto {
  isEnabled: boolean;
  useEmailForOtp?: boolean;
  provider?: WhatsAppProvider;
  instanceId?: string | null;
  phoneNumberId?: string | null;
  metaAppId?: string | null;
  metaWabaId?: string | null;
  tokenMasked?: string | null;
  tokenSet?: boolean;
  tokenLength?: number;
  otpTemplate?: string | null;
  invoiceTemplate?: string | null;
  reportTemplate?: string | null;
  generalTemplate?: string | null;
  metaOtpTemplateName?: string | null;
  metaOtpTemplateLanguage?: string | null;
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
  instanceStatus?: string | null;
  instanceReady?: boolean;
  instanceStatusMessage?: string | null;
}

export interface UpdateWhatsAppSettingsRequest {
  isEnabled?: boolean;
  useEmailForOtp?: boolean;
  provider?: WhatsAppProvider;
  instanceId?: string | null;
  phoneNumberId?: string | null;
  metaAppId?: string | null;
  metaWabaId?: string | null;
  token?: string | null;
  otpTemplate?: string | null;
  invoiceTemplate?: string | null;
  reportTemplate?: string | null;
  generalTemplate?: string | null;
  metaOtpTemplateName?: string | null;
  metaOtpTemplateLanguage?: string | null;
}

/** يدعم camelCase و PascalCase من الـ API. */
function normalizeWhatsAppSettings(raw: Record<string, unknown>): WhatsAppSettingsDto {
  const r = raw as Record<string, unknown>;
  const str = (camel: string, pascal: string) =>
    (r[camel] ?? r[pascal]) as string | null | undefined;
  const bool = (camel: string, pascal: string, fallback = false) =>
    (r[camel] ?? r[pascal] ?? fallback) as boolean;
  const num = (camel: string, pascal: string, fallback = 0) =>
    Number(r[camel] ?? r[pascal] ?? fallback);

  return {
    isEnabled: bool('isEnabled', 'IsEnabled'),
    useEmailForOtp: bool('useEmailForOtp', 'UseEmailForOtp', true),
    provider: (str('provider', 'Provider') as WhatsAppProvider | undefined) ?? 'UltraMsg',
    instanceId: str('instanceId', 'InstanceId') ?? null,
    phoneNumberId: str('phoneNumberId', 'PhoneNumberId') ?? null,
    metaAppId: str('metaAppId', 'MetaAppId') ?? null,
    metaWabaId: str('metaWabaId', 'MetaWabaId') ?? null,
    tokenMasked: str('tokenMasked', 'TokenMasked') ?? null,
    tokenSet: bool('tokenSet', 'TokenSet'),
    tokenLength: num('tokenLength', 'TokenLength'),
    otpTemplate: str('otpTemplate', 'OtpTemplate') ?? null,
    invoiceTemplate: str('invoiceTemplate', 'InvoiceTemplate') ?? null,
    reportTemplate: str('reportTemplate', 'ReportTemplate') ?? null,
    generalTemplate: str('generalTemplate', 'GeneralTemplate') ?? null,
    metaOtpTemplateName: str('metaOtpTemplateName', 'MetaOtpTemplateName') ?? null,
    metaOtpTemplateLanguage: str('metaOtpTemplateLanguage', 'MetaOtpTemplateLanguage') ?? null,
    updatedAtUtc: str('updatedAtUtc', 'UpdatedAtUtc') ?? null,
    updatedBy: str('updatedBy', 'UpdatedBy') ?? null,
    instanceStatus: str('instanceStatus', 'InstanceStatus') ?? null,
    instanceReady: bool('instanceReady', 'InstanceReady'),
    instanceStatusMessage: str('instanceStatusMessage', 'InstanceStatusMessage') ?? null,
  };
}

export const whatsappSettingsApi = {
  get: async (): Promise<WhatsAppSettingsDto> => {
    const res = await api.get<ApiResponse<Record<string, unknown>>>('/settings/whatsapp');
    if (!res.data.success || !res.data.data) throw new Error('Failed to load WhatsApp settings');
    return normalizeWhatsAppSettings(res.data.data);
  },

  update: async (payload: UpdateWhatsAppSettingsRequest): Promise<WhatsAppSettingsDto> => {
    const res = await api.put<ApiResponse<Record<string, unknown>>>('/settings/whatsapp', payload);
    if (!res.data.success || !res.data.data) {
      throw new Error((res.data as { errors?: string[] }).errors?.[0] ?? 'Save failed');
    }
    return normalizeWhatsAppSettings(res.data.data);
  },

  test: async (phone: string, message?: string) => {
    const res = await api.post<{ success: boolean; message?: string; phone?: string }>(
      '/settings/whatsapp/test',
      { phone, message },
    );
    return res.data;
  },
};
