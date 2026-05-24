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
    const raw = localStorage.getItem(key);
    // ملاحظة: لا نسقط على LEGACY_KEY هنا لأنه قد يحوي تفضيلات مستخدم سابق
    // على نفس الجهاز ويُسرّبها لمستخدم جديد. الهجرة من LEGACY تتم مرة واحدة
    // فقط داخل primeFromServer إن لم يكن للمستخدم تفضيلات على الخادم.
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

/**
 * يُستدعى مرة واحدة بعد تسجيل الدخول وقبل التوجيه إلى الصفحة الرئيسية.
 * - يجلب تفضيلات المستخدم من الخادم ويكتبها في localStorage بمفتاح خاص بهذا المستخدم.
 * - بهذا يضمن أن أول render للـ Sidebar سيستخدم التفضيلات الصحيحة بدون "ومضة".
 * - إن كان الخادم فارغاً ولكن يوجد تفضيلات قديمة في LEGACY_KEY (إصدار سابق
 *   لم يُفصل بحسب المستخدم)، نهجرها للمستخدم الحالي ونرفعها للخادم.
 * - مُغلّف ليفشل بصمت — حفظ تفضيلات الواجهة شيء ثانوي.
 */
export async function primeSidebarPrefsFromServer(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const server = await fetchPreferences<ServerPrefsShape>({});
    lastServerSnapshot = server;

    if (server?.sidebar) {
      const normalized = normalize(server.sidebar);
      saveToLocal(userId, normalized);
      return;
    }

    // الخادم فارغ — جرّب هجرة من المفتاح القديم العام (لو موجود)
    let migrated: SidebarPrefs | null = null;
    try {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) migrated = normalize(JSON.parse(legacyRaw));
    } catch {
      migrated = null;
    }

    if (migrated && (Object.keys(migrated.collapsed).length || Object.keys(migrated.hidden).length)) {
      saveToLocal(userId, migrated);
      // ارفع التفضيلات المهاجَرة للخادم كأول snapshot
      const merged: ServerPrefsShape = { ...(server ?? {}), sidebar: migrated };
      lastServerSnapshot = merged;
      void savePreferences(merged);
      // امسح المفتاح القديم بعد الهجرة الناجحة لتجنّب تسريبه لمستخدمين آخرين
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
      return;
    }

    // لا تفضيلات على الخادم ولا في LEGACY — اكتب القيمة الافتراضية بمفتاح المستخدم
    // حتى يبدأ الـ Sidebar من حالة مفتوحة بشكل ثابت.
    saveToLocal(userId, DEFAULT);
  } catch {
    // ignore — UI prefs are non-critical
  }
}

/** Hook لإدارة تفضيلات القائمة الجانبية. يزامن مع الخادم تلقائياً للمستخدمين المسجّلين. */
export function useSidebarPrefs() {
  const userId = useAuthStore(s => s.user?.id) ?? null;
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  // الـ initial state يُقرأ من localStorage الخاص بهذا المستخدم تحديداً.
  // عند تسجيل الدخول، LoginPage يستدعي primeSidebarPrefsFromServer قبل التوجيه،
  // فيكون localStorage جاهزاً بالقيم الصحيحة من أول render — بدون ومضة افتراضية.
  const [prefs, setPrefs] = useState<SidebarPrefs>(() => loadFromLocal(userId));
  const hasSyncedRef = useRef(false);

  // ‎عند تبديل مستخدم أو F5: زامن من الخادم لتغطية حالة عدم الاستدعاء عبر LoginPage
  useEffect(() => {
    hasSyncedRef.current = false;
    // اضبط الحالة من localStorage بمفتاح المستخدم الحالي (قد تتغيّر إن تبدّل المستخدم)
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

  // ‎الافتراض: مجموعة لم يتعامل معها المستخدم بعد ⇒ تعتبر مطوية.
  // ‎هذا يجعل القائمة عند أول دخول مطوية بالكامل (تبدو كقائمة عناوين)
  // ‎ويختار المستخدم بوعي ما يفتحه. القيمة الصريحة `false` (مفتوحة) تُحترَم.
  const isCollapsed = (key: string) => prefs.collapsed[key] !== false;
  const isHidden = (key: string) => !!prefs.hidden[key];

  const toggleCollapsed = (key: string) => {
    const cur = isCollapsed(key);
    persist({ ...prefs, collapsed: { ...prefs.collapsed, [key]: !cur } });
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

  return { prefs, toggleCollapsed, setAllCollapsed, toggleHidden, setHidden, isCollapsed, isHidden };
}
