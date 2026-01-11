'use client';

import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';
import { formatCompactAmount, formatDate } from '@/lib/purchase-format';

// SO item type
interface SOItem {
  id: number;
  name: string;
  partnerName: string;
  dateOrder: string;
  amountTotal: number;
  queue: string;
  deliveryStatus: 'pending' | 'delivered' | 'partial' | 'unknown';
  invoiceStatus: 'pending' | 'invoiced' | 'partial' | 'unknown';
  isOverdueDelivery: boolean;
  hasUnpaidInvoices: boolean;
}

// Invoice item type
interface InvoiceItem {
  id: number;
  name: string;
  partnerName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountResidual: number;
  amountTotal: number;
  isOverdue: boolean;
  overdueDays: number;
  invoiceOrigin: string | null;
}

interface SalesListItemProps {
  item: SOItem | InvoiceItem;
  itemType: 'so' | 'invoice';
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

function getQueueBadgeStyle(queue: string): string {
  const styles: Record<string, string> = {
    to_confirm: 'bg-yellow-100 text-yellow-700',
    to_deliver: 'bg-blue-100 text-blue-700',
    to_invoice: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
  };
  return styles[queue] || 'bg-gray-100 text-gray-700';
}

export function SalesListItem({ item, itemType, t }: SalesListItemProps) {
  const isSO = itemType === 'so';
  const soItem = item as SOItem;
  const invoiceItem = item as InvoiceItem;

  const getQueueLabel = (queue: string): string => {
    const labels: Record<string, string> = {
      to_confirm: t('sales.queueToConfirm'),
      to_deliver: t('sales.queueToDeliver'),
      to_invoice: t('sales.queueToInvoice'),
      completed: t('sales.queueCompleted'),
    };
    return labels[queue] || queue;
  };

  if (isSO) {
    return (
      <Link
        href={`/sales/${soItem.id}`}
        className="flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors"
        style={{ minHeight: 'var(--height-list-item-normal)' }}
      >
        {/* Icon */}
        <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0 mt-0.5">
          <FileText className="w-4 h-4 text-gray-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Customer + Status Badge */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">{soItem.partnerName}</h3>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${getQueueBadgeStyle(soItem.queue)}`}>
              {getQueueLabel(soItem.queue)}
            </span>
            {soItem.isOverdueDelivery && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 flex-shrink-0">
                {t('sales.overdueDelivery')}
              </span>
            )}
          </div>

          {/* Row 2: SO number, date, delivery status */}
          <p className="text-xs text-gray-500 truncate">
            {soItem.name} · {formatDate(soItem.dateOrder)}
            {soItem.deliveryStatus === 'pending' && soItem.queue === 'to_deliver' && (
              <span> · {t('sales.awaitingDelivery')}</span>
            )}
            {soItem.deliveryStatus === 'delivered' && (
              <span> · {t('sales.delivered')}</span>
            )}
          </p>
        </div>

        {/* Amount */}
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-gray-900 tabular-nums">{formatCompactAmount(soItem.amountTotal)}</p>
        </div>

        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      </Link>
    );
  }

  // Invoice item (to_invoice queue - AR)
  return (
    <div
      className="flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors cursor-pointer"
      style={{ minHeight: 'var(--height-list-item-normal)' }}
    >
      {/* Icon */}
      <div className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${invoiceItem.isOverdue ? 'bg-red-100' : 'bg-orange-100'}`}>
        <FileText className={`w-4 h-4 ${invoiceItem.isOverdue ? 'text-red-600' : 'text-orange-600'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Customer + Status/Overdue Badge */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium text-gray-900 truncate">{invoiceItem.partnerName}</h3>
          {invoiceItem.isOverdue ? (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 flex-shrink-0">
              {t('sales.overdueDays', { days: invoiceItem.overdueDays })}
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex-shrink-0">
              {t('sales.queueToInvoice')}
            </span>
          )}
        </div>

        {/* Row 2: Invoice number, due date, origin */}
        <p className="text-xs text-gray-500 truncate">
          {invoiceItem.name}
          {invoiceItem.invoiceDateDue && (
            <span> · {t('sales.dueDate')}: {formatDate(invoiceItem.invoiceDateDue)}</span>
          )}
          {invoiceItem.invoiceOrigin && <span> · {invoiceItem.invoiceOrigin}</span>}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className={`font-semibold tabular-nums ${invoiceItem.isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
          {formatCompactAmount(invoiceItem.amountResidual)}
        </p>
      </div>

      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
    </div>
  );
}
