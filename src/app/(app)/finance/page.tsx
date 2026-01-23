'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { FileText, Receipt, CreditCard, TrendingUp, TrendingDown, DollarSign, PiggyBank, BarChart3, FileCheck, Calculator, Wallet, LineChart, AlertCircle } from 'lucide-react';
import { useInvoices } from '@/hooks/use-finance';
import { KpiCard, KpiCardGrid } from '@/components/ui/kpi-card';
import { KpiCardSkeleton } from '@/components/ui/skeleton';
import { ModuleGate } from '@/components/module-gate';

// Finance Module Features for upgrade page
const FINANCE_FEATURES = [
  {
    icon: Receipt,
    titleZh: '发票管理',
    titleJa: '請求書管理',
    titleEn: 'Invoice Management',
    descZh: '创建、追踪和管理销售发票和采购发票',
    descJa: '販売請求書と仕入請求書の作成、追跡、管理',
    descEn: 'Create, track, and manage sales and purchase invoices',
  },
  {
    icon: DollarSign,
    titleZh: '应收应付',
    titleJa: '売掛金・買掛金',
    titleEn: 'AR/AP Management',
    descZh: '全面管理应收账款和应付账款',
    descJa: '売掛金と買掛金の包括的な管理',
    descEn: 'Comprehensive accounts receivable and payable management',
  },
  {
    icon: PiggyBank,
    titleZh: '银行对账',
    titleJa: '銀行照合',
    titleEn: 'Bank Reconciliation',
    descZh: '自动对账银行流水，确保账目准确',
    descJa: '銀行取引を自動照合し、正確な記帳を確保',
    descEn: 'Automatic bank statement reconciliation',
  },
  {
    icon: BarChart3,
    titleZh: '财务报表',
    titleJa: '財務諸表',
    titleEn: 'Financial Reports',
    descZh: '生成资产负债表、损益表等专业财务报表',
    descJa: '貸借対照表、損益計算書などの財務諸表を生成',
    descEn: 'Generate balance sheets, income statements, and more',
  },
  {
    icon: Calculator,
    titleZh: '税务计算',
    titleJa: '税金計算',
    titleEn: 'Tax Calculation',
    descZh: '自动计算消费税、增值税等税款',
    descJa: '消費税、付加価値税などを自動計算',
    descEn: 'Automatic calculation of sales tax, VAT, etc.',
  },
  {
    icon: FileCheck,
    titleZh: '会计凭证',
    titleJa: '会計伝票',
    titleEn: 'Journal Entries',
    descZh: '记录和管理所有会计凭证',
    descJa: 'すべての会計伝票を記録・管理',
    descEn: 'Record and manage all accounting entries',
  },
  {
    icon: LineChart,
    titleZh: '现金流分析',
    titleJa: 'キャッシュフロー分析',
    titleEn: 'Cash Flow Analysis',
    descZh: '分析现金流入流出，优化资金管理',
    descJa: 'キャッシュインフローとアウトフローを分析し、資金管理を最適化',
    descEn: 'Analyze cash inflows and outflows',
  },
  {
    icon: AlertCircle,
    titleZh: '账款预警',
    titleJa: 'アラート',
    titleEn: 'Payment Alerts',
    descZh: '逾期账款自动提醒，降低坏账风险',
    descJa: '期限切れ請求の自動アラートで不良債権リスクを低減',
    descEn: 'Automatic alerts for overdue payments',
  },
];

const FINANCE_COMPARISON = [
  { feature: '发票管理', basic: '-', premium: '✓' },
  { feature: '应收应付管理', basic: '-', premium: '✓' },
  { feature: '银行对账', basic: '-', premium: '✓' },
  { feature: '财务报表', basic: '-', premium: '✓' },
  { feature: '税务计算', basic: '-', premium: '✓' },
  { feature: '会计凭证', basic: '-', premium: '✓' },
  { feature: '现金流分析', basic: '-', premium: '✓' },
];

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
      label: t('finance.invoices') || '发票管理',
      desc: t('finance.invoicesDesc') || '管理销售和采购发票',
      badge: kpi.unpaidCount > 0 ? kpi.unpaidCount : undefined,
    },
    {
      href: '/finance/payments',
      icon: CreditCard,
      label: t('finance.payments') || '付款管理',
      desc: t('finance.paymentsDesc') || '管理收款和付款记录',
    },
    {
      href: '/finance/journals',
      icon: Receipt,
      label: t('finance.journals') || '日记账',
      desc: t('finance.journalsDesc') || '日记账和会计凭证',
    },
    {
      href: '/finance/accounts',
      icon: Calculator,
      label: t('finance.accounts') || '会计科目',
      desc: t('finance.accountsDesc') || '查看会计科目表',
    },
    {
      href: '/finance/reports',
      icon: BarChart3,
      label: t('finance.reports') || '财务报表',
      desc: t('finance.reportsDesc') || '利润表、资产负债表等',
    },
  ];

  return (
    <ModuleGate
      moduleCode="FINANCE"
      moduleNameZh="财务管理"
      moduleNameJa="財務管理"
      descriptionZh="专业的财务管理系统，处理发票、应收应付、银行对账和财务报表。"
      descriptionJa="請求書、売掛金・買掛金、銀行照合、財務諸表を処理する専門的な財務管理システム。"
      priceMonthly={9800}
      features={FINANCE_FEATURES}
      comparisonItems={FINANCE_COMPARISON}
      heroGradient="from-emerald-600 via-teal-600 to-cyan-700"
      moduleIcon={FileText}
    >
    <div className="section-gap">
      {/* Header - 使用统一的 page-header-sticky 结构 */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">{t('nav.finance')}</h1>
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
              title={t('finance.unpaidInvoices')}
              value={kpi.unpaidCount}
              icon={Receipt}
              tone="warning"
            />
            <KpiCard
              title={t('finance.overdueInvoices')}
              value={kpi.overdueCount}
              icon={CreditCard}
              tone="danger"
            />
            <KpiCard
              title={t('finance.accountsReceivable')}
              value={`¥${kpi.arAmount.toLocaleString()}`}
              icon={TrendingUp}
              tone="success"
            />
            <KpiCard
              title={t('finance.accountsPayable')}
              value={`¥${kpi.apAmount.toLocaleString()}`}
              icon={TrendingDown}
              tone="default"
            />
          </>
        )}
      </KpiCardGrid>

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
    </ModuleGate>
  );
}
