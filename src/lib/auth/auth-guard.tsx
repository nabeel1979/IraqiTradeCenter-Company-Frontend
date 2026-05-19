import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';

export function AuthGuard({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const token = getToken();
  const location = useLocation();
  if (!token || !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
