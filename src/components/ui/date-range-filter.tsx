'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Lock, AlertCircle, Info } from 'lucide-react';
import Link from 'next/link';
import { useIsIOSAppStoreBuild } from '@/lib/appChannel';

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
  /**
   * Maximum number of days allowed for custom date range (0 = unlimited)
   * When exceeded, shows a warning and clamps the date range
   */
  maxCustomDays?: number;
  /**
   * Whether to show upgrade prompt when limit is hit
   */
  showUpgradeOnLimit?: boolean;
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
  maxCustomDays = 0,
  showUpgradeOnLimit = true,
}: DateRangeFilterProps) {
  const t = useTranslations();
  const isIOSAppStore = useIsIOSAppStoreBuild();

  const periods: PeriodType[] = ['today', 'week', 'month', 'custom'];

  const handlePeriodChange = (period: PeriodType) => {
    onChange(period);
  };

  // Calculate if date range exceeds limit
  const dateRangeInfo = useMemo(() => {
    if (!customFrom || !customTo || maxCustomDays === 0) {
      return { days: 0, exceedsLimit: false };
    }

    const from = new Date(customFrom);
    const to = new Date(customTo);
    const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      days,
      exceedsLimit: days > maxCustomDays,
    };
  }, [customFrom, customTo, maxCustomDays]);

  // Handle date change with limit check
  const handleFromChange = (date: string) => {
    if (!onCustomFromChange) return;

    if (maxCustomDays > 0 && customTo) {
      const from = new Date(date);
      const to = new Date(customTo);
      const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (days > maxCustomDays) {
        // Clamp from date to maxCustomDays before to date
        const clampedFrom = new Date(to);
        clampedFrom.setDate(clampedFrom.getDate() - maxCustomDays + 1);
        onCustomFromChange(clampedFrom.toISOString().split('T')[0]);
        return;
      }
    }

    onCustomFromChange(date);
  };

  const handleToChange = (date: string) => {
    if (!onCustomToChange) return;

    if (maxCustomDays > 0 && customFrom) {
      const from = new Date(customFrom);
      const to = new Date(date);
      const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (days > maxCustomDays) {
        // Clamp to date to maxCustomDays after from date
        const clampedTo = new Date(from);
        clampedTo.setDate(clampedTo.getDate() + maxCustomDays - 1);
        onCustomToChange(clampedTo.toISOString().split('T')[0]);
        return;
      }
    }

    onCustomToChange(date);
  };

  return (
    <div className={`flex flex-col gap-[var(--space-2)] ${className}`}>
      {/* Period Selector - Fixed Height Segments */}
      <div className="flex items-center gap-[var(--space-2)]">
        {showIcon && (
          <Calendar className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
        )}
        <div
          className="flex rounded-[var(--radius-md)] border border-[var(--color-border-default)] overflow-hidden flex-1"
          style={{ height: 'var(--height-segment)', minHeight: 'var(--height-segment)' }}
        >
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`flex-1 px-[var(--space-3)] text-body-sm font-medium transition-colors flex items-center justify-center ${
                value === p
                  ? 'bg-[var(--color-primary)] text-[var(--color-text-inverse)]'
                  : 'bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              }`}
              style={{ height: 'var(--height-segment)' }}
            >
              {p === 'today' && t('search.today')}
              {p === 'week' && t('search.thisWeek')}
              {p === 'month' && t('search.thisMonth')}
              {p === 'custom' && (
                <span className="flex items-center gap-1">
                  {t('search.custom')}
                  {maxCustomDays > 0 && (
                    <span className="text-[10px] opacity-70">({maxCustomDays}天)</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range */}
      {value === 'custom' && onCustomFromChange && onCustomToChange && (
        <div className={`space-y-2 ${showIcon ? 'pl-6' : ''}`}>
          <div className="flex items-center gap-[var(--space-2)]">
            <input
              type="date"
              value={customFrom || ''}
              onChange={(e) => handleFromChange(e.target.value)}
              className="input input-sm flex-1"
            />
            <span className="text-[var(--color-text-tertiary)]">~</span>
            <input
              type="date"
              value={customTo || ''}
              onChange={(e) => handleToChange(e.target.value)}
              className="input input-sm flex-1"
            />
          </div>

          {/* Limit warning */}
          {maxCustomDays > 0 && showUpgradeOnLimit && dateRangeInfo.days >= maxCustomDays && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>基础版最多 {maxCustomDays} 天</span>
              {/* Hide upgrade link in iOS App Store builds */}
              {!isIOSAppStore && (
                <Link
                  href="/settings/subscription"
                  className="text-blue-600 hover:underline ml-auto flex items-center gap-0.5"
                >
                  <Lock className="w-3 h-3" />
                  解锁
                </Link>
              )}
            </div>
          )}
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
