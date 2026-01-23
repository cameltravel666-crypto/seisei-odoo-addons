'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ProvisioningData {
  tenant_code: string;
  tenant_name: string;
  status: 'provisioning' | 'ready' | 'failed';
  current_step: string | null;
  step_description: string | null;
  progress: number;
  last_error: string | null;
  odoo_ready: boolean;
  can_retry: boolean;
  job: {
    attempts: number;
    max_attempts: number;
    started_at: string | null;
    completed_at: string | null;
  } | null;
}

interface ProvisioningStatusProps {
  onReady?: () => void;
}

export function ProvisioningStatus({ onReady }: ProvisioningStatusProps) {
  const locale = useLocale();
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);

  const { data, error, refetch } = useQuery<ProvisioningData>({
    queryKey: ['provisioning-status'],
    queryFn: async () => {
      const res = await fetch(`/api/provisioning/status?locale=${locale}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to get status');
      return json.data;
    },
    refetchInterval: (query) => {
      // Stop polling once ready or failed
      const status = query.state.data?.status;
      if (status === 'ready' || status === 'failed') return false;
      return 3000; // Poll every 3 seconds while provisioning
    },
  });

  // When provisioning completes, notify parent and refresh
  useEffect(() => {
    if (data?.status === 'ready') {
      onReady?.();
      // Give a moment for the user to see the success, then refresh
      setTimeout(() => {
        router.refresh();
      }, 1500);
    }
  }, [data?.status, onReady, router]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch('/api/provisioning/retry', { method: 'POST' });
      const json = await res.json();
      if (!json.success) {
        alert(json.error?.message || 'Retry failed');
      } else {
        // Refetch status
        refetch();
      }
    } catch (err) {
      alert('Failed to retry provisioning');
    } finally {
      setIsRetrying(false);
    }
  };

  const getText = (ja: string, zh: string, en: string) => {
    if (locale === 'ja') return ja;
    if (locale === 'zh') return zh;
    return en;
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {getText('ステータス確認エラー', '状态检查失败', 'Status Check Failed')}
          </h2>
          <p className="text-gray-600 mb-4">{(error as Error).message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            {getText('再試行', '重试', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">{getText('確認中...', '检查中...', 'Checking...')}</p>
        </div>
      </div>
    );
  }

  // Ready state - show success briefly
  if (data.status === 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {getText('セットアップ完了!', '设置完成!', 'Setup Complete!')}
          </h2>
          <p className="text-gray-600">
            {getText('リダイレクト中...', '正在跳转...', 'Redirecting...')}
          </p>
        </div>
      </div>
    );
  }

  // Failed state
  if (data.status === 'failed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {getText('セットアップに失敗しました', '设置失败', 'Setup Failed')}
          </h2>
          {data.last_error && (
            <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded-lg">
              {data.last_error}
            </p>
          )}
          {data.can_retry ? (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
            >
              {isRetrying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              {getText('再試行', '重试', 'Retry Setup')}
            </button>
          ) : (
            <p className="text-gray-600">
              {getText(
                'サポートにお問い合わせください: support@seisei.tokyo',
                '请联系客服: support@seisei.tokyo',
                'Please contact support: support@seisei.tokyo'
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Provisioning in progress
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {getText('アカウント設定中', '正在设置您的账户', 'Setting Up Your Account')}
          </h2>
          <p className="text-gray-600">
            {getText(
              'しばらくお待ちください。1-2分で完了します。',
              '请稍候，通常需要1-2分钟完成。',
              'Please wait. This usually takes 1-2 minutes.'
            )}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${data.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-gray-500">{data.step_description || getText('処理中...', '处理中...', 'Processing...')}</span>
            <span className="text-gray-900 font-medium">{data.progress}%</span>
          </div>
        </div>

        {/* Status info */}
        <div className="text-center">
          <p className="text-xs text-gray-400">
            {getText('テナント:', '租户:', 'Tenant:')} {data.tenant_code}
          </p>
          {data.job && (
            <p className="text-xs text-gray-400 mt-1">
              {getText('試行:', '尝试:', 'Attempt:')} {data.job.attempts}/{data.job.max_attempts}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
