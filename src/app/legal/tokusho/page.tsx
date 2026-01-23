'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  companyInfo,
  pricingInfo,
  paymentInfo,
  serviceDelivery,
  cancellationPolicy,
  complaintContact,
  getLocalized,
} from '@/config/company';

type LocaleKey = 'ja' | 'en' | 'zh';

// Helper function for localized content
function L<T extends Record<LocaleKey, unknown>>(
  obj: T,
  locale: string
): T[LocaleKey] {
  const loc = (locale || 'ja') as LocaleKey;
  return obj[loc] || obj['en'] || obj['ja'];
}

// Info Row Component
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <th className="py-3 px-4 text-left font-medium text-gray-700 bg-gray-50 w-1/3 align-top text-sm">
        {label}
      </th>
      <td className="py-3 px-4 text-gray-600 text-sm">{children}</td>
    </tr>
  );
}

export default function TokushoPage() {
  const locale = useLocale() as LocaleKey;

  const pageTitle = {
    ja: '特定商取引法に基づく表記',
    en: 'Specified Commercial Transactions Act Notice',
    zh: '特定商取引法披露',
  };

  const labels = {
    businessEntity: { ja: '販売事業者', en: 'Business Entity', zh: '销售事业者' },
    responsiblePerson: {
      ja: '運営責任者',
      en: 'Responsible Person',
      zh: '负责人',
    },
    address: { ja: '所在地', en: 'Address', zh: '地址' },
    contact: { ja: '連絡先', en: 'Contact', zh: '联系方式' },
    price: { ja: '販売価格', en: 'Pricing', zh: '价格' },
    additionalFees: {
      ja: '商品代金以外の必要料金',
      en: 'Additional Fees',
      zh: '其他费用',
    },
    paymentMethod: { ja: '支払方法', en: 'Payment Method', zh: '支付方式' },
    paymentTiming: { ja: '支払時期', en: 'Payment Timing', zh: '支付时间' },
    serviceDelivery: {
      ja: 'サービス提供時期',
      en: 'Service Delivery',
      zh: '服务提供时间',
    },
    systemRequirements: {
      ja: '動作環境',
      en: 'System Requirements',
      zh: '系统要求',
    },
    cancellation: {
      ja: '解約・返金ポリシー',
      en: 'Cancellation & Refund Policy',
      zh: '取消与退款政策',
    },
    complaint: {
      ja: '苦情・相談窓口',
      en: 'Complaints & Inquiries',
      zh: '投诉与咨询',
    },
    freeTrialNote: {
      ja: `※ ${paymentInfo.trialDays}日間の無料トライアルあり`,
      en: `* ${paymentInfo.trialDays}-day free trial available`,
      zh: `* 提供${paymentInfo.trialDays}天免费试用`,
    },
    contactForPrice: {
      ja: 'お見積り',
      en: 'Contact us',
      zh: '请咨询',
    },
  };

  const disclaimer = {
    ja: '本ページは特定商取引法に基づく表記です。サービスの詳細な利用規約については利用規約をご確認ください。',
    en: 'This page is a disclosure under the Specified Commercial Transactions Act. Please refer to the Terms of Service for detailed service terms.',
    zh: '本页面为依据特定商取引法的披露。服务的详细使用条款请参阅服务条款。',
  };

  const backToLogin = {
    ja: 'ログインに戻る',
    en: 'Back to Login',
    zh: '返回登录',
  };

  const relatedLinks = {
    ja: '関連リンク',
    en: 'Related Links',
    zh: '相关链接',
  };

  const termsLabel = {
    ja: '利用規約',
    en: 'Terms of Service',
    zh: '服务条款',
  };

  const privacyLabel = {
    ja: 'プライバシーポリシー',
    en: 'Privacy Policy',
    zh: '隐私政策',
  };

  const pricingLabel = {
    ja: '料金プラン',
    en: 'Pricing',
    zh: '价格方案',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-100">
      <div
        className="max-w-3xl mx-auto px-4 py-8"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 32px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        }}
      >
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            {L(backToLogin, locale)}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {L(pageTitle, locale)}
          </h1>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <InfoRow label={L(labels.businessEntity, locale)}>
                {L(companyInfo.name, locale)}
              </InfoRow>

              <InfoRow label={L(labels.responsiblePerson, locale)}>
                <span className="text-orange-600">
                  {L(companyInfo.responsiblePerson, locale)}
                </span>
              </InfoRow>

              <InfoRow label={L(labels.address, locale)}>
                {L(companyInfo.address, locale)}
              </InfoRow>

              <InfoRow label={L(labels.contact, locale)}>
                <div className="space-y-1">
                  <div>
                    <span className="font-medium">Email:</span>{' '}
                    <a
                      href={`mailto:${companyInfo.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {companyInfo.email}
                    </a>
                  </div>
                  <div className="text-xs text-gray-500">
                    {L(companyInfo.businessHours, locale)}
                  </div>
                </div>
              </InfoRow>

              <InfoRow label={L(labels.price, locale)}>
                <div className="space-y-2">
                  {pricingInfo.plans.map((plan, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="font-medium">{L(plan.name, locale)}</span>
                      <span>
                        {plan.price
                          ? `${pricingInfo.currencySymbol}${plan.price.toLocaleString()} / ${L(plan.period, locale)}`
                          : L(labels.contactForPrice, locale)}
                      </span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 mt-2">
                    {L(labels.freeTrialNote, locale)}
                  </p>
                  {pricingInfo.taxInclusive && (
                    <p className="text-xs text-gray-500">
                      {locale === 'ja'
                        ? `※ 上記価格は消費税（${pricingInfo.taxRate}%）込みです`
                        : locale === 'zh'
                        ? `* 以上价格含消费税（${pricingInfo.taxRate}%）`
                        : `* Prices include consumption tax (${pricingInfo.taxRate}%)`}
                    </p>
                  )}
                </div>
              </InfoRow>

              <InfoRow label={L(labels.additionalFees, locale)}>
                {L(pricingInfo.additionalFees, locale)}
              </InfoRow>

              <InfoRow label={L(labels.paymentMethod, locale)}>
                <ul className="space-y-2">
                  {paymentInfo.methods.map((method, idx) => (
                    <li key={idx}>
                      <span className="font-medium">{L(method.name, locale)}</span>
                      <br />
                      <span className="text-xs text-gray-500">
                        {L(method.description, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </InfoRow>

              <InfoRow label={L(labels.paymentTiming, locale)}>
                {L(paymentInfo.timing, locale)}
              </InfoRow>

              <InfoRow label={L(labels.serviceDelivery, locale)}>
                {L(serviceDelivery.saas, locale)}
              </InfoRow>

              <InfoRow label={L(labels.systemRequirements, locale)}>
                {L(serviceDelivery.requirements, locale)}
              </InfoRow>

              <InfoRow label={L(labels.cancellation, locale)}>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium mb-1">
                      {locale === 'ja'
                        ? '解約について'
                        : locale === 'zh'
                        ? '关于取消'
                        : 'Cancellation'}
                    </p>
                    <p className="text-sm">{L(cancellationPolicy.saas, locale)}</p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">
                      {locale === 'ja'
                        ? '返金について'
                        : locale === 'zh'
                        ? '关于退款'
                        : 'Refund'}
                    </p>
                    <p className="text-sm">{L(cancellationPolicy.refund, locale)}</p>
                  </div>
                </div>
              </InfoRow>

              <InfoRow label={L(labels.complaint, locale)}>
                <div className="space-y-1">
                  <div>
                    <span className="font-medium">Email:</span>{' '}
                    <a
                      href={`mailto:${complaintContact[locale].email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {complaintContact[locale].email}
                    </a>
                  </div>
                  <div className="text-xs text-gray-500">
                    {complaintContact[locale].hours}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {complaintContact[locale].note}
                  </div>
                </div>
              </InfoRow>
            </tbody>
          </table>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-800">{L(disclaimer, locale)}</p>
        </div>

        {/* Related Links */}
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            {L(relatedLinks, locale)}
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href={companyInfo.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              {companyInfo.website.replace('https://', '')}
              <ExternalLink className="w-3 h-3" />
            </a>
            {/* TODO: Add links when pages exist
            <Link
              href="/legal/terms"
              className="inline-flex items-center gap-1 px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              {L(termsLabel, locale)}
            </Link>
            <Link
              href="/legal/privacy"
              className="inline-flex items-center gap-1 px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              {L(privacyLabel, locale)}
            </Link>
            */}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {L(companyInfo.name, locale)} All rights
            reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
