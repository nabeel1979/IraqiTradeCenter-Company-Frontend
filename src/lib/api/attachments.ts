import { api } from './client';
import type { ApiResponse } from '@/types/api';
import type { AxiosError, AxiosResponse } from 'axios';

/** مهلة أطول لتحميل/معاينة الملفات (قراءة من القرص أو R2). */
const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 120_000;

async function parseBlobErrorMessage(data: Blob): Promise<string> {
  const text = await data.text();
  try {
    const body = JSON.parse(text) as { message?: string; errors?: string[] };
    return body.errors?.[0] ?? body.message ?? 'تعذّر تحميل الملف';
  } catch {
    return text.trim() || 'تعذّر تحميل الملف';
  }
}

async function readAttachmentBlob(
  entryId: number | string,
  attId: number,
  onProgress?: (percent: number) => void,
): Promise<AxiosResponse<Blob>> {
  try {
    const res = await api.get<Blob>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments/${attId}/download`,
      {
        responseType: 'blob',
        timeout: ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
        skipGlobalErrorHandler: true,
        onDownloadProgress: (evt) => {
          if (!onProgress || !evt.total) return;
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      },
    );

    const rawCt = res.headers['content-type'] ?? res.data.type ?? '';
    const contentType = String(rawCt).toLowerCase();
    if (contentType.includes('json') || contentType.includes('problem+json')) {
      throw new Error(await parseBlobErrorMessage(res.data));
    }

    if (res.data.size === 0) {
      throw new Error('الملف فارغ أو غير متاح');
    }

    return res;
  } catch (err: unknown) {
    const ax = err as AxiosError<Blob>;
    if (ax.response?.data instanceof Blob) {
      throw new Error(await parseBlobErrorMessage(ax.response.data));
    }
    if (ax.code === 'ECONNABORTED') {
      throw new Error('انتهت مهلة تحميل الملف');
    }
    if (!ax.response) {
      throw new Error('لا يمكن الاتصال بالخادم');
    }
    throw err instanceof Error ? err : new Error('تعذّر تحميل الملف');
  }
}

/** أنواع الملفات المسموحة في أرشيف السند. */
export const VOUCHER_ATTACHMENT_ACCEPT =
  'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar,.7z,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed';

/**
 * مرفق واحد على سند/قيد محاسبي. يأتي من
 *   GET /api/vouchers/{entryId}/attachments
 *
 * storageProvider يخبرنا من خزَّن الملف (محلياً أم R2)؛ الواجهة لا تتعامل
 * مع المخزن مباشرة — فقط تستدعي endpoint التنزيل والخادم يفكّ المفتاح بنفسه.
 */
export interface VoucherAttachmentDto {
  id: number;
  journalEntryId: number;
  displayName: string;
  originalFileName: string;
  contentType?: string | null;
  sizeBytes: number;
  storageProvider: string;
  uploadedByUserId?: string | null;
  uploadedByUserName?: string | null;
  uploadedAtUtc: string;
  notes?: string | null;
}

export const voucherAttachmentsApi = {
  /** قائمة مرفقات قيد. */
  list: async (entryId: number | string): Promise<VoucherAttachmentDto[]> => {
    const res = await api.get<ApiResponse<VoucherAttachmentDto[]>>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments`,
    );
    return res.data.data ?? [];
  },

  /**
   * رفع ملف جديد. نمرّر <c>displayName</c> اختيارياً (سيُستبدل باسم الملف عند الترك).
   * <c>onProgress</c> يُستخدم لتغذية progress-bar في الـ Dialog.
   */
  upload: async (
    entryId: number | string,
    file: File,
    opts?: { displayName?: string; notes?: string; onProgress?: (percent: number) => void },
  ): Promise<VoucherAttachmentDto | null> => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts?.displayName) fd.append('displayName', opts.displayName);
    if (opts?.notes) fd.append('notes', opts.notes);
    const res = await api.post<ApiResponse<VoucherAttachmentDto>>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments`,
      fd,
      {
        // ‎لا تُضِف Content-Type يدوياً — Axios يضيفه مع boundary صحيح.
        headers: { 'Content-Type': 'multipart/form-data' },
        // ‎المكوّن يعالج الخطأ ويعرض رسالة واضحة (خصوصاً تجاوز الحجم) بنفسه.
        skipGlobalErrorHandler: true,
        onUploadProgress: (evt) => {
          if (!opts?.onProgress || !evt.total) return;
          opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      },
    );
    return res.data.data ?? null;
  },

  /**
   * تنزيل مرفق كـ Blob ثم تشغيل التنزيل في المتصفح. نستعمل blob URL مؤقّتاً حتى
   * نستفيد من توكين الـ Authorization (لا نقدر نستخدم <c>&lt;a download&gt;</c> مباشرة).
   */
  download: async (
    entryId: number | string,
    att: VoucherAttachmentDto,
    onProgress?: (percent: number) => void,
  ): Promise<void> => {
    const res = await readAttachmentBlob(entryId, att.id, onProgress);
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.originalFileName || att.displayName || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * جلب الملف كـ Blob URL مؤقت — يُستخدم من `FileViewerDialog` للعرض الداخلي.
   * المستدعي مسؤول عن استدعاء `URL.revokeObjectURL` عند الانتهاء.
   */
  getRawBlob: async (
    entryId: number | string,
    attId: number,
    onProgress?: (percent: number) => void,
  ): Promise<string> => {
    const res = await readAttachmentBlob(entryId, attId, onProgress);
    return URL.createObjectURL(res.data);
  },

  /** فتح مرفق في تبويب جديد (fallback للملفات خارج التطبيق). */
  openInNewTab: async (entryId: number | string, att: VoucherAttachmentDto): Promise<void> => {
    const url = await voucherAttachmentsApi.getRawBlob(entryId, att.id);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  rename: async (
    entryId: number | string,
    attId: number,
    displayName: string,
  ): Promise<VoucherAttachmentDto | null> => {
    const res = await api.patch<ApiResponse<VoucherAttachmentDto>>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments/${attId}/rename`,
      { displayName },
    );
    return res.data.data ?? null;
  },

  updateNotes: async (
    entryId: number | string,
    attId: number,
    notes: string | null,
  ): Promise<VoucherAttachmentDto | null> => {
    const res = await api.patch<ApiResponse<VoucherAttachmentDto>>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments/${attId}/notes`,
      { notes },
    );
    return res.data.data ?? null;
  },

  remove: async (entryId: number | string, attId: number): Promise<void> => {
    await api.delete(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments/${attId}`,
    );
  },
};

/** صياغة حجم الملف بأقرب وحدة (KB/MB/GB). يبقى دائماً بالأرقام اللاتينية. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'image/bmp': 'BMP',
  'image/tiff': 'TIFF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'application/vnd.rar': 'RAR',
  'application/x-rar-compressed': 'RAR',
  'application/x-7z-compressed': '7Z',
};

/** صيغة الملف للعرض (مثل PDF أو PNG) — من الاسم الأصلي أو نوع المحتوى. */
export function formatFileExtension(
  att: Pick<VoucherAttachmentDto, 'originalFileName' | 'contentType'>,
): string | null {
  const fromName = att.originalFileName?.match(/\.([^.]+)$/)?.[1]?.trim();
  if (fromName) return fromName.toUpperCase();

  const ct = att.contentType?.trim().toLowerCase();
  if (!ct) return null;
  if (MIME_TO_EXT[ct]) return MIME_TO_EXT[ct];

  const subtype = ct.split('/')[1];
  if (!subtype) return null;
  const clean = subtype.split('+')[0]?.split(';')[0]?.trim();
  return clean ? clean.toUpperCase() : null;
}
