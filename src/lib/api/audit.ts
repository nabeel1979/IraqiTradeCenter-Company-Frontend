import { api } from './client';
import type { ApiResponse } from '@/types/api';

/**
 * سجل عملية: يلتقط كل إضافة/تعديل/حذف/طباعة على كيان مهم في النظام.
 * يُرسَل من الواجهات لعرضها في صفحة المراقبة وفي نافذة "المراقبة" داخل كل سند.
 */
export interface AuditLogDto {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  summary?: string | null;
  detailsJson?: string | null;
  userId?: string | null;
  userName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAtUtc: string;
}

export interface AuditListParams {
  pageNumber?: number;
  pageSize?: number;
  entityType?: string;
  entityId?: string;
  action?: string;
  userId?: string;
  fromUtc?: string;
  toUtc?: string;
  search?: string;
}

export interface AuditListResult {
  items: AuditLogDto[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

/** أكواد العمليات المُعتمَدة — مطابقة لما في الخادم (SharedKernel.AuditActions). */
export const AUDIT_ACTIONS = [
  'Create',
  'Update',
  'Delete',
  'Print',
  'Post',
  'Unpost',
  'Reverse',
  'View',
  'Login',
  'Logout',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditApi = {
  list: async (params: AuditListParams = {}): Promise<AuditListResult> => {
    const res = await api.get<ApiResponse<AuditListResult>>('/audit', { params });
    return (
      res.data.data ?? { items: [], totalCount: 0, pageNumber: 1, pageSize: 50 }
    );
  },
  byEntity: async (entityType: string, entityId: string | number): Promise<AuditLogDto[]> => {
    const res = await api.get<ApiResponse<AuditLogDto[]>>(
      `/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(String(entityId))}`,
    );
    return res.data.data ?? [];
  },
  /**
   * تسجيل عملية طباعة من العميل. لا يُلقي الخطأ في حال الفشل — الطباعة أهم من
   * تسجيل المراقبة، فلا نُزعج المستخدم بتوست لو تعذّر التسجيل.
   */
  logPrint: async (payload: {
    entityType: string;
    entityId: string | number;
    summary?: string;
    details?: Record<string, unknown>;
  }): Promise<void> => {
    try {
      await api.post('/audit/print', {
        entityType: payload.entityType,
        entityId: String(payload.entityId),
        summary: payload.summary,
        details: payload.details,
      });
    } catch {
      // ‎تجاهَل أخطاء التسجيل — لا تُفشل سير الطباعة.
    }
  },
};
