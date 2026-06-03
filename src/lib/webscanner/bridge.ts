import type { BridgeDevice } from './types';

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5100';

export function getBridgeUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('bridge') ?? DEFAULT_BRIDGE_URL;
}

export async function fetchDevices(bridgeUrl = getBridgeUrl()): Promise<BridgeDevice[]> {
  const response = await fetch(`${bridgeUrl}/api/devices`);
  if (!response.ok) {
    throw new Error(`Bridge unavailable (${response.status}). Start Scanner.LocalBridge first.`);
  }
  return response.json();
}

export async function checkBridgeHealth(bridgeUrl = getBridgeUrl()): Promise<boolean> {
  try {
    const response = await fetch(`${bridgeUrl}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export interface BridgeStatus {
  online: boolean;
  devices: BridgeDevice[];
  checkedAt: number;
}

// ‎على الحاسبات التي لا يوجد فيها مشغّل السكنر، كل فحص اتصال يُسجَّل خطأً أحمر
// ‎(CORS/connection refused) في الكونسول والشبكة. لتقليل هذا الضجيج نُخزّن آخر
// ‎نتيجة ونعيد استخدامها: فحص متقارب عند الاتصال، وتباطؤ كبير عند عدم الاتصال،
// ‎مع منع الطلبات المتزامنة المكررة.
const ONLINE_TTL_MS = 10_000;
const OFFLINE_TTL_MS = 60_000;

// ‎على الأجهزة التي لا يوجد فيها مشغّل السكنر نُخزّن "غير متصل" بين الجلسات
// ‎لمدّة قصيرة، فنتوقف عن إرسال أي طلب فحص (وبالتالي صفر أخطاء شبكة في
// ‎الكونسول) حتى ينتهي هذا الكولداون أو يطلب المستخدم الفحص يدوياً (force).
const OFFLINE_PERSIST_KEY = 'scanner.bridge.offlineUntil';
const OFFLINE_PERSIST_MS = 5 * 60_000;

function persistedOfflineActive(): boolean {
  try {
    const until = Number(localStorage.getItem(OFFLINE_PERSIST_KEY) ?? '0');
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function setPersistedOffline(offline: boolean): void {
  try {
    if (offline) {
      localStorage.setItem(OFFLINE_PERSIST_KEY, String(Date.now() + OFFLINE_PERSIST_MS));
    } else {
      localStorage.removeItem(OFFLINE_PERSIST_KEY);
    }
  } catch {
    /* ignore */
  }
}

let cachedStatus: BridgeStatus | null = null;
let inflight: Promise<BridgeStatus> | null = null;

export async function getBridgeStatus(force = false): Promise<BridgeStatus> {
  const now = Date.now();
  // ‎فحص تلقائي على جهاز معروف أنه بلا جسر: أعد "غير متصل" بدون أي طلب شبكة.
  if (!force && persistedOfflineActive()) {
    return cachedStatus ?? { online: false, devices: [], checkedAt: now };
  }
  if (!force && cachedStatus) {
    const ttl = cachedStatus.online ? ONLINE_TTL_MS : OFFLINE_TTL_MS;
    if (now - cachedStatus.checkedAt < ttl) {
      return cachedStatus;
    }
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    let online = false;
    let devices: BridgeDevice[] = [];
    try {
      const res = await fetch(`${getBridgeUrl()}/api/health`);
      online = res.ok;
      if (online) {
        try {
          devices = await fetchDevices();
        } catch {
          devices = [];
        }
      }
    } catch {
      online = false;
    }
    cachedStatus = { online, devices, checkedAt: Date.now() };
    setPersistedOffline(!online);
    inflight = null;
    return cachedStatus;
  })();
  return inflight;
}
