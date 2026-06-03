import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n/useLocale';
import { voucherAttachmentsApi, type VoucherAttachmentDto } from '@/lib/api/attachments';

interface FileViewerDialogProps {
  open: boolean;
  onClose: () => void;
  entryId: number | string;
  attachment: VoucherAttachmentDto;
}

const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

/**
 * عارض ملفات داخل التطبيق — يدعم الصور والـ PDF مع أزرار:
 *  • دوران يسار/يمين (بخطوات 90°)
 *  • تكبير / تصغير
 *  • تنزيل مباشر
 *  • ESC للإغلاق
 */
export function FileViewerDialog({ open, onClose, entryId, attachment }: FileViewerDialogProps) {
  const { t } = useTranslation();
  const { isRtl } = useLocale();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadPercent, setLoadPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);          // 0 | 90 | 180 | 270
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  const ct = (attachment.contentType || '').toLowerCase();
  const isPdf   = ct.includes('pdf');
  const isImage = ct.startsWith('image/');

  // ── جلب الملف كـ blob عند الفتح
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadPercent(0);
    setError(null);
    setRotation(0);
    setZoom(100);

    voucherAttachmentsApi.getRawBlob(entryId, attachment.id, (p) => {
      if (!cancelled) setLoadPercent(p);
    }).then(url => {
      if (!cancelled) { setBlobUrl(url); setLoading(false); }
    }).catch((err: unknown) => {
      if (!cancelled) {
        const msg = err instanceof Error
          ? err.message
          : t('attachments.downloadError', { defaultValue: 'تعذّر تحميل الملف' });
        setError(msg);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      // تحرير الـ URL عند الإغلاق
      setBlobUrl(prev => { if (prev) setTimeout(() => URL.revokeObjectURL(prev), 500); return null; });
    };
  }, [open, entryId, attachment.id]);

  // ── Escape للإغلاق
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rotateLeft  = () => setRotation(r => (r - 90 + 360) % 360);
  const rotateRight = () => setRotation(r => (r + 90) % 360);
  const zoomIn  = () => { const i = ZOOM_STEPS.indexOf(zoom); if (i < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[i + 1]); };
  const zoomOut = () => { const i = ZOOM_STEPS.indexOf(zoom); if (i > 0) setZoom(ZOOM_STEPS[i - 1]); };
  const handleDownload = async () => {
    try {
      await voucherAttachmentsApi.download(entryId, attachment);
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : t('attachments.downloadError', { defaultValue: 'تعذّر تحميل الملف' });
      toast.error(msg);
    }
  };

  // ── لحساب transform: عند دوران 90/270 نتبادل العرض والارتفاع عبر CSS
  const rotated90 = rotation === 90 || rotation === 270;
  const contentTransform = `rotate(${rotation}deg) scale(${zoom / 100})`;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── شريط الأدوات */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 bg-[#1e293b] px-3 py-2 shadow-xl">
        {/* العنوان */}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
          {attachment.displayName}
        </span>

        {/* أدوات */}
        <div className="flex items-center gap-1">
          {/* دوران */}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:bg-white/10 hover:text-white" title={t('fileViewer.rotateLeft', { defaultValue: 'دوران يسار' })} onClick={rotateLeft}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:bg-white/10 hover:text-white" title={t('fileViewer.rotateRight', { defaultValue: 'دوران يمين' })} onClick={rotateRight}>
            <RotateCw className="h-4 w-4" />
          </Button>

          <span className="mx-1 h-5 w-px bg-white/20" />

          {/* تكبير */}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:bg-white/10 hover:text-white" title={t('fileViewer.zoomOut', { defaultValue: 'تصغير' })} onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[40px] text-center text-xs text-slate-400 tabular-nums">{zoom}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:bg-white/10 hover:text-white" title={t('fileViewer.zoomIn', { defaultValue: 'تكبير' })} onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
            <ZoomIn className="h-4 w-4" />
          </Button>

          <span className="mx-1 h-5 w-px bg-white/20" />

          {/* تنزيل */}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300" title={t('attachments.download')} onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>

          {/* إغلاق */}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-red-500/20 hover:text-red-400" title={t('common.close')} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── منطقة العرض */}
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center overflow-auto p-4"
        onClick={(e) => { if (e.target === containerRef.current) onClose(); }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm">{t('common.loading')}</span>
            {loadPercent > 0 && (
              <span className="text-lg font-bold tabular-nums text-slate-200" dir="ltr">
                {loadPercent}%
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && blobUrl && (
          <>
            {/* ── عرض الصورة */}
            {isImage && (
              <img
                src={blobUrl}
                alt={attachment.displayName}
                className="max-h-full max-w-full object-contain shadow-2xl transition-transform duration-200"
                style={{
                  transform: contentTransform,
                  transformOrigin: 'center center',
                  // عند دوران 90/270، نُبدِّل التقييد المرئي
                  ...(rotated90 ? { maxWidth: '80vh', maxHeight: '80vw' } : {}),
                }}
                draggable={false}
              />
            )}

            {/* ── عرض الـ PDF */}
            {isPdf && (
              <div
                className="relative transition-transform duration-200"
                style={{
                  transform: contentTransform,
                  transformOrigin: 'center center',
                  width: rotated90 ? '80vh' : '90vw',
                  height: rotated90 ? '90vw' : '85vh',
                }}
              >
                <iframe
                  src={blobUrl}
                  title={attachment.displayName}
                  className="h-full w-full rounded-sm border-0 shadow-2xl"
                />
              </div>
            )}

            {/* ── ملفات أخرى: رسالة + تنزيل */}
            {!isImage && !isPdf && (
              <div className="flex flex-col items-center gap-4 text-slate-400">
                <span className="text-sm">{t('fileViewer.noPreview', { defaultValue: 'لا يمكن معاينة هذا النوع من الملفات مباشرةً.' })}</span>
                <Button onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  {t('attachments.download')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── تلميح بالدوران الحالي */}
      {rotation !== 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-300">
          {rotation}°
        </div>
      )}
    </div>
  );
}
