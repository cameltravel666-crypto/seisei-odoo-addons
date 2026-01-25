'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
// Note: Using alert() instead of toast as sonner is not installed

// ============================================
// Types
// ============================================

type OcrDocumentType = 'purchase' | 'sale' | 'expense';
type ExportTarget = 'freee' | 'moneyforward' | 'yayoi';

interface OcrResult {
  documentId: string;
  extractedSummary: {
    date: string | null;
    counterparty: string | null;
    total: number | null;
    taxRate: number | null;
    tax: number | null;
    invoiceRegNo: string | null;
  };
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
}

// ============================================
// Module Cards Data
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
// Main Component
// ============================================

export default function TryOcrPage() {
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
  const [showAuthModal, setShowAuthModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handlers
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

      try {
        // Upload and recognize
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('type', selectedType);

        const response = await fetch('/api/public/ocr/start', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || 'OCR処理に失敗しました');
        }

        // Poll for result
        const jobId = data.data.jobId;
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const statusResponse = await fetch(`/api/public/ocr/status?jobId=${jobId}`);
          const statusData = await statusResponse.json();

          if (statusData.data?.status === 'completed') {
            const result: OcrResult = {
              documentId: jobId,
              extractedSummary: {
                date: statusData.data.result?.voucherDraft?.journal_date || null,
                counterparty: statusData.data.result?.voucherDraft?.partner_name || null,
                total: statusData.data.result?.voucherDraft?.amount_total || null,
                taxRate: statusData.data.result?.voucherDraft?.tax_rate || null,
                tax: statusData.data.result?.voucherDraft?.amount_tax || null,
                invoiceRegNo: statusData.data.result?.voucherDraft?.invoice_registration_number || null,
              },
              canonicalJournal: {
                txn_date: statusData.data.result?.voucherDraft?.journal_date || new Date().toISOString().split('T')[0],
                description: statusData.data.result?.voucherDraft?.description || '',
                counterparty_name: statusData.data.result?.voucherDraft?.partner_name,
                amount_gross: statusData.data.result?.voucherDraft?.amount_total || 0,
                amount_tax: statusData.data.result?.voucherDraft?.amount_tax,
                tax_rate: statusData.data.result?.voucherDraft?.tax_rate,
                tax_included: true,
                debit: {
                  account_name: getDefaultDebitAccount(selectedType),
                  tax_category: statusData.data.result?.voucherDraft?.tax_rate ? `課税仕入${statusData.data.result.voucherDraft.tax_rate}%` : undefined,
                },
                credit: {
                  account_name: getDefaultCreditAccount(selectedType),
                },
                invoice_reg_no: statusData.data.result?.voucherDraft?.invoice_registration_number,
                warnings: [],
              },
              warnings: statusData.data.result?.warnings || [],
            };

            setOcrResult(result);
            setEditedJournal(result.canonicalJournal);

            // Auto-load preview
            loadPreview(jobId, exportTarget, result.canonicalJournal);
            break;
          } else if (statusData.data?.status === 'failed') {
            throw new Error(statusData.data?.error || 'OCR処理に失敗しました');
          }

          attempts++;
        }

        if (attempts >= maxAttempts) {
          throw new Error('OCR処理がタイムアウトしました');
        }
      } catch (error) {
        console.error('OCR error:', error);
        alert(error instanceof Error ? error.message : 'OCR処理に失敗しました');
      } finally {
        setIsUploading(false);
      }
    },
    [selectedType, exportTarget]
  );

  const loadPreview = async (
    documentId: string,
    target: ExportTarget,
    journal?: OcrResult['canonicalJournal']
  ) => {
    setIsLoadingPreview(true);
    try {
      const response = await fetch('/api/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          target,
          voucherDraft: journal || editedJournal,
          docType: selectedType === 'purchase' ? 'vendor_invoice' : selectedType === 'sale' ? 'receipt' : 'expense',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPreview({
          columns: data.data.columns,
          rowsSample: data.data.rowsSample,
          warnings: data.data.warnings || [],
        });
      }
    } catch (error) {
      console.error('Preview error:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownload = () => {
    // Require login for download
    setShowAuthModal(true);
  };

  const handleWriteback = () => {
    // Require login for writeback
    setShowAuthModal(true);
  };

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

  const resetState = () => {
    setFile(null);
    setOcrResult(null);
    setEditedJournal(null);
    setPreview(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-gray-900">BizNexus</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ログイン
            </Link>
            <Link
              href="/register"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              無料登録
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            書類認識（OCR）
          </h1>
          <p className="text-gray-500">
            請求書・領収書をアップロードして会計ソフト用CSVをダウンロード
          </p>
        </div>

        {/* Step 1: Module Selection */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            1. 書類タイプを選択
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        {selectedType && (
          <div className="mb-8">
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
        {ocrResult && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              3. 認識結果
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500">日付</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.date || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">取引先</p>
                  <p className="font-medium truncate">
                    {ocrResult.extractedSummary.counterparty || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">合計金額</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.total
                      ? `¥${ocrResult.extractedSummary.total.toLocaleString()}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">税率</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.taxRate
                      ? `${ocrResult.extractedSummary.taxRate}%`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">税額</p>
                  <p className="font-medium">
                    {ocrResult.extractedSummary.tax
                      ? `¥${ocrResult.extractedSummary.tax.toLocaleString()}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">登録番号</p>
                  <p className="font-medium text-xs">
                    {ocrResult.extractedSummary.invoiceRegNo || '-'}
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {ocrResult.warnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg mb-4">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    {ocrResult.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Minimal Edit Toggle */}
              <button
                onClick={() => setShowEdit(!showEdit)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                {showEdit ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                {showEdit ? '編集を閉じる' : '編集する'}
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
                        setEditedJournal({
                          ...editedJournal,
                          txn_date: e.target.value,
                        })
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
                        setEditedJournal({
                          ...editedJournal,
                          description: e.target.value,
                        })
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
                          debit: {
                            ...editedJournal.debit,
                            account_name: e.target.value,
                          },
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
                          credit: {
                            ...editedJournal.credit,
                            account_name: e.target.value,
                          },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (ocrResult) {
                        loadPreview(ocrResult.documentId, exportTarget);
                      }
                    }}
                    className="col-span-2 mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                  >
                    プレビューを更新
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Export */}
        {ocrResult && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              4. エクスポート
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {/* Target Selection */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm text-gray-600">出力先:</label>
                <select
                  value={exportTarget}
                  onChange={(e) => {
                    const target = e.target.value as ExportTarget;
                    setExportTarget(target);
                    loadPreview(ocrResult.documentId, target);
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
                          <th
                            key={col.key}
                            className="px-3 py-2 text-left font-medium text-gray-600 border-b"
                          >
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

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleWriteback}
                  className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  <Send className="w-4 h-4" />
                  BizNexusに書き込む
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  CSVをダウンロード
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-center text-sm text-gray-500 mt-8">
          <p>無料で1日3回お試しできます</p>
          <p className="mt-1">
            <Link href="/register" className="text-blue-600 hover:underline">
              無料登録
            </Link>
            すると毎月30回まで無料
          </p>
        </div>
      </main>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              ログインが必要です
            </h2>
            <p className="text-gray-500 mb-6">
              CSVのダウンロードまたはBizNexusへの書き込みには、ログインが必要です。
            </p>
            <div className="space-y-3">
              <Link
                href="/login"
                className="block w-full text-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                ログイン
              </Link>
              <Link
                href="/register"
                className="block w-full text-center px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                無料登録
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          <Link href="/legal/privacy" className="hover:text-gray-700 mr-4">
            プライバシーポリシー
          </Link>
          <Link href="/legal/terms" className="hover:text-gray-700">
            利用規約
          </Link>
        </div>
      </footer>
    </div>
  );
}

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
