'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  BarChart3, PieChart, TrendingUp, FileText, Download,
  ChevronRight, Calendar, DollarSign, Building2, Receipt
} from 'lucide-react';
import { DateRangeFilter, type PeriodType } from '@/components/ui';

interface ReportCard {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  color: string;
  available: boolean;
}

// Report Card Component
function ReportCardItem({
  report,
  dateFrom,
  dateTo,
}: {
  report: ReportCard;
  dateFrom: string;
  dateTo: string;
}) {
  const Icon = report.icon;

  const href = report.available
    ? `${report.href}?date_from=${dateFrom}&date_to=${dateTo}`
    : '#';

  return (
    <Link
      href={href}
      className={`card p-4 hover:shadow-md transition-all border-l-4 ${report.color} ${
        !report.available ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      onClick={(e) => !report.available && e.preventDefault()}
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gray-100 rounded-xl flex-shrink-0">
          <Icon className="w-5 h-5 text-gray-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{report.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{report.description}</p>
        </div>
        {report.available ? (
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
            Coming Soon
          </span>
        )}
      </div>
    </Link>
  );
}

export default function ReportsPage() {
  const t = useTranslations();
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

  // Report definitions
  const financialReports: ReportCard[] = [
    {
      id: 'profit-loss',
      icon: TrendingUp,
      title: t('accounting.profitLoss') || '利润表',
      description: t('accounting.profitLossDesc') || '收入、成本、费用和利润分析',
      href: '/accounting/reports/profit-loss',
      color: 'border-l-green-500',
      available: true,
    },
    {
      id: 'balance-sheet',
      icon: PieChart,
      title: t('accounting.balanceSheet') || '资产负债表',
      description: t('accounting.balanceSheetDesc') || '资产、负债和所有者权益',
      href: '/accounting/reports/balance-sheet',
      color: 'border-l-blue-500',
      available: true,
    },
    {
      id: 'cash-flow',
      icon: DollarSign,
      title: t('accounting.cashFlow') || '现金流量表',
      description: t('accounting.cashFlowDesc') || '现金流入流出分析',
      href: '/accounting/reports/cash-flow',
      color: 'border-l-cyan-500',
      available: true,
    },
  ];

  const accountingReports: ReportCard[] = [
    {
      id: 'trial-balance',
      icon: BarChart3,
      title: t('accounting.trialBalance') || '试算平衡表',
      description: t('accounting.trialBalanceDesc') || '所有科目借贷余额汇总',
      href: '/accounting/reports/trial-balance',
      color: 'border-l-purple-500',
      available: true,
    },
    {
      id: 'general-ledger',
      icon: FileText,
      title: t('accounting.generalLedger') || '总账',
      description: t('accounting.generalLedgerDesc') || '所有科目明细记录',
      href: '/accounting/reports/general-ledger',
      color: 'border-l-indigo-500',
      available: true,
    },
    {
      id: 'aged-receivable',
      icon: Calendar,
      title: t('accounting.agedReceivable') || '应收账龄分析',
      description: t('accounting.agedReceivableDesc') || '按账龄分析应收账款',
      href: '/accounting/reports/aged-receivable',
      color: 'border-l-amber-500',
      available: true,
    },
    {
      id: 'aged-payable',
      icon: Calendar,
      title: t('accounting.agedPayable') || '应付账龄分析',
      description: t('accounting.agedPayableDesc') || '按账龄分析应付账款',
      href: '/accounting/reports/aged-payable',
      color: 'border-l-orange-500',
      available: true,
    },
  ];

  const detailReports: ReportCard[] = [
    {
      id: 'partner-ledger',
      icon: Building2,
      title: t('accounting.partnerLedger') || '往来账',
      description: t('accounting.partnerLedgerDesc') || '客户/供应商往来明细',
      href: '/accounting/reports/partner-ledger',
      color: 'border-l-teal-500',
      available: false,
    },
    {
      id: 'tax-report',
      icon: Receipt,
      title: t('accounting.taxReport') || '税务报表',
      description: t('accounting.taxReportDesc') || '增值税、所得税等税务汇总',
      href: '/accounting/reports/tax',
      color: 'border-l-rose-500',
      available: false,
    },
  ];

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">{t('accounting.reports') || '财务报表'}</h1>
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
      </div>

      {/* Date Info */}
      <div className="card p-3 bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 text-sm text-blue-800">
          <Calendar className="w-4 h-4" />
          <span>
            {t('accounting.reportPeriod') || '报表期间'}:
            {' '}<strong>{dateRange.from}</strong> ~ <strong>{dateRange.to}</strong>
          </span>
        </div>
      </div>

      {/* Financial Statements */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-500 px-1">
          {t('accounting.financialStatements') || '财务报表'}
        </h2>
        {financialReports.map(report => (
          <ReportCardItem
            key={report.id}
            report={report}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
          />
        ))}
      </div>

      {/* Accounting Reports */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-500 px-1">
          {t('accounting.accountingReports') || '会计报表'}
        </h2>
        {accountingReports.map(report => (
          <ReportCardItem
            key={report.id}
            report={report}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
          />
        ))}
      </div>

      {/* Detail Reports */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-500 px-1">
          {t('accounting.detailReports') || '明细报表'}
        </h2>
        {detailReports.map(report => (
          <ReportCardItem
            key={report.id}
            report={report}
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
          />
        ))}
      </div>

      {/* Export Section */}
      <div className="card p-4 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <Download className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">
              {t('accounting.exportReports') || '导出报表'}
            </h3>
            <p className="text-xs text-gray-500">
              {t('accounting.exportReportsDesc') || '在各报表页面可导出Excel格式'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
