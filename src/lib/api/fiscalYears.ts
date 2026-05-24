import { api } from './client';
import type {
  ApiResponse,
  FiscalYearDto,
  FiscalYearStatusDto,
  FiscalYearValidationDto,
  FiscalYearCloseResultDto,
  FiscalYearRolloverResultDto,
} from '@/types/api';

export interface CreateFiscalYearPayload {
  name: string;
  startDate: string;
  endDate: string;
}

export interface UpdateFiscalYearPayload {
  name: string;
  startDate: string;
  endDate: string;
}

export interface CloseFiscalYearPayload {
  forceClose?: boolean;
}

export interface RolloverPayload {
  sourceFiscalYearId: number;
  targetFiscalYearId: number;
  /** كود حساب الأرباح (مطلوب في mode=1 فقط). */
  profitAccountCode?: string | null;
  /** كود حساب الخسائر (مطلوب في mode=1 فقط). */
  lossAccountCode?: string | null;
  /**
   * 1 = WithProfitLoss: ميزانية + احتساب الربح/الخسارة على الحساب المناسب
   * 2 = BalanceSheetOnly: ميزانية فقط بدون ربح/خسارة
   * 3 = AllAccounts: كل الحسابات (ميزانية + إيرادات + مصاريف)
   */
  mode: 1 | 2 | 3;
  previewOnly?: boolean;
  openingEntryDate?: string;
}

export interface UndoRolloverPayload {
  targetFiscalYearId: number;
  /** فك إغلاق السنة المالية السابقة تلقائياً بعد التراجع. */
  reopenSource?: boolean;
}

export interface UndoRolloverResultDto {
  success: boolean;
  deletedEntryId: number;
  affectedAccounts: number;
  reopenedSourceId?: number | null;
  message: string;
}

export interface UpdatePeriodPayload {
  startDate: string;
  endDate: string;
}

/**
 * نتيجة استعلام حالة الفترة بتاريخ معيّن — يستخدمها الـ frontend في صفحات
 * إدخال السندات والقيود لتحديد ما إذا كان التاريخ ضمن فترة مفتوحة (قابلة
 * للتحرير) أم ضمن فترة مغلقة (قراءة فقط).
 */
export interface PeriodStatusByDateDto {
  date: string;
  fiscalYearId: number;
  fiscalYearName: string;
  fiscalYearIsClosed: boolean;
  periodId: number;
  periodNumber: number;
  periodStartDate: string;
  periodEndDate: string;
  /** 1 = مفتوحة، 2 = مغلقة، 3 = مقفلة */
  periodStatus: 1 | 2 | 3;
  isEditable: boolean;
}

export const fiscalYearsApi = {
  getAll: async () => {
    const res = await api.get<ApiResponse<FiscalYearDto[]>>('/fiscal-years');
    return res.data.data ?? [];
  },
  /** السنة المالية المفعَّلة (النشطة) — مصدر الحقيقة لكل التقارير. */
  getActive: async () => {
    const res = await api.get<ApiResponse<FiscalYearDto | null>>('/fiscal-years/active');
    return res.data.data ?? null;
  },
  /** تفعيل سنة مالية كنشطة (وتعطيل بقية السنوات تلقائياً). */
  activate: async (id: number) => {
    const res = await api.post<ApiResponse<unknown>>(`/fiscal-years/${id}/activate`);
    return res.data;
  },
  getStatus: async (id: number) => {
    const res = await api.get<ApiResponse<FiscalYearStatusDto>>(`/fiscal-years/${id}/status`);
    return res.data.data!;
  },
  validate: async (id: number) => {
    const res = await api.get<ApiResponse<FiscalYearValidationDto>>(`/fiscal-years/${id}/validate`);
    return res.data.data!;
  },
  create: async (payload: CreateFiscalYearPayload) => {
    const res = await api.post<ApiResponse<number>>('/fiscal-years', payload);
    return res.data;
  },
  update: async (id: number, payload: UpdateFiscalYearPayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/fiscal-years/${id}`, payload);
    return res.data;
  },
  delete: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/fiscal-years/${id}`);
    return res.data;
  },
  close: async (id: number, payload: CloseFiscalYearPayload = {}) => {
    const res = await api.post<ApiResponse<FiscalYearCloseResultDto>>(`/fiscal-years/${id}/close`, payload);
    return res.data;
  },
  reopen: async (id: number) => {
    const res = await api.post<ApiResponse<unknown>>(`/fiscal-years/${id}/reopen`);
    return res.data;
  },
  rollover: async (payload: RolloverPayload) => {
    const res = await api.post<ApiResponse<FiscalYearRolloverResultDto>>('/fiscal-years/rollover', payload);
    return res.data;
  },
  undoRollover: async (payload: UndoRolloverPayload) => {
    const res = await api.post<ApiResponse<UndoRolloverResultDto>>('/fiscal-years/undo-rollover', payload);
    return res.data;
  },

  // ── إدارة الفترات الفردية
  updatePeriod: async (periodId: number, payload: UpdatePeriodPayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/fiscal-years/periods/${periodId}`, payload);
    return res.data;
  },
  deletePeriod: async (periodId: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/fiscal-years/periods/${periodId}`);
    return res.data;
  },
  setPeriodStatus: async (periodId: number, status: 1 | 2 | 3) => {
    const res = await api.post<ApiResponse<unknown>>(`/fiscal-years/periods/${periodId}/status`, { status });
    return res.data;
  },

  /**
   * إعادة مزامنة الفترات الشهرية لتطابق تواريخ السنة المالية الحالية.
   * تُحذَف الفترات الفارغة الخارجة عن نطاق السنة، وتُعاد الحدود لتلائم.
   */
  resyncPeriods: async (fiscalYearId: number) => {
    const res = await api.post<ApiResponse<{
      removed: number; added: number; adjusted: number; total: number; message: string;
    }>>(`/fiscal-years/${fiscalYearId}/resync-periods`);
    return res.data;
  },

  /**
   * إغلاق/فتح الفترات بالجملة بناءً على تاريخ.
   *   • mode=1 (CloseUpTo): يطبّق `targetStatus` على كل فترة EndDate ≤ Date.
   *   • mode=2 (OpenFrom):  يطبّق `targetStatus` على كل فترة StartDate ≥ Date.
   * targetStatus: 1=Open، 2=Closed، 3=Locked
   */
  bulkSetPeriodsStatus: async (payload: {
    fiscalYearId: number;
    date: string;
    mode: 1 | 2;
    targetStatus: 1 | 2 | 3;
  }) => {
    const res = await api.post<ApiResponse<{ affected: number; total: number; message: string }>>(
      '/fiscal-years/periods/bulk-status',
      payload
    );
    return res.data;
  },

  /**
   * استعلام حالة الفترة بتاريخ — لاستخدامه في صفحات إدخال القيود/السندات
   * لإخفاء أزرار الحفظ/التعديل/الحذف عندما يكون التاريخ ضمن فترة مغلقة.
   * يُرجع null إذا لم تتطابق الفترة (date خارج كل السنوات المالية).
   */
  getPeriodStatusByDate: async (date: string): Promise<PeriodStatusByDateDto | null> => {
    const res = await api.get<ApiResponse<PeriodStatusByDateDto>>(
      '/fiscal-years/period-status',
      { params: { date } }
    );
    if (!res.data?.success) return null;
    return res.data.data ?? null;
  },
};
