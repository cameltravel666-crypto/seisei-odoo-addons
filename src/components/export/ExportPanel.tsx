'use client';

import { useState, useEffect } from 'react';
import { Download, Loader2, RefreshCw, FileDown } from 'lucide-react';
import { ExportTargetSelector } from './ExportTargetSelector';
import { ExportPreviewTable } from './ExportPreviewTable';
import { AuthGate } from './AuthGate';
import { PaywallGate } from './PaywallGate';
import type { ExportTarget, CanonicalJournal, ExportWarning } from '@/types/export';

export interface ExportPanelProps {
  documentId: string;
  canonical?: CanonicalJournal;
  isAuthenticated?: boolean;
  onCanonicalChange?: (canonical: CanonicalJournal) => void;
  className?: string;
}

interface PreviewData {
  target: ExportTarget;
  targetInfo: {
    name: string;
    nameJa: string;
    description: string;
    descriptionJa: string;
    helpUrl?: string;
  };
  columns: Array<{ key: string; label: string; labelJa?: string }>;
  rowsSample: Record<string, string | number>[];
  totalRows: number;
  warnings: ExportWarning[];
  encoding: string;
  fileFormat: string;
  fileName: string;
  canonical: CanonicalJournal;
}

interface EntitlementData {
  canPreview: boolean;
  canDownload: boolean;
  availableTargets: ExportTarget[];
  reason?: string;
  isAuthenticated: boolean;
}

const EXPORT_TARGETS: Record<ExportTarget, {
  name: string;
  nameJa: string;
  description: string;
  descriptionJa: string;
  helpUrl?: string;
}> = {
  freee: {
    name: 'freee',
    nameJa: 'freee会計',
    description: 'Export to freee accounting journal import format',
    descriptionJa: 'freee会計の仕訳インポート形式でエクスポート',
    helpUrl: 'https://support.freee.co.jp/hc/ja/articles/202847470',
  },
  moneyforward: {
    name: 'MoneyForward',
    nameJa: 'マネーフォワード クラウド会計',
    description: 'Export to MoneyForward cloud accounting journal format',
    descriptionJa: 'マネーフォワード クラウド会計の仕訳帳形式でエクスポート',
    helpUrl: 'https://biz.moneyforward.com/support/account/guide/journal/',
  },
  yayoi: {
    name: 'Yayoi',
    nameJa: '弥生会計',
    description: 'Export to Yayoi accounting journal import format',
    descriptionJa: '弥生会計の仕訳日記帳インポート形式でエクスポート',
    helpUrl: 'https://www.yayoi-kk.co.jp/products/account/',
  },
};

/**
 * ExportPanel - Complete export workflow component
 * Includes target selection, preview, and download with auth gates
 */
