import { api } from './client';
import type { ApiResponse } from '@/types/api';

/**
 * إعدادات مخزن المرفقات (مسار محلي / مفاتيح R2). تُجلَب من الواجهة لتعديلها
 * من صفحة الإعدادات. السرّ (SecretAccessKey) لا يُعاد كاملاً — فقط مُقنَّع.
 */
export interface AttachmentStorageSettingsDto {
  provider: 'Local' | 'R2' | string;
  localRootPath?: string | null;
  r2AccountId?: string | null;
  r2AccessKeyId?: string | null;
  r2SecretAccessKeyMasked?: string | null;
  /** هل السرّ مُعيَّن سابقاً؟ — يستعمله الـ UI لتمييز "غير مُحدَّد" عن "محفوظ". */
  r2SecretAccessKeySet?: boolean;
  r2Bucket?: string | null;
  r2PublicBaseUrl?: string | null;
  maxFileSizeBytes: number;
  updatedAtUtc?: string | null;
  updatedBy?: string | null;
}

export interface UpdateAttachmentStorageSettingsRequest {
  provider?: string;
  localRootPath?: string | null;
  r2AccountId?: string | null;
  r2AccessKeyId?: string | null;
  /** اتركه فارغاً للإبقاء على القديم؛ مرّر قيمة جديدة للاستبدال. */
  r2SecretAccessKey?: string | null;
  r2Bucket?: string | null;
  r2PublicBaseUrl?: string | null;
  maxFileSizeBytes?: number;
}

export const attachmentSettingsApi = {
  get: async (): Promise<AttachmentStorageSettingsDto> => {
    const res = await api.get<ApiResponse<AttachmentStorageSettingsDto>>('/settings/attachments');
    return (
      res.data.data ?? {
        provider: 'Local',
        maxFileSizeBytes: 25 * 1024 * 1024,
      }
    );
  },

  update: async (
    payload: UpdateAttachmentStorageSettingsRequest,
  ): Promise<{ data: AttachmentStorageSettingsDto; warning?: string }> => {
    const res = await api.put<ApiResponse<AttachmentStorageSettingsDto> & { warning?: string }>(
      '/settings/attachments',
      payload,
    );
    return {
      data: res.data.data ?? { provider: 'Local', maxFileSizeBytes: 25 * 1024 * 1024 },
      warning: res.data.warning,
    };
  },
};
