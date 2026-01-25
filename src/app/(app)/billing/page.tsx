'use client';

import { useState, useCallback, useRef } from 'react';
import {
  FileText,
  Receipt,
  CreditCard,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Trash2,
  FileUp,
  X,
} from 'lucide-react';

// ============================================
// Types
// ============================================

type OcrDocumentType = 'purchase' | 'sale' | 'expense';

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
  jobId: string;
  odooMoveId: number;
  partnerName: string | null;
  partnerVat: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  amountTotal: number | null;
  amountTax: number | null;
  lineItems: OcrLineItem[];
  confidence: number | null;
}

interface ProcessedFile {
  id: string;
  file: File;
  docType: OcrDocumentType;
  status: 'pending' | 'processing' | 'ocr_done' | 'writing' | 'done' | 'error';
  ocrResult?: OcrResult;
  odooRecord?: {
    id: number;
    name: string;
    type: string;
    url: string;
  };
  error?: string;
}

// ============================================
// Constants
// ============================================

const MODULE_CARDS = [
  {
    type: 'purchase' as const,
    icon: Receipt,
    label: '仕入（購買）',
    description: '仕入先からの請求書・納品書',
    color: 'purple',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-200',
    hoverBorder: 'hover:border-purple-400',
    odooPath: '/purchase',
  },
  {
    type: 'sale' as const,
    icon: FileText,
    label: '売上（販売）',
    description: 'お客様への請求書・見積書',
    color: 'blue',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    odooPath: '/sales',
  },
  {
    type: 'expense' as const,
    icon: CreditCard,
    label: '経費精算',
    description: '領収書・交通費の申請',
    color: 'amber',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-200',
    hoverBorder: 'hover:border-amber-400',
    odooPath: '/expenses',
  },
];

// ============================================
// Helper Functions
// ============================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function fileToBase64(file: File): Promise<string> {
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
}

function getOdooRecordUrl(docType: OcrDocumentType, recordType: string, recordId: number): string {
  // Build URL to view the record in our app
  switch (docType) {
    case 'purchase':
      return recordType === 'vendor_bill'
        ? `/finance/invoices/${recordId}`
        : `/purchase/${recordId}`;
    case 'sale':
      return recordType === 'customer_invoice'
        ? `/finance/invoices/${recordId}`
        : `/sales/${recordId}`;
    case 'expense':
      return `/expenses?id=${recordId}`;
    default:
      return '/billing';
  }
}

// ============================================
// Main Component
// ============================================

