'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { BillingCenterHome } from '@/components/billing';
import { mockKpis, mockRecentItems } from '@/data/mockBillingCenter';

/**
 * 請求・支払センター - Landing Page
 * /try-ocr - 未ログインユーザー向けランディングページ
 * /billing と同じUIだがmockデータを使用し、全アクションでログイン誘導
 */
function TryOcrContent() {
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
              href="/login"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              無料登録
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <BillingCenterHome
          mode="landing"
          kpis={mockKpis}
          recentItems={mockRecentItems}
          isLoading={false}
        />
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

export default function TryOcrPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    }>
      <TryOcrContent />
    </Suspense>
  );
}
