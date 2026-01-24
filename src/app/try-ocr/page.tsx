'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Upload,
  Camera,
  FileText,
  Receipt,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  LogIn,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  initGA4,
  trackPublicSessionStart,
  trackUploadSuccess,
  trackOcrStart,
  trackOcrParseSuccess,
  trackVoucherGenerateSuccess,
  trackSaveClick,
} from '@/lib/analytics';

// Document types for public OCR
type DocType = 'receipt' | 'vendor_invoice' | 'expense';

interface VoucherDraft {
  id: string;
  move_type: 'in_invoice' | 'out_invoice' | 'entry';
  partner_name: string | null;
  partner_vat: string | null;
  invoice_date: string | null;
  amount_total: number | null;
  amount_untaxed: number | null;
  amount_tax: number | null;
  line_items: Array<{
    product_name: string;
    account_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    tax_rate: string;
    amount: number;
  }>;
  ocr_confidence: number | null;
  status: 'draft';
}

interface OcrResult {
  merchant: string | null;
  date: string | null;
  amount_total: number | null;
  confidence: number | null;
}

interface SessionData {
  sessionId: string;
  quotaRemaining: number;
  quotaUsed: number;
  dailyLimit: number;
}

function PublicOcrContent() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query params
  const type = (searchParams.get('type') as DocType) || 'receipt';
  const utmSource = searchParams.get('utm_source');
  const utmMedium = searchParams.get('utm_medium');
  const utmCampaign = searchParams.get('utm_campaign');

  // /try-ocr is always public mode
  const isPublicMode = true;

  // State
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DocType>(type);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [voucherDraft, setVoucherDraft] = useState<VoucherDraft | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Document type options
  const docTypes = [
    { value: 'receipt' as DocType, label: '領収書', icon: Receipt },
    { value: 'vendor_invoice' as DocType, label: '請求書', icon: FileText },
    { value: 'expense' as DocType, label: '経費', icon: Receipt },
  ];

  // Compress image using canvas
  const compressImage = (file: File, maxWidth: number, quality: number): Promise<{ base64: string; size: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        const size = Math.round((base64.length * 3) / 4);

        resolve({ base64, size });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  // Initialize session on mount
  useEffect(() => {
    initGA4();
    initSession();
  }, []);

  const initSession = async () => {
    try {
      const res = await fetch('/api/public/session');
      const data = await res.json();

      if (data.success) {
        setSession(data.data);

        // Track session start
        if (data.data.isNew) {
          trackPublicSessionStart({
            doc_type: docType,
            utm_source: utmSource || undefined,
            utm_medium: utmMedium || undefined,
            utm_campaign: utmCampaign || undefined,
          });
        }
      } else {
        setError('Failed to initialize session');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Accept images and PDF
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('対応形式：JPEG、PNG、WebP、GIF、PDF');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setOcrResult(null);
    setVoucherDraft(null);

    // Create preview for images only (not PDF)
    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Track upload
    trackUploadSuccess({
      file_type: selectedFile.type,
      file_size_kb: Math.round(selectedFile.size / 1024),
    });
  }, []);

  // Process OCR
  const handleProcess = async () => {
    if (!file || !session) return;

    // Check quota
    if (session.quotaRemaining <= 0) {
      setShowLoginPrompt(true);
      return;
    }

    setProcessing(true);
    setError(null);
    const startTime = Date.now();

    trackOcrStart({ doc_type: docType });

    try {
      let base64: string;
      let mimeType = file.type;
      let fileName = file.name;

      // Compress images before upload
      if (file.type.startsWith('image/') && file.size > 500 * 1024) {
        // Compress images larger than 500KB
        const compressed = await compressImage(file, 1200, 0.8);
        base64 = compressed.base64;
        mimeType = 'image/jpeg';
        fileName = file.name.replace(/\.[^.]+$/, '.jpg');
        console.log(`[OCR] Compressed ${Math.round(file.size/1024)}KB -> ${Math.round(compressed.size/1024)}KB`);
      } else {
        // Use original file - convert to base64 in chunks to avoid stack overflow
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        base64 = btoa(binary);
      }

      // Call OCR API
      const res = await fetch('/api/public/ocr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          imageData: base64,
          fileName,
          mimeType,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setJobId(data.data.jobId);
        setOcrResult(data.data.ocrResult);
        setVoucherDraft(data.data.voucherDraft);

        // Update session quota
        setSession(prev => prev ? {
          ...prev,
          quotaRemaining: prev.quotaRemaining - 1,
          quotaUsed: prev.quotaUsed + 1,
        } : null);

        // Track success
        trackOcrParseSuccess({
          processing_time_ms: Date.now() - startTime,
          confidence: data.data.ocrResult?.confidence || 0,
        });

        trackVoucherGenerateSuccess({
          latency_ms: data.data.processingTimeMs || 0,
          has_tax_split: true,
        });
      } else {
        if (data.error?.quotaExceeded) {
          setShowLoginPrompt(true);
        } else {
          setError(data.error?.message || 'OCR処理に失敗しました');
        }
      }
    } catch {
      setError('サーバーへの接続に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  // Handle save click
  const handleSaveClick = () => {
    trackSaveClick({ target: 'billing' });
    setShowLoginPrompt(true);
  };

  // Reset
  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setVoucherDraft(null);
    setJobId(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!isPublicMode) {
    return null; // Will redirect
  }

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

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title & Quota */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            書類認識（OCR）
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Info className="w-4 h-4" />
            <span>
              無料で1日{session?.dailyLimit || 3}回お試しできます
              （残り {session?.quotaRemaining || 0}回）
            </span>
          </div>
        </div>

        {/* Login Prompt Modal */}
        {showLoginPrompt && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {session?.quotaRemaining === 0
                  ? '本日の無料枠を使い切りました'
                  : '保存するには登録が必要です'}
              </h2>
              <p className="text-gray-600 mb-6">
                無料アカウントを作成すると、認識結果を保存して請求書管理に活用できます。
              </p>
              <div className="space-y-3">
                <Link
                  href={`/register?redirect=/ocr&job=${jobId || ''}`}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition"
                >
                  <LogIn className="w-5 h-5" />
                  無料登録して続ける
                </Link>
                <Link
                  href={`/login?redirect=/ocr&job=${jobId || ''}`}
                  className="flex items-center justify-center gap-2 w-full py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition"
                >
                  すでにアカウントをお持ちの方
                </Link>
                <button
                  onClick={() => setShowLoginPrompt(false)}
                  className="w-full py-2 text-gray-500 hover:text-gray-700"
                >
                  後で
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Select Document Type */}
        <div className="bg-white rounded-xl border p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">1. 書類タイプを選択</h2>
          <div className="flex gap-3">
            {docTypes.map((dt) => {
              const Icon = dt.icon;
              const isSelected = docType === dt.value;
              return (
                <button
                  key={dt.value}
                  onClick={() => setDocType(dt.value)}
                  disabled={processing || !!ocrResult}
                  className={`flex-1 p-3 rounded-xl border-2 text-center transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${(processing || ocrResult) ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <Icon className={`w-5 h-5 mx-auto mb-1 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
                  <span className={`text-sm ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                    {dt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Upload */}
        <div className="bg-white rounded-xl border p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">2. 書類をアップロード</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />

          {!file ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
              <div className="flex justify-center gap-4 mb-4">
                <label
                  htmlFor="file-upload"
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition"
                >
                  <Upload className="w-5 h-5" />
                  ファイルを選択
                </label>
                <label
                  htmlFor="file-upload"
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition"
                >
                  <Camera className="w-5 h-5" />
                  撮影する
                </label>
              </div>
              <p className="text-sm text-gray-500">
                JPEG、PNG、WebP、PDF形式に対応（最大10MB）
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              {/* Preview */}
              {previewUrl ? (
                <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : file?.type === 'application/pdf' ? (
                <div className="w-32 h-32 rounded-lg bg-red-50 flex-shrink-0 flex items-center justify-center">
                  <FileText className="w-12 h-12 text-red-500" />
                </div>
              ) : null}
              <div className="flex-1">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <div className="mt-3 flex gap-2">
                  {!ocrResult && (
                    <button
                      onClick={handleProcess}
                      disabled={processing}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {processing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      {processing ? '認識中...' : '認識開始'}
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    クリア
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}
        </div>

        {/* Step 3: Results */}
        {ocrResult && voucherDraft && (
          <div className="bg-white rounded-xl border p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">3. 認識結果</h2>
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm">認識完了</span>
              </div>
            </div>

            {/* OCR Result Preview */}
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">取引先</p>
                  <p className="font-medium text-gray-900">
                    {ocrResult.merchant || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">登録番号</p>
                  <p className="font-medium text-gray-900 font-mono">
                    {voucherDraft.partner_vat || '0'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">日付</p>
                  <p className="font-medium text-gray-900">
                    {ocrResult.date || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">合計金額</p>
                  <p className="font-bold text-lg text-gray-900">
                    ¥{(ocrResult.amount_total || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">信頼度</p>
                  <p className="font-medium text-gray-900">
                    {ocrResult.confidence ? `${(ocrResult.confidence * 100).toFixed(0)}%` : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            {voucherDraft.line_items && voucherDraft.line_items.length > 0 && (
              <div className="border rounded-lg mb-4 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <h3 className="text-sm font-medium text-gray-700">明細行</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">品名</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">勘定科目</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">数量</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">単価</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">税率</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {voucherDraft.line_items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900">{item.product_name}</td>
                          <td className="px-3 py-2 text-gray-600">{item.account_name}</td>
                          <td className="px-3 py-2 text-right text-gray-900">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900">
                            ¥{item.unit_price.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                              {item.tax_rate}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            ¥{item.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="border rounded-lg p-4 mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">税抜金額</span>
                  <span className="text-gray-900">
                    ¥{(voucherDraft.amount_untaxed || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">消費税（8%）</span>
                  <span className="text-gray-900">
                    ¥{(voucherDraft.amount_tax || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span className="text-gray-700">合計</span>
                  <span className="text-gray-900 text-lg">
                    ¥{(voucherDraft.amount_total || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveClick}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition"
            >
              保存して続行（無料登録）
              <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-center text-sm text-gray-500 mt-3">
              無料登録後、仕入請求書として保存されます
            </p>
          </div>
        )}

        {/* Quota Info */}
        {session && (
          <div className="text-center text-sm text-gray-500">
            本日の残り回数: {session.quotaRemaining} / {session.dailyLimit}
          </div>
        )}
      </main>

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

export default function PublicOcrPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    }>
      <PublicOcrContent />
    </Suspense>
  );
}
