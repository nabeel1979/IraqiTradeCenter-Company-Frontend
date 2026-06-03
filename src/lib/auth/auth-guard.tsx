import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { readMustChangePasswordFromToken } from '@/lib/auth/jwt';

interface AuthGuardProps {
  children: ReactNode;
  /** صفحة تغيير كلمة المرور — لا تُعيد التوجيه إليها مرة أخرى */
  allowMustChangePassword?: boolean;
}

export function AuthGuard({ children, allowMustChangePassword = false }: AuthGuardProps) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const storeMustChange = useAuthStore(s => s.user?.mustChangePassword);
  const mustChangePassword = storeMustChange || readMustChangePasswordFromToken();
  const token = getToken();
  const location = useLocation();

  if (!token || !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowMustChangePassword && mustChangePassword) {
    return <Navigate to="/login?mustChange=1" replace />;
  }

  if (allowMustChangePassword && !mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
