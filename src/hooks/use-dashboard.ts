'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

export type DateRangeType = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

export interface DashboardSummary {
  totalSales: number;
  orderCount: number;
  avgOrderValue: number;
  cancelCount: number;
  cancelRate: number;
  salesChange: number;
  orderChange: number;
  avgChange: number;
}

export interface ProductRankingItem {
  productId: number;
  productName: string;
  totalQty: number;
  totalAmount: number;
}

export interface CategoryRankingItem {
  categoryId: number;
  categoryName: string;
  totalAmount: number;
}

export interface PaymentBreakdownItem {
  method: string;
  amount: number;
  count: number;
}

export interface HourlyDataItem {
  hour: number;
  orderCount: number;
  totalSales: number;
}

export interface SalesTrendItem {
  date: string;
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
}

export interface DashboardData {
  dateRange: {
    from: string;
    to: string;
  };
  summary: DashboardSummary;
  productRanking: ProductRankingItem[];
  categoryRanking: CategoryRankingItem[];
  paymentBreakdown: PaymentBreakdownItem[];
  hourlyDistribution: HourlyDataItem[];
  salesTrend: SalesTrendItem[];
}

interface UseDashboardParams {
  range: DateRangeType;
  from?: string;
  to?: string;
}

async function fetchDashboard(params: UseDashboardParams): Promise<DashboardData> {
  const searchParams = new URLSearchParams();
  searchParams.set('range', params.range);
  if (params.range === 'custom' && params.from && params.to) {
    searchParams.set('from', params.from);
    searchParams.set('to', params.to);
  }

  const res = await fetch(`/api/dashboard?${searchParams}`);
  const data: ApiResponse<DashboardData> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch dashboard');
  }

  return data.data!;
}

export function useDashboard(params: UseDashboardParams = { range: 'today' }) {
  return useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => fetchDashboard(params),
    refetchInterval: 60000, // Refresh every minute
  });
}
