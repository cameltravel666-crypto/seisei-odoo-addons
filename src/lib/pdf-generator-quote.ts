/**
 * Quote PDF Generator
 * Generates PDF for Quote Builder quotes
 */

import { SUPPORT_COMMITMENT } from './pricing-quote';

interface QuoteData {
  quoteId: string;
  contact: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  };
  config: {
    storeCount: number;
    planId: string;
    modules: string[];
    posSeats: number;
    kdsScreens: number;
    printhubEnabled: boolean;
    printhubEndpoints: number;
    maintenancePlan: string;
    onboardingPackage: string;
    onboardingInstallments: number;
    hardwareConfig: Record<string, any>;
  };
  pricing: {
    softwareMonthly: number;
    softwareMonthlyOriginal: number;
    discountRate: number;
    hardwareMonthly: number;
    onboardingFee: number;
    onboardingMonthly: number;
    firstMonthTotal: number;
    recurringMonthly: number;
  };
  createdAt: string;
}

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter（スターター）',
  ops_basic: 'Ops Basic（オプス ベーシック）',
  ops_auto: 'Ops Auto（オプス オート）',
};

const MODULE_NAMES: Record<string, string> = {
  qr_order: 'QRオーダー',
  receipt: '領収書発行',
  crm: '顧客管理',
  cashbook: '現金出納帳',
  acc_pro: '会計Pro',
  acc_ent: '会計エンタープライズ',
  bi: '高度なBI分析',
  payroll: '給与計算',
};

export async function generateQuotePDF(data: QuoteData): Promise<Buffer> {
  // For now, return a simple HTML-to-PDF conversion
  // In production, you might want to use a library like `puppeteer` or `pdfkit`
  
  const html = generateQuoteHTML(data);
  
  // This is a placeholder - you'll need to implement actual PDF generation
  // Options:
  // 1. Use puppeteer (requires Chrome/Chromium)
  // 2. Use pdfkit (programmatic PDF generation)
  // 3. Use a service like wkhtmltopdf
  
  // For now, return HTML as buffer (you'll need to replace this)
  return Buffer.from(html, 'utf-8');
}

