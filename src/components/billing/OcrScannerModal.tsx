'use client';

import { useState, useCallback, useRef } from 'react';
import {
  FileText,
  Receipt,
  CreditCard,
  Upload,
  Camera,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Send,
  X,
  Check,
} from 'lucide-react';

// ============================================
// Types
// ============================================

type OcrDocumentType = 'purchase' | 'sale' | 'expense';
type ExportTarget = 'freee' | 'moneyforward' | 'yayoi';
type ExportMode = 'detailed' | 'summary';
type CreateAs = 'invoice' | 'order';

interface OcrLineItem {
  product_name: string;
  account_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate: string;
  amount: number;
}

interface OcrResult {
  documentId: string;
  extractedSummary: {
    date: string | null;
    counterparty: string | null;
    total: number | null;
    taxRate: number | null;
    tax: number | null;
    invoiceRegNo: string | null;
    invoiceNumber: string | null;
  };
  lineItems: OcrLineItem[];
  warnings: string[];
}

interface PreviewResult {
  columns: { key: string; label: string }[];
  rowsSample: Record<string, string | number>[];
  warnings: string[];
  totalRows: number;
}

interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDocType?: OcrDocumentType;
  onSuccess?: (result: { id: number; name: string; type: string }) => void;
}

// ============================================
// Constants
// ============================================

