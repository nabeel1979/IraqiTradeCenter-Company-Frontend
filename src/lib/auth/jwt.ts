import { getToken } from '@/lib/api/client';

/** يقرأ claim mustChangePassword من JWT (احتياط إذا لم تُحدَّث حالة الـ store). */
export function readMustChangePasswordFromToken(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { mustChangePassword?: string | boolean };
    const v = payload.mustChangePassword;
    return v === true || v === 'true';
  } catch {
    return false;
  }
}
