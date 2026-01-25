'use client';

import { useState } from 'react';
import { X, Scan, Edit3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { OcrScannerModal } from './OcrScannerModal';

export interface CreateEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: 'sales' | 'purchase' | 'expense';
}

/**
 * CreateEntryModal - 登録方法選択モーダル
 * ファイル取込（OCR）と手入力の選択肢を提供
 */
export function CreateEntryModal({
  isOpen,
  onClose,
  category,
}: CreateEntryModalProps) {
  const router = useRouter();
  const [showOcrScanner, setShowOcrScanner] = useState(false);

  if (!isOpen && !showOcrScanner) return null;

  // Map category to OCR doc type
  const getDefaultDocType = () => {
    switch (category) {
      case 'sales':
        return 'sale' as const;
      case 'purchase':
        return 'purchase' as const;
      case 'expense':
        return 'expense' as const;
      default:
        return undefined;
    }
  };

  const handleOcrClick = () => {
    setShowOcrScanner(true);
  };

  const handleOcrClose = () => {
    setShowOcrScanner(false);
    onClose();
  };

  const handleOcrSuccess = (result: { id: number; name: string; type: string }) => {
    console.log('OCR write success:', result);
    // Could navigate to the created record or refresh the list
  };

  const handleManualClick = () => {
    // Navigate to manual entry form based on category
    if (category === 'sales') {
      router.push('/billing/sales/new');
    } else if (category === 'purchase') {
      router.push('/billing/purchase/new');
    } else if (category === 'expense') {
      router.push('/billing/expense/new');
    } else {
      // Default: stay on modal
      console.log('Manual entry - coming soon');
    }
    onClose();
  };

  // Show OCR Scanner if opened
  if (showOcrScanner) {
    return (
      <OcrScannerModal
        isOpen={true}
        onClose={handleOcrClose}
        defaultDocType={getDefaultDocType()}
        onSuccess={handleOcrSuccess}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          登録方法を選択
        </h2>

        {/* Options */}
        <div className="space-y-3">
          <button
            onClick={handleOcrClick}
            className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition">
              <Scan className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">ファイル取込（OCR）</p>
              <p className="text-sm text-gray-500">請求書・領収書をスキャンして自動入力</p>
            </div>
          </button>

          <button
            onClick={handleManualClick}
            className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition group"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition">
              <Edit3 className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-900">手入力で作成</p>
              <p className="text-sm text-gray-500">フォームから直接入力して登録</p>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
