import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { readMustChangePasswordFromToken } from './jwt';

interface User {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
  avatarBase64?: string | null;
}

/** يكتشف SuperAdmin من أي مصدر متاح (JWT جديد أو جلسة قديمة). */
export function resolveIsSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.role === 'SuperAdmin') return true;
  return user.roles?.includes('SuperAdmin') ?? false;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** الصلاحيات الفعلية كـ Set (تُحدَّث من الـ login response أو /users/me). */
  permissionSet: Set<string>;
  /** معرّفات الصناديق المسموحة للمستخدم (فارغة = ممنوع كلياً، إلا إن كان SuperAdmin). */
  cashBoxIds: number[];
  setUser: (user: User) => void;
  /** تحديث جزئي للصلاحيات/الصناديق (يُستدعى بعد /users/me أو بعد refresh). */
  setMe: (data: { permissions: string[]; cashBoxIds: number[]; roles: string[]; isSuperAdmin: boolean; mustChangePassword?: boolean; avatarBase64?: string | null }) => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (...codes: string[]) => boolean;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      permissionSet: new Set<string>(),
      cashBoxIds: [],

      setUser: user => {
        const isSuperAdmin = resolveIsSuperAdmin(user);
        const normalized = { ...user, isSuperAdmin };
        set({
          user: normalized,
          isAuthenticated: true,
          permissionSet: new Set(normalized.permissions ?? []),
        });
      },

      setMe: data => set(state => ({
        permissionSet: new Set(data.permissions),
        cashBoxIds: data.cashBoxIds,
        user: state.user ? {
          ...state.user,
          roles: data.roles,
          permissions: data.permissions,
          isSuperAdmin: data.isSuperAdmin,
          mustChangePassword: data.mustChangePassword ?? readMustChangePasswordFromToken(),
          avatarBase64: data.avatarBase64 !== undefined ? data.avatarBase64 : state.user.avatarBase64,
        } : state.user,
      })),

      hasPermission: (code: string) => {
        const s = get();
        if (resolveIsSuperAdmin(s.user)) return true;
        return s.permissionSet.has(code);
      },

      hasAnyPermission: (...codes: string[]) => {
        const s = get();
        if (resolveIsSuperAdmin(s.user)) return true;
        return codes.some(c => s.permissionSet.has(c));
      },

      logout: () => {
        localStorage.removeItem('iqtc_token');
        localStorage.removeItem('iqtc_auth');
        set({ user: null, isAuthenticated: false, permissionSet: new Set(), cashBoxIds: [] });
        if (typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      },
    }),
    {
      name: 'iqtc_auth',
      // الـ Set لا يمكن تخزينه في JSON مباشرة — نخزّن المصفوفة ونعيد بناءها عند الإحياء
      partialize: state => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        cashBoxIds: state.cashBoxIds,
        permissions: Array.from(state.permissionSet),
      }) as unknown as AuthState,
      onRehydrateStorage: () => stored => {
        if (!stored) return;
        const raw = stored as unknown as { permissions?: string[]; user?: User };
        if (Array.isArray(raw.permissions)) {
          (stored as AuthState).permissionSet = new Set(raw.permissions);
        }
        // جلسة قديمة: role=SuperAdmin لكن بدون isSuperAdmin/permissions
        if (raw.user) {
          const u = raw.user;
          if (resolveIsSuperAdmin(u)) {
            u.isSuperAdmin = true;
            (stored as AuthState).user = u;
          }
        }
      },
    }
  )
);
