'use client';

/**
 * DocumentSummaryCard Component
 *
 * Unified summary card for document detail pages featuring:
 * - Core fields in a grid layout
 * - Same visual layout in view & edit mode (minimal reflow)
 * - Swap read-only text for inputs in-place when editing
 *
 * Usage:
 * ```tsx
 * <DocumentSummaryCard
 *   fields={[
 *     { key: 'partner', label: 'Supplier', value: 'ABC Corp', type: 'text' },
 *     { key: 'date', label: 'Order Date', value: '2024-01-15', type: 'date' },
 *   ]}
 *   isEditMode={editMode}
 *   onFieldChange={(key, value) => handleFieldChange(key, value)}
 * />
 * ```
 */
import { ReactNode } from 'react';
import { Search, Check } from 'lucide-react';

export interface SummaryFieldConfig {
  key: string;
  label: string;
  value: string | number | null;
  type?: 'text' | 'date' | 'currency' | 'user' | 'custom';
  editable?: boolean;
  /** For searchable fields (partner selection) */
  searchable?: boolean;
  /** Placeholder for input */
  placeholder?: string;
  /** Custom render function */
  render?: () => ReactNode;
  /** For searchable fields: is a value selected? */
  isSelected?: boolean;
  /** Width hint: 'half' (50%) or 'full' (100%) */
  width?: 'half' | 'full';
}

interface DocumentSummaryCardProps {
  fields: SummaryFieldConfig[];
  isEditMode?: boolean;
  onFieldChange?: (key: string, value: string | number) => void;
  /** For searchable fields */
  onFieldFocus?: (key: string) => void;
  /** Currency formatter */
  formatCurrency?: (value: number) => string;
  /** Date formatter */
  formatDate?: (value: string) => string;
  /** Additional content after fields */
  children?: ReactNode;
}

export function DocumentSummaryCard({
  fields,
  isEditMode = false,
  onFieldChange,
  onFieldFocus,
  formatCurrency = (v) => `¥${v.toLocaleString()}`,
  formatDate = (v) => new Date(v).toLocaleDateString('ja-JP'),
  children,
}: DocumentSummaryCardProps) {
  const renderFieldValue = (field: SummaryFieldConfig) => {
    const value = field.value;

    if (field.type === 'custom' && field.render) {
      return field.render();
    }

    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400">-</span>;
    }

    switch (field.type) {
      case 'currency':
        return formatCurrency(typeof value === 'number' ? value : parseFloat(String(value)));
      case 'date':
        return formatDate(String(value));
      default:
        return <span className="font-medium text-gray-900">{value}</span>;
    }
  };

  const renderFieldInput = (field: SummaryFieldConfig) => {
    if (!field.editable) {
      return (
        <div className="font-medium text-gray-900 py-2">
          {renderFieldValue(field)}
        </div>
      );
    }

    // Searchable field (like partner selection)
    if (field.searchable) {
      return (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={String(field.value || '')}
            onChange={(e) => onFieldChange?.(field.key, e.target.value)}
            onFocus={() => onFieldFocus?.(field.key)}
            placeholder={field.placeholder}
            className="input w-full pl-9 py-2 text-sm"
            style={{ minHeight: '44px' }}
          />
          {field.isSelected && (
            <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
          )}
        </div>
      );
    }

    // Date input
    if (field.type === 'date') {
      return (
        <input
          type="date"
          value={String(field.value || '')}
          onChange={(e) => onFieldChange?.(field.key, e.target.value)}
          className="input w-full py-2 text-sm"
          style={{ minHeight: '44px' }}
        />
      );
    }

    // Text input
    return (
      <input
        type="text"
        value={String(field.value || '')}
        onChange={(e) => onFieldChange?.(field.key, e.target.value)}
        placeholder={field.placeholder}
        className="input w-full py-2 text-sm"
        style={{ minHeight: '44px' }}
      />
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="grid grid-cols-2 gap-4">
        {fields.map((field) => (
          <div
            key={field.key}
            className={field.width === 'full' ? 'col-span-2' : ''}
          >
            <div className="text-xs text-gray-500 mb-1">{field.label}</div>
            {isEditMode && field.editable
              ? renderFieldInput(field)
              : <div className="font-medium text-gray-900">{renderFieldValue(field)}</div>
            }
          </div>
        ))}
      </div>

      {/* Additional content (status indicators, etc.) */}
      {children}
    </div>
  );
}

/**
 * Status indicators section for document summary
 */
export function DocumentStatusIndicators({
  indicators,
}: {
  indicators: {
    icon: ReactNode;
    label: string;
    value: string;
  }[];
}) {
  if (indicators.length === 0) return null;

  return (
    <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
      {indicators.map((indicator, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">{indicator.icon}</span>
          <span className="text-gray-600">
            {indicator.label}: {indicator.value}
          </span>
        </div>
      ))}
    </div>
  );
}
