'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Scan, Package } from 'lucide-react';
import { EmptyState, Pagination, DateRangeFilter, type PeriodType, FAB, ListSkeleton, Skeleton } from '@/components/ui';
import { StatusTabs, type QueueType } from '@/components/purchase/status-tabs';
import { SummaryBar } from '@/components/purchase/summary-bar';
import { SortFilterBar, type SortOption } from '@/components/purchase/sort-filter-bar';
import { PurchaseListItem, type BillItem } from '@/components/purchase/purchase-list-item';
import { OcrBatchButton } from '@/components/ocr';
import { PaymentModal } from '@/components/payment-modal';
import type { ApiResponse } from '@/types';

// Types matching the API response
interface Capabilities {
  hasPickingAccess: boolean;
  hasBillAccess: boolean;
}

interface KPIs {
  toConfirmAmount: number;
  toConfirmCount: number;
  toReceiveAmount: number;
  toReceiveCount: number;
  unpaidAmount: number;
  unpaidCount: number;
  overdueAmount: number;
  overdueCount: number;
  completedAmount: number;
  completedCount: number;
}

interface POItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  dateOrder: string;
  amountTotal: number;
  state: string;
  queue: string;
  receiptStatus: 'pending' | 'received' | 'unknown';
  isOverdueDelivery: boolean;
  hasUnpaidBills: boolean;
  unpaidAmount: number;
}

