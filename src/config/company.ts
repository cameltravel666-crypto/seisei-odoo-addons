/**
 * Company Information Configuration
 *
 * Centralized configuration for legal disclosures and company information.
 * Used in tokusho (特定商取引法) and other legal pages.
 *
 * TODO: Update the following fields with actual company information:
 * - responsiblePerson: 運営責任者名
 * - phone: 電話番号 (optional, can show "お問い合わせフォームより")
 * - bankTransfer: 銀行振込対応可否
 * - businessHours: 営業時間（問い合わせ対応時間）
 */

export const companyInfo = {
  // 販売事業者 / Business Entity
  name: {
    ja: 'Seisei Inc.',
    en: 'Seisei Inc.',
    zh: 'Seisei Inc.',
  },

  // 運営責任者 / Responsible Person
  // TODO: Fill in the responsible person's name
  responsiblePerson: {
    ja: 'TBD（運営責任者名）',
    en: 'TBD (Responsible Person)',
    zh: 'TBD（负责人姓名）',
  },

  // 所在地 / Address
  address: {
    ja: '東京都渋谷区',  // TODO: Full address
    en: 'Shibuya-ku, Tokyo, Japan',
    zh: '日本东京都�的涩谷区',
  },

  // 連絡先 / Contact
  email: 'support@seisei.tokyo',
  phone: null, // TODO: Add phone number or null if not disclosed

  // 営業時間 / Business Hours
  businessHours: {
    ja: '平日 10:00-18:00（日本時間）',
    en: 'Weekdays 10:00-18:00 (JST)',
    zh: '工作日 10:00-18:00（日本时间）',
  },

  // ウェブサイト / Website
  website: 'https://seisei.tokyo',

  // 設立 / Established
  established: '2024',
};

export const pricingInfo = {
  // 通貨 / Currency
  currency: 'JPY',
  currencySymbol: '¥',

  // 税込み表示 / Tax inclusive
  taxInclusive: true,
  taxRate: 10, // 消費税率

  // 基本プラン / Base Plan
  plans: [
    {
      name: { ja: 'スターター', en: 'Starter', zh: '入门版' },
      price: 3000,
      period: { ja: '月額 / 店舗', en: 'per month / store', zh: '月/店铺' },
    },
    {
      name: { ja: 'プロ', en: 'Pro', zh: '专业版' },
      price: 8000,
      period: { ja: '月額 / 店舗', en: 'per month / store', zh: '月/店铺' },
    },
    {
      name: { ja: 'エンタープライズ', en: 'Enterprise', zh: '企业版' },
      price: null, // お見積り
      period: { ja: 'お見積り', en: 'Contact us', zh: '请咨询' },
    },
  ],

  // 追加料金 / Additional Fees
  additionalFees: {
    ja: '消費税込み。銀行振込の場合、振込手数料はお客様負担となります。',
    en: 'Tax included. Bank transfer fees are borne by the customer.',
    zh: '含消费税。银行转账手续费由客户承担。',
  },
};

export const paymentInfo = {
  // 支払方法 / Payment Methods
  methods: [
    {
      name: { ja: 'クレジットカード', en: 'Credit Card', zh: '信用卡' },
      description: {
        ja: 'Visa, Mastercard, American Express, JCB（Stripe経由）',
        en: 'Visa, Mastercard, American Express, JCB (via Stripe)',
        zh: 'Visa, Mastercard, American Express, JCB（通过 Stripe）',
      },
    },
    {
      name: { ja: '銀行振込', en: 'Bank Transfer', zh: '银行转账' },
      description: {
        ja: '年払いプランのみ対応。振込手数料はお客様負担。',
        en: 'Annual plans only. Transfer fees borne by customer.',
        zh: '仅限年付套餐。转账手续费由客户承担。',
      },
    },
  ],

  // 支払時期 / Payment Timing
  timing: {
    ja: '月額プラン：毎月1日に自動課金。年払い：契約開始日に一括課金。',
    en: 'Monthly plans: Automatic billing on the 1st of each month. Annual: Billed upfront on contract start date.',
    zh: '月付套餐：每月1日自动扣款。年付：合同开始日一次性扣款。',
  },

  // 無料トライアル / Free Trial
  trialDays: 14,
};

export const serviceDelivery = {
  // 提供時期 / Service Delivery
  saas: {
    ja: 'アカウント作成完了後、即時ご利用いただけます。',
    en: 'Service is available immediately after account creation.',
    zh: '账户创建完成后即可使用。',
  },

  // 動作環境 / System Requirements
  requirements: {
    ja: 'モダンブラウザ（Chrome, Safari, Firefox, Edge の最新版）推奨。iOS/Android アプリあり。',
    en: 'Modern browsers (latest Chrome, Safari, Firefox, Edge) recommended. iOS/Android apps available.',
    zh: '推荐使用现代浏览器（Chrome, Safari, Firefox, Edge 最新版）。提供 iOS/Android 应用。',
  },
};

export const cancellationPolicy = {
  // SaaS 解約 / SaaS Cancellation
  saas: {
    ja: 'いつでも解約可能。月額プランは当月末まで利用可、日割り返金なし。年払いプランは契約期間終了まで利用可、途中解約時の返金なし。解約後30日間データ保持、その後削除。',
    en: 'Cancel anytime. Monthly plans remain active until end of billing period, no prorated refunds. Annual plans active until contract end, no refunds for early cancellation. Data retained for 30 days after cancellation, then deleted.',
    zh: '可随时取消。月付套餐使用至当月底，无按日退款。年付套餐使用至合同期满，提前取消不退款。取消后数据保留30天，之后删除。',
  },

  // 返金 / Refund
  refund: {
    ja: '初期不良・システム障害による利用不可の場合は、当該期間分を日割りで返金または次月に繰り越し。お客様都合の解約による返金は原則不可。',
    en: 'For service unavailability due to system failures, prorated refund or credit to next billing period. No refunds for customer-initiated cancellation.',
    zh: '因系统故障导致无法使用时，按日退款或抵扣下期费用。客户主动取消原则上不退款。',
  },
};

export const complaintContact = {
  // 苦情・相談窓口 / Complaint Contact
  ja: {
    title: '苦情・相談窓口',
    email: 'support@seisei.tokyo',
    hours: '平日 10:00-18:00（日本時間）',
    note: 'メールでのお問い合わせは24時間受付、2営業日以内に返信いたします。',
  },
  en: {
    title: 'Complaints & Inquiries',
    email: 'support@seisei.tokyo',
    hours: 'Weekdays 10:00-18:00 (JST)',
    note: 'Email inquiries accepted 24/7, response within 2 business days.',
  },
  zh: {
    title: '投诉与咨询',
    email: 'support@seisei.tokyo',
    hours: '工作日 10:00-18:00（日本时间）',
    note: '邮件咨询24小时受理，2个工作日内回复。',
  },
};

// Utility to get localized value
export function getLocalized<T extends Record<string, unknown>>(
  obj: T,
  locale: string
): T[keyof T] {
  const loc = locale as keyof T;
  return obj[loc] || obj['en' as keyof T] || obj['ja' as keyof T];
}
