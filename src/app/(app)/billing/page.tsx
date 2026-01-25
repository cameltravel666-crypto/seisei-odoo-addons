'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Check,
  ArrowLeft,
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
  canonicalJournal: {
    txn_date: string;
    description: string;
    counterparty_name?: string;
    amount_gross: number;
    amount_tax?: number;
    tax_rate?: number;
    tax_included: boolean;
    debit: { account_name: string; tax_category?: string };
    credit: { account_name: string; tax_category?: string };
    invoice_reg_no?: string;
    warnings: string[];
  };
  warnings: string[];
}

interface PreviewResult {
  columns: { key: string; label: string }[];
  rowsSample: Record<string, string | number>[];
  warnings: string[];
  totalRows: number;
}

// ============================================
// Constants
// ============================================

const MODULE_CARDS = [
  {
    type: 'purchase' as const,
    icon: Receipt,
    label: '仕入（購買）',
    labelZh: '采购',
    description: '仕入先からの請求書・納品書をスキャン',
    color: 'purple',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-200',
    hoverBorder: 'hover:border-purple-400',
  },
  {
    type: 'sale' as const,
    icon: FileText,
    label: '売上（販売）',
    labelZh: '销售',
    description: 'お客様への請求書・見積書を作成',
    color: 'blue',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
  },
  {
    type: 'expense' as const,
    icon: CreditCard,
    label: '経費精算',
    labelZh: '费用报销',
    description: '領収書・交通費の申請/承認',
    color: 'amber',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-200',
    hoverBorder: 'hover:border-amber-400',
  },
];

