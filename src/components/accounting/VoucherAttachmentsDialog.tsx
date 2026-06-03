import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  X, Paperclip, Upload, Trash2, Download, Eye, FileText,
  Image, File, Archive, AlertTriangle, Loader2, Pencil, Check, ScanLine,
} from 'lucide-react';
import { WebScannerModal } from '@/components/WebScanner/WebScannerModal';
import { getBridgeStatus } from '@/lib/webscanner/embed';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  voucherAttachmentsApi,
  formatFileSize,
  formatFileExtension,
  VOUCHER_ATTACHMENT_ACCEPT,
  type VoucherAttachmentDto,
} from '@/lib/api/attachments';
import { attachmentSettingsApi } from '@/lib/api/attachmentSettings';
import { FileViewerDialog } from './FileViewerDialog';

const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

interface VoucherAttachmentsDialogProps {
  open: boolean;
  onClose: () => void;
  entryId: number;
  subtitle?: string;
}

function fileIcon(ct?: string | null, fileName?: string | null) {
  const ext = fileName?.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (ext && ['zip', 'rar', '7z'].includes(ext)) return Archive;
  if (!ct) return File;
  if (ct.startsWith('image/')) return Image;
  if (ct === 'application/pdf') return FileText;
  if (
    ct.includes('zip')
    || ct.includes('rar')
    || ct.includes('7z')
    || ct.includes('x-compressed')
  ) return Archive;
  return File;
}

