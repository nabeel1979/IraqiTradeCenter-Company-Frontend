import { checkBridgeHealth, fetchDevices, getBridgeUrl } from './bridge';
import { exportPagesToPdf } from './pdf-export';
import {
  loadSavedPreferences,
  mergeSettings,
  savePreferences,
} from './preferences';
import {
  loadCapabilities,
  scanPages,
  scanRegionsForInput,
  type DeviceCapabilities,
} from './scanner-service';
import { pdfFileToImageBlobs } from './pdfToImages';
import type { BridgeDevice, ScannedPage, ScanSettings } from './types';

const ERROR_TOAST_SECONDS = 30;
// Sentinel <select> value for the synthetic 1-bit black & white mode.
const BW_MODE_VALUE = '__bw__';

function bridgeHostLabel(bridgeUrl: string): string {
  try {
    return new URL(bridgeUrl).host;
  } catch {
    return bridgeUrl.replace(/^https?:\/\//, '');
  }
}

export function bridgeUnreachableMessage(bridgeUrl: string): string {
  return `تعذّر الاتصال بجسر المسح على ${bridgeHostLabel(bridgeUrl)}. ثبت WebScanner Bridge ثم اضغط «تحديث الأجهزة».`;
}

function isBridgeConnectionError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('bridge unavailable') ||
    message.includes('bridge not reachable') ||
    message.includes('scanner.localbridge')
  );
}

export interface WebScanLabels {
  scanner: string;
  loading: string;
  refreshDevices: string;
  scanSettings: string;
  source: string;
  paperSize: string;
  resolution: string;
  colorMode: string;
  scan: string;
  clearPreview: string;
  exportPdf: string;
  preview: string;
  selectAll: string;
  deleteSelected: string;
  previewHint: string;
  page: string;
  deletePage: string;
  viewPage: string;
  moveBack: string;
  moveForward: string;
  rotate: string;
  importFiles: string;
  importing: string;
  zoomIn: string;
  zoomOut: string;
  zoomReset: string;
  colorColor: string;
  colorGrayscale: string;
  colorBlackWhite: string;
  flatbed: string;
  feeder: string;
  noScanners: string;
  scannerOffline: string;
  /** Uses {host} placeholder. */
  bridgeUnreachable: string;
  prevPage: string;
  nextPage: string;
  close: string;
  pageOf: string;
}

const DEFAULT_LABELS: WebScanLabels = {
  scanner: 'Scanner',
  loading: 'Loading…',
  refreshDevices: 'Refresh devices',
  scanSettings: 'Scan settings',
  source: 'Source',
  paperSize: 'Paper size',
  resolution: 'Resolution (DPI)',
  colorMode: 'Color mode',
  scan: 'Scan',
  clearPreview: 'Clear preview',
  exportPdf: 'Export PDF',
  preview: 'Preview',
  selectAll: 'Select all',
  deleteSelected: 'Delete selected',
  previewHint: 'Click to preview · drag or use arrows to reorder',
  page: 'Page',
  deletePage: 'Delete page',
  viewPage: 'View page',
  moveBack: 'Move back',
  moveForward: 'Move forward',
  rotate: 'Rotate',
  importFiles: 'Import from computer',
  importing: 'Importing files…',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Reset zoom',
  colorColor: 'Color',
  colorGrayscale: 'Grayscale',
  colorBlackWhite: 'Black & white',
  flatbed: 'Flatbed (glass)',
  feeder: 'Document feeder (ADF)',
  noScanners: 'No scanners found',
  scannerOffline:
    'The scanner did not respond. Make sure it is powered on and connected, then try again.',
  bridgeUnreachable: 'Could not reach the scan bridge on {host}. Install WebScanner Bridge then press “Refresh devices”.',
  prevPage: 'Previous page',
  nextPage: 'Next page',
  close: 'Close',
  pageOf: 'Page {current} of {total}',
};

export interface WebScanOptions {
  root: HTMLElement;
  bridgeUrl?: string;
  /** Hide title, subtitle, and routine status lines (embedded modal). */
  compact?: boolean;
  /** Visible UI strings; falls back to English for any omitted key. */
  labels?: Partial<WebScanLabels>;
  onPagesChange?: (pages: ScannedPage[]) => void;
  onError?: (message: string) => void;
  onScanningChange?: (scanning: boolean) => void;
  /** Fired when a scanner is connected (true) or no scanner is reachable (false). */
  onDevicesConnected?: (connected: boolean) => void;
  /** Fired while importing files from disk (true) and when done (false). */
  onImportingChange?: (importing: boolean) => void;
}

export class WebScanApp {
  private readonly root: HTMLElement;
  private readonly bridgeUrl: string;
  private readonly compact: boolean;
  private readonly labels: WebScanLabels;
  private readonly onPagesChange?: (pages: ScannedPage[]) => void;
  private readonly onError?: (message: string) => void;
  private readonly onScanningChange?: (scanning: boolean) => void;
  private readonly onDevicesConnected?: (connected: boolean) => void;
  private readonly onImportingChange?: (importing: boolean) => void;

