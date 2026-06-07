import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface BranchDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  isMain: boolean;
  isActive: boolean;
  phone?: string | null;
  address?: string | null;
  managerName?: string | null;
  notes?: string | null;
  displayOrder: number;
  currentAccountId?: number | null;
  currentAccountNameAr?: string | null;
  currentAccountCode?: string | null;
}

export interface UpsertBranchPayload {
  code?: string;
  nameAr: string;
  nameEn?: string | null;
  phone?: string | null;
  address?: string | null;
  managerName?: string | null;
  notes?: string | null;
  isMain?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export interface UserBranchesPayload {
  defaultBranchId?: number | null;
  branchIds?: number[];
}

export interface UserBranchesDto {
  defaultBranchId?: number | null;
  assigned: { branchId: number; isDefault: boolean; assignedAt: string }[];
}

export const branchesApi = {
  getAll: (activeOnly = false) =>
    api.get<ApiResponse<BranchDto[]>>(`/branches?activeOnly=${activeOnly}`).then(r => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<BranchDto>>(`/branches/${id}`).then(r => r.data),

  create: (payload: UpsertBranchPayload) =>
    api.post<ApiResponse<{ id: number; code: string }>>('/branches', payload).then(r => r.data),

  update: (id: number, payload: Partial<UpsertBranchPayload>) =>
    api.put<ApiResponse<void>>(`/branches/${id}`, payload).then(r => r.data),

  delete: (id: number) =>
    api.delete<ApiResponse<void>>(`/branches/${id}`).then(r => r.data),

  getUserBranches: (userId: string) =>
    api.get<ApiResponse<UserBranchesDto>>(`/branches/users/${userId}`).then(r => r.data),

  updateUserBranches: (userId: string, payload: UserBranchesPayload) =>
    api.put<ApiResponse<void>>(`/branches/users/${userId}`, payload).then(r => r.data),
};
