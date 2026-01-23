'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

/**
 * OCR Status for a single invoice
 */
export interface OcrInvoiceStatus {
  id: number;
  name: string;
  ocrStatus: 'pending' | 'processing' | 'done' | 'failed';
  ocrConfidence: number;
  ocrPages: number;
  ocrMatchedCount: number;
  ocrErrorMessage: string | null;
  ocrProcessedAt: string | null;
  moveType: string;
  partnerName: string | null;
}

/**
 * OCR batch processing result
 */
export interface OcrBatchResult {
  processed: number;
  successCount: number;
  failCount: number;
  message: string;
}

/**
 * Hook to trigger batch OCR processing
 */
export function useOcrBatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceIds: number[]): Promise<OcrBatchResult> => {
      const res = await fetch('/api/ocr/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds }),
      });

      const json: ApiResponse<OcrBatchResult> = await res.json();

      if (!json.success) {
        throw new Error(json.error?.message || 'OCR processing failed');
      }

      return json.data!;
    },
    onSuccess: () => {
      // Invalidate related queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ['purchase'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

/**
 * Hook to get OCR status for specific invoices
 * Used for polling during processing
 */
export function useOcrStatus(
  invoiceIds: number[],
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  }
) {
  const enabled = options?.enabled !== false && invoiceIds.length > 0;
  const refetchInterval = options?.refetchInterval ?? false;

  return useQuery({
    queryKey: ['ocr-status', invoiceIds.join(',')],
    queryFn: async (): Promise<OcrInvoiceStatus[]> => {
      const idsParam = invoiceIds.join(',');
      const res = await fetch(`/api/ocr/invoices?ids=${idsParam}`);
      const json: ApiResponse<{ invoices: OcrInvoiceStatus[] }> = await res.json();

      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to get OCR status');
      }

      return json.data!.invoices;
    },
    enabled,
    refetchInterval,
    staleTime: 2000, // Consider data fresh for 2 seconds
  });
}

/**
 * Hook to reset OCR status for invoices
 */
export function useOcrResetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceIds: number[]): Promise<{ reset: number }> => {
      const res = await fetch('/api/ocr/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds }),
      });

      const json: ApiResponse<{ reset: number }> = await res.json();

      if (!json.success) {
        throw new Error(json.error?.message || 'OCR reset failed');
      }

      return json.data!;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['purchase'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['ocr-status'] });
    },
  });
}

/**
 * Check if any invoice in the list is still processing
 */
export function isAnyProcessing(statuses: OcrInvoiceStatus[]): boolean {
  return statuses.some(s => s.ocrStatus === 'processing');
}

/**
 * Get summary of OCR processing
 */
export function getOcrSummary(statuses: OcrInvoiceStatus[]) {
  const pending = statuses.filter(s => s.ocrStatus === 'pending').length;
  const processing = statuses.filter(s => s.ocrStatus === 'processing').length;
  const done = statuses.filter(s => s.ocrStatus === 'done').length;
  const failed = statuses.filter(s => s.ocrStatus === 'failed').length;

  return { pending, processing, done, failed, total: statuses.length };
}
