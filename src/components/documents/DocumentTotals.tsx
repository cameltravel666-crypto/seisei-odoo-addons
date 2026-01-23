'use client';

/**
 * DocumentTotals Component
 *
 * Unified totals card for document detail pages featuring:
 * - Subtotal, tax, and total display
 * - Edit mode total calculation (live)
 * - Residual amount for invoices
 *
 * Usage:
 * ```tsx
 * <DocumentTotals
 *   totals={{ untaxed: 10000, tax: 1000, total: 11000 }}
 *   isEditMode={editMode}
 *   editedTotal={calculatedTotal}
 * />
 * ```
 */
import type { ReactNode } from 'react';

interface DocumentTotalsProps {
  totals: {
    untaxed: number;
    tax: number;
    total: number;
    residual?: number; // For invoices
  };
  isEditMode?: boolean;
  /** Calculated total when in edit mode */
  editedTotal?: number;
  /** Translation function */
  t: (key: string) => string;
  /** Currency formatter */
  formatCurrency?: (value: number) => string;
  /** Tax label (e.g., "消費税", "VAT") */
  taxLabel?: string;
  /** Show residual amount (for invoices) */
  showResidual?: boolean;
  /** Custom content after totals */
  children?: ReactNode;
}

export function DocumentTotals({
  totals,
  isEditMode = false,
  editedTotal,
  t,
  formatCurrency = (v) => `¥${v.toLocaleString()}`,
  taxLabel,
  showResidual = false,
  children,
}: DocumentTotalsProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
      <div className="space-y-2">
        {isEditMode ? (
          // Edit mode: show only calculated total
          <div className="flex justify-between text-base font-bold">
            <span className="text-gray-900">{t('documents.total')}</span>
            <span className="text-blue-600">
              {formatCurrency(editedTotal ?? totals.total)}
            </span>
          </div>
        ) : (
          // View mode: show full breakdown
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('documents.subtotal')}</span>
              <span className="text-gray-900">{formatCurrency(totals.untaxed)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{taxLabel || t('documents.tax')}</span>
              <span className="text-gray-900">{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
              <span className="text-gray-900">{t('documents.total')}</span>
              <span className="text-gray-900">{formatCurrency(totals.total)}</span>
            </div>

            {/* Residual amount for invoices */}
            {showResidual && totals.residual !== undefined && totals.residual > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                <span className="text-orange-600">{t('documents.residual')}</span>
                <span className="text-orange-600 font-medium">
                  {formatCurrency(totals.residual)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {children}
    </div>
  );
}

/**
 * Notes card for documents
 */
export function DocumentNotes({
  notes,
  isEditMode = false,
  onChange,
  t,
  placeholder,
}: {
  notes: string | null;
  isEditMode?: boolean;
  onChange?: (notes: string) => void;
  t: (key: string) => string;
  placeholder?: string;
}) {
  // Don't show anything if no notes and not in edit mode
  if (!notes && !isEditMode) return null;

  if (isEditMode) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <label className="block text-xs text-gray-500 mb-2">
          {t('documents.notes')}
        </label>
        <textarea
          value={notes || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder || t('documents.notesPlaceholder')}
          rows={3}
          className="input w-full resize-none"
          style={{ minHeight: '88px' }}
        />
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-3">
      <div className="text-xs text-yellow-700 mb-1">{t('documents.notes')}</div>
      <div className="text-sm text-yellow-900 whitespace-pre-wrap">{notes}</div>
    </div>
  );
}
