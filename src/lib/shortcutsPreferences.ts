import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { fetchPreferences, savePreferences } from '@/lib/api/preferences';

// ════════════════════════════════════════════════════════════════════
// User shortcuts preferences
// ════════════════════════════════════════════════════════════════════
// قائمة المسارات السريعة التي يختار المستخدم ظهورها في لوحة القيادة.
// تُحفَظ في localStorage بمفتاح خاص بكل مستخدم وتُزامَن مع الخادم تحت
// المفتاح "shortcuts" داخل JSON تفضيلات المستخدم العامة (نفس endpoint
// الـ sidebar prefs). الفلترة النهائية بالصلاحية تحدث وقت العرض داخل
// useAvailableNavItems كي لا نخسر اختيار المستخدم عند تغير الصلاحيات
// مؤقتاً.

const LEGACY_KEY = 'iqtc_shortcuts_prefs';
const KEY_PREFIX = 'iqtc_shortcuts_prefs';

export interface ShortcutsPrefs {
  /** قائمة مسارات (to) مرتّبة كما يريدها المستخدم */
  items: string[];
}

interface ServerPrefsShape {
  shortcuts?: ShortcutsPrefs;
  [other: string]: unknown;
}

const DEFAULT: ShortcutsPrefs = { items: [] };

function storageKeyFor(userId: string | null | undefined): string {
  if (!userId) return LEGACY_KEY;
  return `${KEY_PREFIX}::${userId}`;
}

function normalize(parsed: unknown): ShortcutsPrefs {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const items = Array.isArray(obj.items)
    ? (obj.items.filter(x => typeof x === 'string' && x.length > 0) as string[])
    : [];
  // إزالة التكرارات مع الحفاظ على الترتيب
  return { items: Array.from(new Set(items)) };
}

function loadFromLocal(userId: string | null | undefined): ShortcutsPrefs {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    if (!raw) return { ...DEFAULT };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT };
  }
}

function saveToLocal(userId: string | null | undefined, prefs: ShortcutsPrefs) {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent('shortcuts-prefs-changed'));
  } catch {
    // ignore (storage full / disabled)
  }
}

// ════════════════════════════════════════
// Server sync (debounced)
// ════════════════════════════════════════
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastServerSnapshot: ServerPrefsShape | null = null;

async function syncFromServer(): Promise<ShortcutsPrefs | null> {
  const server = await fetchPreferences<ServerPrefsShape>({});
  lastServerSnapshot = server;
  if (server?.shortcuts) return normalize(server.shortcuts);
  return null;
}

function scheduleServerSave(prefs: ShortcutsPrefs) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const merged: ServerPrefsShape = { ...(lastServerSnapshot ?? {}), shortcuts: prefs };
    lastServerSnapshot = merged;
    void savePreferences(merged);
  }, 600);
}

/** Hook لإدارة مختصرات لوحة القيادة. يزامن مع الخادم تلقائياً للمستخدمين المسجّلين. */
export function useShortcutsPrefs() {
  const userId = useAuthStore(s => s.user?.id) ?? null;
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [prefs, setPrefs] = useState<ShortcutsPrefs>(() => loadFromLocal(userId));

  useEffect(() => {
    setPrefs(loadFromLocal(userId));
    if (!isAuthenticated || !userId) return;
    let cancelled = false;
    (async () => {
      const server = await syncFromServer();
      if (cancelled) return;
      if (server) {
        setPrefs(server);
        saveToLocal(userId, server);
      } else {
        // الخادم فارغ — ارفع تفضيلاتنا المحلية كأول snapshot لو موجودة
        const local = loadFromLocal(userId);
        if (local.items.length > 0) scheduleServerSave(local);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, isAuthenticated]);

  // ‎استمع لأي تغيير من tab/component ثاني
  useEffect(() => {
    const onChange = () => setPrefs(loadFromLocal(userId));
    window.addEventListener('shortcuts-prefs-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('shortcuts-prefs-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [userId]);

  const persist = (next: ShortcutsPrefs) => {
    const cleaned = normalize(next);
    setPrefs(cleaned);
    saveToLocal(userId, cleaned);
    if (isAuthenticated && userId) scheduleServerSave(cleaned);
  };

  const setItems = (items: string[]) => persist({ items });
  const add = (to: string) => {
    if (prefs.items.includes(to)) return;
    persist({ items: [...prefs.items, to] });
  };
  const remove = (to: string) => persist({ items: prefs.items.filter(x => x !== to) });
  const move = (from: number, to: number) => {
    if (from === to) return;
    if (from < 0 || to < 0 || from >= prefs.items.length || to >= prefs.items.length) return;
    const items = [...prefs.items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    persist({ items });
  };
  const has = (to: string) => prefs.items.includes(to);

  return { prefs, setItems, add, remove, move, has };
}
