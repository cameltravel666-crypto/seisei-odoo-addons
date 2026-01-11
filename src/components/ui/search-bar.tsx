'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X, ChevronDown, Star, Plus } from 'lucide-react';

export interface FilterOption {
  field: string;
  label: string;
  value: string;
  type?: 'status' | 'date' | 'text' | 'number';
}

export interface FilterGroup {
  id: string;
  label: string;
  field: string;
  options: { value: string; label: string }[];
}

export interface SavedFilter {
  id: string;
  name: string;
  filters: FilterOption[];
}

interface SearchBarProps {
  placeholder?: string;
  filterGroups?: FilterGroup[];
  savedFilters?: SavedFilter[];
  activeFilters?: FilterOption[];
  onSearch?: (query: string) => void;
  onFilterChange?: (filters: FilterOption[]) => void;
  onSaveFilter?: (name: string, filters: FilterOption[]) => void;
  onDeleteSavedFilter?: (id: string) => void;
}

export function SearchBar({
  placeholder,
  filterGroups = [],
  savedFilters = [],
  activeFilters = [],
  onSearch,
  onFilterChange,
  onSaveFilter,
  onDeleteSavedFilter,
}: SearchBarProps) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterOption[]>(activeFilters);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filterName, setFilterName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setActiveGroup(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(query);
  };

  const addFilter = (group: FilterGroup, option: { value: string; label: string }) => {
    const existingIndex = filters.findIndex(f => f.field === group.field);
    let newFilters: FilterOption[];

    if (existingIndex >= 0) {
      newFilters = filters.map((f, i) =>
        i === existingIndex ? { ...f, value: option.value, label: option.label } : f
      );
    } else {
      newFilters = [...filters, { field: group.field, label: option.label, value: option.value }];
    }

    setFilters(newFilters);
    onFilterChange?.(newFilters);
    setIsDropdownOpen(false);
    setActiveGroup(null);
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const clearAllFilters = () => {
    setFilters([]);
    setQuery('');
    onFilterChange?.([]);
    onSearch?.('');
  };

  const applySavedFilter = (saved: SavedFilter) => {
    setFilters(saved.filters);
    onFilterChange?.(saved.filters);
    setIsDropdownOpen(false);
  };

  const handleSaveFilter = () => {
    if (filterName.trim() && filters.length > 0) {
      onSaveFilter?.(filterName.trim(), filters);
      setFilterName('');
      setShowSaveDialog(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Search Input - Fixed height using design token */}
      <form onSubmit={handleSearch} className="relative">
        <div
          className="flex items-center bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-transparent"
          style={{ height: 'var(--height-input)', minHeight: 'var(--height-input)' }}
        >
          <Search className="w-5 h-5 text-[var(--color-text-placeholder)] ml-[var(--space-3)] flex-shrink-0" />

          {/* Active Filter Chips - Horizontal scroll, no wrap to prevent height change */}
          <div className="flex items-center gap-[var(--space-1)] px-[var(--space-2)] overflow-x-auto scrollbar-hide flex-1">
            {filters.map((filter, index) => (
              <span
                key={`${filter.field}-${index}`}
                className="chip chip-sm chip-primary flex-shrink-0"
              >
                {filter.label}
                <button
                  type="button"
                  onClick={() => removeFilter(index)}
                  className="hover:bg-[var(--color-primary)] hover:bg-opacity-20 rounded-full p-0.5 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={filters.length === 0 ? (placeholder || t('common.search')) : ''}
              className="flex-1 min-w-[100px] outline-none text-[var(--font-body-size)] leading-[var(--font-body-lh)] bg-transparent"
            />
          </div>

        </div>
      </form>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Saved Filters */}
          {savedFilters.length > 0 && (
            <div className="p-2 border-b border-gray-100">
              <div className="text-xs font-medium text-gray-500 px-2 mb-1">{t('search.savedFilters')}</div>
              {savedFilters.map((saved) => (
                <div key={saved.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 rounded">
                  <button
                    onClick={() => applySavedFilter(saved)}
                    className="flex items-center gap-2 text-sm text-gray-700"
                  >
                    <Star className="w-4 h-4 text-yellow-500" />
                    {saved.name}
                  </button>
                  {onDeleteSavedFilter && (
                    <button
                      onClick={() => onDeleteSavedFilter(saved.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Filter Groups */}
          <div className="p-2">
            <div className="text-xs font-medium text-gray-500 px-2 mb-1">{t('search.filterBy')}</div>
            {filterGroups.map((group) => (
              <div key={group.id} className="relative">
                <button
                  onClick={() => setActiveGroup(activeGroup === group.id ? null : group.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 rounded text-sm text-gray-700"
                >
                  {group.label}
                  <ChevronDown className={`w-4 h-4 transition ${activeGroup === group.id ? 'rotate-180' : ''}`} />
                </button>

                {activeGroup === group.id && (
                  <div className="ml-4 mt-1 border-l-2 border-gray-100 pl-2">
                    {group.options.map((option) => {
                      const isActive = filters.some(f => f.field === group.field && f.value === option.value);
                      return (
                        <button
                          key={option.value}
                          onClick={() => addFilter(group, option)}
                          className={`w-full text-left px-2 py-1.5 text-sm rounded ${
                            isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                          }`}
                        >
                          {isActive && <span className="mr-1">✓</span>}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save Current Filter */}
          {filters.length > 0 && onSaveFilter && (
            <div className="p-2 border-t border-gray-100">
              {showSaveDialog ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder={t('search.filterName')}
                    className="flex-1 px-2 py-1 text-sm border rounded"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveFilter}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    className="px-2 py-1 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded w-full"
                >
                  <Plus className="w-4 h-4" />
                  {t('search.saveFilter')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
