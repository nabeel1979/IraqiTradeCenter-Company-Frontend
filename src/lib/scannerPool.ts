/** Shared scanner setup pool — same path on every company site (IIS virtual app). */
export const SCANNER_POOL_PATH =
  import.meta.env.VITE_SCANNER_POOL_PATH ?? '/scanner-pool';

export function scannerPoolUrl(file = ''): string {
  const base = SCANNER_POOL_PATH.replace(/\/$/, '');
  const path = file ? `/${file.replace(/^\//, '')}` : '';
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${base}${path}`;
  }
  return `${base}${path}`;
}

export const SCANNER_SETUP_PAGE = () => scannerPoolUrl('');
/** Single self-contained installer (WebScanner_v2). */
export const SCANNER_SETUP_EXE = () => scannerPoolUrl('WebScanBridgeSetup.exe');
