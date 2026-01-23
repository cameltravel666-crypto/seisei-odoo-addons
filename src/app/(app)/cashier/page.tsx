'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  ArrowDownLeft, ArrowUpRight, Wallet, Plus, ChevronRight,
  TrendingUp, TrendingDown, Calendar
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DateRangeFilter, type PeriodType, ListSkeleton, EmptyState } from '@/components/ui';

interface CashSummary {
  todayInbound: number;
  todayOutbound: number;
  todayNet: number;
  monthInbound: number;
  monthOutbound: number;
  monthNet: number;
}

interface RecentPayment {
  id: number;
  name: string;
  partnerName: string;
  paymentType: 'inbound' | 'outbound';
  amount: number;
  date: string | null;
  state: string;
}

export default function CashierPage() {
  const t = useTranslations();
  const [period, setPeriod] = useState<PeriodType>('today');
  const [customDateFrom, setCustomDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Fetch cash summary
  const { data, isLoading } = useQuery({
    queryKey: ['cashier-summary'],
    queryFn: async () => {
      const res = await fetch('/api/cashier/summary');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data as { summary: CashSummary; recentPayments: RecentPayment[] };
    },
  });

  const summary = data?.summary || {
    todayInbound: 0,
    todayOutbound: 0,
    todayNet: 0,
    monthInbound: 0,
    monthOutbound: 0,
    monthNet: 0,
  };

  const recentPayments = data?.recentPayments || [];

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <h1 className="page-title">{t('cashier.title') || '现金出纳'}</h1>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/cashier/receive"
          className="card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <ArrowDownLeft className="w-6 h-6 text-green-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">{t('cashier.receive') || '收款'}</span>
        </Link>
        <Link
          href="/cashier/pay"
          className="card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
            <ArrowUpRight className="w-6 h-6 text-orange-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">{t('cashier.pay') || '付款'}</span>
        </Link>
      </div>

      {/* Today's Summary */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">{t('cashier.todaySummary') || '今日收支'}</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">{t('cashier.inbound') || '收入'}</p>
            <p className="text-lg font-bold text-green-600 tabular-nums">
              ¥{summary.todayInbound.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">{t('cashier.outbound') || '支出'}</p>
            <p className="text-lg font-bold text-orange-600 tabular-nums">
              ¥{summary.todayOutbound.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">{t('cashier.net') || '净额'}</p>
            <p className={`text-lg font-bold tabular-nums ${summary.todayNet >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              ¥{summary.todayNet.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Month Summary */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">{t('cashier.monthSummary') || '本月收支'}</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              <p className="text-xs text-gray-500">{t('cashier.inbound') || '收入'}</p>
            </div>
            <p className="text-base font-bold text-green-600 tabular-nums">
              ¥{summary.monthInbound.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingDown className="w-3 h-3 text-orange-500" />
              <p className="text-xs text-gray-500">{t('cashier.outbound') || '支出'}</p>
            </div>
            <p className="text-base font-bold text-orange-600 tabular-nums">
              ¥{summary.monthOutbound.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">{t('cashier.net') || '净额'}</p>
            <p className={`text-base font-bold tabular-nums ${summary.monthNet >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              ¥{summary.monthNet.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">{t('cashier.recentPayments') || '最近收支'}</h3>
          <Link href="/cashier/history" className="text-sm text-blue-600">
            {t('common.viewAll') || '查看全部'}
          </Link>
        </div>

        {isLoading ? (
          <ListSkeleton count={3} />
        ) : recentPayments.length === 0 ? (
          <EmptyState
            icon="file"
            title={t('cashier.noPayments') || '暂无收支记录'}
            description={t('cashier.noPaymentsDesc') || '点击上方按钮开始记录收支'}
          />
        ) : (
          <div className="card divide-y divide-[var(--color-border-light)] overflow-hidden">
            {recentPayments.map((payment) => {
              const isInbound = payment.paymentType === 'inbound';
              return (
                <Link
                  key={payment.id}
                  href={`/cashier/history/${payment.id}`}
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
                    <p className="text-body font-medium text-truncate">{payment.partnerName || payment.name}</p>
                    <p className="text-micro text-[var(--color-text-tertiary)]">{payment.date || '-'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-body font-bold tabular-nums ${isInbound ? 'text-green-600' : 'text-orange-600'}`}>
                      {isInbound ? '+' : '-'}¥{payment.amount.toLocaleString()}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/cashier/history"
          className="card p-3 flex items-center gap-3 hover:shadow-md transition-all"
        >
          <Wallet className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium">{t('cashier.history') || '收支记录'}</span>
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        </Link>
        <Link
          href="/finance"
          className="card p-3 flex items-center gap-3 hover:shadow-md transition-all"
        >
          <TrendingUp className="w-5 h-5 text-purple-600" />
          <span className="text-sm font-medium">{t('nav.finance') || '财务管理'}</span>
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        </Link>
      </div>
    </div>
  );
}
