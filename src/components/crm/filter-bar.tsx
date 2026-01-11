'use client';

import { ArrowUpDown } from 'lucide-react';

export type SortOption = 'updated' | 'revenue_desc' | 'revenue_asc' | 'probability' | 'date';

interface FilterBarProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  t: (key: string) => string;
}

/**
 * CRM Filter Bar - Sort dropdown
 * Compact filter controls for the opportunity list
 */
export function CrmFilterBar({
  sortBy,
  onSortChange,
  t,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="text-sm text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer pr-6"
      >
        <option value="updated">{t('crm.sortByUpdated')}</option>
        <option value="revenue_desc">{t('crm.sortByRevenueDesc')}</option>
        <option value="revenue_asc">{t('crm.sortByRevenueAsc')}</option>
        <option value="probability">{t('crm.sortByProbability')}</option>
        <option value="date">{t('crm.sortByDate')}</option>
      </select>
    </div>
  );
}
