'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  Upload,
  Scan,
  FileText,
  ArrowRight,
  CheckCircle,
  Sparkles,
  Clock,
  Shield
} from 'lucide-react';
import { trackCtaClick, initGA4 } from '@/lib/analytics';

// Biznexus OCR URL with UTM parameters
const BIZNEXUS_OCR_URL = 'https://biznexus.seisei.tokyo/try-ocr?type=receipt&utm_source=seisei&utm_medium=site&utm_campaign=ocr_mvp';

export default function ReceiptToVoucherPage() {
  useEffect(() => {
    initGA4();
  }, []);

  const handleCtaClick = () => {
    trackCtaClick({
      cta_id: 'lp_receipt_to_voucher',
      dest_type: 'public_ocr',
      doc_type: 'receipt',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-gray-900">Seisei</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="https://biznexus.seisei.tokyo/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition"
            >
              ログイン
            </Link>
            <Link
              href="https://biznexus.seisei.tokyo/register"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              無料登録
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>AI OCR 無料お試し</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            領収書・請求書をスキャンして
            <br />
            <span className="text-blue-600">仕訳を自動作成</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            紙の領収書や請求書をアップロードするだけで、
            AIが内容を読み取り、会計仕訳のドラフトを自動生成します。
          </p>

          <Link
            href={BIZNEXUS_OCR_URL}
            onClick={handleCtaClick}
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30"
          >
            無料で試す（1日3回）
            <ArrowRight className="w-5 h-5" />
          </Link>

          <p className="text-sm text-gray-500 mt-4">
            登録不要ですぐにお試しいただけます
          </p>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-12">
            3ステップで簡単仕訳作成
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                1
              </div>
              <div className="bg-slate-50 rounded-2xl p-6 pt-8 h-full">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  アップロード
                </h3>
                <p className="text-gray-600">
                  領収書や請求書の画像・PDFをアップロード。スマホで撮影した写真でもOK。
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                2
              </div>
              <div className="bg-slate-50 rounded-2xl p-6 pt-8 h-full">
                <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                  <Scan className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  AI自動抽出
                </h3>
                <p className="text-gray-600">
                  AIが日付、金額、取引先、品目などを自動で読み取り、データ化します。
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                3
              </div>
              <div className="bg-slate-50 rounded-2xl p-6 pt-8 h-full">
                <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  仕訳下書き生成
                </h3>
                <p className="text-gray-600">
                  抽出データから会計仕訳のドラフトを自動生成。確認して保存するだけ。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-12">
            なぜBizNexusのOCRが選ばれるのか
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <CheckCircle className="w-10 h-10 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                高精度AI認識
              </h3>
              <p className="text-gray-600 text-sm">
                最新のAI技術で、手書きや斜めの写真でも高精度に読み取り。日本語対応も万全。
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <Clock className="w-10 h-10 text-blue-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                作業時間を大幅削減
              </h3>
              <p className="text-gray-600 text-sm">
                手入力の手間を省き、経理作業の時間を最大80%削減。本業に集中できます。
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <Shield className="w-10 h-10 text-purple-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                セキュリティ万全
              </h3>
              <p className="text-gray-600 text-sm">
                データは暗号化して安全に管理。国内サーバーで運用し、大切な情報を守ります。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Documents */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            対応書類
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {['領収書', '請求書', '仕入伝票', '経費レシート', '納品書'].map((doc) => (
              <span
                key={doc}
                className="px-4 py-2 bg-slate-100 text-gray-700 rounded-full text-sm"
              >
                {doc}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-3xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            今すぐ無料でお試しください
          </h2>
          <p className="text-blue-100 mb-8">
            登録不要で1日3回まで無料でご利用いただけます。
            <br />
            保存機能は無料アカウント登録後にご利用可能です。
          </p>
          <Link
            href={BIZNEXUS_OCR_URL}
            onClick={handleCtaClick}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 text-lg font-medium rounded-xl hover:bg-blue-50 transition shadow-lg"
          >
            無料で試す
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t bg-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="text-sm text-gray-600">Seisei Inc.</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/legal/privacy" className="hover:text-gray-700">
              プライバシーポリシー
            </Link>
            <Link href="/legal/terms" className="hover:text-gray-700">
              利用規約
            </Link>
            <Link href="https://biznexus.seisei.tokyo" className="hover:text-gray-700">
              BizNexus
            </Link>
          </nav>
          <p className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Seisei Inc. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
