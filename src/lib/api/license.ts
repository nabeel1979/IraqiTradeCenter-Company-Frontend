import { api } from './client';
import type { ApiResponse } from '@/types/api';

/**
 * حالة الترخيص الحالية للنظام — تأتي من `GET /license/status`.
 * تعمل حتى عند انتهاء الترخيص (مسموح بها في `LicenseEnforcementMiddleware`).
 */
export interface LicenseStatus {
  companyKey: string;
  /** ISO datetime لانتهاء آخر تفعيل. null لو لم يفعَّل أبداً. */
  endDateUtc: string | null;
  daysRemaining: number;
  isActive: boolean;
  isInGrace: boolean;
  isExpired: boolean;
  /** true لو رصد الخادم تلاعباً بسلسلة تواقيع التفعيلات (Hash Chain). */
  isTampered?: boolean;
  lastCode: string | null;
  pricePerDay: number;
  currency: string;
  walletBalance: number;
}

export interface ActivationRow {
  id: number;
  code: string;
  days: number;
  startDate: string;
  endDate: string;
  appliedAt: string;
  appliedBy: string | null;
  source: 'Code' | 'Wallet' | 'Card' | string;
  note: string | null;
}

export interface BuyResult {
  method: 'Card' | 'Wallet';
  amount: number;
  currency: string;
  days: number;
  status: string;
  message?: string;
  /** يُملأ فقط في تدفّق QiCard عندما يكون مُفعَّلاً. */
  sessionId?: string;
  /** صفحة الدفع التي يُفتحها المتصفّح — مُفعَّل QiCard فقط. */
  formUrl?: string;
}

/**
 * حالة جلسة دفع بالبطاقة المرسلة عبر QiCard — تُستخدم بالـ polling من واجهة
 * المستخدم بعد فتح صفحة الدفع. تصبح <c>status</c> نهائية (Success/Failed/...)
 * فور وصول الـ webhook من QiCard إلى الباكاند.
 */
export interface CardPaymentStatus {
  sessionId:    string;
  status:       'Created' | 'Pending' | 'Success' | 'Failed' | 'Expired' | 'Error' | 'Canceled';
  amount:       number;
  currency:     string;
  days:         number;
  errorMessage?: string | null;
  activationId?: number  | null;
  completedAt?:  string  | null;
}

/** الحالات النهائية — عند الوصول إليها يجب إيقاف الـ polling. */
export const TERMINAL_CARD_STATUSES: ReadonlyArray<CardPaymentStatus['status']> =
  ['Success', 'Failed', 'Expired', 'Error', 'Canceled'];

export const licenseApi = {
  status: async (): Promise<LicenseStatus> => {
    const res = await api.get<ApiResponse<LicenseStatus>>('/license/status');
    return res.data.data!;
  },
  history: async (take = 50): Promise<ActivationRow[]> => {
    const res = await api.get<ApiResponse<ActivationRow[]>>(`/license/history?take=${take}`);
    return res.data.data ?? [];
  },
  apply: async (code: string): Promise<ActivationRow> => {
    const res = await api.post<ApiResponse<ActivationRow>>('/license/apply', { code });
    return res.data.data!;
  },
  buyWithWallet: async (days: number): Promise<ActivationRow> => {
    const res = await api.post<ApiResponse<ActivationRow>>('/license/buy-with-wallet', { days });
    return res.data.data!;
  },
  buyWithCard: async (days: number): Promise<BuyResult> => {
    const res = await api.post<ApiResponse<BuyResult>>('/license/buy-with-card', { days });
    return res.data.data!;
  },
  /** قراءة حالة جلسة دفع بطاقة (للـ polling بعد فتح صفحة QiCard). */
  cardPaymentStatus: async (sessionId: string): Promise<CardPaymentStatus> => {
    const res = await api.get<ApiResponse<CardPaymentStatus>>(`/license/qicard/status/${sessionId}`);
    return res.data.data!;
  },
  generate: async (days: number): Promise<{ code: string; days: number }> => {
    const res = await api.post<ApiResponse<{ code: string; days: number }>>('/license/generate', { days });
    return res.data.data!;
  },
  /**
   * اختبار: إنهاء الترخيص فوراً.
   * @param expireType  `"natural"` (افتراضي) | `"canceled"` | `"warning"`
   */
  testExpire: async (expireType?: string): Promise<void> => {
    await api.post<ApiResponse<unknown>>('/license/test-expire', { expireType: expireType ?? 'natural' });
  },
  /** اختبار: إعادة الترخيص للوضع النشط (افتراضياً 30 يوم). */
  testRestore: async (days = 30): Promise<void> => {
    await api.post<ApiResponse<unknown>>('/license/test-restore', { days });
  },
};
