import axios, { AxiosError, AxiosInstance } from 'axios';
import { toast } from 'sonner';

const TOKEN_KEY = 'iqtc_token';

// ════════════════════════════════════════
// API Base URL - من Environment Variables
// ════════════════════════════════════════
// في dev: يستخدم Vite proxy تلقائياً (/api → VITE_API_URL → localhost:5050)
// في build: يستخدم VITE_API_URL مباشرة (https://api-company.gcc.iq)
// تسجيل الدخول: عبر /parent-api → VITE_PARENT_API_URL (parent API - SSO)
const API_BASE_URL = import.meta.env.DEV 
  ? '/api'
  : `${import.meta.env.VITE_API_URL}/api`;

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// طلب: أضف Token تلقائياً
api.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ‎جسم الخطأ الموحَّد القادم من الخادم — قد يحوي errors[] أو رسالة LICENSE_EXPIRED.
interface ApiErrorBody {
  errors?: string[];
  message?: string;
  code?: string;
  readOnly?: boolean;
}

// ‎كتم تكرار توست انتهاء الترخيص خلال نافذة قصيرة (لو فيه عدّة طلبات متزامنة).
let lastLicenseToastAt = 0;

// رد: معالجة أخطاء عامة
api.interceptors.response.use(
  res => res,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status;
    const data = error.response?.data;
    const isLicenseExpired =
      status === 403 &&
      (data?.code === 'LICENSE_EXPIRED' ||
        error.response?.headers?.['x-license-status'] === 'expired-readonly');

    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        toast.error('انتهت الجلسة، يرجى تسجيل الدخول');
        setTimeout(() => (window.location.href = '/login'), 1500);
      }
    } else if (isLicenseExpired) {
      // ‎النظام في وضع قراءة فقط — اعرض توستاً واضحاً مرّة واحدة كل 5 ثوانٍ
      // ‎كحدّ أدنى، وأبلغ مكوّن الترخيص ليُحدّث الشارة ويفتح النافذة لو رغب.
      const now = Date.now();
      if (now - lastLicenseToastAt > 5000) {
        lastLicenseToastAt = now;
        toast.error(
          data?.message ||
            'انتهى ترخيص النظام — في وضع قراءة فقط. لا يمكن الحفظ/التعديل/الحذف حتى التجديد.',
          { duration: 6000 },
        );
        try {
          window.dispatchEvent(new CustomEvent('itc:license-expired', { detail: data }));
        } catch {
          /* ignore */
        }
      }
    } else if (data?.errors?.length) {
      data.errors.forEach(e => toast.error(e));
    } else if (error.code === 'ECONNABORTED') {
      toast.error('انتهت مهلة الاتصال بالخادم');
    } else if (!error.response) {
      toast.error('لا يمكن الاتصال بالخادم');
    }
    return Promise.reject(error);
  }
);

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
