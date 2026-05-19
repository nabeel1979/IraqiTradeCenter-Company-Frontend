import { api, setToken } from './client';
import type { LoginRequest, LoginResponse, ApiResponse } from '@/types/api';

export const authApi = {
  login: async (data: LoginRequest) => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', data);
    if (res.data.success && res.data.data?.token) {
      setToken(res.data.data.token);
    }
    return res.data;
  },
};