export function VoucherAttachmentsDialog({ open, onClose, entryId, subtitle }: VoucherAttachmentsDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // ‎معاينة داخل التطبيق (تعمل في تطبيق وندوز حيث لا يُفتح window.open تبويباً).
  const [viewerAtt, setViewerAtt] = useState<VoucherAttachmentDto | null>(null);
  // ‎تحرير اسم العرض/الوصف لمرفق موجود (inline).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  // ‎null = ما زال يتحقق، true = ماسح متصل، false = لا يوجد ماسح/الجسر غير متاح.
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  // ‎حالة تحميل/تنزيل مرفق معيّن مع نسبة حقيقية (0–100).
  const [downloadState, setDownloadState] = useState<{ id: number; percent: number } | null>(null);

  // ‎نفحص اتصال الماسح عند فتح النافذة فقط (عبر كاش مشترك مع تباطؤ عند عدم
  // ‎الاتصال) وعند عودة التركيز للنافذة — بدل polling متكرر يُغرق الحاسبات التي
  // ‎لا يوجد فيها مشغّل السكنر بأخطاء شبكة حمراء.
  useEffect(() => {
    if (!open || scannerOpen) {
      return;
    }
    let active = true;
    const check = async () => {
      const status = await getBridgeStatus();
      if (active) setScannerReady(status.online && status.devices.length > 0);
    };
    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [open, scannerOpen]);

  const key = ['voucher-attachments', entryId];

  // ‎الحد الأقصى لحجم الملف (قابل للضبط من الإعدادات، افتراضياً 25 ميجابايت).
  const settingsQuery = useQuery({
    queryKey: ['attachment-settings', 'max-size'],
    queryFn: () => attachmentSettingsApi.get(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const maxFileSizeBytes =
    settingsQuery.data?.maxFileSizeBytes && settingsQuery.data.maxFileSizeBytes > 0
      ? settingsQuery.data.maxFileSizeBytes
      : DEFAULT_MAX_FILE_SIZE_BYTES;

  // ‎رسالة خطأ واضحة عند تجاوز الحجم، أو null إذا كان الحجم مقبولاً.
  const fileSizeError = (file: { size: number }): string | null => {
    if (file.size <= maxFileSizeBytes) return null;
    return t('attachments.fileTooLarge', {
      size: formatFileSize(file.size),
      max: formatFileSize(maxFileSizeBytes),
      defaultValue:
        'حجم الملف ({{size}}) يتجاوز الحد الأقصى المسموح ({{max}}). يرجى تقليل عدد الصفحات أو الدقة ثم المحاولة مرة أخرى.',
    });
  };

  // ‎ترجمة أخطاء الرفع (خصوصاً قطع الاتصال عند تجاوز حجم الجسم على الخادم) إلى
  // ‎رسالة مفهومة. عند انعدام الاستجابة مع ملف كبير نفترض تجاوز الحجم.
  const uploadErrorMessage = (e: any, file?: { size: number }): string => {
    const serverMsg = e?.response?.data?.errors?.[0] ?? e?.response?.data?.message;
    if (serverMsg) return serverMsg;
    const status = e?.response?.status;
    if (status === 413) {
      return t('attachments.fileTooLarge', {
        size: file ? formatFileSize(file.size) : '',
        max: formatFileSize(maxFileSizeBytes),
        defaultValue:
          'حجم الملف ({{size}}) يتجاوز الحد الأقصى المسموح ({{max}}). يرجى تقليل عدد الصفحات أو الدقة ثم المحاولة مرة أخرى.',
      });
    }
    const code = e?.code;
    const noResponse = !e?.response;
    const protocolError =
      code === 'ERR_NETWORK' ||
      code === 'ERR_HTTP2_PROTOCOL_ERROR' ||
      /network|protocol|http2/i.test(String(e?.message ?? ''));
    if (noResponse && (protocolError || (file && file.size > maxFileSizeBytes))) {
      return t('attachments.fileTooLarge', {
        size: file ? formatFileSize(file.size) : '',
        max: formatFileSize(maxFileSizeBytes),
        defaultValue:
          'حجم الملف ({{size}}) يتجاوز الحد الأقصى المسموح ({{max}}). يرجى تقليل عدد الصفحات أو الدقة ثم المحاولة مرة أخرى.',
      });
    }
    return e?.message ?? t('common.error');
  };

  const listQuery = useQuery({
    queryKey: key,
    queryFn: () => voucherAttachmentsApi.list(entryId),
    enabled: open && !!entryId,
    staleTime: 10_000,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0);
      return voucherAttachmentsApi.upload(entryId, file, {
        displayName: displayName.trim() || undefined,
        notes: notes.trim() || undefined,
        onProgress: setProgress,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setDisplayName('');
      setNotes('');
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(t('attachments.uploadSuccess'));
    },
    onError: (e: any, file) => {
      setProgress(null);
      toast.error(uploadErrorMessage(e, file));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (attId: number) => voucherAttachmentsApi.remove(entryId, attId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setConfirmDeleteId(null); },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? e?.message ?? t('common.error')),
  });

  // ‎تحديث اسم العرض و/أو الوصف لمرفق موجود: نُرسل فقط ما تغيّر فعلاً.
  const updateMut = useMutation({
    mutationFn: async (vars: { att: VoucherAttachmentDto; displayName: string; notes: string }) => {
      const name = vars.displayName.trim();
      if (name && name !== vars.att.displayName) {
        await voucherAttachmentsApi.rename(entryId, vars.att.id, name);
      }
      const newNotes = vars.notes.trim();
      if (newNotes !== (vars.att.notes ?? '')) {
        await voucherAttachmentsApi.updateNotes(entryId, vars.att.id, newNotes || null);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setEditingId(null);
      toast.success(t('common.success'));
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? e?.message ?? t('common.error')),
  });

  const startEdit = (att: VoucherAttachmentDto) => {
    setEditingId(att.id);
    setEditName(att.displayName);
    setEditNotes(att.notes ?? '');
  };

  const handleDownload = async (att: VoucherAttachmentDto) => {
    if (downloadState) return;
    setDownloadState({ id: att.id, percent: 0 });
    try {
      await voucherAttachmentsApi.download(entryId, att, (p) =>
        setDownloadState({ id: att.id, percent: p }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : t('attachments.downloadError', { defaultValue: 'تعذّر تحميل الملف' });
      toast.error(msg);
    } finally {
      setDownloadState(null);
    }
  };

  const uploadFile = (file: File) => {
    const sizeErr = fileSizeError(file);
    if (sizeErr) {
      toast.error(sizeErr);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!displayName.trim()) setDisplayName(file.name.replace(/\.[^.]+$/, ''));
    uploadMut.mutate(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
  };

  // ‎رفع ملف من الماسح مع تقدّم حقيقي (0–100) يُعاد إلى نافذة المسح، وبشكل
  // ‎awaitable حتى تبقى النافذة مفتوحة وتعرض النسبة حتى اكتمال الرفع.
  const handleScannerUpload = async (file: File, onProgress?: (percent: number) => void) => {
    const sizeErr = fileSizeError(file);
    if (sizeErr) {
      // ‎نرمي الخطأ كي تعرضه نافذة الماسح بوضوح وتبقى مفتوحة للتعديل.
      throw new Error(sizeErr);
    }
    onProgress?.(0);
    try {
      await voucherAttachmentsApi.upload(entryId, file, {
        displayName: file.name.replace(/\.[^.]+$/, ''),
        onProgress,
      });
    } catch (e) {
      throw new Error(uploadErrorMessage(e, file));
    }
    await qc.invalidateQueries({ queryKey: key });
    toast.success(t('attachments.uploadSuccess'));
  };

  if (!open) return null;

  const attachments: VoucherAttachmentDto[] = listQuery.data ?? [];

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Paperclip className="h-4 w-4 text-primary" />
              {t('attachments.title')}
            </h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Upload zone */}
        <div className="border-b border-border bg-secondary/20 p-4 shrink-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">              {t('attachments.fields.displayName')}</Label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={t('attachments.fields.displayNamePlaceholder')}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('attachments.fields.notes')}</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('attachments.fields.notesPlaceholder')}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept={VOUCHER_ATTACHMENT_ACCEPT}
            />
            <Button
              size="sm"
              className="gap-2"
              disabled={uploadMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t('attachments.uploadButton')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`gap-2 ${scannerReady === false ? 'opacity-50' : ''}`}
              disabled={uploadMut.isPending || scannerReady === false}
              title={
                scannerReady === false
                  ? t('attachments.scannerOffline')
                  : t('attachments.scanButtonTip')
              }
              onClick={() => setScannerOpen(true)}
            >
              {scannerReady === null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine
                  className={`h-4 w-4 ${scannerReady === false ? 'text-muted-foreground' : ''}`}
                />
              )}
              {t('attachments.scanButton')}
            </Button>
            {progress !== null && (
              <div className="flex-1 rounded-full bg-secondary h-2 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* Attachment list */}
        <div className="flex-1 overflow-y-auto p-4">
          {listQuery.isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!listQuery.isLoading && attachments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Paperclip className="h-8 w-8 opacity-30" />
              <p className="text-sm">{t('attachments.empty')}</p>
            </div>
          )}
          <div className="space-y-2">
            {attachments.map(att => {
              const Icon = fileIcon(att.contentType, att.originalFileName);
              const fileExt = formatFileExtension(att);
              const isEditing = editingId === att.id;
              return (
                <div
                  key={att.id}
                  className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
                >
                  {isEditing ? (
                    /* ── وضع التحرير: تعديل اسم العرض والوصف ── */
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary shrink-0" />
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder={t('attachments.fields.displayNamePlaceholder')}
                          className="h-8 flex-1 text-sm"
                          autoFocus
                        />
                      </div>
                      <Input
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        placeholder={t('attachments.fields.notesPlaceholder')}
                        className="h-8 text-sm"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1"
                          disabled={!editName.trim() || updateMut.isPending}
                          onClick={() => updateMut.mutate({ att, displayName: editName, notes: editNotes })}
                        >
                          {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── وضع العرض العادي ── */
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{att.displayName}</p>
                        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{formatFileSize(att.sizeBytes)}</span>
                          {fileExt && (
                            <span
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                              title={t('attachments.fileFormat', { defaultValue: 'صيغة الملف' })}
                            >
                              {fileExt}
                            </span>
                          )}
                          {att.notes && <span className="opacity-70">· {att.notes}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          title={t('attachments.preview', { defaultValue: 'معاينة' })}
                          onClick={() => setViewerAtt(att)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-primary"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          title={t('attachments.download')}
                          disabled={!!downloadState}
                          onClick={() => void handleDownload(att)}
                          className="flex items-center gap-1 rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-primary disabled:opacity-60"
                        >
                          {downloadState?.id === att.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-[10px] font-semibold tabular-nums" dir="ltr">
                                {downloadState.percent}%
                              </span>
                            </>
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          title={t('attachments.edit', { defaultValue: 'تعديل' })}
                          onClick={() => startEdit(att)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          title={t('attachments.delete')}
                          onClick={() => setConfirmDeleteId(att.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Confirm delete */}
        {confirmDeleteId !== null && (
          <div className="border-t border-border px-5 py-3 bg-destructive/5 shrink-0">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="flex-1 text-sm">{t('attachments.confirmDelete')}</p>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(confirmDeleteId!)}
              >
                {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('common.confirm')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── معاينة داخل التطبيق (تعمل في تطبيق وندوز حيث لا يفتح window.open تبويباً) ── */}
    {viewerAtt && (
      <FileViewerDialog
        open={!!viewerAtt}
        onClose={() => setViewerAtt(null)}
        entryId={entryId}
        attachment={viewerAtt}
      />
    )}

    <WebScannerModal
      isOpen={scannerOpen}
      onClose={() => setScannerOpen(false)}
      onAddToArchive={handleScannerUpload}
    />
    </>
  );
}