  private devices: BridgeDevice[] = [];
  private selectedDevice: BridgeDevice | null = null;
  private capabilities: DeviceCapabilities | null = null;
  private settings: ScanSettings | null = null;
  private pages: ScannedPage[] = [];
  private selectedPageIds = new Set<string>();
  private scanning = false;
  private scanIdle: Promise<void> = Promise.resolve();
  private resolveScanIdle: (() => void) | null = null;
  private errorHideTimer: ReturnType<typeof setTimeout> | undefined;
  private errorCountdownTimer: ReturnType<typeof setInterval> | undefined;
  private dragPageId: string | null = null;
  private lightboxIndex: number | null = null;
  private lightboxEl: HTMLElement | null = null;
  private lightboxZoom = 1;
  private lightboxPan = { x: 0, y: 0 };
  private lightboxPanning = false;
  private lightboxPanStart = { x: 0, y: 0, ox: 0, oy: 0 };
  private connectionPoll: ReturnType<typeof setInterval> | undefined;
  // Set when a scan fails because the device is powered off/unreachable. The
  // bridge still lists the driver, so we can only learn this from a real scan;
  // stays "offline" until a manual refresh or a successful scan.
  private deviceOffline = false;

  constructor(options: WebScanOptions) {
    this.root = options.root;
    this.bridgeUrl = options.bridgeUrl ?? getBridgeUrl();
    this.compact = options.compact ?? false;
    this.labels = { ...DEFAULT_LABELS, ...(options.labels ?? {}) };
    this.onPagesChange = options.onPagesChange;
    this.onError = options.onError;
    this.onScanningChange = options.onScanningChange;
    this.onDevicesConnected = options.onDevicesConnected;
    this.onImportingChange = options.onImportingChange;
    this.renderShell();
    void this.init();
  }

  getPages(): ScannedPage[] {
    return [...this.pages];
  }

  getSettings(): ScanSettings | null {
    return this.settings ? { ...this.settings } : null;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  /** Resolves when the current scan job finishes (or immediately if idle). */
  waitForScanComplete(): Promise<void> {
    return this.scanIdle;
  }

  clearPages(): void {
    this.pages.forEach((p) => this.revokePage(p));
    this.pages = [];
    this.selectedPageIds.clear();
    this.onPagesChange?.(this.pages);
    this.renderPreview();
  }

  dispose(): void {
    this.clearErrorHideTimer();
    this.stopConnectionPolling();
    this.closeLightbox();
    this.removeLightbox();
    this.clearPages();
  }

  deletePage(id: string): void {
    const page = this.pages.find((p) => p.id === id);
    if (!page) {
      return;
    }
    this.revokePage(page);
    this.pages = this.pages.filter((p) => p.id !== id);
    this.selectedPageIds.delete(id);
    this.onPagesChange?.(this.pages);
    this.renderPreview();
  }

  deleteSelectedPages(): void {
    if (this.selectedPageIds.size === 0) {
      return;
    }
    const toRemove = new Set(this.selectedPageIds);
    for (const page of this.pages) {
      if (toRemove.has(page.id)) {
        this.revokePage(page);
      }
    }
    this.pages = this.pages.filter((p) => !toRemove.has(p.id));
    this.selectedPageIds.clear();
    this.onPagesChange?.(this.pages);
    this.renderPreview();
  }

  private revokePage(page: ScannedPage): void {
    URL.revokeObjectURL(page.url);
  }

  private clearErrorHideTimer(): void {
    if (this.errorHideTimer !== undefined) {
      clearTimeout(this.errorHideTimer);
      this.errorHideTimer = undefined;
    }
    if (this.errorCountdownTimer !== undefined) {
      clearInterval(this.errorCountdownTimer);
      this.errorCountdownTimer = undefined;
    }
  }

  private bridgeUnreachable(): string {
    return this.labels.bridgeUnreachable.replace('{host}', bridgeHostLabel(this.bridgeUrl));
  }

  private colorModeLabel(mode: string): string {
    const m = mode.toLowerCase();
    if (m.includes('rgb') || m.includes('color') || m.includes('colour')) {
      return this.labels.colorColor;
    }
    if (m.includes('gray') || m.includes('grey')) {
      return this.labels.colorGrayscale;
    }
    if (m.includes('black') || m.includes('mono') || m.includes('binary')) {
      return this.labels.colorBlackWhite;
    }
    return mode;
  }

  private resolveErrorMessage(err: unknown): string {
    if (isBridgeConnectionError(err)) {
      return this.bridgeUnreachable();
    }
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }

  private renderErrorStatus(
    status: HTMLElement,
    message: string,
    secondsLeft: number,
  ): void {
    status.replaceChildren();
    const messageEl = document.createElement('span');
    messageEl.className = 'webscan-status-message';
    messageEl.textContent = message;

    const countdownEl = document.createElement('span');
    countdownEl.className = 'webscan-status-countdown';
    countdownEl.setAttribute('dir', 'ltr');
    countdownEl.textContent = `${secondsLeft} ث`;

    status.append(messageEl, countdownEl);
  }

  private hideErrorStatus(status: HTMLElement): void {
    status.hidden = true;
    this.clearErrorHideTimer();
  }

  private reportError(message: string): void {
    this.onError?.(message);
    const status = this.root.querySelector<HTMLElement>('[data-status]');
    if (!status) {
      return;
    }

    this.clearErrorHideTimer();
    status.hidden = false;
    status.dataset.level = 'error';

    if (this.compact) {
      let secondsLeft = ERROR_TOAST_SECONDS;
      this.renderErrorStatus(status, message, secondsLeft);

      this.errorCountdownTimer = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
          this.hideErrorStatus(status);
          return;
        }
        this.renderErrorStatus(status, message, secondsLeft);
      }, 1000);

