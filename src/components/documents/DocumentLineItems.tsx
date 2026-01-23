'use client';

/**
 * DocumentLineItems Component
 *
 * Unified line items display and editing component featuring:
 * - Mobile: list rows, tap opens editor sheet
 * - Desktop: table rows, click opens modal
 * - Collapsible in view mode
 * - Product search and add in edit mode
 * - Swipe actions on mobile (future enhancement)
 *
 * Usage:
 * ```tsx
 * <DocumentLineItems
 *   lines={document.lines}
 *   isEditMode={editMode}
 *   onLineClick={(line) => setEditingLine(line)}
 *   onAddProduct={(product) => addLine(product)}
 *   onRemoveLine={(lineId) => removeLine(lineId)}
 * />
 * ```
 */
import { useState, ReactNode } from 'react';
import { ChevronUp, ChevronDown, Search, Plus, Trash2, MoreHorizontal } from 'lucide-react';
import type { DocumentLine } from '@/types/document';

interface Product {
  id: number;
  name: string;
  code: string | null;
  price: number;
  uom: string;
}

interface DocumentLineItemsProps {
  lines: DocumentLine[];
  isEditMode?: boolean;
  /** Called when a line is tapped/clicked to edit */
  onLineClick?: (line: DocumentLine) => void;
  /** Called to remove a line in edit mode */
  onRemoveLine?: (lineId: number) => void;
  /** Translation function */
  t: (key: string) => string;
  /** Currency formatter */
  formatCurrency?: (value: number) => string;
  /** Title text */
  title?: string;
  /** Product search component or handler */
  productSearchSlot?: ReactNode;
  /** Show quantity received/delivered info */
  showFulfillmentInfo?: boolean;
  /** Custom row renderer */
  renderRow?: (line: DocumentLine, isEditMode: boolean) => ReactNode;
}

export function DocumentLineItems({
  lines,
  isEditMode = false,
  onLineClick,
  onRemoveLine,
  t,
  formatCurrency = (v) => `¥${v.toLocaleString()}`,
  title,
  productSearchSlot,
  showFulfillmentInfo = false,
  renderRow,
}: DocumentLineItemsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [lineMenuOpen, setLineMenuOpen] = useState<number | null>(null);

  // Default row renderer
  const defaultRenderRow = (line: DocumentLine) => {
    // In edit mode, show clickable rows with remove option
    if (isEditMode) {
      return (
        <div
          key={line.id}
          className="px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
          onClick={() => onLineClick?.(line)}
        >
          <div className="flex justify-between items-start gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 text-sm truncate">
                {line.name || line.productName}
              </div>
              {line.name && line.name !== line.productName && (
                <div className="text-xs text-gray-400 truncate">{line.productName}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">
                {formatCurrency(line.quantity * line.priceUnit)}
              </span>

              {/* Actions menu for line */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLineMenuOpen(lineMenuOpen === line.id ? null : line.id);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
                  style={{ minWidth: '36px', minHeight: '36px' }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {lineMenuOpen === line.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLineMenuOpen(null);
                      }}
                    />
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveLine?.(line.id);
                          setLineMenuOpen(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        style={{ minHeight: '44px' }}
                      >
                        <Trash2 className="w-4 h-4" />
                        {t('common.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {t('documents.quantity')} {line.quantity}
            {line.uom && ` ${line.uom}`} × {formatCurrency(line.priceUnit)}
          </div>
        </div>
      );
    }

    // View mode - read-only rows
    return (
      <div
        key={line.id}
        className="px-4 py-3"
        onClick={() => onLineClick?.(line)}
      >
        <div className="flex justify-between items-start gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm truncate">
              {line.name || line.productName}
            </div>
            {line.name && line.name !== line.productName && (
              <div className="text-xs text-gray-400 truncate">{line.productName}</div>
            )}
          </div>
          <div className="font-bold text-gray-900">
            {formatCurrency(line.subtotal)}
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {t('documents.quantity')} {line.quantity}
          {line.uom && ` ${line.uom}`} × {formatCurrency(line.priceUnit)}
        </div>

        {/* Fulfillment info (delivered/received quantities) */}
        {showFulfillmentInfo && (
          <div className="text-xs text-gray-400 mt-1">
            {line.qtyReceived !== undefined && (
              <span>{t('documents.received')}: {line.qtyReceived}</span>
            )}
            {line.qtyDelivered !== undefined && (
              <span>{t('documents.delivered')}: {line.qtyDelivered}</span>
            )}
            {line.qtyInvoiced !== undefined && (
              <span className="ml-2">{t('documents.invoiced')}: {line.qtyInvoiced}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-3">
      {isEditMode ? (
        <>
          {/* Product search slot in edit mode */}
          {productSearchSlot && (
            <div className="p-3 border-b border-gray-100">
              {productSearchSlot}
            </div>
          )}

          {/* Lines list */}
          {lines.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-sm">{t('documents.noItems')}</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {lines.map((line) =>
                renderRow ? renderRow(line, true) : defaultRenderRow(line)
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Collapsible header in view mode */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-4 text-left"
            style={{ minHeight: '44px' }}
          >
            <span className="font-medium text-gray-900">
              {title || t('documents.lineItems')} ({lines.length})
            </span>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {/* Lines list (collapsible) */}
          {isExpanded && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {lines.map((line) =>
                renderRow ? renderRow(line, false) : defaultRenderRow(line)
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Product search input for adding products to lines
 */
export function ProductSearchInput({
  value,
  onChange,
  onFocus,
  placeholder,
  isLoading = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder || 'Search products...'}
        className="input w-full pl-9 pr-16 py-2 text-sm"
        style={{ minHeight: '44px' }}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition"
        style={{ minHeight: '32px' }}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Product search dropdown
 */
export function ProductSearchDropdown({
  products,
  isLoading,
  onSelect,
  onClose,
  t,
  formatCurrency = (v) => `¥${v.toLocaleString()}`,
}: {
  products: Product[];
  isLoading: boolean;
  onSelect: (product: Product) => void;
  onClose: () => void;
  t: (key: string) => string;
  formatCurrency?: (value: number) => string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 text-center text-gray-500 text-sm">{t('common.loading')}</div>
        ) : products.length === 0 ? (
          <div className="p-3 text-center text-gray-500 text-sm">{t('common.noData')}</div>
        ) : (
          products.map((product) => (
            <button
              key={product.id}
              onClick={() => {
                onSelect(product);
                onClose();
              }}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
              style={{ minHeight: '44px' }}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-900 text-sm truncate">
                  {product.name}
                </span>
                <span className="text-gray-600 text-sm ml-2">
                  {formatCurrency(product.price)}
                </span>
              </div>
              {product.code && (
                <div className="text-xs text-gray-400">{product.code}</div>
              )}
            </button>
          ))
        )}
      </div>
    </>
  );
}
