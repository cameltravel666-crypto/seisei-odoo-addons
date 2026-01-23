'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

// ============================================
// Types
// ============================================

export interface Journal {
  id: number;
  name: string;
  code: string;
  type: 'sale' | 'purchase' | 'cash' | 'bank' | 'general';
  defaultAccount: string | null;
  currency: string;
}

export interface JournalEntry {
  id: number;
  name: string;
  date: string | null;
  ref: string | null;
  journalId: number | null;
  journalName: string;
  state: string;
  amount: number;
  currency: string;
  partnerName: string | null;
  lineCount: number;
}

export interface MoveLine {
  id: number;
  moveId: number | null;
  moveName: string;
  date: string | null;
  accountId: number | null;
  accountName: string;
  partnerId: number | null;
  partnerName: string | null;
  label: string;
  ref: string | null;
  debit: number;
  credit: number;
  balance: number;
  amountCurrency: number;
  currency: string;
  reconciled: boolean;
  matchingNumber: string | null;
  journalId: number | null;
  journalName: string;
  state: string;
}

export interface Account {
  id: number;
  name: string;
  code: string;
  accountType: string;
  accountTypeLabel: string;
  reconcile: boolean;
  deprecated: boolean;
  currency: string | null;
  groupName: string | null;
  balance: number;
}

export interface JournalKPIs {
  draftCount: number;
  postedCount: number;
  totalCount: number;
}

export interface MoveLineKPIs {
  postedCount: number;
  unreconciledCount: number;
  totalDebit: number;
  totalCredit: number;
}

// ============================================
// Response Types
// ============================================

interface JournalsResponse {
  items: Journal[];
  grouped: Record<string, Journal[]>;
  total: number;
}

interface EntriesResponse {
  kpi: JournalKPIs;
  items: JournalEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface MoveLinesResponse {
  kpi: MoveLineKPIs;
  items: MoveLine[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  totals: {
    debit: number;
    credit: number;
    balance: number;
  };
}

interface AccountsResponse {
  items: Account[];
  typeLabels: Record<string, string>;
  total: number;
}

// ============================================
// Parameter Types
// ============================================

export type EntryQueueType = 'draft' | 'posted' | 'all';
export type LineQueueType = 'all' | 'posted' | 'unreconciled';

interface JournalsParams {
  type?: string;
}

interface EntriesParams {
  page?: number;
  limit?: number;
  queue?: EntryQueueType;
  journalId?: number;
  dateFrom?: string;
  dateTo?: string;
}

interface MoveLinesParams {
  page?: number;
  limit?: number;
  queue?: LineQueueType;
  journalId?: number;
  accountId?: number;
  partnerId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface AccountsParams {
  search?: string;
}

// ============================================
// Fetch Functions
// ============================================

async function fetchJournals(params: JournalsParams): Promise<JournalsResponse> {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);

  const res = await fetch(`/api/accounting/journals?${searchParams}`);
  const data: ApiResponse<JournalsResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch journals');
  }

  return data.data!;
}

async function fetchEntries(params: EntriesParams): Promise<EntriesResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.queue) searchParams.set('queue', params.queue);
  if (params.journalId) searchParams.set('journal_id', params.journalId.toString());
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params.dateTo) searchParams.set('date_to', params.dateTo);

  const res = await fetch(`/api/accounting/entries?${searchParams}`);
  const data: ApiResponse<EntriesResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch entries');
  }

  return data.data!;
}

async function fetchMoveLines(params: MoveLinesParams): Promise<MoveLinesResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.queue) searchParams.set('queue', params.queue);
  if (params.journalId) searchParams.set('journal_id', params.journalId.toString());
  if (params.accountId) searchParams.set('account_id', params.accountId.toString());
  if (params.partnerId) searchParams.set('partner_id', params.partnerId.toString());
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params.dateTo) searchParams.set('date_to', params.dateTo);
  if (params.search) searchParams.set('search', params.search);

  const res = await fetch(`/api/accounting/move-lines?${searchParams}`);
  const data: ApiResponse<MoveLinesResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch move lines');
  }

  return data.data!;
}

async function fetchAccounts(params: AccountsParams): Promise<AccountsResponse> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);

  const res = await fetch(`/api/accounting/accounts?${searchParams}`);
  const data: ApiResponse<AccountsResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch accounts');
  }

  return data.data!;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook to fetch accounting journals
 */
export function useJournals(params: JournalsParams = {}) {
  return useQuery({
    queryKey: ['accounting-journals', params],
    queryFn: () => fetchJournals(params),
  });
}

/**
 * Hook to fetch journal entries (account.move with move_type = 'entry')
 */
export function useJournalEntries(params: EntriesParams = {}) {
  return useQuery({
    queryKey: ['accounting-entries', params],
    queryFn: () => fetchEntries(params),
  });
}

/**
 * Hook to fetch move lines (account.move.line - the main ledger view)
 */
export function useMoveLines(params: MoveLinesParams = {}) {
  return useQuery({
    queryKey: ['accounting-move-lines', params],
    queryFn: () => fetchMoveLines(params),
  });
}

/**
 * Hook to fetch chart of accounts
 */
export function useAccounts(params: AccountsParams = {}) {
  return useQuery({
    queryKey: ['accounting-accounts', params],
    queryFn: () => fetchAccounts(params),
  });
}

/**
 * Hook to post a journal entry
 */
export function usePostEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: number) => {
      const res = await fetch('/api/accounting/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, action: 'post' }),
      });
      const result: ApiResponse<{ message: string }> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to post entry');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-entries'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-move-lines'] });
    },
  });
}
