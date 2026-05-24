import type { ReactNode } from 'react';
import { usePermissions } from './usePermissions';

interface PermissionGateProps {
  /** صلاحية واحدة (أو مصفوفة — يمر إذا كان لديه أي واحدة منها). */
  perm?: string | string[];
  /** يجب أن يكون لديه كل الصلاحيات المذكورة (لا any). */
  allOf?: string[];
  /** ما يُعرض عند عدم وجود الصلاحية (افتراضياً لا شيء). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * يُخفي عناصر الواجهة (الأزرار، الأقسام، الأعمدة) عن المستخدمين الذين لا يملكون الصلاحية المطلوبة.
 *
 * أمثلة:
 *   <PermissionGate perm={PERMS.Accounting.JournalEntries.Create}>
 *     <Button>قيد جديد</Button>
 *   </PermissionGate>
 *
 *   <PermissionGate perm={[PERMS.A.Read, PERMS.B.Read]}>...</PermissionGate>
 *
 *   <PermissionGate allOf={[PERMS.X.Read, PERMS.X.Update]}>...</PermissionGate>
 */
export function PermissionGate({ perm, allOf, fallback = null, children }: PermissionGateProps) {
  const { can, canAny, canAll, isSuper } = usePermissions();

  if (isSuper) return <>{children}</>;

  if (allOf?.length) {
    return canAll(...allOf) ? <>{children}</> : <>{fallback}</>;
  }

  if (Array.isArray(perm)) {
    return canAny(...perm) ? <>{children}</> : <>{fallback}</>;
  }

  if (typeof perm === 'string') {
    return can(perm) ? <>{children}</> : <>{fallback}</>;
  }

  // لم يُمرَّر أي شرط — اعرض المحتوى بدون تقييد
  return <>{children}</>;
}
