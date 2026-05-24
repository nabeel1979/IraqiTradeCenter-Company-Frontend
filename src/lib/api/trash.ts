import { api } from './client';
import type { ApiResponse } from '@/types/api';

/**
 * عنصر في السلة الموحَّدة — يأتي من `GET /trash` ويُمثّل أي كيان محذوف ناعماً
 * في النظام بصرف النظر عن المودول الذي ينتمي إليه.
 */
export interface TrashItemDto {
  entityType: string;
  entityTypeLabel: string;
  module: string;
  /** اسم أيقونة lucide-react المقترح للعرض (اختياري). */
  icon: string;
  entityId: number;
  code?: string | null;
  displayName: string;
  subInfo?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  canRestore: boolean;
  cannotRestoreReason?: string | null;
}

interface TrashListResponse {
  success: boolean;
  data: TrashItemDto[];
  supportedTypes: string[];
}

export const trashApi = {
  list: async (): Promise<{ items: TrashItemDto[]; supportedTypes: string[] }> => {
    const res = await api.get<TrashListResponse>('/trash');
    return {
      items: res.data.data ?? [],
      supportedTypes: res.data.supportedTypes ?? [],
    };
  },
  restore: async (entityType: string, id: number) => {
    const res = await api.post<ApiResponse<unknown>>(
      `/trash/${encodeURIComponent(entityType)}/${id}/restore`,
    );
    return res.data;
  },
  permanentlyDelete: async (entityType: string, id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(
      `/trash/${encodeURIComponent(entityType)}/${id}/permanent`,
    );
    return res.data;
  },
};
