'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, PosProduct, PosOrder, PosCategory } from '@/types';

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface CategoriesParams {
  page?: number;
  limit?: number;
  search?: string;
  includeInactive?: boolean;
}

interface ProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: number;
  available?: boolean;
}

interface OrdersParams {
  page?: number;
  limit?: number;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface OrdersSummary {
  totalOrders: number;
  totalAmount: number;
  avgAmount: number;
  cancelledCount: number;
}

interface OrdersResponse extends PaginatedResponse<PosOrder> {
  summary: OrdersSummary;
}

async function fetchCategories(params: CategoriesParams): Promise<PaginatedResponse<PosCategory>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.includeInactive) searchParams.set('include_inactive', 'true');

  const res = await fetch(`/api/pos/categories?${searchParams}`);
  const data: ApiResponse<PaginatedResponse<PosCategory>> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch categories');
  }

  return data.data!;
}

async function fetchProducts(params: ProductsParams): Promise<PaginatedResponse<PosProduct>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.categoryId) searchParams.set('category_id', params.categoryId.toString());
  if (params.available !== undefined) searchParams.set('available', params.available.toString());

  const res = await fetch(`/api/pos/products?${searchParams}`);
  const data: ApiResponse<PaginatedResponse<PosProduct>> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch products');
  }

  return data.data!;
}

async function fetchOrders(params: OrdersParams): Promise<OrdersResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.state) searchParams.set('state', params.state);
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom);
  if (params.dateTo) searchParams.set('date_to', params.dateTo);
  if (params.search) searchParams.set('search', params.search);

  const res = await fetch(`/api/pos/orders?${searchParams}`);
  const data: ApiResponse<OrdersResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch orders');
  }

  return data.data!;
}

export function useCategories(params: CategoriesParams = {}) {
  return useQuery({
    queryKey: ['pos-categories', params],
    queryFn: () => fetchCategories(params),
  });
}

export function useProducts(params: ProductsParams = {}) {
  return useQuery({
    queryKey: ['pos-products', params],
    queryFn: () => fetchProducts(params),
  });
}

export function useOrders(params: OrdersParams = {}) {
  return useQuery({
    queryKey: ['pos-orders', params],
    queryFn: () => fetchOrders(params),
  });
}

// Category mutations
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; parent_id?: number; sequence?: number; image_1920?: string }) => {
      const res = await fetch('/api/pos/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<PosCategory> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to create category');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-categories'] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; parent_id?: number | null; sequence?: number; image_1920?: string | null }) => {
      const res = await fetch(`/api/pos/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<PosCategory> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to update category');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-categories'] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/pos/categories/${id}`, {
        method: 'DELETE',
      });
      const result: ApiResponse<{ deleted: boolean }> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to delete category');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-categories'] });
    },
  });
}

// Product mutations
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      default_code?: string;
      list_price?: number;
      pos_categ_ids?: number[];
      available_in_pos?: boolean;
      image_1920?: string;
    }) => {
      const res = await fetch('/api/pos/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<PosProduct> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to create product');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: number;
      name?: string;
      default_code?: string;
      list_price?: number;
      pos_categ_ids?: number[];
      available_in_pos?: boolean;
      is_favorite?: boolean;
      image_1920?: string | null;
    }) => {
      const res = await fetch('/api/pos/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<PosProduct> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to update product');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    },
  });
}

// Batch update products
export function useBatchUpdateProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { ids: number[]; available_in_pos?: boolean; is_favorite?: boolean }) => {
      const promises = updates.ids.map((id) =>
        fetch('/api/pos/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, available_in_pos: updates.available_in_pos, is_favorite: updates.is_favorite }),
        }).then((res) => res.json())
      );
      const results = await Promise.all(promises);
      const errors = results.filter((r) => !r.success);
      if (errors.length > 0) throw new Error('Some products failed to update');
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    },
  });
}

// ==================== Tables ====================

export interface TableInfo {
  id: number;
  name: string;
  floor_id: [number, string] | false;
  seats: number;
  position_h: number;
  position_v: number;
  width: number;
  height: number;
  shape: string;
  color: string | false;
  active: boolean;
  isOccupied: boolean;
  activeOrder: {
    id: number;
    state: string;
    amount_total: number;
    partner_id: [number, string] | false;
    create_date: string;
  } | null;
}

export interface FloorInfo {
  id: number;
  name: string;
  sequence: number;
  background_color: string | false;
  tables: TableInfo[];
  stats: {
    total: number;
    occupied: number;
    available: number;
  };
}

interface TablesResponse {
  floors: FloorInfo[];
  stats: {
    total: number;
    occupied: number;
    available: number;
  };
  moduleNotInstalled?: boolean;
  posUrl?: {
    baseUrl: string;
    configId: number | null;
  } | null;
}

interface TablesParams {
  floorId?: number;
}

async function fetchTables(params: TablesParams): Promise<TablesResponse> {
  const searchParams = new URLSearchParams();
  if (params.floorId) searchParams.set('floor_id', params.floorId.toString());

  const res = await fetch(`/api/pos/tables?${searchParams}`);
  const data: ApiResponse<TablesResponse> = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch tables');
  }

  return data.data!;
}

export function useTables(params: TablesParams = {}) {
  return useQuery({
    queryKey: ['pos-tables', params],
    queryFn: () => fetchTables(params),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useUpdateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { table_id: number; action: 'open' | 'close' }) => {
      const res = await fetch('/api/pos/tables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<{ message: string; closedOrders?: number }> = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to update table');
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
    },
  });
}
