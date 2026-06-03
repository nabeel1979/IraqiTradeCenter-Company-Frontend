import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { permissionsApi } from '@/lib/api/permissions';
import { resolveIsSuperAdmin, useAuthStore } from './auth-store';

/**
 * Hook قياسي للوصول لحالة الصلاحيات الحالية:
 *   const { can, isSuper, cashBoxIds } = usePermissions();
 *   if (can(PERMS.Accounting.JournalEntries.Post)) ...
 *
 * يقوم أيضاً بتحديث الـ store من /users/me عند أول mount (مرة لكل جلسة)
 * ليلتقط أي تغييرات حدثت على الصلاحيات بعد الـ login.
 */
export function usePermissions() {
  const user = useAuthStore(s => s.user);
  const permissionSet = useAuthStore(s => s.permissionSet);
  const cashBoxIds = useAuthStore(s => s.cashBoxIds);
  const setMe = useAuthStore(s => s.setMe);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  // مزامنة من /users/me — refetchOnMount لالتقاط الصلاحيات بعد تحديث السيرفر
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: permissionsApi.me,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (data) {
      setMe({
        permissions:  data.permissions,
        cashBoxIds:   data.cashBoxIds,
        roles:        data.roles,
        isSuperAdmin: data.isSuperAdmin,
        mustChangePassword: data.mustChangePassword,
        avatarBase64: data.avatarBase64,
      });
    }
  }, [data, setMe]);

  return useMemo(() => {
    const isSuper = resolveIsSuperAdmin(user);
    const can = (code: string) => isSuper || permissionSet.has(code);
    const canAny = (...codes: string[]) => isSuper || codes.some(c => permissionSet.has(c));
    const canAll = (...codes: string[]) => isSuper || codes.every(c => permissionSet.has(c));
    return { can, canAny, canAll, isSuper, cashBoxIds, permissionSet };
  }, [user, permissionSet, cashBoxIds]);
}
