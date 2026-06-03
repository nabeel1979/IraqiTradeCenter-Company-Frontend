import { jsPDF } from 'jspdf';
import { normalizePaperLabel, paperMmSize } from '@/lib/webscanner/paper';

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = sourceUrl;
  });
}

/** Re-encode a page to a JPEG blob with the user's rotation baked in. */
async function blobToJpeg(blob: Blob, rotation = 0): Promise<Blob> {
  const img = await loadImage(blob);
  const angle = ((rotation % 360) + 360) % 360;
  const swap = angle === 90 || angle === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      0.92,
    );
  });
}

async function blobToImageData(blob: Blob, rotation = 0) {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = sourceUrl;
  });

  const angle = ((rotation % 360) + 360) % 360;
  if (angle === 0) {
    return { dataUrl: sourceUrl, width: img.naturalWidth, height: img.naturalHeight };
  }

  // Bake the user's rotation into the bitmap so it persists in the PDF.
  const swap = angle === 90 || angle === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * @param pages — scanned page blobs
 * @param fileName — output PDF name
 * @param paperSize — e.g. A4, A3 (from scanner settings); its short edge
 *   becomes the page width so each page is sized to its image (no borders).
 */
export async function pagesToPdfBlob(
  pages: { blob: Blob; rotation?: number }[],
  fileName = 'scan.pdf',
  paperSize = 'A4',
) {
  if (!pages.length) {
    throw new Error('No pages to export');
  }

  const paperKey = normalizePaperLabel(paperSize) ?? 'A4';
  const [pa, pb] = paperMmSize(paperKey);
  const shortEdge = Math.min(pa, pb);

  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const { dataUrl, width, height } = await blobToImageData(pages[i].blob, pages[i].rotation ?? 0);
    const imgRatio = width && height ? width / height : shortEdge / Math.max(pa, pb);

    // Size the page to the image so the scan fills it edge-to-edge with no
    // white margins; keep the paper's short edge as the page width.
    let pageW: number;
    let pageH: number;
    if (imgRatio <= 1) {
      pageW = shortEdge;
      pageH = shortEdge / imgRatio;
    } else {
      pageH = shortEdge;
      pageW = shortEdge * imgRatio;
    }
    const orientation = pageW < pageH ? 'portrait' : 'landscape';

    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: 'mm', format: [pageW, pageH] });
    } else {
      pdf.addPage([pageW, pageH], orientation);
    }

    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
  }

  const blob = pdf!.output('blob');
  return { blob, fileName };
}

/**
 * Convert scanned pages to JPEG blobs (rotation baked in). One blob per page.
 * @param baseName — output base name; multi-page output appends a 1-based index.
 */
export async function pagesToJpgBlobs(
  pages: { blob: Blob; rotation?: number }[],
  baseName = 'scan',
): Promise<{ blob: Blob; fileName: string }[]> {
  if (!pages.length) {
    throw new Error('No pages to export');
  }

  const stem = baseName.replace(/\.(jpe?g|pdf)$/i, '');
  const results: { blob: Blob; fileName: string }[] = [];

  for (let i = 0; i < pages.length; i++) {
    const jpegBlob = await blobToJpeg(pages[i].blob, pages[i].rotation ?? 0);
    const fileName = pages.length === 1 ? `${stem}.jpg` : `${stem}-${i + 1}.jpg`;
    results.push({ blob: jpegBlob, fileName });
  }

  return results;
}
