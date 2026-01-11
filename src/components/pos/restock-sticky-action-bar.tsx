'use client';

import { ShoppingCart } from 'lucide-react';

interface RestockStickyActionBarProps {
  selectedCount: number;
  estimatedTotal: number;
  onGeneratePO: () => void;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

export function RestockStickyActionBar({
  selectedCount,
  estimatedTotal,
  onGeneratePO,
  t,
}: RestockStickyActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  const formattedTotal =
    estimatedTotal >= 1000
      ? `${(estimatedTotal / 1000).toFixed(1)}k`
      : estimatedTotal.toLocaleString();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 safe-area-bottom">
      <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
        {/* Left: Selected count */}
        <div className="text-sm">
          <span className="text-gray-600">{t('selectedItems', { count: selectedCount })}</span>
        </div>

        {/* Center: Estimated total */}
        <div className="text-sm text-center">
          <span className="text-gray-500">{t('estimatedAmount')}: </span>
          <span className="font-semibold">¥{formattedTotal}</span>
        </div>

        {/* Right: Action button */}
        <button
          onClick={onGeneratePO}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          {t('generatePO')}
        </button>
      </div>
    </div>
  );
}
