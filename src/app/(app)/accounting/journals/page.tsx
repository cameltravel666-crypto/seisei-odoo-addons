'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  BookOpen, CreditCard, Wallet, Building2, FileText,
  ChevronRight, Plus
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DateRangeFilter, type PeriodType, ListSkeleton, EmptyState, Pagination } from '@/components/ui';

interface Journal {
  id: number;
  name: string;
  code: string;
  type: string;
  defaultAccount: string | null;
  currency: string;
}

interface JournalEntry {
  id: number;
  name: string;
  date: string | null;
  ref: string | null;
  journalId: number | null;
  journalName: string;
  state: string;
  amount: number;
  currency: string;
  partnerName: string | null;
  lineCount: number;
}

type ViewMode = 'journals' | 'entries';
type EntryQueueType = 'draft' | 'posted' | 'all';

// Journal type icon mapping
function getJournalIcon(type: string) {
  switch (type) {
    case 'sale': return FileText;
    case 'purchase': return FileText;
    case 'cash': return Wallet;
    case 'bank': return Building2;
    case 'general':
    default: return BookOpen;
  }
}

// Journal type color mapping
function getJournalColor(type: string) {
  switch (type) {
    case 'sale': return 'text-green-500 bg-green-50';
    case 'purchase': return 'text-orange-500 bg-orange-50';
    case 'cash': return 'text-amber-500 bg-amber-50';
    case 'bank': return 'text-blue-500 bg-blue-50';
    case 'general':
    default: return 'text-purple-500 bg-purple-50';
  }
}

