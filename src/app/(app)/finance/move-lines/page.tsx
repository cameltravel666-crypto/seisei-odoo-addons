'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Search, Filter, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useMoveLines, type LineQueueType } from '@/hooks/use-accounting';
import { DateRangeFilter, type PeriodType, ListSkeleton, EmptyState, Pagination } from '@/components/ui';
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card';
import { KpiCardSkeleton } from '@/components/ui/skeleton';

// Status Tabs
function StatusTabs({
  tabs,
  activeQueue,
  onChange,
}: {
  tabs: { value: LineQueueType; label: string; count?: number }[];
  activeQueue: LineQueueType;
  onChange: (queue: LineQueueType) => void;
}) {
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
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 text-micro font-medium rounded-full inline-flex items-center justify-center tabular-nums ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count > 999 ? '999+' : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function MoveLinesPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeQueue, setActiveQueue] = useState<LineQueueType>('posted');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);

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

  // Fetch move lines
  const { data, isLoading, error } = useMoveLines({
    page,
    limit: 50,
    queue: activeQueue,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    search: search || undefined,
  });

  const kpi = data?.kpi || { postedCount: 0, unreconciledCount: 0, totalDebit: 0, totalCredit: 0 };
  const totals = data?.totals || { debit: 0, credit: 0, balance: 0 };

  const tabs = [
    { value: 'posted' as LineQueueType, label: t('finance.postedEntries') || '已过账分录', count: kpi.postedCount },
    { value: 'unreconciled' as LineQueueType, label: t('finance.unreconciledEntries') || '未对账分录', count: kpi.unreconciledCount },
    { value: 'all' as LineQueueType, label: t('finance.allEntries') || '全部分录' },
  ];

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">{t('finance.moveLines') || '日记账分录'}</h1>
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.search') || '搜索...'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* KPI Summary */}
      <KpiCardGrid columns={2} className="gap-[var(--space-3)]">
        {isLoading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              title={t('finance.totalDebit') || '借方合计'}
              value={`¥${totals.debit.toLocaleString()}`}
              tone="default"
            />
            <KpiCard
              title={t('finance.totalCredit') || '贷方合计'}
              value={`¥${totals.credit.toLocaleString()}`}
              tone="default"
            />
          </>
        )}
      </KpiCardGrid>

      {/* Status Tabs */}
      <StatusTabs
        tabs={tabs}
        activeQueue={activeQueue}
        onChange={(queue) => {
          setActiveQueue(queue);
          setPage(1);
        }}
      />

      {/* Move Lines List */}
      {isLoading ? (
        <ListSkeleton count={10} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="file"
          title={t('finance.noMoveLines') || '暂无分录'}
          description={t('finance.noMoveLinesDesc') || '没有找到符合条件的日记账分录'}
        />
      ) : (
        <>
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 rounded-t-lg">
            <div className="col-span-1">{t('common.date') || '日期'}</div>
            <div className="col-span-2">{t('finance.journals') || '日记账'}</div>
            <div className="col-span-2">{t('finance.account') || '账户'}</div>
            <div className="col-span-2">{t('finance.partner') || '合作伙伴'}</div>
            <div className="col-span-2">{t('finance.label') || '标签'}</div>
            <div className="col-span-1 text-right">{t('finance.debit') || '借方'}</div>
            <div className="col-span-1 text-right">{t('finance.credit') || '贷方'}</div>
            <div className="col-span-1 text-center">{t('finance.matching') || '匹配'}</div>
          </div>

          {/* Table Body */}
          <div className="card divide-y divide-[var(--color-border-light)] overflow-hidden md:rounded-t-none">
            {data.items.map((line) => (
              <div
                key={line.id}
                className="p-3 md:p-2 hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                {/* Mobile Layout */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{line.date || '-'}</p>
                      <Link
                        href={`/finance/journals/entries/${line.moveId}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {line.moveName}
                      </Link>
                    </div>
                    <div className="text-right">
                      {line.debit > 0 && (
                        <p className="text-sm font-semibold text-gray-900">
                          {t('finance.debit')}: ¥{line.debit.toLocaleString()}
                        </p>
                      )}
                      {line.credit > 0 && (
                        <p className="text-sm font-semibold text-gray-900">
                          {t('finance.credit')}: ¥{line.credit.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{line.accountName}</span>
                    {line.reconciled && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        {line.matchingNumber}
                      </span>
                    )}
                  </div>
                  {line.partnerName && (
                    <p className="text-xs text-gray-500">{line.partnerName}</p>
                  )}
                  {line.label && (
                    <p className="text-xs text-gray-400 truncate">{line.label}</p>
                  )}
                </div>

                {/* Desktop Layout */}
                <div className="hidden md:grid grid-cols-12 gap-2 items-center text-sm">
                  <div className="col-span-1 text-gray-500 text-xs">{line.date || '-'}</div>
                  <div className="col-span-2">
                    <Link
                      href={`/finance/journals/entries/${line.moveId}`}
                      className="text-blue-600 hover:underline font-medium truncate block"
                    >
                      {line.moveName}
                    </Link>
                  </div>
                  <div className="col-span-2 text-gray-700 truncate" title={line.accountName}>
                    {line.accountName}
                  </div>
                  <div className="col-span-2 text-gray-600 truncate">
                    {line.partnerName || '-'}
                  </div>
                  <div className="col-span-2 text-gray-500 truncate" title={line.label}>
                    {line.label || '-'}
                  </div>
                  <div className="col-span-1 text-right font-mono tabular-nums">
                    {line.debit > 0 ? `¥${line.debit.toLocaleString()}` : '-'}
                  </div>
                  <div className="col-span-1 text-right font-mono tabular-nums">
                    {line.credit > 0 ? `¥${line.credit.toLocaleString()}` : '-'}
                  </div>
                  <div className="col-span-1 text-center">
                    {line.reconciled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        {line.matchingNumber}
                      </span>
                    ) : line.matchingNumber ? (
                      <span className="text-xs text-amber-600">{line.matchingNumber}</span>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
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
