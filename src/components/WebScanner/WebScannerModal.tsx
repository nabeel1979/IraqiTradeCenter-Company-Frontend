import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { WebScanApp, getBridgeStatus, getBridgeUrl } from '@/lib/webscanner/embed';
import { pagesToPdfBlob, pagesToJpgBlobs } from '@/lib/webscanPdf';
import { SCANNER_SETUP_PAGE, SCANNER_SETUP_ZIP } from '@/lib/scannerPool';
import './WebScannerModal.css';

const BRIDGE_DOWNLOAD_PATH =
  import.meta.env.VITE_SCANNER_BRIDGE_DOWNLOAD_URL ?? SCANNER_SETUP_ZIP();

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface BridgeSetupPanelProps {
  bridgeUrl: string;
  onRecheck: () => void | Promise<void>;
  rechecking: boolean;
}

function BridgeSetupPanel({ bridgeUrl, onRecheck, rechecking }: BridgeSetupPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="webscan-bridge-panel" role="region" aria-labelledby="webscan-bridge-title">
      <h3 id="webscan-bridge-title" className="webscan-bridge-panel__title">
        {t('webScanner.bridgeRequired')}
      </h3>
      <p className="webscan-bridge-panel__text">
        {t('webScanner.bridgeRequiredText')}
      </p>
      <p className="webscan-bridge-panel__hint">
        {t('webScanner.bridgeHint', { url: bridgeUrl })}
      </p>
      <div className="webscan-bridge-panel__actions">
        <a
          href={BRIDGE_DOWNLOAD_PATH}
          download="WebScanBridgeSetup.zip"
          className="webscan-modal-btn webscan-modal-btn--primary webscan-bridge-panel__download"
        >
          {t('webScanner.downloadBridge')}
        </a>
        <a
          href={SCANNER_SETUP_PAGE()}
          target="_blank"
          rel="noopener noreferrer"
          className="webscan-modal-btn webscan-modal-btn--ghost"
        >
          {t('webScanner.openSetupPage')}
        </a>
        <button
          type="button"
          className="webscan-modal-btn webscan-modal-btn--ghost"
          disabled={rechecking}
          onClick={() => void onRecheck()}
        >
          {rechecking ? t('webScanner.rechecking') : t('webScanner.recheck')}
        </button>
      </div>
    </div>
  );
}

export interface WebScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToArchive: (
    file: File,
    onProgress?: (percent: number) => void,
  ) => void | Promise<void>;
}

