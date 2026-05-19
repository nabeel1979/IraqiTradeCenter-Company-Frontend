import { api } from './client';

// ════════════════════════════════════════
// User Preferences API
// ════════════════════════════════════════
// الـ Backend يخزن سلسلة JSON واحدة لكل مستخدم.
// نحن نُسلسل/نُفكّك على جانب العميل لكي يبقى الـ schema مرناً.

interface PreferencesResponse {
  success: boolean;
  data: string;
  errors?: string[];
}

/** يجلب JSON تفضيلات المستخدم الحالي من الخادم (يتطلب JWT). */
export async function fetchPreferences<T = unknown>(fallback: T): Promise<T> {
  try {
    const res = await api.get<PreferencesResponse>('/me/preferences');
    if (!res.data.success) return fallback;
    const raw = res.data.data;
    if (!raw || raw === '{}') return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** يحفظ كائن التفضيلات الكامل للمستخدم الحالي. مُغلّف ليفشل بصمت — حفظ الواجهة شيء ثانوي. */
export async function savePreferences<T>(prefs: T): Promise<boolean> {
  try {
    const json = JSON.stringify(prefs ?? {});
    const res = await api.put<PreferencesResponse>('/me/preferences', { preferences: json });
    return !!res.data.success;
  } catch {
    return false;
  }
}
