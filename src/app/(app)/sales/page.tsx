'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Package } from 'lucide-react';
import { EmptyState, Pagination, DateRangeFilter, type PeriodType, FAB, ListSkeleton } from '@/components/ui';
import { SalesSummaryBar } from '@/components/sales/summary-bar';
import { SalesListItem } from '@/components/sales/sales-list-item';
import type { ApiResponse } from '@/types';

// Reuse types from purchase for consistency
type SalesQueueType = 'to_confirm' | 'to_deliver' | 'to_invoice' | 'completed';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'overdue_first';

// Types matching the API response
interface Capabilities {
  hasInvoiceAccess: boolean;
  hasDeliveryAccess: boolean;
}

interface KPIs {
  toConfirmAmount: number;
  toConfirmCount: number;
  toDeliverAmount: number;
  toDeliverCount: number;
  toInvoiceAmount: number;
  toInvoiceCount: number;
  overdueAmount: number;
  overdueCount: number;
  completedAmount: number;
  completedCount: number;
}

interface SOItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  dateOrder: string;
  amountTotal: number;
  state: string;
  queue: string;
  deliveryStatus: 'pending' | 'delivered' | 'partial' | 'unknown';
  invoiceStatus: 'pending' | 'invoiced' | 'partial' | 'unknown';
  isOverdueDelivery: boolean;
  hasUnpaidInvoices: boolean;
  unpaidAmount: number;
}

interface InvoiceItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountResidual: number;
  amountTotal: number;
  isOverdue: boolean;
  overdueDays: number;
  invoiceOrigin: string | null;
}

