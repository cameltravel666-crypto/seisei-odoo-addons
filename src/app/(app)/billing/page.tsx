'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ExternalLink, FileText, Receipt, CreditCard, Building2 } from 'lucide-react';

/**
 * 票据中心 - Billing Center
 *
 * 直接嵌入 Odoo 18 的票据中心 (Invoicing/Accounting Dashboard)
 * 使用 iframe 方式，最小改动实现功能复用
 */
export default function BillingPage() {
  const t = useTranslations();
  const [odooUrl, setOdooUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initOdoo = async () => {
      try {
        // Fetch tenant info to get Odoo URL
        const res = await fetch('/api/odoo-url');
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Failed to get Odoo info');
        }

        // Build the Odoo billing center URL
        // Odoo 18 uses /odoo/accounting as the main accounting/invoicing dashboard
        const billingUrl = `${data.data.baseUrl}/odoo/accounting?db=${data.data.db}`;
        setOdooUrl(billingUrl);
        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize Odoo:', err);
        setError((err as Error).message);
        setLoading(false);
      }
    };

    initOdoo();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-gray-500">{t('common.loading')}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center text-red-500">
          <p>{t('common.error')}: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section-gap">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <h1 className="page-title">{t('nav.billing')}</h1>
          {odooUrl && (
            <a
              href={odooUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <ExternalLink className="w-4 h-4" />
              {t('common.openInNewTab')}
            </a>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <a
          href={`${odooUrl?.replace('/accounting', '/action-104')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 hover:shadow-md transition-shadow flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-sm font-medium">{t('billing.customerInvoices') || '客户发票'}</span>
        </a>
        <a
          href={`${odooUrl?.replace('/accounting', '/action-110')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 hover:shadow-md transition-shadow flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-2">
            <Receipt className="w-5 h-5 text-purple-600" />
          </div>
          <span className="text-sm font-medium">{t('billing.vendorBills') || '供应商账单'}</span>
        </a>
        <a
          href={`${odooUrl?.replace('/accounting', '/action-811')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 hover:shadow-md transition-shadow flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-2">
            <Building2 className="w-5 h-5 text-green-600" />
          </div>
          <span className="text-sm font-medium">{t('billing.bank') || '银行'}</span>
        </a>
        <a
          href={`${odooUrl?.replace('/accounting', '/action-813')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="card p-4 hover:shadow-md transition-shadow flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
            <CreditCard className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-sm font-medium">{t('billing.expenses') || '费用'}</span>
        </a>
      </div>

      {/* Odoo Iframe */}
      <div className="card overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
        <iframe
          src={odooUrl || ''}
          className="w-full h-full border-0"
          title={t('nav.billing')}
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
