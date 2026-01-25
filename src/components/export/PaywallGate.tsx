'use client';

import { CreditCard, X, Sparkles, Check } from 'lucide-react';
import Link from 'next/link';

export interface PaywallGateProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'no_subscription' | 'quota_exceeded' | 'feature_disabled';
  upgradeUrl?: string;
  quotaUsed?: number;
  quotaLimit?: number;
}

/**
 * PaywallGate - Modal prompting user to upgrade subscription
 */
export function PaywallGate({
  isOpen,
  onClose,
  reason = 'no_subscription',
  upgradeUrl = '/settings/billing',
  quotaUsed,
  quotaLimit,
}: PaywallGateProps) {
  if (!isOpen) return null;

  const getTitle = () => {
    switch (reason) {
      case 'quota_exceeded':
        return '今月のダウンロード枠を使い切りました';
      case 'feature_disabled':
        return 'この機能はご利用プランでは利用できません';
      default:
        return 'プランのアップグレードが必要です';
    }
  };

  const getDescription = () => {
    switch (reason) {
      case 'quota_exceeded':
        return `今月は${quotaLimit || 10}件のダウンロード枠を使い切りました。プランをアップグレードすると、毎月無制限にダウンロードできます。`;
      case 'feature_disabled':
        return 'このエクスポート機能はスタンダードプラン以上でご利用いただけます。';
      default:
        return 'エクスポート機能を利用するには、有料プランへのアップグレードが必要です。';
    }
  };

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

        {/* Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-purple-600" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          {getTitle()}
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          {getDescription()}
        </p>

        {/* Quota indicator (if applicable) */}
        {reason === 'quota_exceeded' && quotaUsed !== undefined && quotaLimit !== undefined && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">今月の利用状況</span>
              <span className="font-medium text-gray-900">
                {quotaUsed} / {quotaLimit}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}

        {/* Plan benefits */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-3">スタンダードプラン</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-600" />
              無制限のエクスポート
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-600" />
              すべての会計ソフトに対応
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-600" />
              優先サポート
            </li>
          </ul>
          <p className="text-blue-700 font-medium mt-3">
            月額 ¥2,980〜
          </p>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <Link
            href={upgradeUrl}
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition font-medium"
          >
            <CreditCard className="w-5 h-5" />
            プランをアップグレード
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            後で
          </button>
        </div>
      </div>
    </div>
  );
}
