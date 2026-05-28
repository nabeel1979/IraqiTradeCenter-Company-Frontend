import { api } from './client';
import type { ApiResponse } from '@/types/api';

/**
 * مرفق واحد على سند/قيد محاسبي. يأتي من
 *   GET /api/vouchers/{entryId}/attachments
 *
 * <c>storageProvider</c> يخبرنا من خزَّن الملف (محلياً أم R2)؛ الواجهة لا تتعامل
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
  download: async (entryId: number | string, att: VoucherAttachmentDto): Promise<void> => {
    const res = await api.get<Blob>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments/${att.id}/download`,
      { responseType: 'blob' },
    );
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
  getRawBlob: async (entryId: number | string, attId: number): Promise<string> => {
    const res = await api.get<Blob>(
      `/vouchers/${encodeURIComponent(String(entryId))}/attachments/${attId}/download`,
      { responseType: 'blob' },
    );
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