// Journal Card
function JournalCard({
  journal,
  t,
}: {
  journal: Journal;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = getJournalIcon(journal.type);
  const colorClass = getJournalColor(journal.type);

  const typeLabels: Record<string, string> = {
    sale: t('accounting.journalSale') || '销售',
    purchase: t('accounting.journalPurchase') || '采购',
    cash: t('accounting.journalCash') || '现金',
    bank: t('accounting.journalBank') || '银行',
    general: t('accounting.journalGeneral') || '通用',
  };

  return (
    <Link
      href={`/accounting/journals?view=entries&journal=${journal.id}`}
      className="card p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{journal.name}</h3>
          <p className="text-xs text-gray-500">
            {journal.code} | {typeLabels[journal.type] || journal.type}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>
    </Link>
  );
}

// Entry List Item
function EntryListItem({
  entry,
  t,
}: {
  entry: JournalEntry;
  t: ReturnType<typeof useTranslations>;
}) {
  const getStatusBadge = () => {
    switch (entry.state) {
      case 'draft':
        return <span className="chip chip-default">{t('status.draft')}</span>;
      case 'posted':
        return <span className="chip chip-success">{t('accounting.posted') || '已过账'}</span>;
      default:
        return null;
    }
  };

  return (
    <Link
      href={`/accounting/journals/entries/${entry.id}`}
      className="list-item hover:bg-[var(--color-bg-hover)] transition-colors"
    >
      <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-muted)]">
        <BookOpen className="w-4 h-4 text-purple-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-body font-medium text-truncate">{entry.name}</span>
          {getStatusBadge()}
        </div>
        <p className="text-sub text-truncate">{entry.journalName}</p>
        <p className="text-micro text-[var(--color-text-tertiary)]">
          {entry.date || '-'}
          {entry.ref && ` | ${entry.ref}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-body font-bold tabular-nums">¥{entry.amount.toLocaleString()}</p>
        <p className="text-micro text-[var(--color-text-tertiary)]">
          {entry.lineCount} {t('accounting.lines') || '行'}
        </p>
      </div>
      <ChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0" />
    </Link>
  );
}

// Status Tabs for entries
function StatusTabs({
  tabs,
  activeQueue,
  onChange,
}: {
  tabs: { value: EntryQueueType; label: string; count: number }[];
  activeQueue: EntryQueueType;
  onChange: (queue: EntryQueueType) => void;
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
            {tab.count > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 text-micro font-medium rounded-full inline-flex items-center justify-center tabular-nums ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function JournalsPage() {
  const t = useTranslations();
  const [viewMode, setViewMode] = useState<ViewMode>('journals');
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeQueue, setActiveQueue] = useState<EntryQueueType>('all');
  const [selectedJournalId, setSelectedJournalId] = useState<number | null>(null);

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

  // Fetch journals
  const journalsQuery = useQuery({
    queryKey: ['accounting-journals'],
    queryFn: async () => {
      const res = await fetch('/api/accounting/journals');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data as { items: Journal[]; total: number };
    },
    enabled: viewMode === 'journals',
  });

  // Fetch entries
  const entriesQuery = useQuery({
    queryKey: ['accounting-entries', page, activeQueue, selectedJournalId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        queue: activeQueue,
      });
      if (selectedJournalId) params.set('journal_id', String(selectedJournalId));
      if (dateRange.from) params.set('date_from', dateRange.from);
      if (dateRange.to) params.set('date_to', dateRange.to);

      const res = await fetch(`/api/accounting/entries?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data as {
        kpi: { draftCount: number; postedCount: number; totalCount: number };
        items: JournalEntry[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
    },
    enabled: viewMode === 'entries',
  });

  const entryKpi = entriesQuery.data?.kpi || { draftCount: 0, postedCount: 0, totalCount: 0 };

  const tabs = [
    { value: 'all' as EntryQueueType, label: t('common.all'), count: 0 },
    { value: 'draft' as EntryQueueType, label: t('status.draft'), count: entryKpi.draftCount },
    { value: 'posted' as EntryQueueType, label: t('accounting.posted') || '已过账', count: entryKpi.postedCount },
  ];

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <h1 className="page-title">{t('accounting.journals') || '日记账'}</h1>
          {viewMode === 'entries' && (
            <Link
              href="/accounting/journals/create"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" />
              {t('accounting.newEntry') || '新建凭证'}
            </Link>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('journals')}
            className={`segment-pill ${viewMode === 'journals' ? 'segment-pill-active' : 'segment-pill-default'}`}
          >
            {t('accounting.journalBooks') || '账簿'}
          </button>
          <button
            onClick={() => setViewMode('entries')}
            className={`segment-pill ${viewMode === 'entries' ? 'segment-pill-active' : 'segment-pill-default'}`}
          >
            {t('accounting.entries') || '凭证'}
          </button>
        </div>

        {viewMode === 'entries' && (
          <DateRangeFilter
            value={period}
            onChange={setPeriod}
            customFrom={customDateFrom}
            customTo={customDateTo}
            onCustomFromChange={setCustomDateFrom}
            onCustomToChange={setCustomDateTo}
            showIcon={false}
          />
        )}
      </div>

      {/* Content */}
      {viewMode === 'journals' ? (
        // Journals View
        journalsQuery.isLoading ? (
          <ListSkeleton count={5} />
        ) : journalsQuery.error ? (
          <div className="card p-6 text-center text-red-600">{(journalsQuery.error as Error).message}</div>
        ) : !journalsQuery.data?.items.length ? (
          <EmptyState
            icon="file"
            title={t('accounting.noJournals') || '暂无日记账'}
            description={t('accounting.noJournalsDesc') || '没有找到日记账'}
          />
        ) : (
          <div className="space-y-3">
            {/* Group by type */}
            {['sale', 'purchase', 'bank', 'cash', 'general'].map(type => {
              const typeJournals = journalsQuery.data.items.filter(j => j.type === type);
              if (typeJournals.length === 0) return null;

              const typeLabels: Record<string, string> = {
                sale: t('accounting.journalTypeSale') || '销售日记账',
                purchase: t('accounting.journalTypePurchase') || '采购日记账',
                cash: t('accounting.journalTypeCash') || '现金日记账',
                bank: t('accounting.journalTypeBank') || '银行日记账',
                general: t('accounting.journalTypeGeneral') || '通用日记账',
              };

              return (
                <div key={type}>
                  <h3 className="text-sm font-medium text-gray-500 mb-2 px-1">{typeLabels[type]}</h3>
                  <div className="space-y-2">
                    {typeJournals.map(journal => (
                      <JournalCard key={journal.id} journal={journal} t={t} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // Entries View
        <>
          <StatusTabs
            tabs={tabs}
            activeQueue={activeQueue}
            onChange={(queue) => {
              setActiveQueue(queue);
              setPage(1);
            }}
          />

          {entriesQuery.isLoading ? (
            <ListSkeleton count={5} />
          ) : entriesQuery.error ? (
            <div className="card p-6 text-center text-red-600">{(entriesQuery.error as Error).message}</div>
          ) : !entriesQuery.data?.items.length ? (
            <EmptyState
              icon="file"
              title={t('accounting.noEntries') || '暂无凭证'}
              description={t('accounting.noEntriesDesc') || '没有找到符合条件的凭证'}
            />
          ) : (
            <>
              <div className="card divide-y divide-[var(--color-border-light)] overflow-hidden">
                {entriesQuery.data.items.map((entry) => (
                  <EntryListItem key={entry.id} entry={entry} t={t} />
                ))}
              </div>
              <Pagination
                page={page}
                totalPages={entriesQuery.data.pagination.totalPages}
                onPageChange={setPage}
              />
              <p className="text-center text-micro text-[var(--color-text-tertiary)]">
                {t('common.totalItems', { count: entriesQuery.data.pagination.total })}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
