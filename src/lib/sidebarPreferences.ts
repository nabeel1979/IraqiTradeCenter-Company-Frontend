import { useEffect, useState } from 'react';

const STORAGE_KEY = 'iqtc_sidebar_prefs';

export interface SidebarPrefs {
  /** group key -> true إذا مطوي */
  collapsed: Record<string, boolean>;
  /** group key -> true إذا مخفي (لا يظهر في القائمة) */
  hidden: Record<string, boolean>;
}

const DEFAULT: SidebarPrefs = { collapsed: {}, hidden: {} };

function load(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return {
      collapsed: parsed?.collapsed ?? {},
      hidden: parsed?.hidden ?? {},
    };
  } catch {
    return { ...DEFAULT };
  }
}

function save(prefs: SidebarPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    // أعلم أي مستمع آخر في نفس النافذة
    window.dispatchEvent(new CustomEvent('sidebar-prefs-changed'));
  } catch {
    // ignore
  }
}

/** Hook لإدارة تفضيلات القائمة الجانبية (مع مزامنة بين كل المكوّنات) */
export function useSidebarPrefs() {
  const [prefs, setPrefs] = useState<SidebarPrefs>(load);

  useEffect(() => {
    const onChange = () => setPrefs(load());
    window.addEventListener('sidebar-prefs-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('sidebar-prefs-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const toggleCollapsed = (key: string) => {
    const next = { ...prefs, collapsed: { ...prefs.collapsed, [key]: !prefs.collapsed[key] } };
    setPrefs(next);
    save(next);
  };

  const setAllCollapsed = (groups: string[], collapsed: boolean) => {
    const map: Record<string, boolean> = {};
    for (const g of groups) map[g] = collapsed;
    const next = { ...prefs, collapsed: map };
    setPrefs(next);
    save(next);
  };

  const toggleHidden = (key: string) => {
    const next = { ...prefs, hidden: { ...prefs.hidden, [key]: !prefs.hidden[key] } };
    setPrefs(next);
    save(next);
  };

  const setHidden = (key: string, hidden: boolean) => {
    const next = { ...prefs, hidden: { ...prefs.hidden, [key]: hidden } };
    setPrefs(next);
    save(next);
  };

  const isCollapsed = (key: string) => !!prefs.collapsed[key];
  const isHidden = (key: string) => !!prefs.hidden[key];

  return { prefs, toggleCollapsed, setAllCollapsed, toggleHidden, setHidden, isCollapsed, isHidden };
}
