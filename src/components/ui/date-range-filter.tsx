'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar } from 'lucide-react';

export type PeriodType = 'today' | 'week' | 'month' | 'custom';

interface DateRangeFilterProps {
  value: PeriodType;
  onChange: (period: PeriodType) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFromChange?: (date: string) => void;
  onCustomToChange?: (date: string) => void;
  showIcon?: boolean;
  className?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  showIcon = true,
  className = '',
}: DateRangeFilterProps) {
  const t = useTranslations();

  const periods: PeriodType[] = ['today', 'week', 'month', 'custom'];

  const handlePeriodChange = (period: PeriodType) => {
    onChange(period);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Period Selector - Fixed Height Segments */}
      <div className="flex items-center gap-2">
        {showIcon && (
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <div
          className="flex rounded-lg border border-gray-200 overflow-hidden flex-1"
          style={{ height: 'var(--height-segment)', minHeight: 'var(--height-segment)' }}
        >
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`flex-1 px-3 text-body-sm font-medium transition-colors flex items-center justify-center ${
                value === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={{ height: 'var(--height-segment)' }}
            >
              {p === 'today' && t('search.today')}
              {p === 'week' && t('search.thisWeek')}
              {p === 'month' && t('search.thisMonth')}
              {p === 'custom' && t('search.custom')}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range */}
      {value === 'custom' && onCustomFromChange && onCustomToChange && (
        <div className={`flex items-center gap-2 ${showIcon ? 'pl-6' : ''}`}>
          <input
            type="date"
            value={customFrom || ''}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="input-sm flex-1"
          />
          <span className="text-gray-400">~</span>
          <input
            type="date"
            value={customTo || ''}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="input-sm flex-1"
          />
        </div>
      )}
    </div>
  );
}

// Helper hook for managing date range state
export function useDateRangeFilter(initialPeriod: PeriodType = 'month') {
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customTo, setCustomTo] = useState(() =>
    new Date().toISOString().split('T')[0]
  );

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
        return { from: customFrom, to: customTo };
    }
  };

  return {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateRange: getDateRange(),
  };
}
