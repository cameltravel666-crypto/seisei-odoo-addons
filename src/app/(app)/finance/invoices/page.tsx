'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  FileText, ArrowUpRight, ArrowDownLeft, AlertCircle, CheckCircle,
  Clock, ChevronRight
} from 'lucide-react';
import { useInvoices, type Invoice, type InvoiceQueueType, type InvoiceType } from '@/hooks/use-finance';
import { EmptyState, Pagination, DateRangeFilter, type PeriodType, ListSkeleton } from '@/components/ui';

// Status Tabs Component
function StatusTabs({
  tabs,
  activeQueue,
  onChange,
}: {
  tabs: { value: InvoiceQueueType; label: string; count: number }[];
  activeQueue: InvoiceQueueType;
  onChange: (queue: InvoiceQueueType) => void;
}) {
  const getBadgeColor = (tab: InvoiceQueueType, isActive: boolean) => {
    if (isActive) return 'bg-blue-600 text-white';
    switch (tab) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'unpaid': return 'bg-orange-100 text-orange-700';
      case 'paid': return 'bg-green-100 text-green-700';
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
  value: InvoiceType;
  onChange: (type: InvoiceType) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const types: { value: InvoiceType; label: string }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'out_invoice', label: t('finance.customerInvoice') },
    { value: 'in_invoice', label: t('finance.vendorBill') },
    { value: 'out_refund', label: t('finance.creditNote') },
    { value: 'in_refund', label: t('finance.vendorCredit') },
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

// Invoice List Item
function InvoiceListItem({ invoice, t }: { invoice: Invoice; t: ReturnType<typeof useTranslations> }) {
  const isCustomerInvoice = ['out_invoice', 'out_refund'].includes(invoice.moveType);
  const isRefund = ['out_refund', 'in_refund'].includes(invoice.moveType);

  const getTypeIcon = () => {
    if (isRefund) {
      return isCustomerInvoice
        ? <ArrowDownLeft className="w-4 h-4 text-orange-500" />
        : <ArrowUpRight className="w-4 h-4 text-orange-500" />;
    }
    return isCustomerInvoice
      ? <ArrowUpRight className="w-4 h-4 text-green-500" />
      : <ArrowDownLeft className="w-4 h-4 text-blue-500" />;
  };

  const getStatusBadge = () => {
    if (invoice.state === 'draft') {
      return <span className="chip chip-default">{t('status.draft')}</span>;
    }
    if (invoice.paymentState === 'paid') {
      return <span className="chip chip-success">{t('status.paid')}</span>;
    }
    if (invoice.isOverdue) {
      return <span className="chip chip-danger">{t('finance.overdue')} {invoice.overdueDays}{t('finance.days')}</span>;
    }
    return <span className="chip chip-warning">{t('finance.unpaid')}</span>;
  };

  return (
    <Link
      href={`/finance/invoices/${invoice.id}`}
      className="list-item hover:bg-[var(--color-bg-hover)] transition-colors"
    >
      <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-muted)]">
        {getTypeIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-body font-medium text-truncate">{invoice.name}</span>
          {getStatusBadge()}
        </div>
        <p className="text-sub text-truncate">{invoice.partnerName}</p>
        <p className="text-micro text-[var(--color-text-tertiary)]">
          {invoice.invoiceDate || '-'}
          {invoice.invoiceDateDue && ` | ${t('finance.due')}: ${invoice.invoiceDateDue}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-body font-bold tabular-nums ${isRefund ? 'text-orange-600' : ''}`}>
          {isRefund ? '-' : ''}¥{invoice.amountTotal.toLocaleString()}
        </p>
        {invoice.paymentState !== 'paid' && invoice.amountResidual > 0 && (
          <p className="text-micro text-[var(--color-text-tertiary)]">
            {t('finance.remaining')}: ¥{invoice.amountResidual.toLocaleString()}
          </p>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0" />
    </Link>
  );
}

export default function InvoicesPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateFrom, setCustomDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customDateTo, setCustomDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeQueue, setActiveQueue] = useState<InvoiceQueueType>('unpaid');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('all');

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
  const { data, isLoading, error } = useInvoices({
    page,
    limit: 20,
    queue: activeQueue,
    type: invoiceType,
    dateFrom: activeQueue === 'all' ? dateRange.from : undefined,
    dateTo: activeQueue === 'all' ? dateRange.to : undefined,
  });

  const kpi = data?.kpi || {
    draftCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    paidCount: 0,
  };

  // Build tabs
  const tabs = useMemo(() => [
    { value: 'unpaid' as InvoiceQueueType, label: t('finance.queueUnpaid'), count: kpi.unpaidCount },
    { value: 'draft' as InvoiceQueueType, label: t('finance.queueDraft'), count: kpi.draftCount },
    { value: 'paid' as InvoiceQueueType, label: t('finance.queuePaid'), count: kpi.paidCount },
    { value: 'all' as InvoiceQueueType, label: t('common.all'), count: 0 },
  ], [t, kpi]);

  const handleQueueChange = (queue: InvoiceQueueType) => {
    setActiveQueue(queue);
    setPage(1);
  };

  const handleTypeChange = (type: InvoiceType) => {
    setInvoiceType(type);
    setPage(1);
  };

  return (
    <div className="section-gap pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 bg-[var(--color-bg-page)] z-10 -mx-4 px-4 pt-2 pb-3 border-b border-[var(--color-border-light)]">
        <h1 className="page-title mb-3">{t('finance.invoices')}</h1>

        {activeQueue === 'all' && (
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

      {/* Status Tabs */}
      <StatusTabs
        tabs={tabs}
        activeQueue={activeQueue}
        onChange={handleQueueChange}
      />

      {/* Type Filter */}
      <TypeTabs
        value={invoiceType}
        onChange={handleTypeChange}
        t={t}
      />

      {/* Summary Bar */}
      {activeQueue === 'unpaid' && kpi.overdueCount > 0 && (
        <div className="card-flat flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] bg-[var(--color-danger-bg)]">
          <AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />
          <span className="text-sub text-[var(--color-danger)]">
            {t('finance.overdueAlert', { count: kpi.overdueCount })}
          </span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="file"
          title={t('finance.noInvoices')}
          description={t('finance.noInvoicesDesc')}
        />
      ) : (
        <>
          <div className="card divide-y divide-[var(--color-border-light)] overflow-hidden">
            {data.items.map((invoice) => (
              <InvoiceListItem key={invoice.id} invoice={invoice} t={t} />
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