export function WebScannerModal({ isOpen, onClose, onAddToArchive }: WebScannerModalProps) {
  const { t, i18n } = useTranslation();
  const dir = i18n.dir();
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<WebScanApp | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [bridgeRechecking, setBridgeRechecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<'add' | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'jpg'>('pdf');
  const [addPercent, setAddPercent] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const checkBridge = useCallback(async (force = false) => {
    const status = await getBridgeStatus(force);
    setBridgeStatus(status.online ? 'ready' : 'missing');
    return status.online;
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setBridgeStatus('checking');
    void checkBridge(true);
    return undefined;
  }, [isOpen, checkBridge]);

  const handleRecheckBridge = async () => {
    setBridgeRechecking(true);
    try {
      const ok = await checkBridge(true);
      if (!ok) {
        toast.warning(t('webScanner.bridgeUnavailable', { url: getBridgeUrl() }));
      }
    } finally {
      setBridgeRechecking(false);
    }
  };

  useLayoutEffect(() => {
    if (!isOpen || bridgeStatus !== 'ready' || !mountRef.current) return undefined;

    const root = mountRef.current;
    root.innerHTML = '';
    setScanning(false);
    setBusy(null);
    setImporting(false);
    setPageCount(0);
    appRef.current = new WebScanApp({
      root,
      bridgeUrl: getBridgeUrl(),
      compact: true,
      labels: {
        scanner: t('webScanner.embed.scanner'),
        loading: t('webScanner.embed.loading'),
        refreshDevices: t('webScanner.embed.refreshDevices'),
        scanSettings: t('webScanner.embed.scanSettings'),
        source: t('webScanner.embed.source'),
        paperSize: t('webScanner.embed.paperSize'),
        resolution: t('webScanner.embed.resolution'),
        colorMode: t('webScanner.embed.colorMode'),
        scan: t('webScanner.embed.scan'),
        clearPreview: t('webScanner.embed.clearPreview'),
        exportPdf: t('webScanner.embed.exportPdf'),
        preview: t('webScanner.embed.preview'),
        selectAll: t('webScanner.embed.selectAll'),
        deleteSelected: t('webScanner.embed.deleteSelected'),
        previewHint: t('webScanner.embed.previewHint'),
        page: t('webScanner.embed.page'),
        deletePage: t('webScanner.embed.deletePage'),
        viewPage: t('webScanner.embed.viewPage'),
        moveBack: t('webScanner.embed.moveBack'),
        moveForward: t('webScanner.embed.moveForward'),
        rotate: t('webScanner.embed.rotate'),
        importFiles: t('webScanner.embed.importFiles'),
        importing: t('webScanner.embed.importing'),
        zoomIn: t('webScanner.embed.zoomIn'),
        zoomOut: t('webScanner.embed.zoomOut'),
        zoomReset: t('webScanner.embed.zoomReset'),
        colorColor: t('webScanner.embed.colorColor'),
        colorGrayscale: t('webScanner.embed.colorGrayscale'),
        colorBlackWhite: t('webScanner.embed.colorBlackWhite'),
        flatbed: t('webScanner.embed.flatbed'),
        feeder: t('webScanner.embed.feeder'),
        noScanners: t('webScanner.embed.noScanners'),
        scannerOffline: t('webScanner.embed.scannerOfflineMessage'),
        bridgeUnreachable: t('webScanner.embed.bridgeUnreachable'),
        prevPage: t('webScanner.embed.prevPage'),
        nextPage: t('webScanner.embed.nextPage'),
        close: t('common.close', { defaultValue: 'إغلاق' }),
        pageOf: t('webScanner.embed.pageOf'),
      },
      onScanningChange: setScanning,
      onPagesChange: (pages) => setPageCount(pages.length),
      onImportingChange: setImporting,
    });

    return () => {
      appRef.current?.dispose();
      appRef.current = null;
      root.innerHTML = '';
      setScanning(false);
      setBusy(null);
      setPageCount(0);
    };
  }, [isOpen, bridgeStatus, t]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    const active = scanning || importing || busy === 'add';
    if (!active) {
      setElapsed(0);
      return undefined;
    }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [scanning, importing, busy]);

  const handleAddToArchive = async () => {
    try {
      if (scanning) {
        await appRef.current?.waitForScanComplete();
      }

      const pages = appRef.current?.getPages() ?? [];
      if (pages.length === 0) {
        toast.warning(t('webScanner.noPages'));
        return;
      }

      setBusy('add');
      setAddPercent(0);
      if (outputFormat === 'jpg') {
        const images = await pagesToJpgBlobs(pages, 'scan');
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const file = new File([img.blob], img.fileName, { type: 'image/jpeg' });
          await onAddToArchive(file, (p) => {
            // Spread per-file progress across the whole batch.
            const overall = ((i + p / 100) / images.length) * 100;
            setAddPercent(Math.round(overall));
          });
        }
      } else {
        const paperSize = appRef.current?.getSettings()?.scanRegion ?? 'A4';
        const { blob, fileName } = await pagesToPdfBlob(pages, 'scan.pdf', paperSize);
        const file = new File([blob], fileName, { type: 'application/pdf' });
        await onAddToArchive(file, (p) => setAddPercent(p));
      }
      setAddPercent(100);
      appRef.current?.clearPages();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('webScanner.pdfError'));
    } finally {
      setBusy(null);
      setAddPercent(null);
    }
  };

  if (!isOpen) return null;

  const bridgeReady = bridgeStatus === 'ready';
  const hasPages = pageCount > 0;
  const addDisabled = !hasPages || scanning || busy !== null;
  const cancelDisabled = scanning || busy !== null;
  const footerLabel =
    busy === 'add'
      ? t('webScanner.adding')
      : scanning
        ? t('webScanner.scanning')
        : t('webScanner.addToArchive');

  return createPortal(
    <div className="webscan-modal-overlay" role="presentation">
      <div
        className="webscan-modal-dialog"
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-labelledby="webscan-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="webscan-modal-chrome">
          <div className="webscan-modal-title-wrap">
            <ScanLine className="h-5 w-5 shrink-0 text-sky-400" aria-hidden />
            <h2 id="webscan-modal-title">{t('webScanner.title')}</h2>
          </div>

          <div className="webscan-modal-chrome-actions">
            {bridgeReady && (
              <label className="webscan-format-select" title={t('webScanner.saveFormat')}>
                <span className="webscan-format-label">{t('webScanner.saveFormat')}</span>
                <select
                  value={outputFormat}
                  disabled={addDisabled}
                  onChange={(e) => setOutputFormat(e.target.value as 'pdf' | 'jpg')}
                >
                  <option value="pdf">{t('webScanner.formatPdf')}</option>
                  <option value="jpg">{t('webScanner.formatJpg')}</option>
                </select>
              </label>
            )}
            {bridgeReady && (
              <button
                type="button"
                className="webscan-modal-btn webscan-modal-btn--primary"
                disabled={addDisabled}
                onClick={() => void handleAddToArchive()}
              >
                {footerLabel}
              </button>
            )}
            <button
              type="button"
              className="webscan-modal-btn webscan-modal-btn--ghost"
              disabled={cancelDisabled}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="webscan-modal-close"
              onClick={onClose}
              disabled={cancelDisabled}
              aria-label={t('common.close', { defaultValue: 'إغلاق' })}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          className={`webscan-modal-body${bridgeReady ? ' webscan-modal-body--scan' : ''}`}
        >
          {bridgeStatus === 'checking' && (
            <p className="webscan-bridge-checking">{t('webScanner.checkingBridge')}</p>
          )}
          {bridgeStatus === 'missing' && (
            <BridgeSetupPanel
              bridgeUrl={getBridgeUrl()}
              onRecheck={handleRecheckBridge}
              rechecking={bridgeRechecking}
            />
          )}
          <div
            className="webscan-embed"
            hidden={!bridgeReady}
            aria-hidden={!bridgeReady}
          >
            <div ref={mountRef} />
          </div>

          {bridgeReady && (scanning || importing || busy === 'add') && (
            <div className="webscan-loading-overlay" role="status" aria-live="polite">
              <span className="webscan-spinner" aria-hidden />
              <span className="webscan-loading-text">
                {scanning
                  ? t('webScanner.scanning')
                  : importing
                    ? t('webScanner.importing')
                    : t('webScanner.adding')}
              </span>
              <div className="webscan-loading-meta">
                <span className="webscan-loading-timer" dir="ltr" title={t('webScanner.elapsed')}>
                  {formatDuration(elapsed)}
                </span>
                {scanning && (
                  <span className="webscan-loading-counter" dir="ltr">
                    {t('webScanner.pagesCounter', {
                      count: pageCount + 1,
                      defaultValue: '{{count}}',
                    })}
                  </span>
                )}
                {busy === 'add' && addPercent !== null && (
                  <span className="webscan-loading-counter" dir="ltr">
                    {addPercent}%
                  </span>
                )}
              </div>
              {busy === 'add' && addPercent !== null && (
                <div className="webscan-loading-bar" aria-hidden>
                  <div
                    className="webscan-loading-bar__fill"
                    style={{ width: `${addPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
