'use client';

import { formatCompactAmount } from '@/lib/purchase-format';

interface CrmSummaryBarProps {
  totalLeads: number;
  expectedRevenue: number;
  wonRevenue: number;
  newThisMonth: number;
  t: (key: string) => string;
}

/**
 * CRM Summary Bar - Compact KPI display
 * Replaces 4 separate KPI cards with a single summary line
 */
export function CrmSummaryBar({
  totalLeads,
  expectedRevenue,
  wonRevenue,
  newThisMonth,
  t,
}: CrmSummaryBarProps) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
      <div className="flex items-center justify-between gap-4 overflow-x-auto text-sm">
        {/* Total Leads */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-gray-500">{t('crm.totalLeads')}</span>
          <span className="font-semibold text-gray-900 tabular-nums">{totalLeads}</span>
        </div>

        <span className="text-gray-300">·</span>

        {/* Expected Revenue */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-gray-500">{t('crm.expectedRevenue')}</span>
          <span className="font-semibold text-gray-900 tabular-nums">{formatCompactAmount(expectedRevenue)}</span>
        </div>

        <span className="text-gray-300">·</span>

        {/* Won Revenue - highlighted if > 0 */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-gray-500">{t('crm.wonRevenue')}</span>
          <span className={`font-semibold tabular-nums ${wonRevenue > 0 ? 'text-blue-600' : 'text-gray-900'}`}>
            {formatCompactAmount(wonRevenue)}
          </span>
        </div>

        <span className="text-gray-300">·</span>

        {/* New This Month */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-gray-500">{t('crm.newThisMonth')}</span>
          <span className="font-semibold text-gray-900 tabular-nums">{newThisMonth}</span>
        </div>
      </div>
    </div>
  );
}
