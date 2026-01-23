'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  TrendingUp, TrendingDown, Wallet, ChevronRight, ChevronDown,
  Calendar, FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loading, DateRangeFilter, type PeriodType, KpiCardSkeleton } from '@/components/ui';
import { IN_CATEGORIES, OUT_CATEGORIES } from '@/lib/cash-ledger';

type BreakdownType = 'in' | 'out' | null;

// Compact amount formatting: >= 1億 → ¥1.00億, >= 100万 → ¥123万, else thousands
function formatCompactAmount(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 100_000_000) {
    // 1億以上
    return `${sign}¥${(absAmount / 100_000_000).toFixed(2)}億`;
  } else if (absAmount >= 1_000_000) {
    // 100万以上
    return `${sign}¥${Math.round(absAmount / 10_000)}万`;
  } else if (absAmount >= 10_000) {
    // 1万以上
    return `${sign}¥${(absAmount / 10_000).toFixed(1)}万`;
  } else {
    return `${sign}¥${absAmount.toLocaleString('ja-JP')}`;
  }
}

// Full amount for breakdown items
function formatFullAmount(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
}

export default function AccountingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [showBreakdown, setShowBreakdown] = useState<BreakdownType>(null);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);

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

  // Fetch summary stats based on date filter
  const statsQuery = useQuery({
    queryKey: ['accounting-stats', dateRange.from, dateRange.to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('date_from', dateRange.from);
      if (dateRange.to) params.set('date_to', dateRange.to);
      const res = await fetch(`/api/cash-ledger/summary?${params}`);
      const data = await res.json();
      if (!data.success) return null;
      return data.data;
    },
  });

  // Fetch today's status separately
  const todayStr = new Date().toISOString().split('T')[0];
  const todayQuery = useQuery({
    queryKey: ['accounting-today', todayStr],
    queryFn: async () => {
      const params = new URLSearchParams({ date_from: todayStr, date_to: todayStr });
      const res = await fetch(`/api/cash-ledger/summary?${params}`);
      const data = await res.json();
      if (!data.success) return { inCount: 0, outCount: 0 };
      return {
        inCount: data.data?.kpi?.todayCount || 0,
        outCount: data.data?.kpi?.todayCount || 0,
        hasDrafts: (data.data?.kpi?.draftCount || 0) > 0,
      };
    },
  });

  const kpi = statsQuery.data?.kpi;
  const inCategories = statsQuery.data?.inCategories || {};
  const outCategories = statsQuery.data?.outCategories || {};

  // Convert categories to array format for display (top 5)
  const inBreakdown = Object.entries(inCategories)
    .filter(([, data]: [string, any]) => data.amount > 0)
    .map(([code, data]: [string, any]) => ({ categoryCode: code, amount: data.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const outBreakdown = Object.entries(outCategories)
    .filter(([, data]: [string, any]) => data.amount > 0)
    .map(([code, data]: [string, any]) => ({ categoryCode: code, amount: data.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Get category name by locale
  const getCategoryName = (code: string, type: 'in' | 'out') => {
    const categories = type === 'in' ? IN_CATEGORIES : OUT_CATEGORIES;
    const cat = categories.find(c => c.code === code);
    if (!cat) return code;
    switch (locale) {
      case 'ja': return cat.nameJa;
      case 'zh': return cat.nameZh;
      default: return cat.nameEn;
    }
  };

  const totalIn = kpi?.totalIn || 0;
  const totalOut = kpi?.totalOut || 0;
  const netAmount = totalIn - totalOut;
  const draftCount = kpi?.draftCount || 0;

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <h1 className="page-title">{t('nav.accounting')}</h1>

      {/* Date Range Filter */}
      <DateRangeFilter
        value={period}
        onChange={setPeriod}
        customFrom={customDateFrom}
        customTo={customDateTo}
        onCustomFromChange={setCustomDateFrom}
        onCustomToChange={setCustomDateTo}
      />

      {/* 2) KPI Cards - 3 metrics with compact format and fixed height */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {/* Total In - clickable */}
          <button
            onClick={() => setShowBreakdown(showBreakdown === 'in' ? null : 'in')}
            className={`card p-3 text-center transition-all cursor-pointer hover:shadow-md active:scale-[0.98] flex flex-col items-center justify-center ${
              showBreakdown === 'in' ? 'ring-2 ring-green-400 bg-green-50' : ''
            }`}
            style={{ height: 'var(--height-kpi-card)', minHeight: 'var(--height-kpi-card)' }}
          >
            <p className="text-xl font-bold text-green-600 whitespace-nowrap tabular-nums">{formatCompactAmount(totalIn)}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{t('expenses.totalIncome')}</p>
          </button>

          {/* Total Out - clickable */}
          <button
            onClick={() => setShowBreakdown(showBreakdown === 'out' ? null : 'out')}
            className={`card p-3 text-center transition-all cursor-pointer hover:shadow-md active:scale-[0.98] flex flex-col items-center justify-center ${
              showBreakdown === 'out' ? 'ring-2 ring-red-400 bg-red-50' : ''
            }`}
            style={{ height: 'var(--height-kpi-card)', minHeight: 'var(--height-kpi-card)' }}
          >
            <p className="text-xl font-bold text-red-500 whitespace-nowrap tabular-nums">{formatCompactAmount(totalOut)}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{t('expenses.totalExpense')}</p>
          </button>

          {/* Net Amount */}
          <div
            className="card p-3 text-center flex flex-col items-center justify-center"
            style={{ height: 'var(--height-kpi-card)', minHeight: 'var(--height-kpi-card)' }}
          >
            <p className={`text-xl font-bold whitespace-nowrap tabular-nums ${netAmount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {formatCompactAmount(netAmount)}
            </p>
            <p className="text-xs text-gray-500 mt-1 truncate">{t('expenses.netAmount')}</p>
          </div>
        </div>
      )}

      {/* 3) Breakdown Accordion - shows below KPI cards */}
      {showBreakdown && (
        <div className={`rounded-lg border overflow-hidden ${
          showBreakdown === 'in' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-inherit">
            <h3 className={`text-sm font-medium ${showBreakdown === 'in' ? 'text-green-800' : 'text-red-800'}`}>
              {showBreakdown === 'in' ? t('expenses.inBreakdownTitle') : t('expenses.outBreakdownTitle')}
            </h3>
            <button
              onClick={() => setShowBreakdown(null)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
            >
              {t('common.close')}
            </button>
          </div>
          <div className="px-4 py-2 space-y-1.5">
            {(showBreakdown === 'in' ? inBreakdown : outBreakdown).length > 0 ? (
              (showBreakdown === 'in' ? inBreakdown : outBreakdown).map((item) => (
                <div key={item.categoryCode} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate flex-1 mr-2">
                    {getCategoryName(item.categoryCode, showBreakdown)}
                  </span>
                  <span className={`font-medium tabular-nums flex-shrink-0 ${
                    showBreakdown === 'in' ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {formatFullAmount(item.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">{t('common.noData')}</p>
            )}
          </div>
        </div>
      )}

      {/* 4) Action Cards */}
      <div className="space-y-3 pt-2">
        {/* Cash Income Entry */}
        <Link
          href="/accounting/cash-ledger?tab=in"
          className="block card p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 hover:border-green-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-500 rounded-xl shadow-sm flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900">{t('expenses.cashIncome')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('expenses.todayCashIncomeDesc')}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {todayQuery.data?.hasDrafts ? (
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                  {t('expenses.hasDrafts', { count: todayQuery.data.inCount || 0 })}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                  {t('expenses.noDrafts')}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-green-400" />
            </div>
          </div>
        </Link>

        {/* Cash Expense Entry */}
        <Link
          href="/accounting/cash-ledger?tab=out"
          className="block card p-4 bg-gradient-to-r from-red-50 to-orange-50 border-red-200 hover:border-red-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500 rounded-xl shadow-sm flex-shrink-0">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900">{t('expenses.cashExpense')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('expenses.todayCashExpenseDesc')}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {todayQuery.data?.hasDrafts ? (
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                  {t('expenses.hasDrafts', { count: todayQuery.data.outCount || 0 })}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                  {t('expenses.noDrafts')}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-red-400" />
            </div>
          </div>
        </Link>

        {/* Reconciliation Pending - Clickable link to pending page */}
        {draftCount > 0 && (
          <Link
            href="/accounting/cash-ledger/pending"
            className="block card p-3 border-amber-200 bg-amber-50 hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-amber-900">{t('expenses.reconciliationPending')}</span>
                  <span className="text-sm font-bold text-amber-700">{draftCount}{t('expenses.items')}</span>
                </div>
                <p className="text-xs text-amber-700 mt-0.5">{t('expenses.reconciliationPendingDesc')}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-400" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
