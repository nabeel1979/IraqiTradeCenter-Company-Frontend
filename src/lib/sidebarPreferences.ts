import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { fetchPreferences, savePreferences } from '@/lib/api/preferences';

const LEGACY_KEY = 'iqtc_sidebar_prefs';
const KEY_PREFIX = 'iqtc_sidebar_prefs';

export interface SidebarPrefs {
  /** group key -> true إذا مطوي */
  collapsed: Record<string, boolean>;
  /** group key -> true إذا مخفي (لا يظهر في القائمة) */
  hidden: Record<string, boolean>;
}

interface ServerPrefsShape {
  sidebar?: SidebarPrefs;
  [other: string]: unknown;
}

const DEFAULT: SidebarPrefs = { collapsed: {}, hidden: {} };

/** مفتاح localStorage المخصص لكل مستخدم (يفصل تفضيلات المستخدمين على نفس الجهاز). */
function storageKeyFor(userId: string | null | undefined): string {
  if (!userId) return LEGACY_KEY;
  return `${KEY_PREFIX}::${userId}`;
}

function normalize(parsed: any): SidebarPrefs {
  return {
    collapsed: parsed?.collapsed ?? {},
    hidden: parsed?.hidden ?? {},
  };
}

function loadFromLocal(userId: string | null | undefined): SidebarPrefs {
  try {
    const key = storageKeyFor(userId);
    let raw = localStorage.getItem(key);
    // ‎هجرة: لو ما عندنا مفتاح خاص بالمستخدم، اقرأ المفتاح القديم العام (مرة واحدة)
    if (!raw && userId) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) raw = legacy;
    }
    if (!raw) return { ...DEFAULT };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT };
  }
}

function saveToLocal(userId: string | null | undefined, prefs: SidebarPrefs) {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent('sidebar-prefs-changed'));
  } catch {
    // ignore (storage full / disabled)
  }
}

// ════════════════════════════════════════
// Server sync (debounced)
// ════════════════════════════════════════
// نخزّن أحدث snapshot في الخادم مع debounce ~600ms حتى لا نُغرق الـ API.
// نُسلسل تحت مفتاح "sidebar" داخل الـ JSON الكامل، حتى نقدر نضيف أقسام ثانية لاحقاً.

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastServerSnapshot: ServerPrefsShape | null = null;

async function syncFromServer(): Promise<SidebarPrefs | null> {
  const server = await fetchPreferences<ServerPrefsShape>({});
  lastServerSnapshot = server;
  if (server?.sidebar) return normalize(server.sidebar);
  return null;
}

function scheduleServerSave(prefs: SidebarPrefs) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const merged: ServerPrefsShape = { ...(lastServerSnapshot ?? {}), sidebar: prefs };
    lastServerSnapshot = merged;
    void savePreferences(merged);
  }, 600);
}

/** Hook لإدارة تفضيلات القائمة الجانبية. يزامن مع الخادم تلقائياً للمستخدمين المسجّلين. */
export function useSidebarPrefs() {
  const userId = useAuthStore(s => s.user?.id) ?? null;
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [prefs, setPrefs] = useState<SidebarPrefs>(() => loadFromLocal(userId));
  const hasSyncedRef = useRef(false);

  // ‎عند تسجيل دخول جديد / تبديل مستخدم: حمّل من الخادم وامزج
  useEffect(() => {
    hasSyncedRef.current = false;
    setPrefs(loadFromLocal(userId));

    if (!isAuthenticated || !userId) return;
    let cancelled = false;
    (async () => {
      const serverPrefs = await syncFromServer();
      if (cancelled) return;
      if (serverPrefs) {
        setPrefs(serverPrefs);
        saveToLocal(userId, serverPrefs);
      } else {
        // ‎الخادم ما عنده شيء — ارفع تفضيلاتنا المحلية كأول snapshot
        const local = loadFromLocal(userId);
        if (Object.keys(local.collapsed).length || Object.keys(local.hidden).length) {
          scheduleServerSave(local);
        }
      }
      hasSyncedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [userId, isAuthenticated]);

  // ‎استمع لأي تغيير من tab/component ثاني
  useEffect(() => {
    const onChange = () => setPrefs(loadFromLocal(userId));
    window.addEventListener('sidebar-prefs-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('sidebar-prefs-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [userId]);

  const persist = (next: SidebarPrefs) => {
    setPrefs(next);
    saveToLocal(userId, next);
    if (isAuthenticated && userId) scheduleServerSave(next);
  };

  const toggleCollapsed = (key: string) => {
    persist({ ...prefs, collapsed: { ...prefs.collapsed, [key]: !prefs.collapsed[key] } });
  };

  const setAllCollapsed = (groups: string[], collapsed: boolean) => {
    const map: Record<string, boolean> = {};
    for (const g of groups) map[g] = collapsed;
    persist({ ...prefs, collapsed: map });
  };

  const toggleHidden = (key: string) => {
    persist({ ...prefs, hidden: { ...prefs.hidden, [key]: !prefs.hidden[key] } });
  };

  const setHidden = (key: string, hidden: boolean) => {
    persist({ ...prefs, hidden: { ...prefs.hidden, [key]: hidden } });
  };

  const isCollapsed = (key: string) => !!prefs.collapsed[key];
  const isHidden = (key: string) => !!prefs.hidden[key];

  return { prefs, toggleCollapsed, setAllCollapsed, toggleHidden, setHidden, isCollapsed, isHidden };
}
