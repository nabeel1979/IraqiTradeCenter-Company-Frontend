import type { DeviceCapabilities } from './scanner-service';
import { defaultSettings, scanRegionsForInput } from './scanner-service';
import type { ScanSettings } from './types';

const STORAGE_KEY = 'webscan.preferences.v1';

export interface SavedWebScanPreferences {
  deviceId?: string;
  settings?: Partial<ScanSettings>;
}

export function loadSavedPreferences(): SavedWebScanPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SavedWebScanPreferences;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function savePreferences(prefs: SavedWebScanPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export function mergeSettings(
  caps: DeviceCapabilities,
  saved: Partial<ScanSettings> | undefined
): ScanSettings {
  const base = defaultSettings(caps);
  if (!saved) {
    return base;
  }

  const inputSource =
    saved.inputSource === 'ADF' && caps.hasFeeder
      ? 'ADF'
      : saved.inputSource === 'Glass' && caps.hasPlaten
        ? 'Glass'
        : base.inputSource;

  const regions = scanRegionsForInput(caps, inputSource);
  const scanRegion =
    saved.scanRegion && regions.includes(saved.scanRegion)
      ? saved.scanRegion
      : base.scanRegion;

  const resolution =
    saved.resolution != null && caps.resolutions.includes(saved.resolution)
      ? saved.resolution
      : base.resolution;

  const colorMode =
    saved.colorMode && caps.colorModes.includes(saved.colorMode)
      ? saved.colorMode
      : base.colorMode;

  const documentFormat =
    saved.documentFormat === 'application/pdf' || saved.documentFormat === 'image/jpeg'
      ? saved.documentFormat
      : base.documentFormat;

  return { inputSource, scanRegion, resolution, colorMode, documentFormat };
}
