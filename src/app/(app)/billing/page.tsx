'use client';

import { useRouter } from 'next/navigation';
import { BillingCenterHome, type BillingKpis, type RecentItem } from '@/components/billing';
import { useInvoices } from '@/hooks/use-finance';

/**
 * 請求・支払センター - Billing Center (App Mode)
 * BizNexus内ページ - 真実データを使用
 */
export default function BillingPage() {
  const router = useRouter();

  // Fetch invoice data for KPIs and recent list
  // TODO: Replace with dedicated billing summary API when available
  const { data, isLoading } = useInvoices({ limit: 10, queue: 'unpaid' });

  // Transform API data to KPIs format
  const kpi = data?.kpi || {
    draftCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
    arAmount: 0,
    apAmount: 0,
  };

  const kpis: BillingKpis = {
    arOpenCount: kpi.unpaidCount || 0,
    arOverdueCount: kpi.overdueCount || 0,
    arBalance: kpi.arAmount || 0,
    apOpenCount: kpi.unpaidCount || 0,  // TODO: Separate AP count from API
    apOverdueCount: kpi.overdueCount || 0,  // TODO: Separate AP overdue from API
    apBalance: kpi.apAmount || 0,
    expensePendingCount: 0,  // TODO: Add expense data from API
    expenseApprovalCount: 0,  // TODO: Add expense approval data from API
  };

  // Transform invoice items to recent items format
  const recentItems: RecentItem[] = (data?.items || []).map((invoice) => {
    const isCustomerInvoice = ['out_invoice', 'out_refund'].includes(invoice.moveType);

    let category: 'sales' | 'purchase' | 'expense' = 'purchase';
    if (isCustomerInvoice) {
      category = 'sales';
    }

    let statusLabel = '未払';
    let statusTone: 'danger' | 'warning' | 'neutral' | 'success' = 'warning';

    if (invoice.paymentState === 'paid') {
      statusLabel = '入金済';
      statusTone = 'success';
    } else if (invoice.isOverdue) {
      statusLabel = '延滞';
      statusTone = 'danger';
    } else if (invoice.state === 'draft') {
      statusLabel = '下書き';
      statusTone = 'neutral';
    }

    return {
      id: String(invoice.id),
      category,
      docNo: invoice.name,
      partnerName: invoice.partnerName,
      amount: invoice.amountTotal,
      date: invoice.invoiceDate || '-',
      statusLabel,
      statusTone,
    };
  });

  const handleNavigate = (category: 'sales' | 'purchase' | 'expense') => {
    switch (category) {
      case 'sales':
        router.push('/billing/sales');
        break;
      case 'purchase':
        router.push('/billing/purchase');
        break;
      case 'expense':
        router.push('/billing/expense');
        break;
    }
  };

  const handleRecentClick = (item: RecentItem) => {
    // Navigate to detail or list with filter
    if (item.category === 'sales') {
      router.push(`/finance/invoices/${item.id}`);
    } else if (item.category === 'purchase') {
      router.push(`/finance/invoices/${item.id}`);
    } else {
      router.push(`/billing/expense?id=${item.id}`);
    }
  };

  const handleOverdueClick = () => {
    router.push('/finance/invoices?queue=unpaid&overdue=true');
  };

  return (
    <BillingCenterHome
      mode="app"
      kpis={kpis}
      recentItems={recentItems}
      isLoading={isLoading}
      onNavigate={handleNavigate}
      onRecentClick={handleRecentClick}
      onOverdueClick={handleOverdueClick}
    />
  );
}
