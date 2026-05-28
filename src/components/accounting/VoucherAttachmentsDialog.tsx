import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Archive,
  Upload,
  Download,
  Trash2,
  X,
  FileText,
  FileImage,
  File as FileIcon,
  ExternalLink,
  Pencil,
  Check,
  Loader2,
  MessageSquarePlus,
} from 'lucide-react';
import {
  voucherAttachmentsApi,
  formatFileSize,
  type VoucherAttachmentDto,
} from '@/lib/api/attachments';
import { useLocale } from '@/lib/i18n/useLocale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { FileViewerDialog } from './FileViewerDialog';

export interface VoucherAttachmentsDialogProps {
  open: boolean;
  onClose: () => void;
  /** مُعرّف القيد/السند (JournalEntry.Id). */
  entryId: number | string;
  /** عنوان فرعي اختياري — رقم السند مثلاً ليتذكّر المستخدم أين هو. */
  subtitle?: string;
  /** هل يستطيع المستخدم الرفع/الحذف؟ — افتراضياً نعم. */
  canEdit?: boolean;
}

/**
 * تواريخ المرفقات: تعرض دائماً بالإنجليزية الميلادية (24h) بتوقيت بغداد.
 * لأنها بيانات تدقيق ولا تتأثر بـ locale العرض.
 */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Baghdad',
  }).format(d);
}

