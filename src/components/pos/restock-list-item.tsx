'use client';

import { Package } from 'lucide-react';
import {
  formatQty,
  formatDays,
  formatRate,
  getDaysStatusColor,
  getDaysStatusBadgeStyle,
} from '@/lib/restock-format';
import type { ReplenishmentItem } from '@/types';

interface RestockListItemProps {
  item: ReplenishmentItem;
  selected: boolean;
  onSelect: (id: number) => void;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

export function RestockListItem({
  item,
  selected,
  onSelect,
  t,
}: RestockListItemProps) {
  const daysInfo = formatDays(item.daysRemaining);

  return (
    <div
      className={`p-3 border-b border-gray-100 last:border-b-0 ${
        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      {/* Row 1: Checkbox + Name + Status Badge */}
      <div className="flex items-center gap-3 mb-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(item.id)}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-medium text-gray-900 truncate">{item.name}</span>
          </div>
          <span className="text-xs text-gray-500">{item.unit}</span>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${getDaysStatusBadgeStyle(
            daysInfo.status
          )}`}
        >
          {daysInfo.status === 'critical' && t('critical')}
          {daysInfo.status === 'warning' && t('warning')}
          {daysInfo.status === 'normal' && t('normal')}
        </span>
      </div>

      {/* Row 2: Key metrics (Days + Suggested) */}
      <div className="flex items-center justify-between pl-8 mb-1">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-gray-500 block">{t('daysRemaining')}</span>
            <span className={`text-lg font-bold ${getDaysStatusColor(daysInfo.status)}`}>
              {daysInfo.text}
            </span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block">{t('suggestedQty')}</span>
            <span className="text-lg font-bold text-blue-600">
              {formatQty(item.suggestedQty, item.unit)}
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Secondary info (small gray text) */}
      <div className="pl-8 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          {t('currentStock')}: {formatQty(item.currentStock, item.unit)}
        </span>
        <span>
          {t('dailyUsage')}: {formatRate(item.avgDailyUsage, item.unit)}
        </span>
        <span>
          {t('minMaxStock')}: {formatQty(item.minStock, item.unit)} / {formatQty(item.maxStock, item.unit)}
        </span>
      </div>
    </div>
  );
}
