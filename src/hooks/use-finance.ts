'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

export interface Invoice {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountTotal: number;
  amountResidual: number;
  amountUntaxed: number;
  amountTax: number;
  state: string;
  paymentState: string;
  moveType: string;
  invoiceOrigin: string | null;
  ref: string | null;
  currency: string;
  isOverdue: boolean;
  overdueDays: number;
}

export interface InvoiceKPIs {
  draftCount: number;
  draftAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
  paidAmount: number;
  arAmount: number;
  apAmount: number;
}

interface InvoicesResponse {
  kpi: InvoiceKPIs;
  items: Invoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type InvoiceQueueType = 'draft' | 'posted' | 'unpaid' | 'paid' | 'all';
export type InvoiceType = 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund' | 'all';

interface InvoicesParams {
  page?: number;
  limit?: number;
  queue?: InvoiceQueueType;
  type?: InvoiceType;
  sort?: 'date' | 'amount' | 'due';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

async function fetchInvoices(params: InvoicesParams): Promise<InvoicesResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.queue) searchParams.set('queue', params.queue);
  if (params.type) searchParams.set('type', params.type);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params.dateTo) searchParams.set('date_to', params.dateTo);
  if (params.search) searchParams.set('search', params.search);

  const res = await fetch(`/api/finance/invoices?${searchParams}`);
  const data: ApiResponse<InvoicesResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch invoices');
  }

  return data.data!;
}

export function useInvoices(params: InvoicesParams = {}) {
  return useQuery({
    queryKey: ['finance-invoices', params],
    queryFn: () => fetchInvoices(params),
  });
}

export function usePostInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await fetch('/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, action: 'post' }),
      });
      const result: ApiResponse<{ message: string }> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to post invoice');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
    },
  });
}
