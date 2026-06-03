import { jsPDF } from 'jspdf';
import type { ScannedPage } from './types';

async function blobToImageData(blob: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

export async function exportPagesToPdf(pages: ScannedPage[], fileName = 'scan.pdf'): Promise<void> {
  if (pages.length === 0) {
    throw new Error('No pages to export');
  }

  const first = await blobToImageData(pages[0].blob);
  const orientation = first.width > first.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [first.width, first.height] });

  for (let i = 0; i < pages.length; i++) {
    const { dataUrl, width, height } = await blobToImageData(pages[i].blob);
    if (i > 0) {
      pdf.addPage([width, height], width > height ? 'landscape' : 'portrait');
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);
  }

  pdf.save(fileName);
}
