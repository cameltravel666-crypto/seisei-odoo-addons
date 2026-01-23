'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  ArrowUpRight, ArrowDownLeft, ChevronRight, Plus
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Pagination, DateRangeFilter, type PeriodType, ListSkeleton } from '@/components/ui';

interface Payment {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  paymentType: 'inbound' | 'outbound';
  partnerType: 'customer' | 'supplier';
  amount: number;
  currency: string;
  date: string | null;
  ref: string | null;
  state: string;
  paymentMethod: string | null;
  journalName: string | null;
  hasInvoices: boolean;
}

interface PaymentKPI {
  draftCount: number;
  draftAmount: number;
  postedCount: number;
  postedAmount: number;
  inboundAmount: number;
  outboundAmount: number;
}

type PaymentQueueType = 'draft' | 'posted' | 'reconciled' | 'all';
type PaymentTypeFilter = 'inbound' | 'outbound' | 'all';

// Status Tabs Component
function StatusTabs({
  tabs,
  activeQueue,
  onChange,
}: {
  tabs: { value: PaymentQueueType; label: string; count: number }[];
  activeQueue: PaymentQueueType;
  onChange: (queue: PaymentQueueType) => void;
}) {
  const getBadgeColor = (tab: PaymentQueueType, isActive: boolean) => {
    if (isActive) return 'bg-blue-600 text-white';
    switch (tab) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'posted': return 'bg-green-100 text-green-700';
      case 'reconciled': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div
      className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide"
      style={{ height: 'var(--height-tab)', minHeight: 'var(--height-tab)' }}
    >
      {tabs.map((tab) => {
        const isActive = activeQueue === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-2 px-4 text-body font-medium border-b-2 transition whitespace-nowrap ${
              isActive
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            style={{ height: 'var(--height-tab)' }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 text-micro font-medium rounded-full inline-flex items-center justify-center tabular-nums ${getBadgeColor(tab.value, isActive)}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Type Filter Tabs
function TypeTabs({
  value,
  onChange,
  t,
}: {
  value: PaymentTypeFilter;
  onChange: (type: PaymentTypeFilter) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const types: { value: PaymentTypeFilter; label: string }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'inbound', label: t('accounting.receive') || '收款' },
    { value: 'outbound', label: t('accounting.pay') || '付款' },
  ];

  return (
    <div className="flex gap-[var(--space-2)] overflow-x-auto scrollbar-hide -mx-4 px-4">
      {types.map((type) => (
        <button
          key={type.value}
          onClick={() => onChange(type.value)}
          className={`segment-pill ${
            value === type.value ? 'segment-pill-active' : 'segment-pill-default'
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  );
}

// Payment List Item
function PaymentListItem({
  payment,
  t,
}: {
  payment: Payment;
  t: ReturnType<typeof useTranslations>;
}) {
  const isInbound = payment.paymentType === 'inbound';

  const getStatusBadge = () => {
    switch (payment.state) {
      case 'draft':
        return <span className="chip chip-default">{t('status.draft')}</span>;
      case 'posted':
        return <span className="chip chip-success">{t('accounting.posted') || '已过账'}</span>;
      case 'reconciled':
        return <span className="chip chip-info">{t('accounting.reconciled') || '已对账'}</span>;
      case 'cancelled':
        return <span className="chip chip-danger">{t('status.cancelled') || '已取消'}</span>;
      default:
        return null;
    }
  };

  return (
    <Link
      href={`/accounting/payments/${payment.id}`}
      className="list-item hover:bg-[var(--color-bg-hover)] transition-colors"
    >
      <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-muted)]">
        {isInbound ? (
          <ArrowDownLeft className="w-4 h-4 text-green-500" />
        ) : (
          <ArrowUpRight className="w-4 h-4 text-orange-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-body font-medium text-truncate">{payment.name}</span>
          {getStatusBadge()}
        </div>
        <p className="text-sub text-truncate">{payment.partnerName}</p>
        <p className="text-micro text-[var(--color-text-tertiary)]">
          {payment.date || '-'}
          {payment.journalName && ` | ${payment.journalName}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-body font-bold tabular-nums ${isInbound ? 'text-green-600' : 'text-orange-600'}`}>
          {isInbound ? '+' : '-'}¥{payment.amount.toLocaleString()}
        </p>
        {payment.ref && (
          <p className="text-micro text-[var(--color-text-tertiary)]">
            {payment.ref}
          </p>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0" />
    </Link>
  );
}

export default function PaymentsPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeQueue, setActiveQueue] = useState<PaymentQueueType>('all');
  const [paymentType, setPaymentType] = useState<PaymentTypeFilter>('all');

  // Calculate date range
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

  // Fetch data
  const { data, isLoading, error } = useQuery({
    queryKey: ['accounting-payments', page, activeQueue, paymentType, dateRange.from, dateRange.to],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        queue: activeQueue,
        type: paymentType,
      });
      if (dateRange.from) params.set('date_from', dateRange.from);
      if (dateRange.to) params.set('date_to', dateRange.to);

      const res = await fetch(`/api/accounting/payments?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data as { kpi: PaymentKPI; items: Payment[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
    },
  });

  const kpi = data?.kpi || {
    draftCount: 0,
    draftAmount: 0,
    postedCount: 0,
    postedAmount: 0,
    inboundAmount: 0,
    outboundAmount: 0,
  };

  // Build tabs
  const tabs = useMemo(() => [
    { value: 'all' as PaymentQueueType, label: t('common.all'), count: 0 },
    { value: 'draft' as PaymentQueueType, label: t('status.draft'), count: kpi.draftCount },
    { value: 'posted' as PaymentQueueType, label: t('accounting.posted') || '已过账', count: kpi.postedCount },
  ], [t, kpi]);

  const handleQueueChange = (queue: PaymentQueueType) => {
    setActiveQueue(queue);
    setPage(1);
  };

  const handleTypeChange = (type: PaymentTypeFilter) => {
    setPaymentType(type);
    setPage(1);
  };

  return (
    <div className="section-gap pb-24">
      {/* Sticky Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <h1 className="page-title">{t('accounting.payments') || '付款管理'}</h1>
          <Link
            href="/accounting/payments/register"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            {t('accounting.registerPayment') || '登记付款'}
          </Link>
        </div>

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

      {/* KPI Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">{t('accounting.totalReceived') || '总收款'}</p>
          <p className="text-lg font-bold text-green-600 tabular-nums">¥{kpi.inboundAmount.toLocaleString()}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">{t('accounting.totalPaid') || '总付款'}</p>
          <p className="text-lg font-bold text-orange-600 tabular-nums">¥{kpi.outboundAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Status Tabs */}
      <StatusTabs
        tabs={tabs}
        activeQueue={activeQueue}
        onChange={handleQueueChange}
      />

      {/* Type Filter */}
      <TypeTabs
        value={paymentType}
        onChange={handleTypeChange}
        t={t}
      />

      {/* List */}
      {isLoading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="file"
          title={t('accounting.noPayments') || '暂无付款记录'}
          description={t('accounting.noPaymentsDesc') || '没有找到符合条件的付款记录'}
        />
      ) : (
        <>
          <div className="card divide-y divide-[var(--color-border-light)] overflow-hidden">
            {data.items.map((payment) => (
              <PaymentListItem
                key={payment.id}
                payment={payment}
                t={t}
              />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />
          <p className="text-center text-micro text-[var(--color-text-tertiary)]">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}
    </div>
  );
}
