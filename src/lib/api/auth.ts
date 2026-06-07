import { api, setToken } from './client';
import type { LoginRequest, LoginResponse, ApiResponse } from '@/types/api';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordPayload {
  username: string;
}

export const authApi = {
  login: async (data: LoginRequest) => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', data, {
      skipGlobalErrorHandler: true,
    });
    if (res.data.success && res.data.data?.token) {
      setToken(res.data.data.token);
    }
    return res.data;
  },

  changePassword: async (data: ChangePasswordPayload) => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/change-password', data, {
      skipGlobalErrorHandler: true,
    });
    if (res.data.success && res.data.data?.token) {
      setToken(res.data.data.token);
    }
    return res.data;
  },

  forgotPassword: async (data: ForgotPasswordPayload) => {
    const res = await api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', data, {
      skipGlobalErrorHandler: true,
    });
    return res.data;
  },

  getResetCredentials: async (token: string) => {
    const res = await api.get<ApiResponse<{ username: string; password: string }>>(
      `/auth/reset-credentials/${token}`,
      { skipGlobalErrorHandler: true },
    );
    return res.data;
  },
};
