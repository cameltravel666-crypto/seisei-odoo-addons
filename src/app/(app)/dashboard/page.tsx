'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  XCircle,
  CreditCard,
  Package,
  Clock,
  BarChart3,
  PieChart,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useDashboard, type DateRangeType } from '@/hooks/use-dashboard';
import { Loading } from '@/components/ui/loading';
import { StatCard } from '@/components/ui/stat-card';
import { DateRangeFilter, type PeriodType } from '@/components/ui/date-range-filter';

// Tab types for sub-navigation
type DashboardTab = 'overview' | 'sales' | 'products' | 'orders' | 'payments';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Map PeriodType to DateRangeType
const periodToDateRange: Record<PeriodType, DateRangeType> = {
  today: 'today',
  week: 'thisWeek',
  month: 'thisMonth',
  custom: 'custom',
};

export default function DashboardPage() {
  const t = useTranslations();
  const [period, setPeriod] = useState<PeriodType>('month');
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0]);

  const dateRange = periodToDateRange[period];

  const { data, isLoading, error } = useDashboard({
    range: dateRange,
    from: customFrom,
    to: customTo,
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatPriceCompact = (price: number) => {
    if (price >= 10000) {
      return `¥${(price / 10000).toFixed(1)}万`;
    }
    return formatPrice(price);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const tabs = [
    { value: 'overview', label: t('dashboard.overview'), icon: BarChart3 },
    { value: 'sales', label: t('dashboard.salesAnalysis'), icon: TrendingUp },
    { value: 'products', label: t('dashboard.productAnalysis'), icon: Package },
    { value: 'orders', label: t('dashboard.orderAnalysis'), icon: Clock },
    { value: 'payments', label: t('dashboard.paymentAnalysis'), icon: CreditCard },
  ];

  if (isLoading) {
    return <Loading text={t('common.loading')} />;
  }

  if (error) {
    return (
      <div className="card p-6 text-center text-red-600">
        {t('common.error')}: {(error as Error).message}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const trendData = data.salesTrend.map((item) => ({
    ...item,
    date: formatShortDate(item.date),
  }));

  // Hourly data for peak hours chart
  const hourlyData = data.hourlyDistribution
    .filter(h => h.orderCount > 0 || h.totalSales > 0)
    .map(h => ({
      ...h,
      label: `${h.hour}:00`,
    }));

  // Payment pie chart data
  const paymentPieData = data.paymentBreakdown.map((p, i) => ({
    name: p.method,
    value: p.amount,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <h1 className="page-title">{t('nav.dashboard')}</h1>

      {/* Date Range Filter */}
      <DateRangeFilter
        value={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {/* Sub-navigation Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as DashboardTab)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition ${
                activeTab === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards - unified format */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard
              value={data.summary.orderCount}
              label={t('dashboard.orderCount')}
              type="highlight"
            />
            <StatCard
              value={formatPriceCompact(data.summary.totalSales)}
              label={t('dashboard.sales')}
              type="amount"
            />
            <StatCard
              value={formatPrice(data.summary.avgOrderValue)}
              label={t('dashboard.avgOrder')}
              type="amount"
            />
            <StatCard
              value={data.summary.cancelCount}
              label={t('dashboard.cancelCount')}
              type="negative"
            />
          </div>

          {/* Quick Charts Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Sales Trend */}
            <div className="card p-4">
              <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.salesTrend')}</h2>
              <div className="h-56">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value) => [formatPrice(value as number), t('dashboard.sales')]} />
                      <Area type="monotone" dataKey="totalSales" stroke="#3b82f6" fill="#93c5fd" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
                )}
              </div>
            </div>

            {/* Payment Breakdown */}
            <div className="card p-4">
              <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.paymentBreakdown')}</h2>
              <div className="h-56">
                {paymentPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {paymentPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatPrice(value as number)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
                )}
              </div>
            </div>
          </div>

          {/* Top Products Quick View */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.topProducts')}</h2>
            {data.productRanking.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('dashboard.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data.productRanking.slice(0, 5).map((product, index) => (
                  <div key={product.productId} className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-900 truncate">{product.productName}</span>
                    <span className="text-sm text-gray-500">{product.totalQty}{t('dashboard.unit')}</span>
                    <span className="text-sm font-medium text-gray-900">{formatPrice(product.totalAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Analysis Tab */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Summary Cards - unified format */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard value={data.summary.orderCount} label={t('dashboard.orderCount')} type="highlight" />
            <StatCard value={formatPriceCompact(data.summary.totalSales)} label={t('dashboard.sales')} type="amount" />
            <StatCard value={formatPrice(data.summary.avgOrderValue)} label={t('dashboard.avgOrder')} type="amount" />
            <StatCard
              value={formatPercent(data.summary.salesChange)}
              label={t('dashboard.vsLastPeriod')}
              type={data.summary.salesChange >= 0 ? 'amount' : 'negative'}
            />
          </div>

          {/* Sales Trend Chart */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.salesTrend')}</h2>
            <div className="h-72">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatPriceCompact(v)} />
                    <Tooltip formatter={(value) => [formatPrice(value as number), t('dashboard.sales')]} />
                    <Area type="monotone" dataKey="totalSales" stroke="#3b82f6" fill="#93c5fd" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
              )}
            </div>
          </div>

          {/* Order Count Chart */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.orderCount')}</h2>
            <div className="h-64">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [value, t('dashboard.orders')]} />
                    <Bar dataKey="orderCount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Products Analysis Tab */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Top Products Table */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.topProductsTitle')}</h2>
            {data.productRanking.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('dashboard.noData')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">{t('dashboard.rank')}</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">{t('dashboard.product')}</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">{t('dashboard.qty')}</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">{t('dashboard.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productRanking.map((product, index) => (
                      <tr key={product.productId} className="border-b border-gray-50">
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-medium ${
                            index < 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-gray-900">{product.productName}</td>
                        <td className="py-3 px-2 text-right text-gray-600">{product.totalQty}</td>
                        <td className="py-3 px-2 text-right font-medium text-gray-900">{formatPrice(product.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Product Chart */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.salesByProduct')}</h2>
            <div className="h-64">
              {data.productRanking.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.productRanking.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatPriceCompact(v)} />
                    <YAxis type="category" dataKey="productName" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(value) => formatPrice(value as number)} />
                    <Bar dataKey="totalAmount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Orders Analysis Tab */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Order Stats - unified format */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard value={data.summary.orderCount + data.summary.cancelCount} label={t('dashboard.totalOrders')} type="highlight" />
            <StatCard value={data.summary.orderCount} label={t('dashboard.completedOrders')} type="amount" />
            <StatCard value={`${data.summary.cancelRate.toFixed(1)}%`} label={t('dashboard.cancelRate')} type="amount" />
            <StatCard value={data.summary.cancelCount} label={t('dashboard.cancelCount')} type="negative" />
          </div>

          {/* Peak Hours Chart */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.peakHours')}</h2>
            <div className="h-64">
              {hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value, name) => [value, name === 'orderCount' ? t('dashboard.orders') : t('dashboard.sales')]} />
                    <Bar dataKey="orderCount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
              )}
            </div>
          </div>

          {/* Hourly Sales */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.hourlySales')}</h2>
            <div className="h-64">
              {hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatPriceCompact(v)} />
                    <Tooltip formatter={(value) => [formatPrice(value as number), t('dashboard.sales')]} />
                    <Area type="monotone" dataKey="totalSales" stroke="#f59e0b" fill="#fcd34d" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">{t('dashboard.noData')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payments Analysis Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* Payment Methods Summary */}
          <div className="card p-4">
            <h2 className="text-base font-medium text-gray-900 mb-4">{t('dashboard.paymentBreakdown')}</h2>
            {data.paymentBreakdown.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('dashboard.noData')}</p>
            ) : (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Pie Chart */}
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {paymentPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatPrice(value as number)} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Payment List */}
                <div className="space-y-3">
                  {data.paymentBreakdown.map((payment, index) => {
                    const total = data.paymentBreakdown.reduce((sum, p) => sum + p.amount, 0);
                    const percent = total > 0 ? (payment.amount / total) * 100 : 0;
                    return (
                      <div key={payment.method} className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="flex-1 text-sm text-gray-900">{payment.method}</span>
                        <span className="text-sm text-gray-500">{payment.count}{t('dashboard.transactions')}</span>
                        <span className="text-sm font-medium text-gray-900">{formatPrice(payment.amount)}</span>
                        <span className="text-xs text-gray-500 w-12 text-right">{percent.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// KPI Card with change indicator - unified style
function KpiCard({
  title,
  value,
  change,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'purple' | 'red' | 'yellow';
}) {
  const iconColorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  const valueColorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-blue-600',
    red: 'text-red-500',
    yellow: 'text-gray-900',
  };

  return (
    <div className="card p-3 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${iconColorClasses[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className={`text-2xl font-bold ${valueColorClasses[color]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{title}</div>
      {change !== undefined && (
        <div className={`flex items-center justify-center gap-1 mt-1 text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>
        </div>
      )}
      {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

// Simple Summary Card - unified style
function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'green' | 'red';
}) {
  const valueClass = highlight === 'green' ? 'text-green-600' : highlight === 'red' ? 'text-red-500' : 'text-gray-900';
  return (
    <div className="card p-3 text-center">
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
