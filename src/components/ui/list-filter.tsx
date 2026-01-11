'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar } from 'lucide-react';

export interface StatusTab {
  value: string;
  label: string;
}

export interface SummaryCard {
  value: string | number;
  label: string;
  color?: 'gray' | 'blue' | 'green' | 'red' | 'orange';
}

interface DateFilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
}

interface StatusTabsProps {
  tabs: StatusTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
}

interface SummaryCardsProps {
  cards: SummaryCard[];
}

// Format price with compact mode for large numbers
export function formatPriceCompact(price: number, compact = false): string {
  if (compact && price >= 10000) {
    return `¥${(price / 10000).toFixed(1)}万`;
  }
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(price);
}

type QuickDateType = 'today' | 'week' | 'month' | 'custom';

export function DateFilterBar({ dateFrom, dateTo, onDateChange }: DateFilterBarProps) {
  const t = useTranslations();
  const [activeQuick, setActiveQuick] = useState<QuickDateType>('month');

  const setQuickDate = (range: QuickDateType) => {
    const today = new Date();
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    setActiveQuick(range);

    switch (range) {
      case 'today':
        onDateChange(formatDateStr(today), formatDateStr(today));
        break;
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        onDateChange(formatDateStr(weekStart), formatDateStr(today));
        break;
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        onDateChange(formatDateStr(monthStart), formatDateStr(today));
        break;
      }
      case 'custom':
        // Keep current dates, just show picker
        break;
    }
  };

  const periods: QuickDateType[] = ['today', 'week', 'month', 'custom'];

  return (
    <div className="space-y-2">
      {/* Segment Control */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setQuickDate(p)}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                activeQuick === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
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
      {activeQuick === 'custom' && (
        <div className="flex items-center gap-2 pl-6">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateChange(e.target.value, dateTo)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <span className="text-gray-400">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateChange(dateFrom, e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      )}
    </div>
  );
}

export function StatusTabs({ tabs, activeTab, onTabChange }: StatusTabsProps) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === tab.value
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SummaryCards({ cards }: SummaryCardsProps) {
  const colorClasses: Record<string, string> = {
    gray: 'text-gray-900',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-500',
    orange: 'text-orange-600',
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {cards.map((card, index) => (
        <div key={index} className="card p-2 text-center">
          <p className={`text-lg font-bold ${colorClasses[card.color || 'gray']}`}>
            {card.value}
          </p>
          <p className="text-xs text-gray-500">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
