'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Receipt, ChevronRight, Calendar } from 'lucide-react';
import { useOrders } from '@/hooks/use-pos';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/ui/stat-card';

export default function OrdersPage() {
  const t = useTranslations();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data, isLoading, error } = useOrders({
    page,
    limit: 20,
    state: stateFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Status badge colors and labels
  const getStatusBadge = (state: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      paid: 'bg-green-100 text-green-800',
      done: 'bg-green-100 text-green-800',
      invoiced: 'bg-blue-100 text-blue-800',
      cancel: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      draft: t('status.draft'),
      paid: t('status.paid'),
      done: t('status.done'),
      invoiced: t('status.invoiced'),
      cancel: t('status.cancelled'),
    };
    return {
      color: colors[state] || 'bg-gray-100 text-gray-800',
      label: labels[state] || state,
    };
  };

  const formatPrice = (price: number, compact = false) => {
    if (compact && price >= 10000) {
      // Format as 万 for large numbers
      return `¥${(price / 10000).toFixed(1)}万`;
    }
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleOrderClick = (orderId: number) => {
    router.push(`/pos/orders/${orderId}`);
  };

  const setQuickDate = (range: string) => {
    const today = new Date();
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    switch (range) {
      case 'today':
        setDateFrom(formatDateStr(today));
        setDateTo(formatDateStr(today));
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        setDateFrom(formatDateStr(yesterday));
        setDateTo(formatDateStr(yesterday));
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        setDateFrom(formatDateStr(weekAgo));
        setDateTo(formatDateStr(today));
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setDateFrom(formatDateStr(monthStart));
        setDateTo(formatDateStr(today));
        break;
      case 'clear':
        setDateFrom('');
        setDateTo('');
        break;
    }
    setPage(1);
  };

  // Use server-provided summary statistics
  const summary = data?.summary || { totalOrders: 0, totalAmount: 0, avgAmount: 0, cancelledCount: 0 };

  // Simplified status tabs: All / In Progress (paid) / Completed (done) / Cancelled (cancel)
  const statusTabs = [
    { value: '', label: t('common.all') },
    { value: 'paid', label: t('status.paid') },
    { value: 'done', label: t('status.done') },
    { value: 'cancel', label: t('status.cancelled') },
  ];

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('pos.orders')}</h1>

      {/* 1. Date Filter Bar (First Priority) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Calendar className="w-4 h-4 text-gray-500" />

          {/* Quick date buttons */}
          <button
            onClick={() => { setQuickDate('today'); }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              dateFrom === new Date().toISOString().split('T')[0] && dateTo === dateFrom
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('search.today')}
          </button>
          <button
            onClick={() => setQuickDate('week')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              dateFrom && dateTo && dateFrom !== dateTo && new Date(dateTo).getTime() - new Date(dateFrom).getTime() <= 7 * 86400000
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('search.thisWeek')}
          </button>
          <button
            onClick={() => setQuickDate('month')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              dateFrom && new Date(dateFrom).getDate() === 1
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('search.thisMonth')}
          </button>

          {/* Custom date range */}
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              showDatePicker ? 'bg-gray-100 border-gray-300' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('search.custom')}
          </button>

          {(dateFrom || dateTo) && (
            <button
              onClick={() => setQuickDate('clear')}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>

      {/* Custom Date Picker (collapsible) */}
      {showDatePicker && (
        <div className="flex items-center gap-2 pl-6">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="input text-sm py-1.5"
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="input text-sm py-1.5"
          />
        </div>
      )}

      {/* 2. Status Tabs (Single Dimension) */}
      <div className="flex gap-1 border-b border-gray-200">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStateFilter(tab.value); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              stateFilter === tab.value
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Summary Cards (High-Level Metrics Only) - Single Row */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard value={summary.totalOrders} label={t('order.totalOrders')} type="highlight" />
        <StatCard value={formatPrice(summary.totalAmount, true)} label={t('order.totalAmount')} type="amount" />
        <StatCard value={formatPrice(summary.avgAmount, true)} label={t('dashboard.avgOrder')} type="amount" />
        <StatCard value={summary.cancelledCount} label={t('status.cancelled')} type="negative" />
      </div>

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">
          {t('common.error')}: {(error as Error).message}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="file"
          title={t('pos.noOrders')}
          description={t('pos.noOrdersDesc')}
        />
      ) : (
        <>
          <div className="card divide-y divide-gray-100">
            {data.items.map((order) => {
              const status = getStatusBadge(order.state);
              return (
                <div
                  key={order.id}
                  onClick={() => handleOrderClick(order.id)}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Receipt className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{order.name}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {order.partner_id ? order.partner_id[1] : t('pos.walkIn')}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(order.date_order)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatPrice(order.amount_total)}</p>
                    <p className="text-xs text-gray-500">
                      {t('pos.tax')}: {formatPrice(order.amount_tax)}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              );
            })}
          </div>

          <Pagination
            page={page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />

          <p className="text-center text-sm text-gray-500">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}
    </div>
  );
}