interface PurchaseData {
  capabilities: Capabilities;
  kpi: KPIs;
  itemType: 'po' | 'bill';
  items: (POItem | BillItem)[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  queue: string;
}

export default function PurchasePage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeQueue, setActiveQueue] = useState<QueueType>('to_confirm');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // OCR selection mode (only for to_pay queue - vendor bills)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<BillItem | null>(null);

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setSelectionMode(false);
  };

  const handleOcrComplete = () => {
    setSelectedIds([]);
    setSelectionMode(false);
  };

  // Payment modal handlers
  const handlePaymentClick = (bill: BillItem) => {
    setSelectedBill(bill);
    setPaymentModalOpen(true);
  };

  const handlePaymentClose = () => {
    setPaymentModalOpen(false);
    setSelectedBill(null);
  };

  const handlePaymentSuccess = () => {
    // Refresh the list after successful payment
    queryClient.invalidateQueries({ queryKey: ['purchase'] });
  };

  // Calculate date range based on period
  const getDateRange = () => {
    const today = new Date();
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    switch (period) {
      case 'today':
        return { from: formatDateStr(today), to: formatDateStr(today) };
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return { from: formatDateStr(weekStart), to: formatDateStr(today) };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: formatDateStr(monthStart), to: formatDateStr(today) };
      }
      case 'custom':
      default:
        return { from: customDateFrom, to: customDateTo };
    }
  };

  const dateRange = getDateRange();

  // Map sort option to API params
  const getSortParams = () => {
    switch (sortBy) {
      case 'date_desc':
        return { sort: 'date', order: 'desc' };
      case 'date_asc':
        return { sort: 'date', order: 'asc' };
      case 'amount_desc':
        return { sort: 'amount', order: 'desc' };
      case 'amount_asc':
        return { sort: 'amount', order: 'asc' };
      case 'overdue_first':
        return { sort: 'overdue', order: 'desc' };
      default:
        return { sort: 'date', order: 'desc' };
    }
  };

  // Fetch data
  const { data, isLoading, error } = useQuery({
    queryKey: ['purchase', 'queue', activeQueue, page, dateRange.from, dateRange.to, sortBy, overdueOnly],
    queryFn: async () => {
      const sortParams = getSortParams();
      const params = new URLSearchParams();
      params.set('queue', activeQueue);
      params.set('page', page.toString());
      params.set('limit', '20');
      params.set('sort', sortParams.sort);
      params.set('order', sortParams.order);
      if (dateRange.from) params.set('date_from', dateRange.from);
      if (dateRange.to) params.set('date_to', dateRange.to);
      if (overdueOnly && activeQueue === 'to_pay') params.set('overdue_only', 'true');

      const res = await fetch(`/api/purchase?${params}`);
      const json: ApiResponse<PurchaseData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
  });

  const capabilities = data?.capabilities || { hasPickingAccess: true, hasBillAccess: true };
  const kpi = data?.kpi || {
    toConfirmAmount: 0,
    toConfirmCount: 0,
    toReceiveAmount: 0,
    toReceiveCount: 0,
    unpaidAmount: 0,
    unpaidCount: 0,
    overdueAmount: 0,
    overdueCount: 0,
    completedAmount: 0,
    completedCount: 0,
  };

  // Build tabs with counts
  const tabs = useMemo(() => {
    const allTabs = [
      { value: 'to_confirm' as QueueType, label: t('purchase.queueToConfirm'), count: kpi.toConfirmCount },
      { value: 'to_receive' as QueueType, label: t('purchase.queueToReceive'), count: kpi.toReceiveCount },
      { value: 'to_pay' as QueueType, label: t('purchase.queueToPay'), count: kpi.unpaidCount, requiresBillAccess: true },
      { value: 'completed' as QueueType, label: t('purchase.queueCompleted'), count: kpi.completedCount },
    ];
    return allTabs.filter((tab) => !('requiresBillAccess' in tab && tab.requiresBillAccess && !capabilities.hasBillAccess));
  }, [t, kpi, capabilities.hasBillAccess]);

  // Get summary data for current tab
  const getSummaryData = () => {
    switch (activeQueue) {
      case 'to_confirm':
        return { count: kpi.toConfirmCount, amount: kpi.toConfirmAmount, overdueCount: 0 };
      case 'to_receive':
        return { count: kpi.toReceiveCount, amount: kpi.toReceiveAmount, overdueCount: 0 };
      case 'to_pay':
        return { count: kpi.unpaidCount, amount: kpi.unpaidAmount, overdueCount: kpi.overdueCount };
      case 'completed':
        return { count: kpi.completedCount, amount: kpi.completedAmount, overdueCount: 0 };
      default:
        return { count: 0, amount: 0, overdueCount: 0 };
    }
  };

  const summaryData = getSummaryData();

  const handleQueueChange = (queue: QueueType) => {
    setActiveQueue(queue);
    setPage(1);
    setOverdueOnly(false); // Reset overdue filter when changing tabs
    // Reset OCR selection when changing queues
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleSortChange = (sort: SortOption) => {
    setSortBy(sort);
    setPage(1);
  };

  const handleOverdueChange = (value: boolean) => {
    setOverdueOnly(value);
    setPage(1);
  };

  const getEmptyMessage = (): string => {
    const messages: Record<string, string> = {
      to_confirm: t('purchase.emptyToConfirm'),
      to_receive: t('purchase.emptyToReceive'),
      to_pay: t('purchase.emptyToPay'),
      completed: t('purchase.emptyCompleted'),
    };
    return messages[activeQueue] || t('purchase.noItems');
  };

  return (
    <div className="section-gap pb-24">
      {/*
        Sticky Header - 使用统一的 page-header-sticky 类
        在移动端：main 滚动区 top:0 即可吸顶
        在桌面端：同样 top:0
      */}
      <div className="page-header-sticky">
        {/* Title - Fixed height */}
        <div className="page-header-title flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="page-title">{t('nav.purchase')}</h1>
            <Link
              href="/products"
              className="ml-2 p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title={t('nav.products')}
            >
              <Package className="w-4 h-4" />
            </Link>
          </div>
          {/* OCR button only for vendor bills (to_pay queue) */}
          {activeQueue === 'to_pay' && data?.itemType === 'bill' && (
            <button
              onClick={() => {
                setSelectionMode(!selectionMode);
                if (selectionMode) setSelectedIds([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                selectionMode
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Scan className="w-4 h-4" />
              {selectionMode ? t('common.cancel') : t('ocr.batchOcr')}
            </button>
          )}
        </div>

        {/* Date Range Filter */}
        <DateRangeFilter
          value={period}
          onChange={setPeriod}
          customFrom={customDateFrom}
          customTo={customDateTo}
          onCustomFromChange={setCustomDateFrom}
          onCustomToChange={setCustomDateTo}
          showIcon={false}
        />
      </div>

      {/* Status Tabs */}
      <StatusTabs
        tabs={tabs}
        activeQueue={activeQueue}
        onChange={handleQueueChange}
      />

      {/* Summary Bar */}
      <SummaryBar
        count={summaryData.count}
        amount={summaryData.amount}
        overdueCount={summaryData.overdueCount}
        queue={activeQueue}
        t={t}
      />

      {/* Sort & Filter Bar */}
      <SortFilterBar
        sortBy={sortBy}
        onSortChange={handleSortChange}
        showOverdueFilter={activeQueue === 'to_pay'}
        overdueOnly={overdueOnly}
        onOverdueChange={handleOverdueChange}
        t={t}
      />

      {/* List */}
      {isLoading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState icon="file" title={getEmptyMessage()} />
      ) : (
        <>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {data.items.map((item) => (
              <PurchaseListItem
                key={item.id}
                item={item as any}
                itemType={data.itemType}
                t={t}
                selectionMode={selectionMode && data.itemType === 'bill'}
                isSelected={selectedIds.includes(item.id)}
                onToggleSelect={handleToggleSelect}
                onPaymentClick={data.itemType === 'bill' ? handlePaymentClick : undefined}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-xs text-gray-400">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}

      {/* FAB - Create Purchase Order */}
      <FAB href="/purchase/create" label={t('purchase.createOrder')} />

      {/* OCR Batch Button (for vendor bills) */}
      {selectionMode && activeQueue === 'to_pay' && (
        <OcrBatchButton
          selectedIds={selectedIds}
          onComplete={handleOcrComplete}
          onClear={handleClearSelection}
          t={t}
        />
      )}

      {/* Payment Modal */}
      {selectedBill && (
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={handlePaymentClose}
          invoiceId={selectedBill.id}
          invoiceName={selectedBill.name}
          partnerName={selectedBill.partnerName}
          amount={selectedBill.amountResidual}
          type="outbound"
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
