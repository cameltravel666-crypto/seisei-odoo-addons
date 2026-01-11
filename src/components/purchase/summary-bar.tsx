'use client';

import { formatCompactAmount } from '@/lib/purchase-format';

interface SummaryBarProps {
  count: number;
  amount: number;
  overdueCount?: number;
  queue: 'to_confirm' | 'to_receive' | 'to_pay' | 'completed';
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

export function SummaryBar({ count, amount, overdueCount = 0, queue, t }: SummaryBarProps) {
  const getQueueColor = () => {
    switch (queue) {
      case 'to_confirm':
        return 'bg-yellow-50 border-yellow-200';
      case 'to_receive':
        return 'bg-blue-50 border-blue-200';
      case 'to_pay':
        return overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div
      className={`px-4 rounded-lg border flex items-center ${getQueueColor()}`}
      style={{ height: 'var(--height-summary-bar)', minHeight: 'var(--height-summary-bar)' }}
    >
      <div className="flex items-center justify-between text-sm w-full">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">
            {count} {t('purchase.orders')}
          </span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">
            {t('purchase.total')} {formatCompactAmount(amount)}
          </span>
        </div>
        {queue === 'to_pay' && overdueCount > 0 && (
          <span className="text-red-600 font-medium">
            {t('purchase.overdue')} {overdueCount}
          </span>
        )}
      </div>
    </div>
  );
}
