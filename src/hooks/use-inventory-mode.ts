'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

/**
 * Mode-based Inventory Hooks
 *
 * Implements isolated state per mode (inventory/receiving/shipping)
 * with configuration-driven data fetching and capability detection.
 */

// ============================================
// Types
// ============================================

export type InventoryMode = 'inventory' | 'receiving' | 'shipping';

export type InventoryTab = 'all' | 'in_stock' | 'out_of_stock' | 'low_stock';
export type PickingTab = 'pending' | 'done';

export interface StockItem {
  productId: number;
  productName: string;
  barcode: string | null;
  defaultCode: string | null;
  uom: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface StockStats {
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
}

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

export interface PickingStats {
  pending: number;
  done: number;
  total: number;
}

export interface Capabilities {
  canAccessStockQuant: boolean;
  canAccessProductProduct: boolean;
  canAccessStockPicking: boolean;
  canAccessStockPickingType: boolean;
  canAccessStockMove: boolean;
  canAccessStockMoveLine: boolean;
  stockQuantFields: string[];
  productFields: string[];
  incomingPickingTypeIds: number[];
  outgoingPickingTypeIds: number[];
  internalPickingTypeIds: number[];
  pickingTypes: Array<{ id: number; name: string; code: string; warehouseId: number | null }>;
  inventoryStrategy: 'stock_quant' | 'product_qty' | 'product_only';
  errors: string[];
}

// ============================================
// Mode Configuration (configuration-driven, no scattered if-else)
// ============================================

interface ModeConfig<TTab extends string, TItem, TStats> {
  mode: InventoryMode;
  tabs: Array<{ value: TTab; labelKey: string }>;
  defaultTab: TTab;
  fetchList: (params: {
    page: number;
    limit: number;
    search: string;
    tab: TTab;
    capabilities?: Capabilities;
    lowStockThreshold?: number;
  }) => Promise<{
    items: TItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    stats: TStats;
    strategy?: string;
  }>;
  computeStats: (items: TItem[], stats: TStats) => TStats;
}

// ============================================
// API Fetchers
// ============================================

async function fetchInventoryCapabilities(): Promise<Capabilities> {
  const res = await fetch('/api/inventory/capabilities');
  const data: ApiResponse<Capabilities> = await res.json();
  if (!data.success || !data.data) {
    throw new Error(data.error?.message || 'Failed to fetch capabilities');
  }
  return data.data;
}

async function fetchStock(params: {
  page: number;
  limit: number;
  search: string;
  tab: InventoryTab;
  strategy?: string;
  lowStockThreshold?: number;
}): Promise<{
  items: StockItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: StockStats;
  strategy: string;
}> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', params.page.toString());
  searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.tab) searchParams.set('tab', params.tab);
  if (params.strategy) searchParams.set('strategy', params.strategy);
  if (params.lowStockThreshold) searchParams.set('lowStockThreshold', params.lowStockThreshold.toString());

  const res = await fetch(`/api/inventory/stock?${searchParams}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch stock');
  }
  return data.data;
}

async function fetchPickings(params: {
  page: number;
  limit: number;
  search: string;
  tab: PickingTab;
  type: 'incoming' | 'outgoing';
  pickingTypeIds?: number[];
}): Promise<{
  items: PickingItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: PickingStats;
}> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', params.page.toString());
  searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('type', params.type);

  // Map tab to state filter
  if (params.tab === 'pending') {
    searchParams.set('state', 'assigned');
  } else if (params.tab === 'done') {
    searchParams.set('state', 'done');
  }

  const res = await fetch(`/api/inventory/pickings?${searchParams}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch pickings');
  }

  // Transform summary to stats
  const summary = data.data.summary || {};
  const stats: PickingStats = {
    pending: (summary.assigned || 0) + (summary.waiting || 0) + (summary.confirmed || 0),
    done: summary.done || 0,
    total: data.data.pagination.total,
  };

  return {
    items: data.data.items,
    pagination: data.data.pagination,
    stats,
  };
}

// ============================================
// Mode Configurations
// ============================================

