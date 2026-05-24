import { api } from './client';
import type {
  ApiResponse,
  RoleDetailDto,
  RoleListItemDto,
  RoleUpsertPayload,
} from '@/types/api';

export const rolesApi = {
  list: async () => {
    const res = await api.get<ApiResponse<RoleListItemDto[]>>('/roles');
    return res.data.data ?? [];
  },

  get: async (id: number) => {
    const res = await api.get<ApiResponse<RoleDetailDto>>(`/roles/${id}`);
    if (!res.data.success || !res.data.data) throw new Error('Role not found');
    return res.data.data;
  },

  create: async (payload: RoleUpsertPayload) => {
    const res = await api.post<ApiResponse<{ id: number }>>('/roles', payload);
    return res.data;
  },

  update: async (id: number, payload: RoleUpsertPayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/roles/${id}`, payload);
    return res.data;
  },

  remove: async (id: number) => {
    const res = await api.delete<ApiResponse<unknown>>(`/roles/${id}`);
    return res.data;
  },
};
