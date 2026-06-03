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
  r2Endpoint?: string | null;
  r2Jurisdiction?: 'default' | 'eu' | string | null;
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
  r2Jurisdiction?: string | null;
  r2PublicBaseUrl?: string | null;
  maxFileSizeBytes?: number;
}

/**
 * نتيجة اختبار الاتصال مع Cloudflare R2 (rendre/قراءة/حذف كائن صغير).
 * يُستعمل في زر "اختبار الاتصال" في صفحة الإعدادات للحصول على تشخيص فوري
 * بدون انتظار دورة المزامنة.
 */
export interface R2ConnectionTestResultDto {
  success: boolean;
  stage?: string;
  message?: string;
  inner?: string | null;
  hint?: string | null;
  endpoint?: string | null;
  endpointHost?: string | null;
  accountId?: string | null;
  accountIdValid?: boolean;
  bucket?: string | null;
  jurisdiction?: string | null;
  bytesUploaded?: number;
  bytesRead?: number;
  elapsedMs?: number;
  checks?: Array<{ stage: string; ok: boolean; detail?: string; host?: string }>;
  timings?: {
    uploadMs: number;
    readMs: number;
    deleteMs: number;
    totalMs: number;
  };
  missing?: string[];
}

/**
 * لقطة حالة مزامنة المرفقات بين القرص المحلي و Cloudflare R2.
 * يُعاد منها كل دقيقة من الخدمة الخلفية ويستعملها زر شريط الرأس لعرض الحالة.
 */
export interface AttachmentSyncStatusDto {
  lastTickAtUtc?: string | null;
  pendingUploads: number;
  pendingDeletes: number;
  pendingLocalPurge: number;
  failedCount: number;
  lastUploadedCount: number;
  lastDeletedCount: number;
  lastLocalPurgedCount: number;
  lastWarning?: string | null;
  lastError?: string | null;
  lastErrorAtUtc?: string | null;
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

  /**
   * حالة المزامنة الحالية — تُستخدم لتغذية أيقونة الشريط العلوي بقيم Polling.
   * نُعيد قيماً افتراضية صفرية لو فشل الطلب كي لا تظهر الأيقونة بحالة خطأ
   * مؤقتة عند انقطاع شبكة عابر.
   */
  /**
   * اختبار اتصال مباشر مع R2 — يرفع كائناً صغيراً ويقرأه ويحذفه.
   *
   * نمنح الطلب timeout = 90 ثانية (بدل الـ 30 ث الافتراضية في axios) لأن:
   *   • TLS handshake مع Cloudflare على Windows Server قد يأخذ 5–15 ث.
   *   • AWS SDK قد يُعيد المحاولة (مع backoff) عند فشل عابر.
   *   • نريد للمستخدم أن يرى الخطأ الحقيقي من الباك إند، لا "client timeout".
   */
  testR2Connection: async (): Promise<R2ConnectionTestResultDto> => {
    const res = await api.post<R2ConnectionTestResultDto>(
      '/settings/attachments/test-r2-connection',
      undefined,
      { timeout: 90_000 },
    );
    return res.data;
  },

  getSyncStatus: async (): Promise<AttachmentSyncStatusDto> => {
    const res = await api.get<ApiResponse<AttachmentSyncStatusDto>>('/settings/attachments/sync-status');
    return (
      res.data.data ?? {
        pendingUploads: 0,
        pendingDeletes: 0,
        pendingLocalPurge: 0,
        failedCount: 0,
        lastUploadedCount: 0,
        lastDeletedCount: 0,
        lastLocalPurgedCount: 0,
      }
    );
  },
};
