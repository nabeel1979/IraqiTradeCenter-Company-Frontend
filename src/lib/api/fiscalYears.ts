import { api } from './client';
import type {
  ApiResponse,
  FiscalYearDto,
  FiscalYearStatusDto,
  FiscalYearValidationDto,
  FiscalYearCloseResultDto,
  FiscalYearRolloverResultDto,
} from '@/types/api';

export interface CreateFiscalYearPayload {
  name: string;
  startDate: string;
  endDate: string;
}

export interface CloseFiscalYearPayload {
  forceClose?: boolean;
}

export interface RolloverPayload {
  sourceFiscalYearId: number;
  targetFiscalYearId: number;
  retainedEarningsCode: string;
  previewOnly?: boolean;
}

export const fiscalYearsApi = {
  getAll: async () => {
    const res = await api.get<ApiResponse<FiscalYearDto[]>>('/fiscal-years');
    return res.data.data ?? [];
  },
  getStatus: async (id: number) => {
    const res = await api.get<ApiResponse<FiscalYearStatusDto>>(`/fiscal-years/${id}/status`);
    return res.data.data!;
  },
  validate: async (id: number) => {
    const res = await api.get<ApiResponse<FiscalYearValidationDto>>(`/fiscal-years/${id}/validate`);
    return res.data.data!;
  },
  create: async (payload: CreateFiscalYearPayload) => {
    const res = await api.post<ApiResponse<number>>('/fiscal-years', payload);
    return res.data;
  },
  close: async (id: number, payload: CloseFiscalYearPayload = {}) => {
    const res = await api.post<ApiResponse<FiscalYearCloseResultDto>>(`/fiscal-years/${id}/close`, payload);
    return res.data;
  },
  rollover: async (payload: RolloverPayload) => {
    const res = await api.post<ApiResponse<FiscalYearRolloverResultDto>>('/fiscal-years/rollover', payload);
    return res.data;
  },
};
