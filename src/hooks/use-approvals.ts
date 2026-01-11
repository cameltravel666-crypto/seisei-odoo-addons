'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

interface Approval {
  id: number;
  type: string;
  name: string;
  requester: string;
  amount: number | null;
  date: string;
  state: string;
  model: string;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ApprovalsParams {
  type?: string;
  page?: number;
  limit?: number;
}

async function fetchApprovals(params: ApprovalsParams): Promise<PaginatedResponse<Approval>> {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const res = await fetch(`/api/approvals?${searchParams}`);
  const data: ApiResponse<PaginatedResponse<Approval>> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch approvals');
  }

  return data.data!;
}

async function processApproval(params: {
  id: number;
  action: 'approve' | 'reject';
  model: string;
  reason?: string;
}): Promise<boolean> {
  const res = await fetch(`/api/approvals/${params.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: params.action,
      model: params.model,
      reason: params.reason,
    }),
  });

  const data: ApiResponse<{ result: boolean }> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to process approval');
  }

  return data.data!.result;
}

export function useApprovals(params: ApprovalsParams = {}) {
  return useQuery({
    queryKey: ['approvals', params],
    queryFn: () => fetchApprovals(params),
  });
}

export function useApprovalAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: processApproval,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}
