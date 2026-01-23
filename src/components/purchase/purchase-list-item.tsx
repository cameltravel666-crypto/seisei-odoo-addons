'use client';

import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';
import { formatCompactAmount, formatDate, getQueueBadgeStyle } from '@/lib/purchase-format';
import { OcrStatusBadge, OcrCheckbox } from '@/components/ocr';

// PO item type
interface POItem {
  id: number;
  name: string;
  partnerName: string;
  dateOrder: string;
  amountTotal: number;
  queue: string;
  receiptStatus: 'pending' | 'received' | 'unknown';
  isOverdueDelivery: boolean;
  hasUnpaidBills: boolean;
}

// Bill item type
interface BillItem {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountResidual: number;
  amountTotal: number;
  isOverdue: boolean;
  overdueDays: number;
  invoiceOrigin: string | null;
  // OCR fields
  ocrStatus?: 'pending' | 'processing' | 'done' | 'failed';
  ocrConfidence?: number;
  ocrPages?: number;
  hasAttachment?: boolean;
}

interface PurchaseListItemProps {
  item: POItem | BillItem;
  itemType: 'po' | 'bill';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string;
  // OCR selection mode props
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  // Payment click handler (for bills)
  onPaymentClick?: (bill: BillItem) => void;
}

export function PurchaseListItem({
  item,
  itemType,
  t,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onPaymentClick,
}: PurchaseListItemProps) {
  const isPO = itemType === 'po';
  const poItem = item as POItem;
  const billItem = item as BillItem;

  const getQueueLabel = (queue: string): string => {
    const labels: Record<string, string> = {
      to_confirm: t('purchase.queueToConfirm'),
      to_receive: t('purchase.queueToReceive'),
      to_pay: t('purchase.queueToPay'),
      completed: t('purchase.queueCompleted'),
    };
    return labels[queue] || queue;
  };

  if (isPO) {
    return (
      <Link
        href={`/purchase/${poItem.id}`}
        className="flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors"
        style={{ minHeight: 'var(--height-list-item-normal)' }}
      >
        {/* Icon */}
        <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0 mt-0.5">
          <FileText className="w-4 h-4 text-gray-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Supplier + Status Badge */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">{poItem.partnerName}</h3>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${getQueueBadgeStyle(poItem.queue)}`}>
              {getQueueLabel(poItem.queue)}
            </span>
            {poItem.isOverdueDelivery && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 flex-shrink-0">
                {t('purchase.overdueDelivery')}
              </span>
            )}
          </div>

          {/* Row 2: PO number, date, etc */}
          <p className="text-xs text-gray-500 truncate">
            {poItem.name} · {formatDate(poItem.dateOrder)}
            {poItem.receiptStatus === 'pending' && poItem.queue === 'to_receive' && (
              <span> · {t('purchase.awaitingReceipt')}</span>
            )}
            {poItem.receiptStatus === 'received' && (
              <span> · {t('purchase.received')}</span>
            )}
          </p>
        </div>

        {/* Amount */}
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-gray-900 tabular-nums">{formatCompactAmount(poItem.amountTotal)}</p>
        </div>

        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      </Link>
    );
  }

  // Bill item (to_pay queue)
  const billContent = (
    <>
      {/* Selection checkbox */}
      {selectionMode && (
        <OcrCheckbox
          checked={isSelected}
          onChange={() => onToggleSelect?.(billItem.id)}
          disabled={!billItem.hasAttachment}
        />
      )}

      {/* Icon */}
      <div className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${billItem.isOverdue ? 'bg-red-100' : 'bg-orange-100'}`}>
        <FileText className={`w-4 h-4 ${billItem.isOverdue ? 'text-red-600' : 'text-orange-600'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Supplier + Status/Overdue Badge + OCR Status */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium text-gray-900 truncate">{billItem.partnerName}</h3>
          {billItem.isOverdue ? (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 flex-shrink-0">
              {t('purchase.overdueDays', { days: billItem.overdueDays })}
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex-shrink-0">
              {t('purchase.queueToPay')}
            </span>
          )}
          {/* OCR status badge */}
          {billItem.hasAttachment && billItem.ocrStatus && billItem.ocrStatus !== 'pending' && (
            <OcrStatusBadge
              status={billItem.ocrStatus}
              confidence={billItem.ocrConfidence}
              compact
              t={t}
            />
          )}
        </div>

        {/* Row 2: Bill number, due date, origin */}
        <p className="text-xs text-gray-500 truncate">
          {billItem.name}
          {billItem.invoiceDateDue && (
            <span> · {t('purchase.dueDate')}: {formatDate(billItem.invoiceDateDue)}</span>
          )}
          {billItem.invoiceOrigin && <span> · {billItem.invoiceOrigin}</span>}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className={`font-semibold tabular-nums ${billItem.isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
          {formatCompactAmount(billItem.amountResidual)}
        </p>
      </div>

      {!selectionMode && (
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      )}
    </>
  );

  if (selectionMode) {
    return (
      <div
        className={`flex items-start gap-3 p-3 transition-colors cursor-pointer ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
        style={{ minHeight: 'var(--height-list-item-normal)' }}
        onClick={() => billItem.hasAttachment && onToggleSelect?.(billItem.id)}
      >
        {billContent}
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors cursor-pointer"
      style={{ minHeight: 'var(--height-list-item-normal)' }}
      onClick={() => onPaymentClick?.(billItem)}
    >
      {billContent}
    </div>
  );
}

// Export BillItem type for external use
export type { BillItem };
