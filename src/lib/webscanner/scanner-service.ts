// @ts-nocheck
import Scanner from './lib/escl-sdk-ts/escl/scanner';
import { normalizePaperLabel, PAPER_SIZE_ORDER } from './paper';
import type { BridgeDevice, ScanSettings, ScannedPage } from './types';

const COLOR_MODE_PRIORITY = ['RGB24', 'RGB48', 'RGB', 'Color', 'color'];

/** Prefer a full-color mode when the scanner exposes one. */
export function pickDefaultColorMode(colorModes: string[]): string {
  if (colorModes.length === 0) {
    return 'RGB24';
  }

  for (const preferred of COLOR_MODE_PRIORITY) {
    const found = colorModes.find(
      (m) => m === preferred || m.toLowerCase() === preferred.toLowerCase()
    );
    if (found) {
      return found;
    }
  }

  const color = colorModes.find((mode) => {
    const l = mode.toLowerCase();
    return (
      !l.includes('gray') &&
      !l.includes('grey') &&
      !l.includes('black') &&
      !l.includes('mono') &&
      !l.includes('binary')
    );
  });

  return color ?? colorModes[0];
}

export interface DeviceCapabilities {
  hasFeeder: boolean;
  hasPlaten: boolean;
  platenScanRegions: string[];
  feederScanRegions: string[];
  /** All sizes supported on either input (for display). */
  scanRegions: string[];
  resolutions: number[];
  colorModes: string[];
  documentFormats: string[];
}

export function scanRegionsForInput(
  caps: DeviceCapabilities,
  inputSource: 'ADF' | 'Glass'
): string[] {
  if (inputSource === 'ADF') {
    return caps.feederScanRegions.length > 0 ? caps.feederScanRegions : caps.platenScanRegions;
  }
  return caps.platenScanRegions;
}

function sortPaperSizes(regions: string[]): string[] {
  return [...regions].sort(
    (a, b) =>
      (PAPER_SIZE_ORDER.indexOf(a as (typeof PAPER_SIZE_ORDER)[number]) === -1
        ? 99
        : PAPER_SIZE_ORDER.indexOf(a as (typeof PAPER_SIZE_ORDER)[number])) -
      (PAPER_SIZE_ORDER.indexOf(b as (typeof PAPER_SIZE_ORDER)[number]) === -1
        ? 99
        : PAPER_SIZE_ORDER.indexOf(b as (typeof PAPER_SIZE_ORDER)[number]))
  );
}

function createScanner(device: BridgeDevice): Scanner {
  return new Scanner({ ip: device.host, port: device.port });
}

/** Otsu's method: find the optimal luminance threshold from a histogram. */
function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Convert a (grayscale/colour) scan blob to true 1-bit black & white. */
async function binarizeBlob(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const hist = new Array(256).fill(0);
    const lum = new Uint8Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      lum[j] = y;
      hist[y]++;
    }
    const threshold = otsuThreshold(hist, lum.length);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = lum[j] >= threshold ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error('B&W encode failed'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadCapabilities(device: BridgeDevice): Promise<DeviceCapabilities> {
  const scanner = createScanner(device);
  const result = await scanner.ScannerCapabilities();
  const caps = result.capabilities['scan:ScannerCapabilities'];
  const setting = result.scansetting;

  const platenRegions =
    setting.platen.find((s) => s.name === 'ScanRegions')?.options ?? [];
  const feederRegions =
    setting.adf.Simplex.find((s) => s.name === 'ScanRegions')?.options ?? [];

  const platenScanRegions = sortPaperSizes(platenRegions);
  const feederScanRegions = sortPaperSizes(feederRegions);

  return {
    hasFeeder: Boolean(caps['scan:Adf']),
    hasPlaten: Boolean(caps['scan:Platen']),
    platenScanRegions,
    feederScanRegions,
    scanRegions: [...new Set([...platenScanRegions, ...feederScanRegions])],
    resolutions:
      setting.platen.find((s) => s.name === 'Resolution')?.options ??
      setting.adf.Simplex.find((s) => s.name === 'Resolution')?.options ??
      [300],
    colorModes:
      setting.platen.find((s) => s.name === 'ColorMode')?.options ??
      setting.adf.Simplex.find((s) => s.name === 'ColorMode')?.options ??
      ['RGB24'],
    documentFormats:
      setting.platen.find((s) => s.name === 'DocumentFormat')?.options ??
      setting.adf.Simplex.find((s) => s.name === 'DocumentFormat')?.options ??
      ['image/jpeg'],
  };
}

export function defaultSettings(caps: DeviceCapabilities): ScanSettings {
  const inputSource = caps.hasFeeder ? 'ADF' : 'Glass';
  const regions = scanRegionsForInput(caps, inputSource);
  return {
    inputSource,
    scanRegion: regions.includes('A4') ? 'A4' : regions[0] ?? 'A4',
    resolution: caps.resolutions.includes(300) ? 300 : caps.resolutions[0] ?? 300,
    colorMode: pickDefaultColorMode(caps.colorModes),
    documentFormat: 'image/jpeg',
  };
}

export async function scanPages(
  device: BridgeDevice,
  settings: ScanSettings,
  onPage?: (page: ScannedPage, index: number) => void
): Promise<ScannedPage[]> {
  const scanner = createScanner(device);
  const paperLabel = normalizePaperLabel(settings.scanRegion) ?? settings.scanRegion;

  const jobUrl = await scanner.ScanJobs({
    InputSource: settings.inputSource as 'ADF' | 'Glass',
    ScanRegions: paperLabel as 'A4',
    Resolution: settings.resolution,
    ColorMode: settings.colorMode,
    DocumentFormat: settings.documentFormat as 'image/jpeg',
  });

  const jobId = jobUrl.split('/').filter(Boolean).pop();
  if (!jobId) {
    throw new Error('Invalid scan job response');
  }

  const pages: ScannedPage[] = [];
  let index = 0;
  // Flatbed (glass) holds a single sheet → one page per scan.
  // Document feeder (ADF) processes the whole stack → keep pulling pages.
  const singlePage = settings.inputSource === 'Glass';
  // If a single page never arrives within this window, the device is offline
  // or stuck — abort instead of "scanning" forever.
  const PAGE_DEADLINE_MS = 45000;

  while (true) {
    try {
      const doc = await scanner.NextDocument(jobId, Date.now() + PAGE_DEADLINE_MS);
      const mime = settings.documentFormat === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
      let blob = new Blob([doc.data], { type: mime });
      // True black & white: threshold the grayscale scan to 1-bit monochrome.
      if (settings.blackWhite && mime !== 'application/pdf') {
        try {
          blob = await binarizeBlob(blob);
        } catch {
          /* fall back to the original grayscale image */
        }
      }
      const page: ScannedPage = {
        id: crypto.randomUUID(),
        blob,
        url: URL.createObjectURL(blob),
        rotation: 0,
      };
      pages.push(page);
      onPage?.(page, index++);
      if (singlePage) {
        break;
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        break;
      }
      throw err;
    }
  }

  if (pages.length === 0) {
    throw new Error('No pages scanned. Check paper in the feeder or on the glass.');
  }

  return pages;
}