function generateQuoteHTML(data: QuoteData): string {
  const modules = data.config.modules
    .map(m => MODULE_NAMES[m] || m)
    .join('、');

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>お見積書 - ${data.quoteId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 40px;
            background: #fff;
            color: #333;
            font-size: 14px;
            line-height: 1.6;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #2563eb;
        }
        .header h1 {
            font-size: 28px;
            color: #1e3a8a;
            margin-bottom: 10px;
        }
        .quote-id {
            font-size: 16px;
            color: #64748b;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #1e3a8a;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e2e8f0;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }
        .info-label {
            font-weight: bold;
            color: #475569;
        }
        .info-value {
            color: #334155;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        th {
            background: #f1f5f9;
            padding: 12px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #e2e8f0;
        }
        td {
            padding: 10px 12px;
            border: 1px solid #e2e8f0;
        }
        .price {
            text-align: right;
            font-weight: bold;
        }
        .total-row {
            background: #eff6ff;
            font-size: 16px;
            font-weight: bold;
        }
        .notes {
            background: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #2563eb;
            margin-top: 30px;
        }
        .notes h3 {
            color: #1e3a8a;
            margin-bottom: 10px;
        }
        .notes ul {
            list-style-position: inside;
            color: #475569;
        }
        .notes li {
            margin-bottom: 5px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            color: #64748b;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>お見積書</h1>
        <div class="quote-id">${data.quoteId}</div>
        <div style="margin-top: 10px; font-size: 12px;">発行日: ${new Date(data.createdAt).toLocaleDateString('ja-JP')}</div>
    </div>

    <div class="section">
        <div class="section-title">お客様情報</div>
        <div class="info-grid">
            <div class="info-label">お名前</div>
            <div class="info-value">${data.contact.name}</div>
            
            ${data.contact.company ? `
            <div class="info-label">会社名</div>
            <div class="info-value">${data.contact.company}</div>
            ` : ''}
            
            <div class="info-label">メールアドレス</div>
            <div class="info-value">${data.contact.email}</div>
            
            ${data.contact.phone ? `
            <div class="info-label">電話番号</div>
            <div class="info-value">${data.contact.phone}</div>
            ` : ''}
        </div>
    </div>

    <div class="section">
        <div class="section-title">ご希望の構成</div>
        <div class="info-grid">
            <div class="info-label">店舗数</div>
            <div class="info-value">${data.config.storeCount}店舗</div>
            
            <div class="info-label">基本プラン</div>
            <div class="info-value">${PLAN_NAMES[data.config.planId] || data.config.planId}</div>
            
            ${modules ? `
            <div class="info-label">追加モジュール</div>
            <div class="info-value">${modules}</div>
            ` : ''}
            
            ${data.config.posSeats > 0 ? `
            <div class="info-label">POS機位</div>
            <div class="info-value">${data.config.posSeats}機位</div>
            ` : ''}
            
            ${data.config.kdsScreens > 0 ? `
            <div class="info-label">KDS画面</div>
            <div class="info-value">${data.config.kdsScreens}画面</div>
            ` : ''}
            
            ${data.config.maintenancePlan ? `
            <div class="info-label">保守プラン</div>
            <div class="info-value">${data.config.maintenancePlan}</div>
            ` : ''}
            
            ${data.config.onboardingPackage ? `
            <div class="info-label">導入サービス</div>
            <div class="info-value">${data.config.onboardingPackage}${data.config.onboardingInstallments > 0 ? ` (${data.config.onboardingInstallments}回分割)` : ''}</div>
            ` : ''}
        </div>
    </div>

    <div class="section">
        <div class="section-title">お見積金額（税抜）</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 60%;">項目</th>
                    <th style="width: 40%;" class="price">金額</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>ソフトウェア月額費用${data.pricing.discountRate > 0 ? ` (${data.pricing.discountRate}%OFF適用)` : ''}</td>
                    <td class="price">
                        ${data.pricing.discountRate > 0 ? 
                          `<span style="text-decoration: line-through; color: #94a3b8;">¥${data.pricing.softwareMonthlyOriginal.toLocaleString()}</span><br>` : 
                          ''}
                        ¥${data.pricing.softwareMonthly.toLocaleString()}/月
                    </td>
                </tr>
                
                ${data.pricing.hardwareMonthly > 0 ? `
                <tr>
                    <td>ハードウェアレンタル費用</td>
                    <td class="price">¥${data.pricing.hardwareMonthly.toLocaleString()}/月</td>
                </tr>
                ` : ''}
                
                ${data.pricing.onboardingFee > 0 ? `
                <tr>
                    <td>導入費用${data.config.onboardingInstallments > 0 ? ` (${data.config.onboardingInstallments}回分割)` : ''}</td>
                    <td class="price">
                        ${data.config.onboardingInstallments > 0 ? 
                          `¥${data.pricing.onboardingMonthly.toLocaleString()}/月 × ${data.config.onboardingInstallments}回<br>` :
                          ''}
                        合計: ¥${data.pricing.onboardingFee.toLocaleString()}
                    </td>
                </tr>
                ` : ''}
                
                <tr class="total-row">
                    <td>初月お支払い</td>
                    <td class="price">¥${data.pricing.firstMonthTotal.toLocaleString()}</td>
                </tr>
                
                <tr class="total-row" style="background: #dbeafe;">
                    <td>翌月以降（月額）</td>
                    <td class="price">¥${data.pricing.recurringMonthly.toLocaleString()}/月</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="notes">
        <h3>サポート・注記</h3>
        <ul>
            <li>最短${SUPPORT_COMMITMENT.deploymentDays}日で導入開始（データ提供が前提）</li>
            <li>AIサポート: ${SUPPORT_COMMITMENT.botSupport}</li>
            <li>有人サポート: ${SUPPORT_COMMITMENT.humanSupport}（${SUPPORT_COMMITMENT.humanSupportDays}）</li>
            <li>表示価格はすべて税抜です。別途消費税（10%）がかかります。</li>
            <li>本見積は発行日から14日間有効です。</li>
            <li>ハードウェアのBYOD（お手持ちの機器）も利用可能です。</li>
        </ul>
    </div>

    <div class="footer">
        <div><strong>Seisei Inc.</strong></div>
        <div style="margin-top: 5px;">https://seisei.tokyo</div>
        <div style="margin-top: 10px;">© 2026 Seisei Inc. All rights reserved.</div>
    </div>
</body>
</html>
  `.trim();
}
