import { useEffect, useState } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inventoryApi } from '@/lib/api/inventory';

interface ItemImageThumbProps {
  itemId: number;
  imageId: number;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

/** صورة مادة — تُحمَّل عبر API مع JWT (blob URL)، داخل إطار مربع */
export function ItemImageThumb({ itemId, imageId, alt = '', className, onClick }: ItemImageThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    inventoryApi.getImageBlobUrl(itemId, imageId)
      .then(blobUrl => { if (!cancelled) setUrl(blobUrl); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      setUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [itemId, imageId]);

  const frameClass = cn(
    'relative flex aspect-square shrink-0 items-center justify-center overflow-hidden bg-muted',
    onClick && 'cursor-pointer',
    className,
  );

  if (failed) {
    return (
      <div className={frameClass} onClick={onClick} role={onClick ? 'button' : undefined}>
        <ImageIcon className="h-6 w-6 text-muted-foreground opacity-40" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className={frameClass}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={frameClass} onClick={onClick} role={onClick ? 'button' : undefined}>
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