interface SalesData {
  capabilities: Capabilities;
  kpi: KPIs;
  itemType: 'so' | 'invoice';
  items: (SOItem | InvoiceItem)[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  queue: string;
}

// StatusTabs component inline (reuse structure from purchase)
function StatusTabs({
  tabs,
  activeQueue,
  onChange,
}: {
  tabs: { value: SalesQueueType; label: string; count: number }[];
  activeQueue: SalesQueueType;
  onChange: (queue: SalesQueueType) => void;
}) {
  const getBadgeColor = (tab: SalesQueueType, isActive: boolean) => {
    if (isActive) return 'bg-blue-600 text-white';
    switch (tab) {
      case 'to_confirm': return 'bg-yellow-100 text-yellow-700';
      case 'to_deliver': return 'bg-blue-100 text-blue-700';
      case 'to_invoice': return 'bg-orange-100 text-orange-700';
      case 'completed': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div
      className="flex border-b border-gray-200 overflow-x-auto"
      style={{ height: 'var(--height-tab)', minHeight: 'var(--height-tab)' }}
    >
      {tabs.map((tab) => {
        const isActive = activeQueue === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-2 px-4 text-body-sm font-medium border-b-2 transition whitespace-nowrap ${
              isActive
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            style={{ height: 'var(--height-tab)' }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 text-caption font-medium rounded-full inline-flex items-center justify-center tabular-nums ${getBadgeColor(tab.value, isActive)}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// SortFilterBar component inline
function SortFilterBar({
  sortBy,
  onSortChange,
  showOverdueFilter,
  overdueOnly,
  onOverdueChange,
  t,
}: {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showOverdueFilter: boolean;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
  t: (key: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const sortOptions: { value: SortOption; label: string; showForOverdue?: boolean }[] = [
    { value: 'date_desc', label: t('sales.sortDateNewest') },
    { value: 'date_asc', label: t('sales.sortDateOldest') },
    { value: 'amount_desc', label: t('sales.sortAmountHigh') },
    { value: 'amount_asc', label: t('sales.sortAmountLow') },
    { value: 'overdue_first', label: t('sales.sortOverdueFirst'), showForOverdue: true },
  ];

  const visibleOptions = sortOptions.filter(opt => !opt.showForOverdue || showOverdueFilter);
  const currentLabel = visibleOptions.find(opt => opt.value === sortBy)?.label || t('sales.sort');

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Sort Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <span className="truncate max-w-[120px]">{currentLabel}</span>
          <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => { onSortChange(option.value); setIsOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                  sortBy === option.value ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Overdue Toggle - Only for to_invoice tab */}
      {showOverdueFilter && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => onOverdueChange(false)}
            className={`px-3 py-1.5 transition ${!overdueOnly ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {t('sales.filterAll')}
          </button>
          <button
            onClick={() => onOverdueChange(true)}
            className={`px-3 py-1.5 transition ${overdueOnly ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {t('sales.filterOverdueOnly')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeQueue, setActiveQueue] = useState<SalesQueueType>('to_confirm');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [overdueOnly, setOverdueOnly] = useState(false);

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
      case 'date_desc': return { sort: 'date', order: 'desc' };
      case 'date_asc': return { sort: 'date', order: 'asc' };
      case 'amount_desc': return { sort: 'amount', order: 'desc' };
      case 'amount_asc': return { sort: 'amount', order: 'asc' };
      case 'overdue_first': return { sort: 'overdue', order: 'desc' };
      default: return { sort: 'date', order: 'desc' };
    }
  };

  // Fetch data
  const { data, isLoading, error } = useQuery({
    queryKey: ['sales', 'queue', activeQueue, page, dateRange.from, dateRange.to, sortBy, overdueOnly],
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
      if (overdueOnly && activeQueue === 'to_invoice') params.set('overdue_only', 'true');

      const res = await fetch(`/api/sales?${params}`);
      const json: ApiResponse<SalesData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
  });

  const capabilities = data?.capabilities || { hasInvoiceAccess: true, hasDeliveryAccess: true };
  const kpi = data?.kpi || {
    toConfirmAmount: 0,
    toConfirmCount: 0,
    toDeliverAmount: 0,
    toDeliverCount: 0,
    toInvoiceAmount: 0,
    toInvoiceCount: 0,
    overdueAmount: 0,
    overdueCount: 0,
    completedAmount: 0,
    completedCount: 0,
  };

  // Build tabs with counts
  const tabs = useMemo(() => {
    const allTabs = [
      { value: 'to_confirm' as SalesQueueType, label: t('sales.queueToConfirm'), count: kpi.toConfirmCount },
      { value: 'to_deliver' as SalesQueueType, label: t('sales.queueToDeliver'), count: kpi.toDeliverCount },
      { value: 'to_invoice' as SalesQueueType, label: t('sales.queueToInvoice'), count: kpi.toInvoiceCount, requiresInvoiceAccess: true },
      { value: 'completed' as SalesQueueType, label: t('sales.queueCompleted'), count: kpi.completedCount },
    ];
    return allTabs.filter((tab) => !('requiresInvoiceAccess' in tab && tab.requiresInvoiceAccess && !capabilities.hasInvoiceAccess));
  }, [t, kpi, capabilities.hasInvoiceAccess]);

  // Get summary data for current tab
  const getSummaryData = () => {
    switch (activeQueue) {
      case 'to_confirm':
        return { count: kpi.toConfirmCount, amount: kpi.toConfirmAmount, overdueCount: 0 };
      case 'to_deliver':
        return { count: kpi.toDeliverCount, amount: kpi.toDeliverAmount, overdueCount: 0 };
      case 'to_invoice':
        return { count: kpi.toInvoiceCount, amount: kpi.toInvoiceAmount, overdueCount: kpi.overdueCount };
      case 'completed':
        return { count: kpi.completedCount, amount: kpi.completedAmount, overdueCount: 0 };
      default:
        return { count: 0, amount: 0, overdueCount: 0 };
    }
  };

  const summaryData = getSummaryData();

  const handleQueueChange = (queue: SalesQueueType) => {
    setActiveQueue(queue);
    setPage(1);
    setOverdueOnly(false);
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
      to_confirm: t('sales.emptyToConfirm'),
      to_deliver: t('sales.emptyToDeliver'),
      to_invoice: t('sales.emptyToInvoice'),
      completed: t('sales.emptyCompleted'),
    };
    return messages[activeQueue] || t('sales.noItems');
  };

  return (
    <div className="space-y-3 pb-24">
      {/*
        Sticky Header - 使用统一的 page-header-sticky 类
        在移动端：main 滚动区 top:0 即可吸顶
      */}
      <div className="page-header-sticky">
        {/* Title */}
        <div className="page-header-title flex items-center">
          <h1 className="page-title">{t('nav.sales')}</h1>
          <Link
            href="/products"
            className="ml-2 p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title={t('nav.products')}
          >
            <Package className="w-4 h-4" />
          </Link>
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
      <SalesSummaryBar
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
        showOverdueFilter={activeQueue === 'to_invoice'}
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
              <SalesListItem
                key={item.id}
                item={item as any}
                itemType={data.itemType}
                t={t}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-xs text-gray-400">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}

      {/* FAB - Create Sales Order */}
      <FAB href="/sales/create" label={t('sales.createOrder')} />
    </div>
  );
}