export default function BillingOcrPage() {
  // State
  const [selectedType, setSelectedType] = useState<OcrDocumentType | null>(null);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process single file: OCR + Auto-write to Odoo
  const processFile = async (processedFile: ProcessedFile): Promise<ProcessedFile> => {
    try {
      // Step 1: OCR
      const imageData = await fileToBase64(processedFile.file);

      const ocrResponse = await fetch('/api/billing/ocr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          docType: processedFile.docType,
          fileName: processedFile.file.name,
          mimeType: processedFile.file.type,
          imageData,
        }),
      });

      const ocrData = await ocrResponse.json();

      if (!ocrResponse.ok || !ocrData.success) {
        throw new Error(ocrData.error?.message || 'OCR処理に失敗しました');
      }

      const voucherDraft = ocrData.data.voucherDraft;

      const ocrResult: OcrResult = {
        jobId: ocrData.data.jobId,
        odooMoveId: voucherDraft.odoo_move_id,
        partnerName: voucherDraft.partner_name,
        partnerVat: voucherDraft.partner_vat,
        invoiceDate: voucherDraft.invoice_date,
        invoiceNumber: voucherDraft.invoice_number,
        amountTotal: voucherDraft.amount_total,
        amountTax: voucherDraft.amount_tax,
        lineItems: voucherDraft.line_items || [],
        confidence: voucherDraft.ocr_confidence,
      };

      // Step 2: Auto-write to Odoo module
      // Note: Convert null to undefined for Zod validation (optional() accepts undefined, not null)
      const writeResponse = await fetch('/api/billing/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          docType: processedFile.docType,
          date: ocrResult.invoiceDate || new Date().toISOString().split('T')[0],
          counterparty: ocrResult.partnerName || undefined,
          total: ocrResult.amountTotal || 0,
          tax: ocrResult.amountTax ?? undefined,
          invoiceRegNo: ocrResult.partnerVat || undefined,
          invoiceNumber: ocrResult.invoiceNumber || undefined,
          lineItems: ocrResult.lineItems?.length ? ocrResult.lineItems : undefined,
          createAs: 'invoice',
        }),
      });

      const writeData = await writeResponse.json();

      if (!writeResponse.ok || !writeData.success) {
        throw new Error(writeData.error?.message || '書き込みに失敗しました');
      }

      return {
        ...processedFile,
        status: 'done',
        ocrResult,
        odooRecord: {
          id: writeData.data.id,
          name: writeData.data.name,
          type: writeData.data.type,
          url: getOdooRecordUrl(processedFile.docType, writeData.data.type, writeData.data.id),
        },
      };

    } catch (error) {
      return {
        ...processedFile,
        status: 'error',
        error: error instanceof Error ? error.message : '処理に失敗しました',
      };
    }
  };

  // Process all pending files
  const processAllFiles = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);

    // Process files one by one
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.status !== 'pending') continue;

      // Update UI to show processing
      setFiles(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'processing' } : f
      ));

      // Process the file
      const processed = await processFile(file);

      // Update the file in state
      setFiles(prev => prev.map((f, idx) =>
        idx === i ? processed : f
      ));
    }

    setIsProcessing(false);
  };

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || !selectedType) return;

    const newFiles: ProcessedFile[] = Array.from(selectedFiles).map(file => ({
      id: generateId(),
      file,
      docType: selectedType,
      status: 'pending',
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, [selectedType]);

  // Remove file from list
  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // Clear all files
  const clearAllFiles = () => {
    setFiles([]);
  };

  // Drag & drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Get status color
  const getStatusColor = (status: ProcessedFile['status']) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-600';
      case 'processing': return 'bg-blue-100 text-blue-600';
      case 'ocr_done': return 'bg-yellow-100 text-yellow-600';
      case 'writing': return 'bg-purple-100 text-purple-600';
      case 'done': return 'bg-green-100 text-green-600';
      case 'error': return 'bg-red-100 text-red-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  // Get status text
  const getStatusText = (status: ProcessedFile['status']) => {
    switch (status) {
      case 'pending': return '待機中';
      case 'processing': return 'OCR認識中...';
      case 'ocr_done': return 'OCR完了';
      case 'writing': return '登録中...';
      case 'done': return '完了';
      case 'error': return 'エラー';
      default: return '';
    }
  };

  // Count by status
  const statusCounts = {
    pending: files.filter(f => f.status === 'pending').length,
    processing: files.filter(f => ['processing', 'ocr_done', 'writing'].includes(f.status)).length,
    done: files.filter(f => f.status === 'done').length,
    error: files.filter(f => f.status === 'error').length,
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">書類認識（OCR）</h1>
            <p className="text-sm text-gray-500 mt-1">
              書類をアップロード → 自動認識 → Odooに自動登録
            </p>
          </div>
          {files.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 bg-gray-100 rounded">待機: {statusCounts.pending}</span>
              <span className="px-2 py-1 bg-blue-100 rounded">処理中: {statusCounts.processing}</span>
              <span className="px-2 py-1 bg-green-100 rounded">完了: {statusCounts.done}</span>
              {statusCounts.error > 0 && (
                <span className="px-2 py-1 bg-red-100 rounded">エラー: {statusCounts.error}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step 1: Module Selection */}
      <div className="card p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          1. 書類タイプを選択
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODULE_CARDS.map((card) => {
            const Icon = card.icon;
            const isSelected = selectedType === card.type;
            return (
              <button
                key={card.type}
                onClick={() => setSelectedType(card.type)}
                disabled={isProcessing}
                className={`p-4 rounded-xl border-2 transition-all text-left disabled:opacity-50 ${
                  isSelected
                    ? `${card.borderColor} ${card.bgColor}`
                    : `border-gray-200 bg-white ${card.hoverBorder}`
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.textColor}`} />
                </div>
                <p className="font-medium text-gray-900">{card.label}</p>
                <p className="text-xs text-gray-500 mt-1">{card.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Batch Upload */}
      {selectedType && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              2. 書類をアップロード（複数選択可）
            </h2>
            {files.length > 0 && (
              <button
                onClick={clearAllFiles}
                disabled={isProcessing}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                すべてクリア
              </button>
            )}
          </div>

          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              isProcessing
                ? 'border-gray-200 bg-gray-50'
                : 'border-gray-300 bg-white hover:border-blue-400 cursor-pointer'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
          >
            <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-2">
              ドラッグ＆ドロップ または クリックして選択
            </p>
            <p className="text-sm text-gray-500">
              JPEG、PNG、PDF形式（複数ファイル対応）
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((pf) => (
                <div
                  key={pf.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    pf.status === 'error' ? 'border-red-200 bg-red-50' :
                    pf.status === 'done' ? 'border-green-200 bg-green-50' :
                    'border-gray-200 bg-white'
                  }`}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {pf.status === 'processing' || pf.status === 'writing' ? (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    ) : pf.status === 'done' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : pf.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <FileText className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {pf.file.name}
                    </p>
                    {pf.status === 'done' && pf.odooRecord && (
                      <p className="text-xs text-green-600">
                        → {pf.odooRecord.name}
                      </p>
                    )}
                    {pf.status === 'error' && pf.error && (
                      <p className="text-xs text-red-600">{pf.error}</p>
                    )}
                    {pf.ocrResult && pf.status === 'done' && (
                      <p className="text-xs text-gray-500">
                        {pf.ocrResult.partnerName} | ¥{pf.ocrResult.amountTotal?.toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(pf.status)}`}>
                    {getStatusText(pf.status)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {pf.status === 'done' && pf.odooRecord && (
                      <a
                        href={pf.odooRecord.url}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                        title="詳細を確認"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {(pf.status === 'pending' || pf.status === 'error') && (
                      <button
                        onClick={() => removeFile(pf.id)}
                        disabled={isProcessing}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Process Button */}
          {files.length > 0 && statusCounts.pending > 0 && (
            <button
              onClick={processAllFiles}
              disabled={isProcessing}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  {statusCounts.pending}件を処理開始
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Step 3: Results Summary */}
      {statusCounts.done > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            3. 処理結果
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">ファイル名</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">取引先</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">日付</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">登録先</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {files.filter(f => f.status === 'done').map((pf) => (
                  <tr key={pf.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{pf.file.name}</td>
                    <td className="px-3 py-2 text-gray-600">{pf.ocrResult?.partnerName || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{pf.ocrResult?.invoiceDate || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      ¥{pf.ocrResult?.amountTotal?.toLocaleString() || 0}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        {pf.odooRecord?.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {pf.odooRecord && (
                        <a
                          href={pf.odooRecord.url}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          確認 <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-gray-700">
                    合計 {statusCounts.done} 件
                  </td>
                  <td className="px-3 py-2 text-right text-gray-900">
                    ¥{files
                      .filter(f => f.status === 'done')
                      .reduce((sum, f) => sum + (f.ocrResult?.amountTotal || 0), 0)
                      .toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Quick Links to Modules */}
          <div className="mt-4 flex gap-3">
            {MODULE_CARDS.map(card => {
              const count = files.filter(f => f.status === 'done' && f.docType === card.type).length;
              if (count === 0) return null;
              return (
                <a
                  key={card.type}
                  href={card.odooPath}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg ${card.bgColor} ${card.textColor} hover:opacity-80`}
                >
                  <card.icon className="w-4 h-4" />
                  {card.label}へ ({count}件)
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