const MODULE_CARDS = [
  {
    type: 'purchase' as const,
    icon: Receipt,
    label: '仕入（購買）',
    description: '仕入先からの請求書',
    color: 'purple',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
  },
  {
    type: 'sale' as const,
    icon: FileText,
    label: '売上（販売）',
    description: 'お客様への請求書',
    color: 'blue',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
  {
    type: 'expense' as const,
    icon: CreditCard,
    label: '経費精算',
    description: '領収書・交通費',
    color: 'amber',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
  },
];

const EXPORT_TARGETS = [
  { value: 'freee' as const, label: 'freee会計' },
  { value: 'moneyforward' as const, label: 'マネーフォワード' },
  { value: 'yayoi' as const, label: '弥生会計' },
];

// ============================================
// Helper Functions
// ============================================

function getDefaultDebitAccount(type: OcrDocumentType): string {
  switch (type) {
    case 'purchase':
      return '仕入高';
    case 'sale':
      return '売掛金';
    case 'expense':
      return '消耗品費';
    default:
      return '仕入高';
  }
}

// ============================================
// Component
// ============================================

export function OcrScannerModal({
  isOpen,
  onClose,
  defaultDocType,
  onSuccess,
}: OcrScannerModalProps) {
  // State
  const [step, setStep] = useState<'select' | 'upload' | 'result' | 'action'>('select');
  const [selectedType, setSelectedType] = useState<OcrDocumentType | null>(defaultDocType || null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [exportTarget, setExportTarget] = useState<ExportTarget>('freee');
  const [exportMode, setExportMode] = useState<ExportMode>('summary');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showLineItems, setShowLineItems] = useState(false);
  const [createAs, setCreateAs] = useState<CreateAs>('invoice');
  const [isWriting, setIsWriting] = useState(false);
  const [writeSuccess, setWriteSuccess] = useState<{ id: number; name: string; type: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state
  const resetState = () => {
    setStep('select');
    setSelectedType(defaultDocType || null);
    setFile(null);
    setOcrResult(null);
    setPreview(null);
    setWriteSuccess(null);
  };

  // Close modal
  const handleClose = () => {
    resetState();
    onClose();
  };

  // File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle file select
  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      if (!selectedType) {
        alert('書類タイプを選択してください');
        return;
      }

      setFile(selectedFile);
      setIsUploading(true);
      setOcrResult(null);
      setPreview(null);

      try {
        const imageData = await fileToBase64(selectedFile);

        const docTypeMap: Record<OcrDocumentType, string> = {
          purchase: 'vendor_invoice',
          sale: 'receipt',
          expense: 'expense',
        };

        const response = await fetch('/api/public/ocr/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            docType: docTypeMap[selectedType],
            fileName: selectedFile.name,
            mimeType: selectedFile.type,
            imageData,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || 'OCR処理に失敗しました');
        }

        const voucherDraft = data.data.voucherDraft;
        const jobId = data.data.jobId;

        const lineItems: OcrLineItem[] = (voucherDraft.line_items || []).map((item: OcrLineItem) => ({
          product_name: item.product_name || '',
          account_name: item.account_name || getDefaultDebitAccount(selectedType),
          quantity: item.quantity || 1,
          unit: item.unit || '個',
          unit_price: item.unit_price || 0,
          tax_rate: item.tax_rate || '10%',
          amount: item.amount || 0,
        }));

        const taxRate = lineItems[0]?.tax_rate
          ? parseInt(lineItems[0].tax_rate) || 10
          : 10;

        const result: OcrResult = {
          documentId: jobId,
          extractedSummary: {
            date: voucherDraft.invoice_date || null,
            counterparty: voucherDraft.partner_name || null,
            total: voucherDraft.amount_total || null,
            taxRate: taxRate,
            tax: voucherDraft.amount_tax || null,
            invoiceRegNo: voucherDraft.partner_vat || null,
            invoiceNumber: voucherDraft.invoice_number || null,
          },
          lineItems,
          warnings: [],
        };

        setOcrResult(result);
        setStep('result');

        // Load preview
        loadPreview(jobId, exportTarget, exportMode, lineItems);
      } catch (error) {
        console.error('OCR error:', error);
        alert(error instanceof Error ? error.message : 'OCR処理に失敗しました');
      } finally {
        setIsUploading(false);
      }
    },
    [selectedType, exportTarget, exportMode]
  );

  // Load export preview
  const loadPreview = async (
    documentId: string,
    target: ExportTarget,
    mode: ExportMode,
    items?: OcrLineItem[]
  ) => {
    setIsLoadingPreview(true);
    try {
      const targetMap: Record<ExportTarget, string> = {
        freee: 'FREEE',
        moneyforward: 'MONEYFORWARD',
        yayoi: 'YAYOI',
      };

      const response = await fetch('/api/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documentId,
          target: targetMap[target],
          lineItems: items || ocrResult?.lineItems || [],
          exportMode: mode,
          docType: selectedType,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPreview({
          columns: data.data.columns,
          rowsSample: data.data.rowsSample,
          warnings: data.data.warnings || [],
          totalRows: data.data.totalRows || data.data.rowsSample?.length || 0,
        });
      }
    } catch (error) {
      console.error('Preview error:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Write to Odoo
  const handleWriteToOdoo = async () => {
    if (!ocrResult || !selectedType) return;

    setIsWriting(true);
    try {
      const response = await fetch('/api/billing/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          docType: selectedType,
          date: ocrResult.extractedSummary.date || new Date().toISOString().split('T')[0],
          counterparty: ocrResult.extractedSummary.counterparty,
          total: ocrResult.extractedSummary.total || 0,
          tax: ocrResult.extractedSummary.tax,
          taxRate: ocrResult.extractedSummary.taxRate,
          invoiceRegNo: ocrResult.extractedSummary.invoiceRegNo,
          invoiceNumber: ocrResult.extractedSummary.invoiceNumber,
          lineItems: ocrResult.lineItems,
          createAs: selectedType === 'expense' ? 'invoice' : createAs,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || '書き込みに失敗しました');
      }

      setWriteSuccess(data.data);
      setStep('action');
      onSuccess?.(data.data);
    } catch (error) {
      console.error('Write error:', error);
      alert(error instanceof Error ? error.message : '書き込みに失敗しました');
    } finally {
      setIsWriting(false);
    }
  };

  // Download CSV
  const handleDownload = async () => {
    if (!ocrResult) return;

    setIsDownloading(true);
    try {
      const targetMap: Record<ExportTarget, string> = {
        freee: 'FREEE',
        moneyforward: 'MONEYFORWARD',
        yayoi: 'YAYOI',
      };

      const response = await fetch('/api/export/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documentId: ocrResult.documentId,
          target: targetMap[exportTarget],
          docType: selectedType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'ダウンロードに失敗しました');
      }

      // Get filename from header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `export_${exportTarget}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }

      // Download file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'ダウンロードに失敗しました');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'select' && '書類をスキャン'}
            {step === 'upload' && 'ファイルをアップロード'}
            {step === 'result' && '認識結果'}
            {step === 'action' && '完了'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Select Document Type */}
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm mb-4">
                書類タイプを選択してください
              </p>
              <div className="grid grid-cols-3 gap-3">
                {MODULE_CARDS.map((card) => {
                  const Icon = card.icon;
                  const isSelected = selectedType === card.type;
                  return (
                    <button
                      key={card.type}
                      onClick={() => {
                        setSelectedType(card.type);
                        setStep('upload');
                      }}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        isSelected
                          ? `border-${card.color}-400 ${card.bgColor}`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center mx-auto mb-2`}
                      >
                        <Icon className={`w-5 h-5 ${card.textColor}`} />
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{card.label}</p>
                      <p className="text-xs text-gray-500 mt-1">{card.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('select')}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                ← 書類タイプを変更
              </button>

              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  isUploading
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                    <p className="text-gray-600">認識中...</p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center">
                    <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
                    <p className="text-gray-900 font-medium">{file.name}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center gap-4 mb-4">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Upload className="w-4 h-4" />
                        ファイルを選択
                      </button>
                      <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        <Camera className="w-4 h-4" />
                        撮影する
                      </button>
                    </div>
                    <p className="text-sm text-gray-500">
                      JPEG、PNG、PDF形式（最大10MB）
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    handleFileSelect(selectedFile);
                  }
                }}
              />
            </div>
          )}

          {/* Step 3: Result */}
          {step === 'result' && ocrResult && (
            <div className="space-y-4">
              {/* Invoice Reg No */}
              {ocrResult.extractedSummary.invoiceRegNo ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-600 font-medium">適格請求書発行事業者</p>
                  <p className="text-lg font-mono font-bold text-green-700">
                    {ocrResult.extractedSummary.invoiceRegNo}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm text-amber-700">インボイス登録番号が見つかりません</p>
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-gray-500">日付</p>
                  <p className="font-medium">{ocrResult.extractedSummary.date || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">取引先</p>
                  <p className="font-medium truncate">{ocrResult.extractedSummary.counterparty || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">請求書番号</p>
                  <p className="font-medium text-sm">{ocrResult.extractedSummary.invoiceNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">合計金額</p>
                  <p className="font-medium text-lg text-blue-600">
                    {ocrResult.extractedSummary.total
                      ? `¥${ocrResult.extractedSummary.total.toLocaleString()}`
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Tax Summary */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">税抜金額</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.total && ocrResult.extractedSummary.tax
                      ? `¥${(ocrResult.extractedSummary.total - ocrResult.extractedSummary.tax).toLocaleString()}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">消費税（{ocrResult.extractedSummary.taxRate || 10}%）</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.tax
                      ? `¥${ocrResult.extractedSummary.tax.toLocaleString()}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">税込合計</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.total
                      ? `¥${ocrResult.extractedSummary.total.toLocaleString()}`
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Line Items */}
              {ocrResult.lineItems.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowLineItems(!showLineItems)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    {showLineItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    明細行（{ocrResult.lineItems.length}件）
                  </button>

                  {showLineItems && (
                    <div className="mt-2 overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">品名</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600">数量</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600">単価</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ocrResult.lineItems.map((item, idx) => (
                            <tr key={idx} className="border-t border-gray-100">
                              <td className="px-3 py-2">{item.product_name || '-'}</td>
                              <td className="px-3 py-2 text-right">{item.quantity} {item.unit}</td>
                              <td className="px-3 py-2 text-right">¥{item.unit_price.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-medium">¥{item.amount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Actions Section */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-900 mb-3">保存先を選択</h3>

                {/* Write to Odoo */}
                <div className="p-4 border rounded-lg mb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900">BizNexusに登録</p>
                      <p className="text-sm text-gray-500">Odoo 18に直接書き込み</p>
                    </div>
                    <button
                      onClick={handleWriteToOdoo}
                      disabled={isWriting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isWriting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      登録
                    </button>
                  </div>

                  {/* Create as option (for purchase/sale only) */}
                  {selectedType !== 'expense' && (
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="createAs"
                          value="invoice"
                          checked={createAs === 'invoice'}
                          onChange={() => setCreateAs('invoice')}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span>{selectedType === 'purchase' ? '仕入請求書' : '売上請求書'}として登録</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="createAs"
                          value="order"
                          checked={createAs === 'order'}
                          onChange={() => setCreateAs('order')}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span>{selectedType === 'purchase' ? '発注書' : '受注書'}として登録</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Export to CSV */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900">CSVをエクスポート</p>
                      <p className="text-sm text-gray-500">他の会計ソフトへインポート</p>
                    </div>
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      ダウンロード
                    </button>
                  </div>

                  {/* Export target */}
                  <div className="flex items-center gap-3 mb-3">
                    <label className="text-sm text-gray-600">出力先:</label>
                    <select
                      value={exportTarget}
                      onChange={(e) => {
                        const target = e.target.value as ExportTarget;
                        setExportTarget(target);
                        if (ocrResult) {
                          loadPreview(ocrResult.documentId, target, exportMode, ocrResult.lineItems);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                    >
                      {EXPORT_TARGETS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Export mode */}
                  <div className="flex gap-4 text-sm mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="exportMode"
                        value="summary"
                        checked={exportMode === 'summary'}
                        onChange={() => {
                          setExportMode('summary');
                          if (ocrResult) {
                            loadPreview(ocrResult.documentId, exportTarget, 'summary', ocrResult.lineItems);
                          }
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span>汇总模式（1行）</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="exportMode"
                        value="detailed"
                        checked={exportMode === 'detailed'}
                        onChange={() => {
                          setExportMode('detailed');
                          if (ocrResult) {
                            loadPreview(ocrResult.documentId, exportTarget, 'detailed', ocrResult.lineItems);
                          }
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span>明細模式（明細ごと）</span>
                    </label>
                  </div>

                  {/* Preview */}
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    </div>
                  ) : preview && preview.rowsSample.length > 0 ? (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            {preview.columns.slice(0, 5).map((col) => (
                              <th key={col.key} className="px-2 py-1 text-left font-medium text-gray-600 border-b">
                                {col.label}
                              </th>
                            ))}
                            {preview.columns.length > 5 && (
                              <th className="px-2 py-1 text-left font-medium text-gray-600 border-b">...</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rowsSample.slice(0, 2).map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-100">
                              {preview.columns.slice(0, 5).map((col) => (
                                <td key={col.key} className="px-2 py-1 text-gray-900 truncate max-w-[100px]">
                                  {row[col.key] ?? '-'}
                                </td>
                              ))}
                              {preview.columns.length > 5 && (
                                <td className="px-2 py-1 text-gray-400">...</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'action' && writeSuccess && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                登録完了
              </h3>
              <p className="text-gray-600 mb-4">
                {writeSuccess.name} を作成しました
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    resetState();
                    setStep('select');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  続けてスキャン
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
