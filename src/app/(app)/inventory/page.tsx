'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  Clock,
  CheckCircle2,
  Barcode,
  AlertCircle,
} from 'lucide-react';
import {
  useCapabilities,
  useInventoryStock,
  useReceivingPickings,
  useShippingPickings,
  type InventoryMode,
  type InventoryTab,
  type PickingTab,
  type StockItem,
  type PickingItem,
} from '@/hooks/use-inventory-mode';
import { EmptyState, Pagination, ListSkeleton } from '@/components/ui';
import { StatCard } from '@/components/ui/stat-card';

/**
 * Inventory Page - Mode-based Architecture
 *
 * Three distinct modes with isolated state:
 * - Mode A: 库存 (Inventory) - stock.quant aggregated by product
 * - Mode B: 入库 (Receiving) - stock.picking incoming
 * - Mode C: 出库 (Shipping) - stock.picking outgoing
 *
 * Key rules:
 * - Mode switch resets tabs, search, and data
 * - Stats always computed from same data source as list
 * - No "在售/售罄" terminology (inventory semantics only)
 * - Graceful degradation on capability failure
 */

// Mode state per mode (isolated)
interface ModeState {
  inventory: { search: string; tab: InventoryTab; page: number };
  receiving: { search: string; tab: PickingTab; page: number };
  shipping: { search: string; tab: PickingTab; page: number };
}

// Business professional color scheme - no red/green
const stateColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  waiting: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  assigned: 'bg-indigo-50 text-indigo-700',
  done: 'bg-slate-100 text-slate-600',
  cancel: 'bg-slate-100 text-slate-500',
};

// App-configurable low stock threshold (not written to ERP)
const LOW_STOCK_THRESHOLD = 5;

