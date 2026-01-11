'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, ChevronDown } from 'lucide-react';

export type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'overdue_first';

interface SortFilterBarProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showOverdueFilter: boolean;
  overdueOnly: boolean;
  onOverdueChange: (overdueOnly: boolean) => void;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

export function SortFilterBar({
  sortBy,
  onSortChange,
  showOverdueFilter,
  overdueOnly,
  onOverdueChange,
  t,
}: SortFilterBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortOptions: { value: SortOption; label: string; showForOverdue?: boolean }[] = [
    { value: 'date_desc', label: t('purchase.sortDateNewest') },
    { value: 'date_asc', label: t('purchase.sortDateOldest') },
    { value: 'amount_desc', label: t('purchase.sortAmountHigh') },
    { value: 'amount_asc', label: t('purchase.sortAmountLow') },
    { value: 'overdue_first', label: t('purchase.sortOverdueFirst'), showForOverdue: true },
  ];

  const visibleOptions = sortOptions.filter(
    (opt) => !opt.showForOverdue || showOverdueFilter
  );

  const currentLabel = visibleOptions.find((opt) => opt.value === sortBy)?.label || t('purchase.sort');

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Sort Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="truncate max-w-[120px]">{currentLabel}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isDropdownOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSortChange(option.value);
                  setIsDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                  sortBy === option.value ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Overdue Toggle - Only show for to_pay queue */}
      {showOverdueFilter && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => onOverdueChange(false)}
            className={`px-3 py-1.5 transition ${
              !overdueOnly
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('purchase.filterAll')}
          </button>
          <button
            onClick={() => onOverdueChange(true)}
            className={`px-3 py-1.5 transition ${
              overdueOnly
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('purchase.filterOverdueOnly')}
          </button>
        </div>
      )}
    </div>
  );
}
