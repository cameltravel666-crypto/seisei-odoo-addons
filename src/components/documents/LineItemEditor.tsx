'use client';

/**
 * LineItemEditor Component
 *
 * A responsive editor for document line items that:
 * - Shows as a bottom sheet on mobile (touch-friendly)
 * - Shows as a modal on desktop
 * - Includes user-editable name field
 * - Has quantity stepper with 44x44 touch targets
 * - Delete action with confirmation (no tiny trash icons)
 *
 * Usage:
 * ```tsx
 * <LineItemEditor
 *   line={selectedLine}
 *   onSave={(updates) => handleUpdateLine(updates)}
 *   onDelete={() => handleDeleteLine()}
 *   onClose={() => setSelectedLine(null)}
 * />
 * ```
 */
import { useState, useEffect, useRef } from 'react';
import { X, Minus, Plus, Trash2, Loader2 } from 'lucide-react';
import type { DocumentLine, LineEditPayload } from '@/types/document';

interface LineItemEditorProps {
  /** The line item being edited */
  line: DocumentLine | null;
  /** Callback to save changes */
  onSave: (lineId: number, updates: LineEditPayload) => void;
  /** Callback to delete the line */
  onDelete: (lineId: number) => void;
  /** Callback to close the editor */
  onClose: () => void;
  /** Whether we're in saving state */
  isSaving?: boolean;
  /** Translation function */
  t: (key: string) => string;
  /** Currency formatter */
  formatCurrency?: (value: number) => string;
  /** Maximum name length */
  maxNameLength?: number;
}

export function LineItemEditor({
  line,
  onSave,
  onDelete,
  onClose,
  isSaving = false,
  t,
  formatCurrency = (v) => `¥${v.toLocaleString()}`,
  maxNameLength = 120,
}: LineItemEditorProps) {
  // Local state for editing
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [priceUnit, setPriceUnit] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Initialize values when line changes
  useEffect(() => {
    if (line) {
      setName(line.name || line.productName || '');
      setQuantity(line.quantity);
      setPriceUnit(line.priceUnit);
      setShowDeleteConfirm(false);
    }
  }, [line]);

  if (!line) return null;

  const subtotal = quantity * priceUnit;
  const hasChanges =
    name !== (line.name || line.productName || '') ||
    quantity !== line.quantity ||
    priceUnit !== line.priceUnit;

  const handleSave = () => {
    onSave(line.id, {
      name: name.trim(),
      quantity,
      priceUnit,
    });
    onClose();
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(line.id);
      onClose();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const incrementQty = () => setQuantity((q) => q + 1);
  const decrementQty = () => setQuantity((q) => Math.max(1, q - 1));

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={() => !isSaving && onClose()}
      />

      {/* Sheet / Modal */}
      <div
        className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:rounded-xl bg-white rounded-t-2xl z-50 max-h-[85vh] overflow-y-auto animate-slide-up md:animate-fade-in"
        style={{
          paddingBottom: 'calc(var(--space-6, 24px) + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Handle (mobile only) */}
        <div className="flex justify-center py-2 md:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">
            {line.productName}
          </h3>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-5">
          {/* Name Field (user-editable) */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">
              {t('documents.lineName')}
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={line.productName}
              maxLength={maxNameLength}
              disabled={isSaving}
              className="input w-full disabled:opacity-50"
              style={{ minHeight: '44px' }}
            />
            <div className="text-right text-xs text-gray-400 mt-1">
              {name.length}/{maxNameLength}
            </div>
          </div>

          {/* Quantity with Stepper */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">
              {t('documents.quantity')}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={decrementQty}
                disabled={isSaving || quantity <= 1}
                className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 disabled:hover:bg-gray-100 transition"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                <Minus className="w-5 h-5 text-gray-700" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isSaving}
                className="input w-24 text-center text-lg font-medium disabled:opacity-50"
                min="1"
                style={{ minHeight: '44px' }}
              />
              <button
                onClick={incrementQty}
                disabled={isSaving}
                className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 transition"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                <Plus className="w-5 h-5 text-gray-700" />
              </button>
              {line.uom && (
                <span className="text-sm text-gray-500">{line.uom}</span>
              )}
            </div>
          </div>

          {/* Unit Price */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">
              {t('documents.unitPrice')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={priceUnit}
              onChange={(e) => setPriceUnit(parseFloat(e.target.value) || 0)}
              disabled={isSaving}
              className="input w-full text-right text-lg disabled:opacity-50"
              min="0"
              step="0.01"
              style={{ minHeight: '44px' }}
            />
          </div>

          {/* Subtotal Display */}
          <div className="flex justify-between items-center py-3 border-t border-gray-200">
            <span className="text-gray-600">{t('documents.subtotal')}</span>
            <span className="text-xl font-bold text-gray-900">
              {formatCurrency(subtotal)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 space-y-3">
          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full btn btn-primary py-3 text-base flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              t('common.confirm')
            )}
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className={`w-full py-3 font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition ${
              showDeleteConfirm
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-red-500 hover:bg-red-50'
            }`}
            style={{ minHeight: '44px' }}
          >
            <Trash2 className="w-4 h-4" />
            {showDeleteConfirm ? t('common.confirmDelete') : t('common.delete')}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
