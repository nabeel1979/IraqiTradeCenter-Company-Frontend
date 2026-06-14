import { api } from './client';
import type { ApiResponse } from '@/types/api';

export interface DashboardDailySalesDto {
  dayKey: string;
  date: string;
  sales: number;
  orders: number;
}

export interface DashboardTopRepDto {
  salesRepId: number;
  name: string;
  sales: number;
}

export interface DashboardRecentInvoiceDto {
  id: number;
  invoiceNumber: string;
  customerName?: string | null;
  amount: number;
  status: string;
}

export interface DashboardLowStockItemDto {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  remaining: number;
  unitName: string;
}

export interface DashboardStatsDto {
  todaySales: number;
  todaySalesChangePct?: number | null;
  monthlySales: number;
  monthlySalesChangePct?: number | null;
  invoicesThisMonth: number;
  invoicesChangePct?: number | null;
  activeCustomers: number;
  totalCustomers: number;
  activeCustomersChangePct?: number | null;
  customerReceivables: number;
  weeklySales: DashboardDailySalesDto[];
  topSalesReps: DashboardTopRepDto[];
  recentInvoices: DashboardRecentInvoiceDto[];
  lowStockItems: DashboardLowStockItemDto[];
}

export const dashboardApi = {
  stats: async () => {
    const res = await api.get<ApiResponse<DashboardStatsDto>>('/dashboard/stats');
    return res.data.data!;
  },
};
