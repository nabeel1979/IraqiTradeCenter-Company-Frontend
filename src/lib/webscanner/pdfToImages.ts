import * as pdfjsLib from 'pdfjs-dist';
// Bundle the worker as a regular .js chunk (Vite) so IIS serves it without
// needing a custom .mjs MIME mapping on the server.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

/**
 * Render every page of a PDF file to a JPEG blob so it can be shown and
 * handled exactly like a scanned page in the preview.
 *
 * @param scale — render scale; higher = sharper but larger. ~2 ≈ 150 DPI.
 */
export async function pdfFileToImageBlobs(file: File, scale = 2): Promise<Blob[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const blobs: Blob[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (out) => (out ? resolve(out) : reject(new Error('PDF page render failed'))),
          'image/jpeg',
          0.92,
        ),
      );
      blobs.push(blob);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return blobs;
}
