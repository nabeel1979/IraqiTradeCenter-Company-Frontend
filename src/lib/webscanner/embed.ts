import './embed.css';

export { WebScanApp, bridgeUnreachableMessage, type WebScanOptions } from './app';
export type { BridgeDevice, ScannedPage, ScanSettings } from './types';
export { fetchDevices, checkBridgeHealth, getBridgeStatus, getBridgeUrl } from './bridge';
export type { BridgeStatus } from './bridge';
export { exportPagesToPdf } from './pdf-export';
