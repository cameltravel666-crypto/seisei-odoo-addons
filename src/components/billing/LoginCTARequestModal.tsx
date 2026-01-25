'use client';

import { X, LogIn, FileText } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface LoginCTARequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * LoginCTARequestModal - ログイン誘導モーダル
 * landing modeで全てのアクションに対して表示
 */
export function LoginCTARequestModal({
  isOpen,
  onClose,
}: LoginCTARequestModalProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  const loginUrl = `/login?next=${encodeURIComponent(pathname)}`;

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
          <FileText className="w-8 h-8 text-blue-600" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          ログインしてご利用ください
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          請求・支払・経費精算をBizNexusで一元管理できます。
        </p>

        {/* Benefits */}
        <ul className="text-sm text-gray-600 mb-6 space-y-2">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
            請求書・領収書の自動読み取り（OCR）
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
            売掛・買掛の一元管理
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
            経費精算のワークフロー
          </li>
        </ul>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href={loginUrl}
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium"
          >
            <LogIn className="w-5 h-5" />
            ログイン
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