export const INVENTORY_MODE_CONFIG: ModeConfig<InventoryTab, StockItem, StockStats> = {
  mode: 'inventory',
  tabs: [
    { value: 'all', labelKey: 'inventory.tabAll' },
    { value: 'in_stock', labelKey: 'inventory.tabInStock' },
    { value: 'out_of_stock', labelKey: 'inventory.tabOutOfStock' },
    { value: 'low_stock', labelKey: 'inventory.tabLowStock' },
  ],
  defaultTab: 'all',
  fetchList: async (params) => {
    return fetchStock({
      page: params.page,
      limit: params.limit,
      search: params.search,
      tab: params.tab,
      strategy: params.capabilities?.inventoryStrategy,
      lowStockThreshold: params.lowStockThreshold,
    });
  },
  computeStats: (_items, stats) => stats, // Stats come from API, already computed
};

export const RECEIVING_MODE_CONFIG: ModeConfig<PickingTab, PickingItem, PickingStats> = {
  mode: 'receiving',
  tabs: [
    { value: 'pending', labelKey: 'inventory.tabPending' },
    { value: 'done', labelKey: 'inventory.tabDone' },
  ],
  defaultTab: 'pending',
  fetchList: async (params) => {
    return fetchPickings({
      page: params.page,
      limit: params.limit,
      search: params.search,
      tab: params.tab,
      type: 'incoming',
      pickingTypeIds: params.capabilities?.incomingPickingTypeIds,
    });
  },
  computeStats: (_items, stats) => stats,
};

export const SHIPPING_MODE_CONFIG: ModeConfig<PickingTab, PickingItem, PickingStats> = {
  mode: 'shipping',
  tabs: [
    { value: 'pending', labelKey: 'inventory.tabPending' },
    { value: 'done', labelKey: 'inventory.tabDone' },
  ],
  defaultTab: 'pending',
  fetchList: async (params) => {
    return fetchPickings({
      page: params.page,
      limit: params.limit,
      search: params.search,
      tab: params.tab,
      type: 'outgoing',
      pickingTypeIds: params.capabilities?.outgoingPickingTypeIds,
    });
  },
  computeStats: (_items, stats) => stats,
};

// ============================================
// React Query Hooks
// ============================================

export function useCapabilities() {
  return useQuery({
    queryKey: ['inventory', 'capabilities'],
    queryFn: fetchInventoryCapabilities,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export function useInventoryStock(params: {
  page: number;
  limit?: number;
  search?: string;
  tab?: InventoryTab;
  lowStockThreshold?: number;
  enabled?: boolean;
}) {
  const { data: capabilities } = useCapabilities();

  return useQuery({
    queryKey: ['inventory', 'stock', params, capabilities?.inventoryStrategy],
    queryFn: () =>
      INVENTORY_MODE_CONFIG.fetchList({
        page: params.page,
        limit: params.limit || 50,
        search: params.search || '',
        tab: params.tab || 'all',
        capabilities,
        lowStockThreshold: params.lowStockThreshold || 5,
      }),
    enabled: params.enabled !== false,
  });
}

export function useReceivingPickings(params: {
  page: number;
  limit?: number;
  search?: string;
  tab?: PickingTab;
  enabled?: boolean;
}) {
  const { data: capabilities } = useCapabilities();

  return useQuery({
    queryKey: ['inventory', 'receiving', params],
    queryFn: () =>
      RECEIVING_MODE_CONFIG.fetchList({
        page: params.page,
        limit: params.limit || 20,
        search: params.search || '',
        tab: params.tab || 'pending',
        capabilities,
      }),
    enabled: params.enabled !== false && capabilities?.canAccessStockPicking !== false,
  });
}

export function useShippingPickings(params: {
  page: number;
  limit?: number;
  search?: string;
  tab?: PickingTab;
  enabled?: boolean;
}) {
  const { data: capabilities } = useCapabilities();

  return useQuery({
    queryKey: ['inventory', 'shipping', params],
    queryFn: () =>
      SHIPPING_MODE_CONFIG.fetchList({
        page: params.page,
        limit: params.limit || 20,
        search: params.search || '',
        tab: params.tab || 'pending',
        capabilities,
      }),
    enabled: params.enabled !== false && capabilities?.canAccessStockPicking !== false,
  });
}
