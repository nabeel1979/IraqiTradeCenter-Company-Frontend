import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inventoryApi } from '@/lib/api/inventory';
import { ItemImageThumb } from '@/components/inventory/ItemImageThumb';

interface ItemImageViewerDialogProps {
  open: boolean;
  onClose: () => void;
  itemId: number;
  imageId: number;
  /** قائمة معرّفات الصور للتصفح (الألبوم) */
  imageIds?: number[];
  onImageIdChange?: (id: number) => void;
  title?: string;
}

const ZOOM_STEPS = [50, 67, 75, 100, 125, 150, 200, 300];

export function ItemImageViewerDialog({
  open, onClose, itemId, imageId, imageIds = [], onImageIdChange, title,
}: ItemImageViewerDialogProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const browseList = imageIds.length > 0 ? imageIds : [imageId];
  const currentIdx = browseList.indexOf(imageId);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < browseList.length - 1;

  const goPrev = () => {
    if (canPrev && onImageIdChange) onImageIdChange(browseList[currentIdx - 1]);
  };

  const goNext = () => {
    if (canNext && onImageIdChange) onImageIdChange(browseList[currentIdx + 1]);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setZoom(100);
    setRotation(0);

    inventoryApi.getImageBlobUrl(itemId, imageId)
      .then(url => { if (!cancelled) { setBlobUrl(url); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError('تعذّر تحميل الصورة'); setLoading(false); } });

    return () => {
      cancelled = true;
      setBlobUrl(prev => { if (prev) setTimeout(() => URL.revokeObjectURL(prev), 300); return null; });
    };
  }, [open, itemId, imageId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && canPrev && onImageIdChange) onImageIdChange(browseList[currentIdx - 1]);
      if (e.key === 'ArrowLeft' && canNext && onImageIdChange) onImageIdChange(browseList[currentIdx + 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canPrev, canNext, currentIdx, browseList, onImageIdChange, onClose]);

  if (!open) return null;

  const zoomIn = () => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, (idx < 0 ? 0 : idx) + 1)]);
  };

  const zoomOut = () => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
    setZoom(ZOOM_STEPS[Math.max(0, (idx <= 0 ? 0 : idx) - 1)]);
  };

  const counter = browseList.length > 1 && currentIdx >= 0
    ? `${currentIdx + 1} / ${browseList.length}`
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 p-3 text-white" onClick={e => e.stopPropagation()}>
        <span className="text-sm truncate">{title ?? 'معاينة الصورة'}</span>
        <div className="flex items-center gap-1">
          {browseList.length > 1 && onImageIdChange && (
            <>
              <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10"
                disabled={!canPrev} onClick={goPrev} title="السابق">
                <ChevronRight className="h-5 w-5" />
              </Button>
              {counter && <span className="text-xs min-w-[3rem] text-center">{counter}</span>}
              <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10"
                disabled={!canNext} onClick={goNext} title="التالي">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="w-px h-5 bg-white/20 mx-1" />
            </>
          )}
          <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs w-10 text-center">{zoom}%</span>
          <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10"
            onClick={() => setRotation(r => (r + 90) % 360)}>
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative" onClick={e => e.stopPropagation()}>
        {browseList.length > 1 && onImageIdChange && (
          <>
            <Button type="button" variant="ghost" size="icon"
              className="absolute start-2 top-1/2 -translate-y-1/2 h-10 w-10 text-white hover:bg-white/10 z-10"
              disabled={!canPrev} onClick={goPrev}>
              <ChevronRight className="h-6 w-6" />
            </Button>
            <Button type="button" variant="ghost" size="icon"
              className="absolute end-2 top-1/2 -translate-y-1/2 h-10 w-10 text-white hover:bg-white/10 z-10"
              disabled={!canNext} onClick={goNext}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </>
        )}
        {loading && <p className="text-white/70 text-sm">جاري التحميل...</p>}
        {error && <p className="text-red-300 text-sm">{error}</p>}
        {!loading && !error && blobUrl && (
          <img
            src={blobUrl}
            alt=""
            className="max-w-none max-h-[75vh] transition-transform duration-200 shadow-2xl"
            style={{ transform: `rotate(${rotation}deg) scale(${zoom / 100})` }}
          />
        )}
      </div>

      {browseList.length > 1 && onImageIdChange && (
        <div className="flex justify-center gap-2 p-3 overflow-x-auto" onClick={e => e.stopPropagation()}>
          {browseList.map(id => (
            <button key={id} type="button"
              className={`h-12 w-12 rounded border-2 overflow-hidden shrink-0 transition-all ${
                id === imageId ? 'border-primary ring-2 ring-primary/50' : 'border-white/30 opacity-70 hover:opacity-100'
              }`}
              onClick={() => onImageIdChange(id)}>
              <ItemImageThumb itemId={itemId} imageId={id} className="h-full w-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
