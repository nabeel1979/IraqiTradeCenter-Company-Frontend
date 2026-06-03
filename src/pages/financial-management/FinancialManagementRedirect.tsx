import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import type { FinancialPartyKind } from '@/types/api';
import { FM_PATHS, KIND_ORDER } from './routes';

function canAccessKind(kind: FinancialPartyKind, can: (p: string) => boolean): boolean {
  if (kind === 'CashBox') return can(PERMS.Accounting.CashBoxes.Read);
  return (
    can(PERMS.FinancialManagement.Categories.Read) ||
    can(PERMS.FinancialManagement.Parties.Read)
  );
}

/** يُعيد التوجيه من `/financial-management` إلى أول صفحة نوع طرف يمكن الوصول إليها. */
export function FinancialManagementRedirect() {
  const { can } = usePermissions();
  const first = KIND_ORDER.find(k => canAccessKind(k, can));
  if (!first) return <Navigate to="/" replace />;
  return <Navigate to={FM_PATHS[first]} replace />;
}
