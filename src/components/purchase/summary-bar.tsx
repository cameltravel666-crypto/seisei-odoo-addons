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
  // Use unified muted background for consistency (per next.txt: avoid yellow that jumps from blue-white palette)
  const getQueueStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      height: 'var(--height-summary-bar)',
      minHeight: 'var(--height-summary-bar)',
      backgroundColor: 'var(--color-bg-muted)',
      borderColor: 'var(--color-border-light)',
    };

    // Only highlight danger state for overdue payments
    if (queue === 'to_pay' && overdueCount > 0) {
      return {
        ...base,
        backgroundColor: 'var(--color-danger-bg)',
        borderColor: 'var(--color-danger-bg)',
      };
    }

    return base;
  };

  return (
    <div
      className="px-[var(--space-4)] rounded-[var(--radius-md)] border flex items-center"
      style={getQueueStyle()}
    >
      <div className="flex items-center justify-between text-body w-full">
        <div className="flex items-center gap-[var(--space-2)]">
          <span className="font-medium text-[var(--color-text-primary)] tabular-nums">
            {count} {t('purchase.orders')}
          </span>
          <span className="text-[var(--color-text-tertiary)]">·</span>
          <span className="text-[var(--color-text-secondary)] tabular-nums">
            {t('purchase.total')} {formatCompactAmount(amount)}
          </span>
        </div>
        {queue === 'to_pay' && overdueCount > 0 && (
          <span className="text-[var(--color-danger)] font-medium tabular-nums">
            {t('purchase.overdue')} {overdueCount}
          </span>
        )}
      </div>
    </div>
  );
}
