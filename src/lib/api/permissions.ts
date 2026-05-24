import { api } from './client';
import type { ApiResponse, MeDto, ModuleNode } from '@/types/api';

export const permissionsApi = {
  /** شجرة الصلاحيات لعرضها في محرّر الأدوار. */
  tree: async () => {
    const res = await api.get<ApiResponse<ModuleNode[]>>('/permissions/tree');
    return res.data.data ?? [];
  },

  /** قائمة مسطَّحة (مفيدة للاختبار/الـ debugging). */
  flat: async () => {
    const res = await api.get<ApiResponse<unknown[]>>('/permissions/flat');
    return res.data.data ?? [];
  },

  /** صلاحيات المستخدم الحالي + الصناديق المسموحة (تُحدَّث بعد تسجيل الدخول/الـ refresh). */
  me: async () => {
    const res = await api.get<ApiResponse<MeDto>>('/users/me');
    return res.data.data ?? null;
  },
};