/** أيقونة مناسبة بناءً على نوع المحتوى. */
function pickIcon(att: VoucherAttachmentDto) {
  const ct = (att.contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return FileImage;
  if (ct.includes('pdf') || ct.includes('text') || ct.includes('word') || ct.includes('excel') || ct.includes('sheet'))
    return FileText;
  return FileIcon;
}

/**
 * نافذة "أرشيف السند": ترفع/تعرض/تنزّل/تحذف عدة ملفات لكل سند.
 *   • الرفع: اختيار ملف + اسم وصفي اختياري + ملاحظات + progress bar.
 *   • العرض: قائمة مرتّبة بالأحدث، مع اسم العرض/الحجم/من رفع/تاريخ الرفع.
 *   • التنزيل: زرّ Download (يستخدم blob لاستعمال توكين الـ Auth).
 *   • فتح في تبويب: للصور و PDF.
 *   • الحذف: يطلب تأكيداً ثم ينادي DELETE — الـ Backend يحذف من المخزن
 *     ويضع <c>IsDeleted=true</c>.
 */
export function VoucherAttachmentsDialog({
  open,
  onClose,
  entryId,
  subtitle,
  canEdit = true,
}: VoucherAttachmentsDialogProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  // ── تحرير الاسم المضمَّن داخل كارت المرفق
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  // ── تحرير الملاحظات المضمَّن داخل كارت المرفق
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState('');

  // ── حالة تحميل لكل ملف (download) — Set من IDs
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const setLoading = useCallback((id: number, on: boolean) => {
    setLoadingIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // ── عارض الملفات الداخلي (مع أزرار الدوران)
  const [viewerAtt, setViewerAtt] = useState<VoucherAttachmentDto | null>(null);

  // ── تأكيد الحذف المدمج (بديل عن window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['voucher-attachments', String(entryId)],
    queryFn: () => voucherAttachmentsApi.list(entryId),
    enabled: open,
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('no_file');
      return voucherAttachmentsApi.upload(entryId, selectedFile, {
        displayName: displayName || undefined,
        notes: notes || undefined,
        onProgress: setProgress,
      });
    },
    onSuccess: () => {
      toast.success(t('attachments.uploadSuccess'));
      setSelectedFile(null);
      setDisplayName('');
      setNotes('');
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['voucher-attachments', String(entryId)] });
    },
    onError: (err) => {
      setProgress(null);
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e?.response?.data?.message ?? t('attachments.uploadError'));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => voucherAttachmentsApi.remove(entryId, id),
    // ── تحديث فوري للكاش قبل انتظار إعادة الجلب (optimistic removal)
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ['voucher-attachments', String(entryId)] });
      const prev = qc.getQueryData<VoucherAttachmentDto[]>(['voucher-attachments', String(entryId)]);
      qc.setQueryData<VoucherAttachmentDto[]>(
        ['voucher-attachments', String(entryId)],
        old => (old ?? []).filter(a => a.id !== id),
      );
      return { prev };
    },
    onSuccess: () => {
      toast.success(t('attachments.deleteSuccess'));
      setConfirmDeleteId(null);
      // إعادة جلب لضمان التزامن مع السيرفر
      qc.invalidateQueries({ queryKey: ['voucher-attachments', String(entryId)] });
    },
    onError: (_err, _id, ctx) => {
      // استعادة القائمة السابقة إن فشل الحذف
      if (ctx?.prev !== undefined) {
        qc.setQueryData(['voucher-attachments', String(entryId)], ctx.prev);
      }
      toast.error(t('attachments.deleteError'));
      setConfirmDeleteId(null);
    },
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      voucherAttachmentsApi.rename(entryId, id, name),
    onSuccess: () => {
      toast.success(t('attachments.renameSuccess', { defaultValue: 'تم تغيير الاسم' }));
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['voucher-attachments', String(entryId)] });
    },
    onError: () => toast.error(t('attachments.renameError', { defaultValue: 'فشل تغيير الاسم' })),
  });

  const updateNotesMut = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string | null }) =>
      voucherAttachmentsApi.updateNotes(entryId, id, notes),
    onSuccess: () => {
      toast.success(t('attachments.notesUpdated', { defaultValue: 'تم تحديث الملاحظات' }));
      setEditingNotesId(null);
      qc.invalidateQueries({ queryKey: ['voucher-attachments', String(entryId)] });
    },
    onError: () => toast.error(t('attachments.notesError', { defaultValue: 'فشل تحديث الملاحظات' })),
  });

  if (!open) return null;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setSelectedFile(f ?? null);
    if (f && !displayName) setDisplayName(f.name);
  };

  const canOpenInTab = (att: VoucherAttachmentDto) => {
    const ct = (att.contentType || '').toLowerCase();
    return ct.startsWith('image/') || ct.includes('pdf');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Archive className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{t('attachments.title')}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4 space-y-4">
          {canEdit && (
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4 text-primary" />
                {t('attachments.uploadSection')}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('attachments.fields.file')}</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={onFileChange}
                    className="block w-full text-xs file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:opacity-90"
                  />
                  {selectedFile && (
                    <p className="text-[11px] text-muted-foreground num-display" dir="ltr">
                      {selectedFile.name} · {formatFileSize(selectedFile.size)}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('attachments.fields.displayName')}</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('attachments.fields.displayNamePlaceholder')}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs text-muted-foreground">{t('attachments.fields.notes')}</label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('attachments.fields.notesPlaceholder')}
                  />
                </div>
              </div>
              {progress !== null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => uploadMut.mutate()}
                  disabled={!selectedFile || uploadMut.isPending}
                >
                  <Upload className="me-1.5 h-3.5 w-3.5" />
                  {uploadMut.isPending ? t('attachments.uploading') : t('attachments.uploadButton')}
                </Button>
              </div>
            </div>
          )}

          {isLoading && <LoadingSpinner text={t('common.loading')} />}
          {isError && (
            <EmptyState
              icon={Archive}
              title={t('attachments.loadError')}
              description={t('common.serverConnectionError')}
            />
          )}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <EmptyState
              icon={Archive}
              title={t('attachments.empty')}
              description={t('attachments.emptyDescription')}
            />
          )}
          {!isLoading && !isError && (data?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {(data ?? []).map((att) => {
                const Icon = pickIcon(att);
                const isEditing = editingId === att.id;
                const isFileLoading = loadingIds.has(att.id);
                const ct2 = (att.contentType || '').toLowerCase();
                const isImage = ct2.startsWith('image/');
                const isPdf = ct2.includes('pdf');
                return (
                  <li
                    key={att.id}
                    className="rounded-lg border border-border/60 bg-secondary/30 p-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* أيقونة نوع الملف — يظهر spinner أثناء التحميل */}
                      <span className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border transition-opacity ${
                        isImage
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : isPdf
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                          : 'border-primary/30 bg-primary/10 text-primary'
                      } ${isFileLoading ? 'opacity-60' : ''}`}>
                        {isFileLoading
                          ? <Loader2 className="h-5 w-5 animate-spin" />
                          : <Icon className="h-5 w-5" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        {/* اسم العرض — قابل للتحرير */}
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              autoFocus
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && editingName.trim()) renameMut.mutate({ id: att.id, name: editingName.trim() });
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-7 text-sm"
                            />
                            <Button
                              type="button" variant="ghost" size="icon"
                              className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
                              disabled={!editingName.trim() || renameMut.isPending}
                              onClick={() => renameMut.mutate({ id: att.id, name: editingName.trim() })}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button" variant="ghost" size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold leading-tight" title={att.displayName}>
                              {att.displayName}
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => { setEditingId(att.id); setEditingName(att.displayName); }}
                                className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-primary"
                                title={t('attachments.rename', { defaultValue: 'تغيير الاسم' })}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* اسم الملف الأصلي */}
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground" dir="ltr">
                          <span className="num-display font-mono">{att.originalFileName}</span>
                          <span className="text-border">·</span>
                          <span className="num-display">{formatFileSize(att.sizeBytes)}</span>
                        </div>

                        {/* الوقت والمستخدم */}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/70">
                          <span className="num-display" dir="ltr">{formatWhen(att.uploadedAtUtc)}</span>
                          {att.uploadedByUserName && (
                            <span className="rounded-full border border-border/50 bg-card px-2 py-0.5 text-[10px]">
                              {att.uploadedByUserName}
                            </span>
                          )}
                        </div>

                        {/* ملاحظات: قابلة للتحرير inline */}
                        {editingNotesId === att.id ? (
                          <div className="mt-1.5 flex flex-col gap-1">
                            <textarea
                              autoFocus
                              rows={2}
                              maxLength={500}
                              value={editingNotes}
                              onChange={e => setEditingNotes(e.target.value.slice(0, 500))}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setEditingNotesId(null);
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
                                  updateNotesMut.mutate({ id: att.id, notes: editingNotes.trim() || null });
                              }}
                              className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary"
                              placeholder={t('attachments.fields.notesPlaceholder', { defaultValue: 'وصف مختصر للمستند…' })}
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">{editingNotes.length}/500</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={updateNotesMut.isPending}
                                  onClick={() => updateNotesMut.mutate({ id: att.id, notes: editingNotes.trim() || null })}
                                  className="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50"
                                >
                                  {updateNotesMut.isPending ? '…' : t('common.save', { defaultValue: 'حفظ' })}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNotesId(null)}
                                  className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                                >
                                  {t('common.cancel', { defaultValue: 'إلغاء' })}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1.5 group/notes flex items-start gap-1">
                            {att.notes ? (
                              <p className="flex-1 rounded border border-border/40 bg-card/60 px-2 py-1 text-[11px] text-foreground/80">
                                {att.notes}
                              </p>
                            ) : (
                              <span className="flex-1 text-[10px] text-muted-foreground/40 italic">
                                {t('attachments.noNotes', { defaultValue: 'لا توجد ملاحظات' })}
                              </span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => { setEditingNotesId(att.id); setEditingNotes(att.notes ?? ''); }}
                                className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover/notes:opacity-100 hover:text-primary"
                                title={t('attachments.editNotes', { defaultValue: 'تعديل الملاحظات' })}
                              >
                                <MessageSquarePlus className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* أزرار الإجراءات */}
                      <div className="flex flex-shrink-0 items-center gap-0.5">
                        {canOpenInTab(att) && (
                          <Button
                            variant="ghost" size="icon"
                            title={t('attachments.openInTab')}
                            className="h-8 w-8 text-sky-400 hover:bg-sky-500/10 hover:text-sky-300"
                            disabled={isFileLoading}
                            onClick={() => setViewerAtt(att)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon"
                          title={t('attachments.download')}
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          disabled={isFileLoading}
                          onClick={async () => {
                            setLoading(att.id, true);
                            try { await voucherAttachmentsApi.download(entryId, att); }
                            catch { toast.error(t('attachments.downloadError', { defaultValue: 'فشل تحميل الملف' })); }
                            finally { setLoading(att.id, false); }
                          }}
                        >
                          {isFileLoading
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4" />}
                        </Button>
                        {canEdit && (
                          confirmDeleteId === att.id ? (
                            // ── تأكيد الحذف المدمج
                            <div className="flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1">
                              <span className="text-[11px] text-destructive whitespace-nowrap">
                                {t('attachments.confirmDeleteInline', { defaultValue: 'حذف؟' })}
                              </span>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-destructive hover:bg-destructive/20"
                                onClick={() => { setConfirmDeleteId(null); deleteMut.mutate(att.id); }}
                                disabled={deleteMut.isPending}
                              >
                                {deleteMut.isPending ? '...' : t('common.yes', { defaultValue: 'نعم' })}
                              </button>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                {t('common.no', { defaultValue: 'لا' })}
                              </button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost" size="icon"
                              title={t('attachments.delete')}
                              className="h-8 w-8 hover:bg-destructive/10"
                              onClick={() => setConfirmDeleteId(att.id)}
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>

      {/* ── عارض الملفات الداخلي مع أزرار الدوران */}
      {viewerAtt && (
        <FileViewerDialog
          open={!!viewerAtt}
          onClose={() => setViewerAtt(null)}
          entryId={entryId}
          attachment={viewerAtt}
        />
      )}
    </div>
  );
}
