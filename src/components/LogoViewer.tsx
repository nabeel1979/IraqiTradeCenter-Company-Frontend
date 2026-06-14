import { useEffect, useState } from 'react';
import { Download, Minus, Plus, RotateCcw, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export const DEFAULT_LOGO_SRC = '/logo.png?v=5';

type LogoViewerProps = {
  alt: string;
  src?: string;
  className?: string;
  buttonClassName?: string;
};

export function LogoViewer({ alt, src = DEFAULT_LOGO_SRC, className, buttonClassName }: LogoViewerProps) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setScale(1);
  };

  return (
    <>
      <button
        type="button"
        className={cn('inline-flex shrink-0 cursor-zoom-in items-center justify-center', buttonClassName)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label="عرض اللوكو وتكبيره"
      >
        <img src={src} alt={alt} className={className} draggable={false} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center justify-center gap-2 sm:left-auto sm:right-4 sm:justify-end">
            <button
              type="button"
              className="rounded-full bg-white/95 p-2 text-gray-900 shadow hover:bg-white"
              onClick={(event) => {
                event.stopPropagation();
                setScale((value) => Math.max(0.6, value - 0.2));
              }}
              aria-label="تصغير اللوكو"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-full bg-white/95 p-2 text-gray-900 shadow hover:bg-white"
              onClick={(event) => {
                event.stopPropagation();
                setScale((value) => Math.min(3, value + 0.2));
              }}
              aria-label="تكبير اللوكو"
            >
              <Plus className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-full bg-white/95 p-2 text-gray-900 shadow hover:bg-white"
              onClick={(event) => {
                event.stopPropagation();
                setScale(1);
              }}
              aria-label="إعادة الحجم"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <a
              className="rounded-full bg-white/95 p-2 text-gray-900 shadow hover:bg-white"
              href={src}
              download="iraqi-trade-center-logo.png"
              onClick={(event) => event.stopPropagation()}
              aria-label="حفظ اللوكو"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              className="rounded-full bg-white/95 p-2 text-gray-900 shadow hover:bg-white"
              onClick={(event) => {
                event.stopPropagation();
                close();
              }}
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <img
            src={src}
            alt={alt}
            className="max-h-[80vh] max-w-[90vw] object-contain transition-transform duration-200"
            style={{ transform: `scale(${scale})` }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
