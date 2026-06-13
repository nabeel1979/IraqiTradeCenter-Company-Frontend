import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface StorePlatformUserProfile {
  userId: string;
  userCode: string;
  fullName: string;
  phone: string;
  contactPhone?: string | null;
  email: string;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  detailedAddress?: string | null;
}

export const storePlatformApi = {
  lookupUser: async (code: string, storeCustomerId?: number) => {
    const res = await api.get<ApiResponse<StorePlatformUserProfile>>(
      '/store-platform/users/lookup',
      {
        params: {
          code: code.trim().toUpperCase(),
          ...(storeCustomerId ? { storeCustomerId } : {}),
        },
      },
    );
    return res.data.data!;
  },
};
