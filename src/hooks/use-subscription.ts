'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

export interface SubscriptionItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  productNameZh: string | null;
  productNameJa: string | null;
  productType: string;
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: string;
  startDate: string;
  endDate: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
}

export interface Subscription {
  id: string;
  status: string;
  startDate: string;
  nextBillingDate: string;
  endDate: string | null;
  totalAmount: number;
  currency: string;
  billingCycle: string;
  isInTrial: boolean;
  trialEndDate?: string;
  autoRenew: boolean;
  items: SubscriptionItem[];
  invoices: Invoice[];
}

export interface TenantFeature {
  moduleCode: string;
  isAllowed: boolean;
  isVisible: boolean;
}

export interface SubscriptionData {
  tenant: {
    id: string;
    tenantCode: string;
    name: string;
    planCode: string;
    odoo19PartnerId: number | null;
  };
  subscription: Subscription | null;
  features: TenantFeature[];
  enabledModules: string[];
}

async function fetchSubscription(): Promise<SubscriptionData> {
  const res = await fetch('/api/subscription');
  const data: ApiResponse<SubscriptionData> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch subscription');
  }

  return data.data!;
}

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: fetchSubscription,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
