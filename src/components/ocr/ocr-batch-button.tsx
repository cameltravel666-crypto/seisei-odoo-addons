'use client';

import { useState, useEffect } from 'react';
import { Scan, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useOcrBatchMutation, useOcrStatus, isAnyProcessing, getOcrSummary } from '@/hooks/use-ocr';

interface OcrBatchButtonProps {
  selectedIds: number[];
  onComplete?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, params?: any) => string;
}

type ProcessingState = 'idle' | 'processing' | 'done';

export function OcrBatchButton({
  selectedIds,
  onComplete,
  onClear,
  disabled = false,
  t,
}: OcrBatchButtonProps) {
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [processedIds, setProcessedIds] = useState<number[]>([]);

  const batchMutation = useOcrBatchMutation();

  // Poll for status while processing
  const { data: statusData } = useOcrStatus(processedIds, {
    enabled: processingState === 'processing' && processedIds.length > 0,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Check if processing is complete
  useEffect(() => {
    if (processingState === 'processing' && statusData && statusData.length > 0) {
      if (!isAnyProcessing(statusData)) {
        setProcessingState('done');
        // Auto-hide after 3 seconds
        setTimeout(() => {
          setProcessingState('idle');
          setProcessedIds([]);
          onComplete?.();
        }, 3000);
      }
    }
  }, [statusData, processingState, onComplete]);

  const handleOcrClick = async () => {
    if (selectedIds.length === 0 || disabled) return;

    setProcessingState('processing');
    setProcessedIds(selectedIds);

    try {
      await batchMutation.mutateAsync(selectedIds);
    } catch (error) {
      console.error('OCR batch error:', error);
      setProcessingState('idle');
      setProcessedIds([]);
    }
  };

  const summary = statusData ? getOcrSummary(statusData) : null;

  // Idle state - show trigger button
  if (processingState === 'idle') {
    if (selectedIds.length === 0) return null;

    return (
      <div className="fixed bottom-20 left-0 right-0 z-40 px-4 safe-area-bottom">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-body font-medium text-gray-900">
                {t('ocr.selectedCount').replace('{count}', String(selectedIds.length))}
              </p>
              <p className="text-sub text-gray-500">{t('ocr.selectForOcr')}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClear}
                className="px-4 py-2 text-body text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleOcrClick}
                disabled={disabled || batchMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-body font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {batchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Scan className="w-4 h-4" />
                )}
                {t('ocr.processSelected')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Processing state - show progress
  if (processingState === 'processing') {
    return (
      <div className="fixed bottom-20 left-0 right-0 z-40 px-4 safe-area-bottom">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-body font-medium text-gray-900">{t('ocr.processing')}</p>
              {summary && (
                <p className="text-sub text-gray-500">
                  {summary.done + summary.failed}/{summary.total} {t('common.completed')}
                </p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {summary && (
            <div className="mt-3">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${((summary.done + summary.failed) / summary.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Done state - show results
  if (processingState === 'done' && summary) {
    const hasErrors = summary.failed > 0;

    return (
      <div className="fixed bottom-20 left-0 right-0 z-40 px-4 safe-area-bottom">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              hasErrors ? 'bg-orange-100' : 'bg-green-100'
            }`}>
              {hasErrors ? (
                <XCircle className="w-5 h-5 text-orange-600" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-body font-medium text-gray-900">
                {hasErrors ? t('ocr.completedWithErrors') : t('ocr.completed')}
              </p>
              <p className="text-sub text-gray-500">
                {t('ocr.successMessage')
                  .replace('{success}', String(summary.done))
                  .replace('{fail}', String(summary.failed))}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