      this.errorHideTimer = setTimeout(() => {
        this.hideErrorStatus(status);
      }, ERROR_TOAST_SECONDS * 1000);
      return;
    }

    status.textContent = message;
  }

  private setStatus(message: string, level: 'info' | 'error' = 'info'): void {
    const status = this.root.querySelector<HTMLElement>('[data-status]');
    if (!status) {
      return;
    }
    if (this.compact && level !== 'error') {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.dataset.level = level;
  }

  private renderShell(): void {
    const L = this.labels;
    this.root.innerHTML = `
      <div class="webscan${this.compact ? ' webscan--compact' : ''}">
        ${
          this.compact
            ? ''
            : `<header class="webscan-header">
          <h1>WebScan</h1>
          <p class="webscan-subtitle">Local &amp; network scanners via NAPS2 ESCL bridge</p>
        </header>`
        }
        ${this.compact ? '' : '<p class="webscan-status" data-status data-level="info">Connecting to bridge…</p>'}
        <div class="webscan-sidebar">
          <section class="webscan-panel">
            <label>${L.scanner}</label>
            <select data-device disabled><option>${L.loading}</option></select>
            <button type="button" data-refresh><span class="webscan-refresh-indicator" data-refresh-indicator aria-hidden="true"></span><span class="webscan-refresh-label">${L.refreshDevices}</span></button>
          </section>
          <section class="webscan-panel webscan-settings" data-settings hidden>
            <h2>${L.scanSettings}</h2>
            <div class="webscan-grid">
              <label>${L.source}
                <select data-input-source></select>
              </label>
              <label>${L.paperSize}
                <select data-paper-size></select>
              </label>
              <label>${L.resolution}
                <select data-resolution></select>
              </label>
              <label>${L.colorMode}
                <select data-color-mode></select>
              </label>
            </div>
          </section>
          <section class="webscan-actions">
            <button type="button" data-scan disabled>${L.scan}</button>
            <button type="button" class="webscan-import-btn" data-import>${L.importFiles}</button>
            <input type="file" data-import-input accept="image/*,application/pdf" multiple hidden />
            <button type="button" data-clear disabled>${L.clearPreview}</button>
            <button type="button" data-export-pdf disabled>${L.exportPdf}</button>
          </section>
        </div>
        <section class="webscan-preview">
          <div class="webscan-preview-header">
            <h2>${L.preview} <span data-page-count></span></h2>
            ${
              this.compact
                ? `<span class="webscan-preview-hint">${L.previewHint}</span>`
                : `<div class="webscan-preview-toolbar" data-preview-toolbar hidden>
              <label class="webscan-select-all">
                <input type="checkbox" data-select-all />
                ${L.selectAll}
              </label>
              <button type="button" data-delete-selected disabled>${L.deleteSelected}</button>
            </div>`
            }
          </div>
          <div class="webscan-thumbs" data-preview></div>
        </section>
        ${this.compact ? '<p class="webscan-status" data-status data-level="info" hidden></p>' : ''}
      </div>
    `;

    this.root.querySelector('[data-refresh]')?.addEventListener('click', () => void this.loadDevices());
    this.root.querySelector('[data-scan]')?.addEventListener('click', () => void this.runScan());
    const importInput = this.root.querySelector<HTMLInputElement>('[data-import-input]');
    this.root.querySelector('[data-import]')?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', () => {
      if (importInput.files && importInput.files.length > 0) {
        void this.importFiles(importInput.files);
      }
      importInput.value = '';
    });
    this.root.querySelector('[data-clear]')?.addEventListener('click', () => this.clearPages());
    this.root.querySelector('[data-delete-selected]')?.addEventListener('click', () => this.deleteSelectedPages());
    this.root.querySelector('[data-select-all]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) {
        this.pages.forEach((p) => this.selectedPageIds.add(p.id));
      } else {
        this.selectedPageIds.clear();
      }
      this.renderPreview();
    });
    this.root.querySelector('[data-export-pdf]')?.addEventListener('click', () => void this.exportPdf());
    this.root.querySelector('[data-device]')?.addEventListener('change', (e) => {
      const id = (e.target as HTMLSelectElement).value;
      void this.selectDevice(id);
    });
  }

  private async init(): Promise<void> {
    const healthy = await checkBridgeHealth(this.bridgeUrl);
    if (!healthy) {
      this.setRefreshState('off');
      this.onDevicesConnected?.(false);
      this.reportError(this.bridgeUnreachable());
      return;
    }
    await this.loadDevices();
    this.startConnectionPolling();
  }

  private setRefreshState(state: 'loading' | 'ok' | 'off'): void {
    const btn = this.root.querySelector<HTMLButtonElement>('[data-refresh]');
    if (!btn) {
      return;
    }
    btn.classList.toggle('webscan-refresh--loading', state === 'loading');
    btn.classList.toggle('webscan-refresh--ok', state === 'ok');
    btn.classList.toggle('webscan-refresh--off', state === 'off');
    btn.disabled = state === 'loading';
  }

  private startConnectionPolling(): void {
    this.stopConnectionPolling();
    this.connectionPoll = setInterval(() => void this.pollConnection(), 8000);
  }

  private stopConnectionPolling(): void {
    if (this.connectionPoll !== undefined) {
      clearInterval(this.connectionPoll);
      this.connectionPoll = undefined;
    }
  }

  // Lightweight live re-check: updates the status colour without rebuilding the
  // device dropdown, so the indicator reflects the scanner being turned off.
  private async pollConnection(): Promise<void> {
    if (this.scanning || this.deviceOffline) {
      // While we know the device is offline (from a failed scan) keep it red;
      // the registry would otherwise still report the driver as "present".
      return;
    }
    try {
      const healthy = await checkBridgeHealth(this.bridgeUrl);
      if (!healthy) {
        this.setRefreshState('off');
        this.onDevicesConnected?.(false);
        return;
      }
      const devices = await fetchDevices(this.bridgeUrl);
      const connected = devices.length > 0;
      this.setRefreshState(connected ? 'ok' : 'off');
      this.onDevicesConnected?.(connected);
    } catch {
      this.setRefreshState('off');
      this.onDevicesConnected?.(false);
    }
  }

  private async loadDevices(): Promise<void> {
    this.setStatus('Discovering scanners…');
    this.setRefreshState('loading');
    this.deviceOffline = false;
    this.onDevicesConnected?.(false);
    const select = this.root.querySelector<HTMLSelectElement>('[data-device]')!;
    select.disabled = true;

    try {
      this.devices = await fetchDevices(this.bridgeUrl);
      select.innerHTML = '';

      if (this.devices.length === 0) {
        select.innerHTML = `<option>${this.labels.noScanners}</option>`;
        this.setStatus('No scanners detected. Connect a USB or network scanner and refresh.');
        this.setRefreshState('off');
        this.onDevicesConnected?.(false);
        return;
      }

      for (const device of this.devices) {
        const opt = document.createElement('option');
        opt.value = device.id;
        const kind = device.source === 'network-escl' ? 'network' : 'local';
        opt.textContent = `${device.name} (${device.driver}, ${kind})`;
        select.appendChild(opt);
      }

      select.disabled = false;
      this.setStatus(`Found ${this.devices.length} scanner(s).`);
      this.setRefreshState('ok');
      this.onDevicesConnected?.(true);

      const saved = loadSavedPreferences();
      const savedDeviceId =
        saved?.deviceId && this.devices.some((d) => d.id === saved.deviceId)
          ? saved.deviceId
          : this.devices[0].id;
      select.value = savedDeviceId;
      await this.selectDevice(savedDeviceId);
    } catch (err) {
      this.setRefreshState('off');
      this.onDevicesConnected?.(false);
      this.reportError(this.resolveErrorMessage(err));
    }
  }

  private async selectDevice(id: string): Promise<void> {
    this.selectedDevice = this.devices.find((d) => d.id === id) ?? null;
    if (!this.selectedDevice) {
      return;
    }

    this.setStatus(`Loading capabilities for ${this.selectedDevice.name}…`);
    const settingsPanel = this.root.querySelector<HTMLElement>('[data-settings]')!;
    settingsPanel.hidden = true;

    try {
      this.capabilities = await loadCapabilities(this.selectedDevice);
      const saved = loadSavedPreferences();
      this.settings = mergeSettings(this.capabilities, saved?.settings);
      this.populateSettingsUi();
      this.persistPreferences();
      settingsPanel.hidden = false;
      this.root.querySelector<HTMLButtonElement>('[data-scan]')!.disabled = false;
      this.setStatus(`Ready — ${this.selectedDevice.host}:${this.selectedDevice.port}`);
    } catch (err) {
      this.reportError(this.resolveErrorMessage(err));
    }
  }

  private populateSettingsUi(): void {
    if (!this.capabilities || !this.settings) {
      return;
    }

    const inputSelect = this.root.querySelector<HTMLSelectElement>('[data-input-source]')!;
    inputSelect.innerHTML = '';
    if (this.capabilities.hasPlaten) {
      inputSelect.appendChild(new Option(this.labels.flatbed, 'Glass'));
    }
    if (this.capabilities.hasFeeder) {
      inputSelect.appendChild(new Option(this.labels.feeder, 'ADF'));
    }
    inputSelect.value = this.settings.inputSource;
    inputSelect.onchange = () => {
      if (this.settings) {
        this.settings.inputSource = inputSelect.value as 'ADF' | 'Glass';
        this.refreshPaperSizeOptions();
        this.persistPreferences();
      }
    };

    this.refreshPaperSizeOptions();

    const resSelect = this.root.querySelector<HTMLSelectElement>('[data-resolution]')!;
    resSelect.innerHTML = '';
    for (const dpi of this.capabilities.resolutions) {
      resSelect.appendChild(new Option(`${dpi} DPI`, String(dpi)));
    }
    resSelect.value = String(this.settings.resolution);
    resSelect.onchange = () => {
      if (this.settings) {
        this.settings.resolution = Number(resSelect.value);
        this.persistPreferences();
      }
    };

    const colorSelect = this.root.querySelector<HTMLSelectElement>('[data-color-mode]')!;
    colorSelect.innerHTML = '';
    for (const mode of this.capabilities.colorModes) {
      colorSelect.appendChild(new Option(this.colorModeLabel(mode), mode));
    }
    // Synthetic true black & white (1-bit) produced by thresholding a grayscale
    // scan — works even when the device only exposes colour/grayscale.
    const grayscaleMode = this.grayscaleColorMode();
    const hasNativeBw = this.capabilities.colorModes.some((m) => {
      const l = m.toLowerCase();
      return l.includes('black') || l.includes('mono') || l.includes('binary');
    });
    if (grayscaleMode && !hasNativeBw) {
      colorSelect.appendChild(new Option(this.labels.colorBlackWhite, BW_MODE_VALUE));
    }
    colorSelect.value = this.settings.blackWhite ? BW_MODE_VALUE : this.settings.colorMode;
    colorSelect.onchange = () => {
      if (!this.settings) {
        return;
      }
      if (colorSelect.value === BW_MODE_VALUE) {
        this.settings.blackWhite = true;
        this.settings.colorMode = this.grayscaleColorMode() ?? this.settings.colorMode;
      } else {
        this.settings.blackWhite = false;
        this.settings.colorMode = colorSelect.value;
      }
      this.persistPreferences();
    };
  }

  private grayscaleColorMode(): string | null {
    const modes = this.capabilities?.colorModes ?? [];
    return (
      modes.find((m) => {
        const l = m.toLowerCase();
        return l.includes('gray') || l.includes('grey');
      }) ?? null
    );
  }

  private refreshPaperSizeOptions(): void {
    if (!this.capabilities || !this.settings) {
      return;
    }

    const paperSelect = this.root.querySelector<HTMLSelectElement>('[data-paper-size]')!;
    const regions = scanRegionsForInput(this.capabilities, this.settings.inputSource);
    paperSelect.innerHTML = '';
    for (const region of regions) {
      paperSelect.appendChild(new Option(region, region));
    }

    if (!regions.includes(this.settings.scanRegion)) {
      this.settings.scanRegion = regions.includes('A4') ? 'A4' : regions[0] ?? 'A4';
    }
    paperSelect.value = this.settings.scanRegion;
    paperSelect.onchange = () => {
      if (this.settings) {
        this.settings.scanRegion = paperSelect.value;
        this.persistPreferences();
      }
    };
  }

  private setScanning(active: boolean): void {
    if (active === this.scanning) {
      return;
    }
    this.scanning = active;
    if (active) {
      this.scanIdle = new Promise((resolve) => {
        this.resolveScanIdle = resolve;
      });
    } else {
      this.resolveScanIdle?.();
      this.resolveScanIdle = null;
    }
    this.onScanningChange?.(active);
  }

  private persistPreferences(): void {
    if (!this.settings) {
      return;
    }
    savePreferences({
      deviceId: this.selectedDevice?.id,
      settings: { ...this.settings },
    });
  }

  private async runScan(): Promise<void> {
    if (!this.selectedDevice || !this.settings || this.scanning) {
      return;
    }

    this.setScanning(true);
    const scanBtn = this.root.querySelector<HTMLButtonElement>('[data-scan]')!;
    scanBtn.disabled = true;
    this.setStatus('Scanning…');

    try {
      const newPages = await scanPages(this.selectedDevice, this.settings, (page) => {
        this.pages.push(page);
        this.renderPreview();
        this.onPagesChange?.(this.pages);
      });
      if (newPages.length > 0 && this.pages.length === 0) {
        this.pages = newPages;
        this.renderPreview();
      }
      this.onPagesChange?.(this.pages);
      this.setStatus(`Scanned ${newPages.length} page(s).`);
      this.root.querySelector<HTMLButtonElement>('[data-export-pdf]')!.disabled = this.pages.length === 0;
      this.root.querySelector<HTMLButtonElement>('[data-clear]')!.disabled = this.pages.length === 0;
      // A successful scan proves the device is online again.
      this.deviceOffline = false;
      this.setRefreshState('ok');
      this.onDevicesConnected?.(true);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const code = (err as { code?: string })?.code;
      const deviceUnavailable =
        (err as { scannerOffline?: boolean })?.scannerOffline === true ||
        code === 'ECONNABORTED' ||
        isBridgeConnectionError(err) ||
        (typeof status === 'number' && status >= 500);
      if (deviceUnavailable) {
        this.deviceOffline = true;
        this.setRefreshState('off');
        this.onDevicesConnected?.(false);
        this.reportError(this.labels.scannerOffline);
      } else {
        this.reportError(this.resolveErrorMessage(err));
      }
    } finally {
      this.setScanning(false);
      scanBtn.disabled = false;
    }
  }

  /** Import image/PDF files from the computer and add them as preview pages. */
  private async importFiles(files: FileList): Promise<void> {
    const list = Array.from(files);
    if (list.length === 0) {
      return;
    }

    this.onImportingChange?.(true);
    this.setStatus(this.labels.importing);
    try {
      for (const file of list) {
        const isPdf =
          file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImage =
          file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(file.name);

        if (isPdf) {
          const blobs = await pdfFileToImageBlobs(file);
          for (const blob of blobs) {
            this.addImportedPage(blob);
          }
        } else if (isImage) {
          this.addImportedPage(file);
        }
      }
      this.onPagesChange?.(this.pages);
      this.renderPreview();
      this.root.querySelector<HTMLButtonElement>('[data-export-pdf]')!.disabled = this.pages.length === 0;
      this.root.querySelector<HTMLButtonElement>('[data-clear]')!.disabled = this.pages.length === 0;
      this.setStatus(`Imported ${this.pages.length} page(s).`);
    } catch (err) {
      this.reportError(this.resolveErrorMessage(err));
    } finally {
      this.onImportingChange?.(false);
    }
  }

  private addImportedPage(blob: Blob): void {
    const page: ScannedPage = {
      id: crypto.randomUUID(),
      blob,
      url: URL.createObjectURL(blob),
      rotation: 0,
    };
    this.pages.push(page);
  }

  /** Rotate a page 90° clockwise; rotation is baked into the exported PDF. */
  private rotatePage(id: string): void {
    const page = this.pages.find((p) => p.id === id);
    if (!page) {
      return;
    }
    page.rotation = (((page.rotation ?? 0) + 90) % 360) as number;
    this.onPagesChange?.(this.pages);
    this.renderPreview();
    if (this.lightboxIndex !== null && this.pages[this.lightboxIndex]?.id === id) {
      this.updateLightbox();
    }
  }

  /** Move a page towards the start (delta < 0) or end (delta > 0) of the list. */
  private movePage(id: string, delta: number): void {
    const fromIndex = this.pages.findIndex((p) => p.id === id);
    if (fromIndex < 0) {
      return;
    }
    const toIndex = fromIndex + delta;
    if (toIndex < 0 || toIndex >= this.pages.length) {
      return;
    }
    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
    this.onPagesChange?.(this.pages);
    this.renderPreview();
  }

  private reorderPages(draggedId: string, targetId: string): void {
    const fromIndex = this.pages.findIndex((p) => p.id === draggedId);
    const toIndex = this.pages.findIndex((p) => p.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    const openPageId =
      this.lightboxIndex !== null
        ? this.pages[this.lightboxIndex]?.id
        : null;

    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
    this.onPagesChange?.(this.pages);
    this.renderPreview();

    if (openPageId) {
      const nextIndex = this.pages.findIndex((p) => p.id === openPageId);
      if (nextIndex >= 0) {
        this.lightboxIndex = nextIndex;
        this.updateLightbox();
      } else {
        this.closeLightbox();
      }
    }
  }

  private ensureLightbox(): HTMLElement {
    if (this.lightboxEl) {
      return this.lightboxEl;
    }

    const lb = document.createElement('div');
    lb.className = 'webscan-lightbox';
    lb.dataset.webscanLightbox = '';
    lb.hidden = true;
    lb.innerHTML = `
      <div class="webscan-lightbox-backdrop" data-lightbox-close></div>
      <div class="webscan-lightbox-dialog" role="dialog" aria-modal="true">
        <button type="button" class="webscan-lightbox-close" data-lightbox-close aria-label="${this.labels.close}">×</button>
        <div class="webscan-lightbox-zoom" role="group">
          <button type="button" data-lightbox-zoom-out aria-label="${this.labels.zoomOut}">−</button>
          <button type="button" data-lightbox-zoom-reset aria-label="${this.labels.zoomReset}">⤢</button>
          <button type="button" data-lightbox-zoom-in aria-label="${this.labels.zoomIn}">+</button>
        </div>
        <button type="button" class="webscan-lightbox-nav webscan-lightbox-nav--prev" data-lightbox-prev aria-label="${this.labels.prevPage}">‹</button>
        <div class="webscan-lightbox-stage" data-lightbox-stage>
          <img data-lightbox-img alt="" draggable="false" />
        </div>
        <button type="button" class="webscan-lightbox-nav webscan-lightbox-nav--next" data-lightbox-next aria-label="${this.labels.nextPage}">›</button>
        <p class="webscan-lightbox-caption" data-lightbox-caption></p>
      </div>
    `;

    lb.tabIndex = -1;

    lb.querySelectorAll('[data-lightbox-close]').forEach((el) => {
      el.addEventListener('click', () => this.closeLightbox());
    });
    lb.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => {
      this.shiftLightbox(-1);
    });
    lb.querySelector('[data-lightbox-next]')?.addEventListener('click', () => {
      this.shiftLightbox(1);
    });

    lb.querySelector('[data-lightbox-zoom-in]')?.addEventListener('click', () => {
      this.setLightboxZoom(this.lightboxZoom + 0.25);
    });
    lb.querySelector('[data-lightbox-zoom-out]')?.addEventListener('click', () => {
      this.setLightboxZoom(this.lightboxZoom - 0.25);
    });
    lb.querySelector('[data-lightbox-zoom-reset]')?.addEventListener('click', () => {
      this.resetLightboxZoom();
    });

    const stage = lb.querySelector<HTMLElement>('[data-lightbox-stage]');
    stage?.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const step = e.deltaY < 0 ? 0.2 : -0.2;
        this.setLightboxZoom(this.lightboxZoom + step);
      },
      { passive: false },
    );
    stage?.addEventListener('dblclick', () => {
      if (this.lightboxZoom > 1) {
        this.resetLightboxZoom();
      } else {
        this.setLightboxZoom(2);
      }
    });
    stage?.addEventListener('pointerdown', (e) => {
      if (this.lightboxZoom <= 1) {
        return;
      }
      this.lightboxPanning = true;
      this.lightboxPanStart = {
        x: e.clientX,
        y: e.clientY,
        ox: this.lightboxPan.x,
        oy: this.lightboxPan.y,
      };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('webscan-lightbox-stage--panning');
    });
    stage?.addEventListener('pointermove', (e) => {
      if (!this.lightboxPanning) {
        return;
      }
      this.lightboxPan = {
        x: this.lightboxPanStart.ox + (e.clientX - this.lightboxPanStart.x),
        y: this.lightboxPanStart.oy + (e.clientY - this.lightboxPanStart.y),
      };
      this.applyLightboxTransform();
    });
    const endPan = (e: PointerEvent) => {
      if (!this.lightboxPanning) {
        return;
      }
      this.lightboxPanning = false;
      try {
        stage?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      stage?.classList.remove('webscan-lightbox-stage--panning');
    };
    stage?.addEventListener('pointerup', endPan);
    stage?.addEventListener('pointercancel', endPan);

    lb.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        this.shiftLightbox(1);
      } else if (e.key === 'ArrowRight') {
        this.shiftLightbox(-1);
      } else if (e.key === '+' || e.key === '=') {
        this.setLightboxZoom(this.lightboxZoom + 0.25);
      } else if (e.key === '-' || e.key === '_') {
        this.setLightboxZoom(this.lightboxZoom - 0.25);
      } else if (e.key === '0') {
        this.resetLightboxZoom();
      }
    });

    document.body.appendChild(lb);
    this.lightboxEl = lb;
    return lb;
  }

  private removeLightbox(): void {
    this.lightboxEl?.remove();
    this.lightboxEl = null;
    this.lightboxIndex = null;
  }

  private openLightbox(index: number): void {
    if (index < 0 || index >= this.pages.length) {
      return;
    }

    const lb = this.ensureLightbox();
    this.lightboxIndex = index;
    this.lightboxZoom = 1;
    this.lightboxPan = { x: 0, y: 0 };
    lb.hidden = false;
    this.updateLightbox();
    lb.focus();
  }

  private setLightboxZoom(zoom: number): void {
    const clamped = Math.min(5, Math.max(1, Math.round(zoom * 100) / 100));
    this.lightboxZoom = clamped;
    if (clamped === 1) {
      this.lightboxPan = { x: 0, y: 0 };
    }
    this.applyLightboxTransform();
  }

  private resetLightboxZoom(): void {
    this.lightboxZoom = 1;
    this.lightboxPan = { x: 0, y: 0 };
    this.applyLightboxTransform();
  }

  private applyLightboxTransform(): void {
    if (!this.lightboxEl || this.lightboxIndex === null) {
      return;
    }
    const img = this.lightboxEl.querySelector<HTMLImageElement>('[data-lightbox-img]');
    const stage = this.lightboxEl.querySelector<HTMLElement>('[data-lightbox-stage]');
    if (!img) {
      return;
    }
    const rot = this.pages[this.lightboxIndex]?.rotation ?? 0;
    img.style.transform = `translate(${this.lightboxPan.x}px, ${this.lightboxPan.y}px) scale(${this.lightboxZoom}) rotate(${rot}deg)`;
    if (stage) {
      stage.style.cursor = 'grab';
    }
  }

  private closeLightbox(): void {
    if (!this.lightboxEl) {
      return;
    }
    this.lightboxEl.hidden = true;
    this.lightboxIndex = null;
  }

  private shiftLightbox(delta: number): void {
    if (this.lightboxIndex === null || this.pages.length === 0) {
      return;
    }
    const next =
      (this.lightboxIndex + delta + this.pages.length) % this.pages.length;
    this.lightboxIndex = next;
    this.lightboxZoom = 1;
    this.lightboxPan = { x: 0, y: 0 };
    this.updateLightbox();
  }

  private updateLightbox(): void {
    if (!this.lightboxEl || this.lightboxIndex === null) {
      return;
    }

    const page = this.pages[this.lightboxIndex];
    if (!page) {
      this.closeLightbox();
      return;
    }

    const img = this.lightboxEl.querySelector<HTMLImageElement>('[data-lightbox-img]')!;
    const caption = this.lightboxEl.querySelector('[data-lightbox-caption]')!;
    const prev = this.lightboxEl.querySelector<HTMLButtonElement>('[data-lightbox-prev]')!;
    const next = this.lightboxEl.querySelector<HTMLButtonElement>('[data-lightbox-next]')!;

    img.src = page.url;
    img.alt = `${this.labels.page} ${this.lightboxIndex + 1}`;
    this.applyLightboxTransform();
    caption.textContent = this.labels.pageOf
      .replace('{current}', String(this.lightboxIndex + 1))
      .replace('{total}', String(this.pages.length));

    const single = this.pages.length <= 1;
    prev.disabled = single;
    next.disabled = single;
  }

  private bindThumbDrag(card: HTMLElement, pageId: string): void {
    card.draggable = true;
    card.dataset.pageId = pageId;

    card.addEventListener('dragstart', (e) => {
      this.dragPageId = pageId;
      card.classList.add('webscan-thumb--dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', pageId);
      }
    });

    card.addEventListener('dragend', () => {
      this.dragPageId = null;
      card.classList.remove('webscan-thumb--dragging');
      this.root
        .querySelectorAll('.webscan-thumb--drop-target')
        .forEach((el) => el.classList.remove('webscan-thumb--drop-target'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      if (this.dragPageId && this.dragPageId !== pageId) {
        card.classList.add('webscan-thumb--drop-target');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('webscan-thumb--drop-target');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('webscan-thumb--drop-target');
      const fromId =
        this.dragPageId ?? e.dataTransfer?.getData('text/plain') ?? '';
      if (!fromId || fromId === pageId) {
        return;
      }
      this.reorderPages(fromId, pageId);
    });
  }

  private renderPreview(): void {
    const pageIds = new Set(this.pages.map((p) => p.id));
    for (const id of this.selectedPageIds) {
      if (!pageIds.has(id)) {
        this.selectedPageIds.delete(id);
      }
    }

    const container = this.root.querySelector('[data-preview]')!;
    const count = this.root.querySelector('[data-page-count]')!;
    const toolbar = this.root.querySelector<HTMLElement>('[data-preview-toolbar]');
    const selectAll = this.root.querySelector<HTMLInputElement>('[data-select-all]');
    const deleteSelectedBtn = this.root.querySelector<HTMLButtonElement>(
      '[data-delete-selected]',
    );

    count.textContent = this.pages.length ? `(${this.pages.length})` : '';
    if (toolbar) {
      toolbar.hidden = this.pages.length === 0;
    }

    container.innerHTML = '';
    this.pages.forEach((page, i) => {
      const card = document.createElement('div');
      card.className = 'webscan-thumb';
      if (this.selectedPageIds.has(page.id)) {
        card.classList.add('webscan-thumb--selected');
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'webscan-thumb-delete';
      deleteBtn.title = this.labels.deletePage;
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePage(page.id);
      });

      const img = document.createElement('img');
      img.className = 'webscan-thumb-image';
      img.src = page.url;
      img.alt = `${this.labels.page} ${i + 1}`;
      img.title = this.labels.viewPage;
      img.draggable = false;
      img.dataset.rotation = String(page.rotation ?? 0);
      img.style.transform = `rotate(${page.rotation ?? 0}deg)`;
      img.addEventListener('click', () => this.openLightbox(i));

      const rotateBtn = document.createElement('button');
      rotateBtn.type = 'button';
      rotateBtn.className = 'webscan-thumb-rotate';
      rotateBtn.title = this.labels.rotate;
      rotateBtn.textContent = '↻';
      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.rotatePage(page.id);
      });

      const reorder = document.createElement('div');
      reorder.className = 'webscan-thumb-reorder';

      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'webscan-thumb-move webscan-thumb-move--back';
      backBtn.title = this.labels.moveBack;
      backBtn.textContent = '‹';
      backBtn.disabled = i === 0;
      backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.movePage(page.id, -1);
      });

      const fwdBtn = document.createElement('button');
      fwdBtn.type = 'button';
      fwdBtn.className = 'webscan-thumb-move webscan-thumb-move--forward';
      fwdBtn.title = this.labels.moveForward;
      fwdBtn.textContent = '›';
      fwdBtn.disabled = i === this.pages.length - 1;
      fwdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.movePage(page.id, 1);
      });

      reorder.append(backBtn, fwdBtn);

      const label = document.createElement('span');
      label.textContent = `${this.labels.page} ${i + 1}`;
      label.className = 'webscan-thumb-label';

      if (!this.compact) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'webscan-thumb-select';
        checkbox.checked = this.selectedPageIds.has(page.id);
        checkbox.title = 'Select page';
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            this.selectedPageIds.add(page.id);
          } else {
            this.selectedPageIds.delete(page.id);
          }
          this.renderPreview();
        });
        card.appendChild(checkbox);
      }

      this.bindThumbDrag(card, page.id);

      card.appendChild(deleteBtn);
      card.appendChild(rotateBtn);
      card.appendChild(img);
      card.appendChild(reorder);
      card.appendChild(label);
      container.appendChild(card);
    });

    if (selectAll && deleteSelectedBtn) {
      const selectedCount = this.selectedPageIds.size;
      selectAll.checked =
        this.pages.length > 0 && selectedCount === this.pages.length;
      selectAll.indeterminate =
        selectedCount > 0 && selectedCount < this.pages.length;
      deleteSelectedBtn.disabled = selectedCount === 0;
      deleteSelectedBtn.textContent =
        selectedCount > 0
          ? `${this.labels.deleteSelected} (${selectedCount})`
          : this.labels.deleteSelected;
    }

    const hasPages = this.pages.length > 0;
    this.root.querySelector<HTMLButtonElement>('[data-export-pdf]')!.disabled = !hasPages;
    this.root.querySelector<HTMLButtonElement>('[data-clear]')!.disabled = !hasPages;
  }

  private async exportPdf(): Promise<void> {
    if (this.pages.length === 0) {
      return;
    }
    this.setStatus('Building PDF…');
    try {
      await exportPagesToPdf(this.pages);
      this.setStatus('PDF downloaded.');
    } catch (err) {
      this.reportError(this.resolveErrorMessage(err));
    }
  }
}
