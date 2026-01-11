'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ExternalLink, Send, Clock } from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RestockKpiGrid } from '@/components/pos/restock-kpi-grid';
import { RestockFilterSegment, type FilterStatus } from '@/components/pos/restock-filter-segment';
import { RestockListItem } from '@/components/pos/restock-list-item';
import { RestockStickyActionBar } from '@/components/pos/restock-sticky-action-bar';
import type { ApiResponse, ReplenishmentData, ReplenishmentItem } from '@/types';

export default function ReplenishmentPage() {
  const t = useTranslations('pos');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pos-replenishment'],
    queryFn: async () => {
      const res = await fetch('/api/pos/replenishment');
      const json: ApiResponse<ReplenishmentData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch replenishment data');
      return json.data!;
    },
  });

  // Compute filter counts
  const filterCounts = useMemo(() => {
    if (!data?.items) {
      return { all: 0, critical: 0, warning: 0, handled: 0 };
    }
    return {
      all: data.items.length,
      critical: data.items.filter(i => i.status === 'critical').length,
      warning: data.items.filter(i => i.status === 'warning').length,
      handled: 0, // Not implemented in data model
    };
  }, [data?.items]);

  // Filter and sort items (critical items first)
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];

    let items = [...data.items];

    // Apply filter
    if (filterStatus === 'critical') {
      items = items.filter(i => i.status === 'critical');
    } else if (filterStatus === 'warning') {
      items = items.filter(i => i.status === 'warning');
    }

    // Sort: critical first, then by days remaining
    items.sort((a, b) => {
      if (a.status === 'critical' && b.status !== 'critical') return -1;
      if (b.status === 'critical' && a.status !== 'critical') return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    return items;
  }, [data?.items, filterStatus]);

  // Toggle item selection
  const toggleItemSelection = (id: number) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Select/deselect all filtered items
  const toggleSelectAll = () => {
    const allIds = filteredItems.map(item => item.id);
    const allSelected = allIds.every(id => selectedItems.includes(id));
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedItems(prev => [...new Set([...prev, ...allIds])]);
    }
  };

  // Calculate estimated total for selected items
  const estimatedTotal = useMemo(() => {
    if (!data?.items) return 0;
    return data.items
      .filter(item => selectedItems.includes(item.id))
      .reduce((sum, item) => sum + item.suggestedQty * item.unitPrice, 0);
  }, [data?.items, selectedItems]);

  // Handle generate PO click
  const handleGeneratePO = () => {
    // TODO: Navigate to PO creation page with selected items
    console.log('Generate PO for items:', selectedItems);
    // router.push(`/purchase/create?items=${selectedItems.join(',')}`);
  };

  // Order status badge
  const getOrderStatusBadge = (status: string) => {
    if (status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
          <Send className="w-3 h-3" />
          {t('orderSent')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
        <Clock className="w-3 h-3" />
        {t('orderPending')}
      </span>
    );
  };

  if (isLoading) {
    return <Loading text={t('loading') || '読み込み中...'} />;
  }

  if (error) {
    return (
      <div className="card p-6 text-center text-red-600">
        {(error as Error).message}
      </div>
    );
  }

  const replenishmentData = data || {
    summary: { criticalItems: 0, warningItems: 0, pendingOrders: 0, totalSuggested: 0 },
    items: [],
    pendingOrders: [],
  };

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every(item => selectedItems.includes(item.id));

  return (
    <div className="space-y-4 pb-20">
      {/* Page Title */}
      <h1 className="page-title">{t('replenishment')}</h1>

      {/* KPI Grid - Compact 2x2 */}
      <RestockKpiGrid
        criticalItems={replenishmentData.summary.criticalItems}
        warningItems={replenishmentData.summary.warningItems}
        pendingOrders={replenishmentData.summary.pendingOrders}
        totalSuggested={replenishmentData.summary.totalSuggested}
        t={t}
      />

      {/* Filter Segment */}
      <RestockFilterSegment
        value={filterStatus}
        onChange={setFilterStatus}
        counts={filterCounts}
        t={t}
      />

      {/* List Section */}
      <div className="card overflow-hidden">
        {/* List Header with Select All */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('selectAll')}
          </label>
          <span className="text-xs text-gray-500">
            {filteredItems.length} {t('items')}
          </span>
        </div>

        {/* List Items */}
        {filteredItems.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title={t('noData') || '暂无数据'}
            description={t('noReplenishmentData') || '目前没有需要补货的原材料'}
          />
        ) : (
          <div>
            {filteredItems.map(item => (
              <RestockListItem
                key={item.id}
                item={item}
                selected={selectedItems.includes(item.id)}
                onSelect={toggleItemSelection}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pending Purchase Orders */}
      {replenishmentData.pendingOrders.length > 0 && (
        <div className="card">
          <div className="p-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900 text-sm">{t('pendingPO')}</h2>
          </div>

          <div className="divide-y divide-gray-100">
            {replenishmentData.pendingOrders.map((order) => (
              <Link
                key={order.id}
                href={`/purchase/${order.odooId}`}
                className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{order.id}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {order.supplier} · {order.items} {t('ingredientTypes')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <span className="font-medium text-sm">¥{order.totalAmount.toLocaleString()}</span>
                  </div>
                  {getOrderStatusBadge(order.status)}
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Action Bar */}
      <RestockStickyActionBar
        selectedCount={selectedItems.length}
        estimatedTotal={estimatedTotal}
        onGeneratePO={handleGeneratePO}
        t={t}
      />
    </div>
  );
}
