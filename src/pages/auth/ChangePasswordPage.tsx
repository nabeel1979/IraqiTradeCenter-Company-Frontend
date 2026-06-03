import { Navigate } from 'react-router-dom';

/** توافق خلفي — تغيير كلمة المرور أصبح ضمن صفحة الدخول. */
export function ChangePasswordPage() {
  return <Navigate to="/login?mustChange=1" replace />;
}
