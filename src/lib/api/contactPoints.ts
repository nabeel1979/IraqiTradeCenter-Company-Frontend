import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface ContactPointListItemDto {
  id: number;
  kind: string;
  displayValue: string;
  normalizedValue: string;
  ownerType: string;
  ownerId: string;
  ownerLabel?: string | null;
}

export interface DeleteUserResponseDto {
  removedContacts?: string[];
}

export const contactPointsApi = {
  list: async (params?: { search?: string; kind?: string; ownerType?: string }) => {
    const res = await api.get<ApiResponse<ContactPointListItemDto[]>>('/contact-points', { params });
    return res.data.data ?? [];
  },

  remove: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/contact-points/${id}`);
    return res.data;
  },
};
