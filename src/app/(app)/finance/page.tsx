'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { FileText, Receipt, CreditCard, TrendingUp, TrendingDown } from 'lucide-react';
import { useInvoices } from '@/hooks/use-finance';
import { KpiCardSkeleton } from '@/components/ui/skeleton';

export default function FinancePage() {
  const t = useTranslations();
  const { data, isLoading } = useInvoices({ limit: 1 });

  const kpi = data?.kpi || {
    draftCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    arAmount: 0,
    apAmount: 0,
  };

  const menuItems = [
    {
      href: '/finance/invoices',
      icon: FileText,
      label: t('finance.invoices'),
      desc: t('finance.invoicesDesc'),
      badge: kpi.unpaidCount > 0 ? kpi.unpaidCount : undefined,
    },
  ];

  return (
    <div className="section-gap">
      {/* Header */}
      <h1 className="page-title">{t('nav.finance')}</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-[var(--space-3)]">
        {isLoading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <div className="card kpi-card">
              <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-warning-bg)]">
                <Receipt className="w-5 h-5 text-[var(--color-warning)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="kpi-title">{t('finance.unpaidInvoices')}</p>
                <p className="kpi-value">{kpi.unpaidCount}</p>
              </div>
            </div>
            <div className="card kpi-card">
              <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)]">
                <CreditCard className="w-5 h-5 text-[var(--color-danger)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="kpi-title">{t('finance.overdueInvoices')}</p>
                <p className="kpi-value">{kpi.overdueCount}</p>
              </div>
            </div>
            <div className="card kpi-card">
              <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-success-bg)]">
                <TrendingUp className="w-5 h-5 text-[var(--color-success)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="kpi-title">{t('finance.accountsReceivable')}</p>
                <p className="kpi-value text-sm">¥{kpi.arAmount.toLocaleString()}</p>
              </div>
            </div>
            <div className="card kpi-card">
              <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-primary-bg)]">
                <TrendingDown className="w-5 h-5 text-[var(--color-primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="kpi-title">{t('finance.accountsPayable')}</p>
                <p className="kpi-value text-sm">¥{kpi.apAmount.toLocaleString()}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Menu Items */}
      <div className="card overflow-hidden divide-y divide-[var(--color-border-light)]">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="list-item hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <div className="p-2 rounded-[var(--radius-md)] bg-[var(--color-bg-muted)]">
                <Icon className="w-5 h-5 text-[var(--color-text-secondary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-body font-medium">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="chip chip-warning">{item.badge}</span>
                  )}
                </div>
                <p className="text-sub text-truncate">{item.desc}</p>
              </div>
              <svg className="w-5 h-5 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