const EXPORT_TARGETS = [
  { value: 'freee' as const, label: 'freee会計' },
  { value: 'moneyforward' as const, label: 'マネーフォワード クラウド会計' },
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

function getDefaultCreditAccount(type: OcrDocumentType): string {
  switch (type) {
    case 'purchase':
      return '未払金';
    case 'sale':
      return '売上高';
    case 'expense':
      return '現金';
    default:
      return '未払金';
  }
}

// ============================================
// Main Component
// ============================================

export default function BillingOcrPage() {
  const router = useRouter();

  // State
  const [selectedType, setSelectedType] = useState<OcrDocumentType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [editedJournal, setEditedJournal] = useState<OcrResult['canonicalJournal'] | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>('freee');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('summary');
  const [showLineItems, setShowLineItems] = useState(false);
  const [createAs, setCreateAs] = useState<CreateAs>('invoice');
  const [isWriting, setIsWriting] = useState(false);
  const [writeSuccess, setWriteSuccess] = useState<{ id: number; name: string; type: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setEditedJournal(null);
      setPreview(null);
      setWriteSuccess(null);

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
          canonicalJournal: {
            txn_date: voucherDraft.invoice_date || new Date().toISOString().split('T')[0],
            description: lineItems[0]?.product_name || '取引',
            counterparty_name: voucherDraft.partner_name,
            amount_gross: voucherDraft.amount_total || 0,
            amount_tax: voucherDraft.amount_tax,
            tax_rate: taxRate,
            tax_included: true,
            debit: {
              account_name: getDefaultDebitAccount(selectedType),
              tax_category: `課税仕入${taxRate}%`,
            },
            credit: {
              account_name: getDefaultCreditAccount(selectedType),
            },
            invoice_reg_no: voucherDraft.partner_vat,
            warnings: [],
          },
          warnings: [],
        };

        setOcrResult(result);
        setEditedJournal(result.canonicalJournal);

        // Auto-load preview
        loadPreview(jobId, exportTarget, exportMode, result.canonicalJournal, lineItems);
      } catch (error) {
        console.error('OCR error:', error);
        alert(error instanceof Error ? error.message : 'OCR処理に失敗しました');
      } finally {
        setIsUploading(false);
      }
    },
    [selectedType, exportTarget, exportMode]
  );

  // Load preview
  const loadPreview = async (
    documentId: string,
    target: ExportTarget,
    mode: ExportMode,
    journal?: OcrResult['canonicalJournal'],
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
          canonical: journal || editedJournal,
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
          description: editedJournal?.description,
          lineItems: ocrResult.lineItems,
          createAs: selectedType === 'expense' ? 'invoice' : createAs,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || '書き込みに失敗しました');
      }

      setWriteSuccess(data.data);
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
          canonical: editedJournal,
          docType: selectedType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'ダウンロードに失敗しました');
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `export_${exportTarget}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }

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

  // Drag & drop handlers
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

  // Reset state
  const resetState = () => {
    setFile(null);
    setOcrResult(null);
    setEditedJournal(null);
    setPreview(null);
    setWriteSuccess(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">書類認識（OCR）</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          請求書・領収書をアップロードして自動認識 → Odoo登録 or CSVエクスポート
        </p>
      </div>

      {/* Success Message */}
      {writeSuccess && (
        <div className="card p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-green-800">登録完了</p>
              <p className="text-sm text-green-600">{writeSuccess.name} を作成しました</p>
            </div>
            <button
              onClick={() => {
                resetState();
                setSelectedType(null);
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              続けてスキャン
            </button>
          </div>
        </div>
      )}

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
                onClick={() => {
                  setSelectedType(card.type);
                  resetState();
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? `${card.borderColor} ${card.bgColor}`
                    : `border-gray-200 bg-white ${card.hoverBorder}`
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center mb-3`}
                >
                  <Icon className={`w-5 h-5 ${card.textColor}`} />
                </div>
                <p className="font-medium text-gray-900">{card.label}</p>
                <p className="text-xs text-gray-500 mt-1">{card.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Upload Area */}
      {selectedType && !writeSuccess && (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            2. 書類をアップロード
          </h2>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isUploading
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-blue-400'
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
                <button
                  onClick={() => {
                    resetState();
                    fileInputRef.current?.click();
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  別のファイルを選択
                </button>
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
                  JPEG、PNG、WebP、PDF形式に対応（最大10MB）
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

      {/* Step 3: Recognition Result */}
      {ocrResult && !writeSuccess && (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            3. 認識結果
          </h2>

          {/* Invoice Registration Number */}
          {ocrResult.extractedSummary.invoiceRegNo && ocrResult.extractedSummary.invoiceRegNo !== '0' ? (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-600 font-medium">適格請求書発行事業者</p>
              <p className="text-lg font-mono font-bold text-green-700">
                {ocrResult.extractedSummary.invoiceRegNo}
              </p>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <p className="text-sm text-amber-700 font-medium">
                  インボイス登録番号が見つかりません
                </p>
              </div>
            </div>
          )}

          {/* Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
          <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
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
            <div className="mb-4">
              <button
                onClick={() => setShowLineItems(!showLineItems)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2"
              >
                {showLineItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                明細行（{ocrResult.lineItems.length}件）
              </button>

              {showLineItems && (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">品名</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">数量</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">単価</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600">税率</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">勘定科目</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocrResult.lineItems.map((item, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{item.product_name || '-'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            ¥{item.unit_price.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{item.tax_rate}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            ¥{item.amount.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{item.account_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Edit Toggle */}
          <button
            onClick={() => setShowEdit(!showEdit)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            {showEdit ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showEdit ? '仕訳編集を閉じる' : '仕訳を編集する'}
          </button>

          {/* Edit Form */}
          {showEdit && editedJournal && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">日付</label>
                <input
                  type="date"
                  value={editedJournal.txn_date}
                  onChange={(e) =>
                    setEditedJournal({ ...editedJournal, txn_date: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">摘要</label>
                <input
                  type="text"
                  value={editedJournal.description}
                  onChange={(e) =>
                    setEditedJournal({ ...editedJournal, description: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">借方科目</label>
                <input
                  type="text"
                  value={editedJournal.debit.account_name}
                  onChange={(e) =>
                    setEditedJournal({
                      ...editedJournal,
                      debit: { ...editedJournal.debit, account_name: e.target.value },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">貸方科目</label>
                <input
                  type="text"
                  value={editedJournal.credit.account_name}
                  onChange={(e) =>
                    setEditedJournal({
                      ...editedJournal,
                      credit: { ...editedJournal.credit, account_name: e.target.value },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <button
                onClick={() => {
                  if (ocrResult) {
                    loadPreview(ocrResult.documentId, exportTarget, exportMode, editedJournal, ocrResult.lineItems);
                  }
                }}
                className="col-span-2 mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                プレビューを更新
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Export / Save */}
      {ocrResult && !writeSuccess && (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            4. 保存 / エクスポート
          </h2>

          {/* Write to Odoo Section */}
          <div className="p-4 border rounded-lg mb-4 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-gray-900">Odooに登録</p>
                <p className="text-sm text-gray-500">
                  {selectedType === 'purchase' && '仕入先からの請求書として登録'}
                  {selectedType === 'sale' && 'お客様への請求書として登録'}
                  {selectedType === 'expense' && '経費精算として登録'}
                </p>
              </div>
              <button
                onClick={handleWriteToOdoo}
                disabled={isWriting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                登録する
              </button>
            </div>

            {/* Create as option */}
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

          {/* Export Mode Selection */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">出力形式:</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportMode"
                  value="summary"
                  checked={exportMode === 'summary'}
                  onChange={() => {
                    setExportMode('summary');
                    loadPreview(ocrResult.documentId, exportTarget, 'summary', editedJournal || undefined, ocrResult.lineItems);
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">
                  <span className="font-medium">汇总模式</span>
                  <span className="text-gray-500 ml-1">（1行：借方科目・総金額・総税額）</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportMode"
                  value="detailed"
                  checked={exportMode === 'detailed'}
                  onChange={() => {
                    setExportMode('detailed');
                    loadPreview(ocrResult.documentId, exportTarget, 'detailed', editedJournal || undefined, ocrResult.lineItems);
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">
                  <span className="font-medium">明細模式</span>
                  <span className="text-gray-500 ml-1">（明細ごと：借方科目・金額・税額）</span>
                </span>
              </label>
            </div>
          </div>

          {/* Target Selection */}
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-gray-600">出力先:</label>
            <select
              value={exportTarget}
              onChange={(e) => {
                const target = e.target.value as ExportTarget;
                setExportTarget(target);
                loadPreview(ocrResult.documentId, target, exportMode, editedJournal || undefined, ocrResult.lineItems);
              }}
              className="flex-1 max-w-xs px-3 py-2 border rounded-lg text-sm"
            >
              {EXPORT_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Preview Table */}
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : preview ? (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {preview.columns.map((col) => (
                      <th key={col.key} className="px-3 py-2 text-left font-medium text-gray-600 border-b">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rowsSample.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      {preview.columns.map((col) => (
                        <td key={col.key} className="px-3 py-2 text-gray-900">
                          {row[col.key] ?? '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Preview Warnings */}
          {preview?.warnings && preview.warnings.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                {preview.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            CSVをダウンロード
          </button>
        </div>
      )}
    </div>
  );
}