export function ExportPanel({
  documentId,
  canonical: initialCanonical,
  isAuthenticated: propIsAuthenticated,
  onCanonicalChange,
  className = '',
}: ExportPanelProps) {
  // State
  const [selectedTarget, setSelectedTarget] = useState<ExportTarget | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementData | null>(null);

  // Gate modals
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [showPaywallGate, setShowPaywallGate] = useState(false);
  const [paywallReason, setPaywallReason] = useState<'no_subscription' | 'quota_exceeded'>('no_subscription');

  // Check entitlement on mount
  useEffect(() => {
    checkEntitlement();
  }, []);

  // Fetch preview when target changes
  useEffect(() => {
    if (selectedTarget) {
      fetchPreview(selectedTarget);
    } else {
      setPreview(null);
    }
  }, [selectedTarget, documentId]);

  const checkEntitlement = async () => {
    try {
      const res = await fetch('/api/export/entitlement');
      const data = await res.json();
      if (data.success) {
        setEntitlement(data.data);
      }
    } catch (err) {
      console.error('[ExportPanel] Failed to check entitlement:', err);
    }
  };

  const fetchPreview = async (target: ExportTarget) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          target,
          canonical: initialCanonical,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPreview(data.data);
        // Notify parent of canonical (may be updated by server)
        if (onCanonicalChange && data.data.canonical) {
          onCanonicalChange(data.data.canonical);
        }
      } else {
        setError(data.error?.message || 'プレビューの取得に失敗しました');
      }
    } catch (err) {
      setError('サーバーへの接続に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedTarget || !preview) return;

    // Check authentication first
    const isAuthenticated = propIsAuthenticated ?? entitlement?.isAuthenticated ?? false;

    if (!isAuthenticated) {
      setShowAuthGate(true);
      return;
    }

    // Check download entitlement
    if (!entitlement?.canDownload) {
      if (entitlement?.reason === 'no_subscription') {
        setPaywallReason('no_subscription');
        setShowPaywallGate(true);
        return;
      }
      if (entitlement?.reason === 'quota_exceeded') {
        setPaywallReason('quota_exceeded');
        setShowPaywallGate(true);
        return;
      }
    }

    // Proceed with download
    setDownloading(true);
    setError(null);

    try {
      const res = await fetch('/api/export/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          target: selectedTarget,
          canonical: preview.canonical,
          encoding: preview.encoding,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();

        if (errorData.error?.code === 'AUTH_REQUIRED') {
          setShowAuthGate(true);
          return;
        }

        if (errorData.error?.code === 'SUBSCRIPTION_REQUIRED') {
          setPaywallReason('no_subscription');
          setShowPaywallGate(true);
          return;
        }

        throw new Error(errorData.error?.message || 'ダウンロードに失敗しました');
      }

      // Get file from response
      const blob = await res.blob();
      const fileName = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || preview.fileName;

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(fileName);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'ダウンロードに失敗しました');
    } finally {
      setDownloading(false);
    }
  };

  const isAuthenticated = propIsAuthenticated ?? entitlement?.isAuthenticated ?? false;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Step: Select Target */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FileDown className="w-5 h-5 text-blue-600" />
          会計ソフトを選択
        </h3>
        <ExportTargetSelector
          targets={EXPORT_TARGETS}
          selected={selectedTarget}
          onSelect={setSelectedTarget}
          disabled={loading || downloading}
          availableTargets={entitlement?.availableTargets}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl border p-8 text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-600">プレビューを生成中...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          {error}
          <button
            onClick={() => selectedTarget && fetchPreview(selectedTarget)}
            className="ml-2 text-red-600 underline hover:no-underline"
          >
            再試行
          </button>
        </div>
      )}

      {/* Preview */}
      {preview && !loading && (
        <div className="space-y-4">
          <ExportPreviewTable
            columns={preview.columns}
            rows={preview.rowsSample}
            warnings={preview.warnings}
            targetName={preview.targetInfo.nameJa}
            encoding={preview.encoding}
            fileFormat={preview.fileFormat}
            fileName={preview.fileName}
          />

          {/* Download button */}
          <div className="bg-white rounded-xl border p-4">
            <button
              onClick={handleDownload}
              disabled={downloading || preview.warnings.some(w => w.severity === 'error')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  ダウンロード中...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  {isAuthenticated ? 'ダウンロード' : 'ダウンロード（無料登録）'}
                </>
              )}
            </button>

            {!isAuthenticated && (
              <p className="text-center text-sm text-gray-500 mt-2">
                ダウンロードには無料登録が必要です
              </p>
            )}

            {preview.warnings.some(w => w.severity === 'error') && (
              <p className="text-center text-sm text-red-600 mt-2">
                エラーを修正してからダウンロードしてください
              </p>
            )}
          </div>
        </div>
      )}

      {/* Auth Gate Modal */}
      <AuthGate
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        redirectPath={`/documents?export=${documentId}`}
        jobId={documentId}
      />

      {/* Paywall Gate Modal */}
      <PaywallGate
        isOpen={showPaywallGate}
        onClose={() => setShowPaywallGate(false)}
        reason={paywallReason}
      />
    </div>
  );
}
