import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface IntegrationStatusDto {
  parentApiUrl: string;
  parentSiteUrl: string;
  companyKey: string;
  licenseActive: boolean;
  licenseEndDate?: string | null;
  parentSubscriber?: {
    found?: boolean;
    databaseName?: string;
    active?: boolean;
    startDate?: string;
    endDate?: string;
    error?: string;
  } | null;
  integrationHeader: string;
  webhookIncomingOrders: string;
  authKeyHint: string;
  features: {
    incomingOrders: boolean;
    ssoLogin: boolean;
    licensePushFromParent: boolean;
  };
}

export const integrationApi = {
  getStatus: async () => {
    const res = await api.get<ApiResponse<IntegrationStatusDto>>('/integration/status');
    if (!res.data.success || !res.data.data) throw new Error(res.data.errors?.[0] ?? 'Failed to load integration status');
    return res.data.data;
  },
};
