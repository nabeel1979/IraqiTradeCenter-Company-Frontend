export interface BridgeDevice {
  id: string;
  name: string;
  driver: string;
  host: string;
  port: number;
  source: 'bridged' | 'network-escl';
}

export interface ScannedPage {
  id: string;
  blob: Blob;
  url: string;
  width?: number;
  height?: number;
  /** Clockwise rotation applied by the user, in degrees: 0 | 90 | 180 | 270. */
  rotation?: number;
}

export interface ScanSettings {
  inputSource: 'ADF' | 'Glass';
  scanRegion: string;
  resolution: number;
  colorMode: string;
  documentFormat: 'image/jpeg' | 'application/pdf';
  /**
   * True black & white. Most consumer scanners only expose colour/grayscale
   * over eSCL, so we scan in grayscale and threshold the image to 1-bit
   * monochrome on the client.
   */
  blackWhite?: boolean;
}