export default function InventoryPage() {
  const t = useTranslations();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);

  // Current mode
  const [mode, setMode] = useState<InventoryMode>('inventory');

  // Per-mode state (isolated)
  const [modeState, setModeState] = useState<ModeState>({
    inventory: { search: '', tab: 'all', page: 1 },
    receiving: { search: '', tab: 'pending', page: 1 },
    shipping: { search: '', tab: 'pending', page: 1 },
  });

  // Capabilities query
  const { data: capabilities, isLoading: capabilitiesLoading, error: capabilitiesError } = useCapabilities();

  // Mode-specific queries (only active mode fetches)
  const inventoryQuery = useInventoryStock({
    page: modeState.inventory.page,
    search: modeState.inventory.search,
    tab: modeState.inventory.tab,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    enabled: mode === 'inventory',
  });

  const receivingQuery = useReceivingPickings({
    page: modeState.receiving.page,
    search: modeState.receiving.search,
    tab: modeState.receiving.tab,
    enabled: mode === 'receiving',
  });

  const shippingQuery = useShippingPickings({
    page: modeState.shipping.page,
    search: modeState.shipping.search,
    tab: modeState.shipping.tab,
    enabled: mode === 'shipping',
  });

  // Current mode's data
  const currentState = modeState[mode];
  const currentQuery = mode === 'inventory' ? inventoryQuery : mode === 'receiving' ? receivingQuery : shippingQuery;

  // Scroll to top on mode change
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mode]);

  // Mode change handler (resets to defaults but preserves search per mode)
  const handleModeChange = (newMode: InventoryMode) => {
    setMode(newMode);
  };

  // State update helpers
  const updateState = <K extends keyof ModeState[typeof mode]>(key: K, value: ModeState[typeof mode][K]) => {
    setModeState((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], [key]: value, page: key === 'page' ? value : 1 },
    }));
  };

  const handleSearchChange = (search: string) => updateState('search', search);
  const handleTabChange = (tab: string) => {
    if (mode === 'inventory') {
      updateState('tab', tab as InventoryTab);
    } else {
      updateState('tab', tab as PickingTab);
    }
  };
  const handlePageChange = (page: number) => updateState('page', page);

  // Format helpers
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

  const getPickingStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      draft: t('inventory.stateDraft'),
      waiting: t('inventory.stateWaiting'),
      confirmed: t('inventory.stateConfirmed'),
      assigned: t('inventory.stateReady'),
      done: t('inventory.stateDone'),
      cancel: t('status.cancelled'),
    };
    return labels[state] || state;
  };

  // Mode tabs config
  const modeTabs = [
    { value: 'inventory' as const, label: t('inventory.modeInventory'), icon: Package },
    { value: 'receiving' as const, label: t('inventory.modeReceiving'), icon: ArrowDownToLine },
    { value: 'shipping' as const, label: t('inventory.modeShipping'), icon: ArrowUpFromLine },
  ];

  // Status tabs per mode
  const inventoryTabs = [
    { value: 'all', label: t('inventory.tabAll') },
    { value: 'in_stock', label: t('inventory.tabInStock') },
    { value: 'out_of_stock', label: t('inventory.tabOutOfStock') },
    { value: 'low_stock', label: t('inventory.tabLowStock') },
  ];

  const pickingTabs = [
    { value: 'pending', label: t('inventory.tabPending') },
    { value: 'done', label: t('inventory.tabDone') },
  ];

  // Search placeholder per mode
  const searchPlaceholders: Record<InventoryMode, string> = {
    inventory: t('inventory.searchProductBarcode'),
    receiving: t('inventory.searchReceiving'),
    shipping: t('inventory.searchShipping'),
  };

  // Render stats cards - unified format
  const renderStatsCards = () => {
    if (mode === 'inventory') {
      const stats = inventoryQuery.data?.stats;
      if (!stats) return null;

      return (
        <div className="grid grid-cols-4 gap-2">
          <StatCard value={stats.totalProducts} label={t('inventory.statsTotal')} type="highlight" />
          <StatCard value={stats.inStock} label={t('inventory.statsInStock')} type="amount" />
          <StatCard value={stats.outOfStock} label={t('inventory.statsOutOfStock')} type={stats.outOfStock > 0 ? 'negative' : 'amount'} />
          <StatCard value={stats.lowStock} label={t('inventory.statsLowStock')} type={stats.lowStock > 0 ? 'negative' : 'amount'} />
        </div>
      );
    } else {
      const stats = mode === 'receiving' ? receivingQuery.data?.stats : shippingQuery.data?.stats;
      if (!stats) return null;

      return (
        <div className="grid grid-cols-4 gap-2">
          <StatCard value={stats.pending} label={t('inventory.statsPending')} type="highlight" />
          <StatCard value={stats.done} label={t('inventory.statsDone')} type="amount" />
          <StatCard value={stats.pending + stats.done} label={t('inventory.statsTotal')} type="amount" />
          <StatCard value={0} label="-" type="neutral" />
        </div>
      );
    }
  };

  // Render stock list item
  const renderStockItem = (item: StockItem) => (
    <div
      key={item.productId}
      className="flex items-center gap-4 p-4 border-b border-gray-100 last:border-b-0"
      style={{ minHeight: 'var(--height-list-item-normal)' }}
    >
      <div className="p-2 bg-blue-50 rounded-lg">
        {item.barcode ? (
          <Barcode className="w-5 h-5 text-blue-600" />
        ) : (
          <Package className="w-5 h-5 text-blue-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 truncate">{item.productName}</h3>
        {item.barcode && (
          <div className="text-xs text-gray-400 font-mono">{item.barcode}</div>
        )}
      </div>
      <div className="text-right">
        <p className={`font-bold text-lg tabular-nums ${
          item.availableQuantity <= 0 ? 'text-slate-400' :
          item.availableQuantity <= LOW_STOCK_THRESHOLD ? 'text-amber-600' :
          'text-slate-800'
        }`}>
          {item.availableQuantity}
        </p>
        <p className="text-xs text-gray-500">{item.uom || t('inventory.unit')}</p>
      </div>
    </div>
  );

  // Render picking list item
  const renderPickingItem = (item: PickingItem) => (
    <div
      key={item.id}
      onClick={() => router.push(`/inventory/pickings/${item.id}`)}
      className="flex items-center gap-4 p-4 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors"
      style={{ minHeight: 'var(--height-list-item-normal)' }}
    >
      <div className={`p-2 rounded-lg ${
        item.state === 'done' ? 'bg-slate-100' :
        item.state === 'assigned' ? 'bg-indigo-50' :
        'bg-amber-50'
      }`}>
        {item.state === 'done' ? (
          <CheckCircle2 className="w-5 h-5 text-slate-600" />
        ) : (
          <Truck className={`w-5 h-5 ${
            item.state === 'assigned' ? 'text-indigo-600' : 'text-amber-600'
          }`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-medium text-gray-900">{item.name}</h3>
          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${stateColors[item.state] || 'bg-gray-100'}`}>
            {getPickingStateLabel(item.state)}
          </span>
        </div>
        <div className="text-sm text-gray-500 truncate">
          {item.partnerName || item.origin || '-'}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
          <Clock className="w-3 h-3" />
          <span>{formatDate(item.scheduledDate)}</span>
          {item.moveCount > 0 && (
            <span className="ml-2">{item.moveCount} {t('inventory.items')}</span>
          )}
        </div>
      </div>
    </div>
  );

  // Capability error display
  if (capabilitiesError) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t('nav.inventory')}</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">{t('inventory.capabilityError')}</h3>
            <p className="text-sm text-red-600 mt-1">{(capabilitiesError as Error).message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" ref={listRef}>
      <h1 className="page-title">{t('nav.inventory')}</h1>

      {/* Mode Tabs (top-level) - Fixed Height */}
      <div
        className="flex gap-1 p-1 bg-gray-100 rounded-lg"
        style={{ height: 'var(--height-tab)', minHeight: 'var(--height-tab)' }}
      >
        {modeTabs.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => handleModeChange(value)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 text-body-sm font-medium rounded-md transition-colors ${
              mode === value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Search Bar (with barcode support for inventory mode) */}
      <div className="relative">
        <input
          type="text"
          value={currentState.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={searchPlaceholders[mode]}
          className="input w-full pl-10"
        />
        {mode === 'inventory' ? (
          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        ) : (
          <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Status Tabs (mode-specific) - Fixed Height Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(mode === 'inventory' ? inventoryTabs : pickingTabs).map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 text-body-sm font-medium rounded-full whitespace-nowrap transition-colors flex items-center justify-center ${
              currentState.tab === tab.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={{ height: 'var(--height-button-sm)', minHeight: 'var(--height-button-sm)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Cards (from same source as list) */}
      {renderStatsCards()}

      {/* Loading State */}
      {(capabilitiesLoading || currentQuery.isLoading) && (
        <ListSkeleton count={5} />
      )}

      {/* Error State */}
      {currentQuery.error && !currentQuery.isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{(currentQuery.error as Error).message}</p>
        </div>
      )}

      {/* List Content */}
      {!capabilitiesLoading && !currentQuery.isLoading && !currentQuery.error && (
        <>
          {mode === 'inventory' ? (
            // Inventory list
            !inventoryQuery.data?.items.length ? (
              <EmptyState
                icon="package"
                title={t('inventory.noItems')}
                description={t('inventory.noItemsDesc')}
              />
            ) : (
              <>
                <div className="bg-white rounded-lg border border-gray-200">
                  {inventoryQuery.data.items.map(renderStockItem)}
                </div>
                {inventoryQuery.data.pagination.totalPages > 1 && (
                  <Pagination
                    page={modeState.inventory.page}
                    totalPages={inventoryQuery.data.pagination.totalPages}
                    onPageChange={handlePageChange}
                  />
                )}
                <p className="text-center text-sm text-gray-500">
                  {t('common.totalItems', { count: inventoryQuery.data.pagination.total })}
                </p>
              </>
            )
          ) : (
            // Pickings list (receiving or shipping)
            <>
              {(() => {
                const data = mode === 'receiving' ? receivingQuery.data : shippingQuery.data;
                if (!data?.items.length) {
                  return (
                    <EmptyState
                      icon="package"
                      title={mode === 'receiving' ? t('inventory.noReceipts') : t('inventory.noDeliveries')}
                      description={mode === 'receiving' ? t('inventory.noReceiptsDesc') : t('inventory.noDeliveriesDesc')}
                    />
                  );
                }
                return (
                  <>
                    <div className="bg-white rounded-lg border border-gray-200">
                      {data.items.map(renderPickingItem)}
                    </div>
                    {data.pagination.totalPages > 1 && (
                      <Pagination
                        page={modeState[mode].page}
                        totalPages={data.pagination.totalPages}
                        onPageChange={handlePageChange}
                      />
                    )}
                    <p className="text-center text-sm text-gray-500">
                      {t('common.totalItems', { count: data.pagination.total })}
                    </p>
                  </>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* Debug: Show strategy used (only in development) */}
      {process.env.NODE_ENV === 'development' && inventoryQuery.data?.strategy && mode === 'inventory' && (
        <p className="text-xs text-gray-400 text-center">
          Strategy: {inventoryQuery.data.strategy}
        </p>
      )}
    </div>
  );
}
