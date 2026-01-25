'use client';

import { LogIn, UserPlus, X, Download } from 'lucide-react';
import Link from 'next/link';

export interface AuthGateProps {
  isOpen: boolean;
  onClose: () => void;
  redirectPath?: string;
  jobId?: string;
  title?: string;
  description?: string;
}

/**
 * AuthGate - Modal prompting user to log in or register to access download
 */
export function AuthGate({
  isOpen,
  onClose,
  redirectPath = '/documents',
  jobId,
  title = 'ダウンロードには登録が必要です',
  description = '無料アカウントを作成すると、認識結果をCSVファイルとしてダウンロードし、会計ソフトにインポートできます。',
}: AuthGateProps) {
  if (!isOpen) return null;

  const registerUrl = `/register?redirect=${encodeURIComponent(redirectPath)}${jobId ? `&job=${jobId}` : ''}`;
  const loginUrl = `/login?redirect=${encodeURIComponent(redirectPath)}${jobId ? `&job=${jobId}` : ''}`;

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
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Download className="w-8 h-8 text-blue-600" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          {title}
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          {description}
        </p>

        {/* Benefits list */}
        <ul className="text-sm text-gray-600 mb-6 space-y-2">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
            freee、マネーフォワード、弥生会計に対応
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
            認識結果を保存・編集可能
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
            毎月10件まで無料でダウンロード
          </li>
        </ul>

        {/* Action buttons */}
        <div className="space-y-3">
          <Link
            href={registerUrl}
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium"
          >
            <UserPlus className="w-5 h-5" />
            無料で登録する
          </Link>
          <Link
            href={loginUrl}
            className="flex items-center justify-center gap-2 w-full py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition"
          >
            <LogIn className="w-5 h-5" />
            すでにアカウントをお持ちの方
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
