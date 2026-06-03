import { api } from './client';
import type {
  ApiResponse,
  ResetPasswordResponseDto,
  UserCashBoxAssignmentDto,
  UserCreatePayload,
  UserDetailDto,
  UserListItemDto,
  UserPermissionOverrideDto,
  UserUpdatePayload,
} from '@/types/api';

export const usersApi = {
  list: async (search?: string) => {
    const res = await api.get<ApiResponse<UserListItemDto[]>>('/users', {
      params: search ? { search } : undefined,
    });
    return res.data.data ?? [];
  },

  get: async (id: string) => {
    const res = await api.get<ApiResponse<UserDetailDto>>(`/users/${id}`);
    if (!res.data.success || !res.data.data) throw new Error('User not found');
    return res.data.data;
  },

  create: async (payload: UserCreatePayload) => {
    const res = await api.post<ApiResponse<{ id: string }>>('/users', payload);
    return res.data;
  },

  update: async (id: string, payload: UserUpdatePayload) => {
    const res = await api.put<ApiResponse<unknown>>(`/users/${id}`, payload);
    return res.data;
  },

  remove: async (id: string) => {
    const res = await api.delete<ApiResponse<unknown>>(`/users/${id}`);
    return res.data;
  },

  setRoles: async (id: string, roleIds: number[]) => {
    const res = await api.put<ApiResponse<unknown>>(`/users/${id}/roles`, { roleIds });
    return res.data;
  },

  setOverrides: async (id: string, overrides: UserPermissionOverrideDto[]) => {
    const res = await api.put<ApiResponse<unknown>>(`/users/${id}/permission-overrides`, { overrides });
    return res.data;
  },

  setCashBoxes: async (id: string, cashBoxes: UserCashBoxAssignmentDto[]) => {
    const res = await api.put<ApiResponse<unknown>>(`/users/${id}/cash-boxes`, { cashBoxes });
    return res.data;
  },

  resetPassword: async (id: string) => {
    const res = await api.post<ApiResponse<ResetPasswordResponseDto>>(`/users/${id}/reset-password`);
    if (!res.data.success || !res.data.data) throw new Error(res.data.errors?.[0] ?? 'Reset failed');
    return res.data.data;
  },
};
