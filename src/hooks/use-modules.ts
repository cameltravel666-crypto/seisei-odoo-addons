'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

interface Summary {
  totalOrders: number;
  totalAmount: number;
  avgAmount: number;
  cancelledCount: number;
  accountsPayable?: number;   // For purchase module
  accountsReceivable?: number; // For sales module
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary?: Summary;
}

interface QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

async function fetchModule<T>(endpoint: string, params: QueryParams): Promise<PaginatedResponse<T>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.state) searchParams.set('state', params.state);
  if (params.type) searchParams.set('type', params.type);
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params.dateTo) searchParams.set('date_to', params.dateTo);

  const res = await fetch(`/api/${endpoint}?${searchParams}`);
  const data: ApiResponse<PaginatedResponse<T>> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || `Failed to fetch ${endpoint}`);
  }

  return data.data!;
}

// Inventory
export interface InventoryItem {
  id: number;
  productId: number;
  productName: string;
  locationId: number;
  locationName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export function useInventory(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['inventory', params],
    queryFn: () => fetchModule<InventoryItem>('inventory', params),
  });
}

// Purchase
export interface PurchaseItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  dateOrder: string;
  amountTotal: number;
  state: string;
  receiptStatus: 'no' | 'pending' | 'full';
  pickingCount: number;
}

export function usePurchase(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['purchase', params],
    queryFn: () => fetchModule<PurchaseItem>('purchase', params),
  });
}

// Sales
export interface SalesItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  dateOrder: string;
  amountTotal: number;
  state: string;
}

export function useSales(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: () => fetchModule<SalesItem>('sales', params),
  });
}

// Expenses
export interface ExpenseItem {
  id: number;
  name: string;
  employeeId: number | null;
  employeeName: string;
  amount: number;
  date: string;
  state: string;
}

export function useExpenses(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: () => fetchModule<ExpenseItem>('expenses', params),
  });
}

// CRM
export interface CrmItem {
  id: number;
  name: string;
  partnerName: string | null;
  email: string | null;
  phone: string | null;
  expectedRevenue: number;
  probability: number;
  stageName: string;
  createdAt: string;
}

export function useCrm(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['crm', params],
    queryFn: () => fetchModule<CrmItem>('crm', params),
  });
}

// Accounting (Expenses)
export interface AccountingItem {
  id: number;
  name: string;
  employeeId: number | null;
  employeeName: string;
  productName: string | null;
  amount: number;
  date: string;
  state: string;
  description: string | null;
  reference: string | null;
  sheetName: string | null;
}

interface AccountingKpi {
  draftCount: number;
  draftAmount: number;
  submittedCount: number;
  submittedAmount: number;
  approvedCount: number;
  approvedAmount: number;
  doneCount: number;
  doneAmount: number;
  thisMonthAmount: number;
}

interface AccountingResponse {
  kpi: AccountingKpi;
  items: AccountingItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface AccountingQueryParams {
  page?: number;
  limit?: number;
  queue?: string;
  sort?: string;
}

export function useAccounting(params: AccountingQueryParams = {}) {
  return useQuery({
    queryKey: ['accounting', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.queue) searchParams.set('queue', params.queue);
      if (params.sort) searchParams.set('sort', params.sort);

      const res = await fetch(`/api/accounting?${searchParams}`);
      const data: ApiResponse<AccountingResponse> = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch expenses');
      }

      return data.data!;
    },
  });
}

// HR
export interface HrItem {
  id: number;
  name: string;
  jobTitle: string | null;
  departmentName: string | null;
  email: string | null;
  phone: string | null;
}

export function useHr(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['hr', params],
    queryFn: () => fetchModule<HrItem>('hr', params),
  });
}

// Maintenance
export interface MaintenanceItem {
  id: number;
  name: string;
  equipmentName: string;
  requestDate: string;
  scheduleDate: string | null;
  stageName: string;
  priority: string;
}

export function useMaintenance(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['maintenance', params],
    queryFn: () => fetchModule<MaintenanceItem>('maintenance', params),
  });
}

// Documents
export interface DocumentItem {
  id: number;
  name: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  createdBy: string;
}

export function useDocuments(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['documents', params],
    queryFn: () => fetchModule<DocumentItem>('documents', params),
  });
}

// Stock Pickings (Inventory Transfers)
export interface PickingItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string | null;
  scheduledDate: string;
  dateDone: string | null;
  origin: string | null;
  state: string;
  pickingTypeId: number | null;
  pickingTypeName: string | null;
  pickingTypeCode: string;
  locationId: number | null;
  locationName: string | null;
  locationDestId: number | null;
  locationDestName: string | null;
  moveCount: number;
}

interface PickingsSummary {
  draft: number;
  waiting: number;
  confirmed: number;
  assigned: number;
  done: number;
  cancel: number;
}

interface PickingsResponse {
  items: PickingItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: PickingsSummary;
}

export function usePickings(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['pickings', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.search) searchParams.set('search', params.search);
      if (params.state) searchParams.set('state', params.state);
      if (params.type) searchParams.set('type', params.type);

      const res = await fetch(`/api/inventory/pickings?${searchParams}`);
      const data: ApiResponse<PickingsResponse> = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch pickings');
      }

      return data.data!;
    },
  });
}
