'use client';

import { Loader2 } from 'lucide-react';

export type OcrStatus = 'pending' | 'processing' | 'done' | 'failed';

interface OcrStatusBadgeProps {
  status: OcrStatus;
  confidence?: number;
  compact?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
}

/**
 * OCR Status Badge Component
 *
 * Displays the OCR processing status with appropriate styling:
 * - pending: Gray
 * - processing: Yellow with spinner
 * - done: Green with confidence
 * - failed: Red
 */
export function OcrStatusBadge({
  status,
  confidence,
  compact = false,
  t,
}: OcrStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          label: t('ocr.statusPending'),
          className: 'bg-gray-100 text-gray-600',
          icon: null,
        };
      case 'processing':
        return {
          label: t('ocr.statusProcessing'),
          className: 'bg-yellow-100 text-yellow-700',
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
        };
      case 'done':
        return {
          label: confidence ? `${Math.round(confidence)}%` : t('ocr.statusDone'),
          className: 'bg-green-100 text-green-700',
          icon: null,
        };
      case 'failed':
        return {
          label: t('ocr.statusFailed'),
          className: 'bg-red-100 text-red-700',
          icon: null,
        };
      default:
        return {
          label: '-',
          className: 'bg-gray-100 text-gray-400',
          icon: null,
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    // Compact mode - just a small dot indicator
    const dotColors: Record<OcrStatus, string> = {
      pending: 'bg-gray-400',
      processing: 'bg-yellow-500 animate-pulse',
      done: 'bg-green-500',
      failed: 'bg-red-500',
    };

    return (
      <span
        className={`inline-block w-2 h-2 rounded-full ${dotColors[status]}`}
        title={config.label}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-micro font-medium rounded-full ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

/**
 * Checkbox for OCR selection mode
 */
interface OcrCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function OcrCheckbox({ checked, onChange, disabled = false }: OcrCheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
          onChange(!checked);
        }
      }}
      disabled={disabled}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
        checked
          ? 'bg-blue-600 border-blue-600'
          : 'bg-white border-gray-300 hover:border-gray-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
