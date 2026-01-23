'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Receipt,
  Building2,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Scan,
  Plus,
} from 'lucide-react';
import { useInvoices, type Invoice } from '@/hooks/use-finance';
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card';
import { KpiCardSkeleton } from '@/components/ui/skeleton';

/**
 * 票据中心 - Billing Center
 *
 * 提供发票和账单的快速访问入口，类似文档识别的交互方式
 * 通过 BizNexus API 与 Odoo 后端交互
 */
export default function BillingPage() {
  const t = useTranslations();
  const router = useRouter();

  // Fetch invoice data for KPIs and recent list
  const { data, isLoading } = useInvoices({ limit: 5, queue: 'unpaid' });

  const kpi = data?.kpi || {
    draftCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    arAmount: 0,
    apAmount: 0,
  };

  // Quick action cards
  const quickActions = [
    {
      href: '/finance/invoices?type=out_invoice',
      icon: FileText,
      label: t('billing.customerInvoices'),
      desc: t('billing.customerInvoicesDesc') || '查看和管理客户发票',
      color: 'blue',
      badge: undefined,
    },
    {
      href: '/finance/invoices?type=in_invoice',
      icon: Receipt,
      label: t('billing.vendorBills'),
      desc: t('billing.vendorBillsDesc') || '查看和管理供应商账单',
      color: 'purple',
      badge: undefined,
    },
    {
      href: '/ocr',
      icon: Scan,
      label: t('billing.documentScan') || '文档扫描',
      desc: t('billing.documentScanDesc') || '扫描发票和收据',
      color: 'green',
    },
    {
      href: '/expenses',
      icon: CreditCard,
      label: t('billing.expenses'),
      desc: t('billing.expensesDesc') || '管理费用报销',
      color: 'amber',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <h1 className="page-title">{t('nav.billing')}</h1>
          <Link
            href="/ocr"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('billing.newDocument') || '新建单据'}
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCardGrid columns={2} className="gap-[var(--space-3)]">
        {isLoading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              title={t('billing.unpaidInvoices') || '待付发票'}
              value={kpi.unpaidCount}
              icon={Clock}
              tone="warning"
            />
            <KpiCard
              title={t('billing.overdueInvoices') || '逾期发票'}
              value={kpi.overdueCount}
              icon={AlertCircle}
              tone="danger"
            />
            <KpiCard
              title={t('billing.receivable') || '应收账款'}
              value={`¥${kpi.arAmount.toLocaleString()}`}
              icon={TrendingUp}
              tone="success"
            />
            <KpiCard
              title={t('billing.payable') || '应付账款'}
              value={`¥${kpi.apAmount.toLocaleString()}`}
              icon={TrendingDown}
              tone="default"
            />
          </>
        )}
      </KpiCardGrid>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="card p-4 hover:shadow-md transition-shadow flex flex-col items-center text-center group"
            >
              <div className={`w-12 h-12 rounded-xl ${colorMap[action.color]} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium text-gray-900">{action.label}</span>
              <span className="text-xs text-gray-500 mt-1">{action.desc}</span>
            </Link>
          );
        })}
      </div>

      {/* Overdue Alert */}
      {kpi.overdueCount > 0 && (
        <div className="card-flat flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              {t('billing.overdueAlert') || `您有 ${kpi.overdueCount} 张发票已逾期`}
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {t('billing.overdueAlertDesc') || '请尽快处理以避免额外费用'}
            </p>
          </div>
          <Link
            href="/finance/invoices?queue=unpaid"
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
          >
            {t('common.view')}
          </Link>
        </div>
      )}

      {/* Recent Invoices */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {t('billing.recentInvoices') || '最近发票'}
          </h2>
          <Link
            href="/finance/invoices"
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            {t('common.viewAll')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            {t('common.loading')}...
          </div>
        ) : !data?.items.length ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{t('billing.noRecentInvoices') || '暂无发票'}</p>
            <Link
              href="/ocr"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              <Scan className="w-4 h-4" />
              {t('billing.scanFirst') || '扫描第一张发票'}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.items.map((invoice) => (
              <InvoiceListItem key={invoice.id} invoice={invoice} t={t} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/finance"
          className="card p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{t('billing.financeModule') || '财务管理'}</p>
            <p className="text-xs text-gray-500">{t('billing.financeModuleDesc') || '完整财务功能'}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 ml-auto" />
        </Link>
        <Link
          href="/accounting/cash-ledger"
          className="card p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{t('billing.cashLedger') || '现金出纳'}</p>
            <p className="text-xs text-gray-500">{t('billing.cashLedgerDesc') || '日常收支记录'}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 ml-auto" />
        </Link>
      </div>
    </div>
  );
}

// Invoice List Item Component
function InvoiceListItem({
  invoice,
  t,
}: {
  invoice: Invoice;
  t: ReturnType<typeof useTranslations>;
}) {
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
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{t('status.draft')}</span>;
    }
    if (invoice.paymentState === 'paid') {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">{t('status.paid')}</span>;
    }
    if (invoice.isOverdue) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">{t('finance.overdue')}</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">{t('finance.unpaid')}</span>;
  };

  return (
    <Link
      href={`/finance/invoices/${invoice.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
        {getTypeIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-gray-900 truncate">{invoice.name}</span>
          {getStatusBadge()}
        </div>
        <p className="text-xs text-gray-500 truncate">{invoice.partnerName}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${isRefund ? 'text-orange-600' : 'text-gray-900'}`}>
          {isRefund ? '-' : ''}¥{invoice.amountTotal.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400">{invoice.invoiceDate || '-'}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </Link>
  );
}
