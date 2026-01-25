/**
 * Canonical Journal Generator
 * 从OCR结果生成标准仕訳中间格式
 */

import type {
  CanonicalJournal,
  CanonicalJournalLine,
  TaxCategory,
  ExportWarning,
  DEFAULT_DEBIT_ACCOUNTS,
  DEFAULT_CREDIT_ACCOUNTS,
} from '@/types/export';

// 票据类型
export type SourceDocType = 'receipt' | 'vendor_invoice' | 'expense';

// OCR行项目（来自现有系统）
export interface OcrLineItem {
  product_name?: string;
  account_name?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  tax_rate?: string;
  amount?: number;
}

// OCR结果（来自现有系统的VoucherDraft）
export interface OcrVoucherDraft {
  id: string;
  odoo_move_id?: number;
  move_type: string;
  partner_name: string | null;
  partner_vat: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  amount_total: number | null;
  amount_untaxed: number | null;
  amount_tax: number | null;
  line_items: OcrLineItem[];
  ocr_confidence: number | null;
  ocr_status: string;
  status: string;
}

// 默认科目映射
const DEBIT_ACCOUNT_MAPPING: Record<string, { code: string; name: string }> = {
  // 费用类
  '消耗品費': { code: '6110', name: '消耗品費' },
  '会議費': { code: '6150', name: '会議費' },
  '交際費': { code: '6160', name: '交際費' },
  '旅費交通費': { code: '6200', name: '旅費交通費' },
  '通信費': { code: '6210', name: '通信費' },
  '水道光熱費': { code: '6220', name: '水道光熱費' },
  '広告宣伝費': { code: '6300', name: '広告宣伝費' },
  '地代家賃': { code: '6400', name: '地代家賃' },
  '保険料': { code: '6500', name: '保険料' },
  '修繕費': { code: '6600', name: '修繕費' },
  '雑費': { code: '6900', name: '雑費' },
  // 仕入
  '仕入高': { code: '5100', name: '仕入高' },
  '仕入': { code: '5100', name: '仕入高' },
  '売上原価': { code: '5000', name: '売上原価' },
  // 経費（英語から日本語への変換用）
  'Consumables': { code: '6110', name: '消耗品費' },
  'Expenses': { code: '6900', name: '雑費' },
  'Purchase': { code: '5100', name: '仕入高' },
  'Cost of Goods Sold': { code: '5000', name: '売上原価' },
};

const CREDIT_ACCOUNT_MAPPING: Record<string, { code: string; name: string }> = {
  '現金': { code: '1000', name: '現金' },
  '普通預金': { code: '1100', name: '普通預金' },
  '当座預金': { code: '1110', name: '当座預金' },
  'クレジットカード': { code: '2150', name: 'クレジットカード' },
  '買掛金': { code: '2100', name: '買掛金' },
  '未払金': { code: '2120', name: '未払金' },
};

// 税率から税区分を推定
function inferTaxCategory(taxRate: string | number | undefined, isDebit: boolean): TaxCategory {
  if (!taxRate) {
    return isDebit ? '課税仕入10%' : '対象外';
  }

  const rate = typeof taxRate === 'string'
    ? parseFloat(taxRate.replace('%', ''))
    : taxRate;

  if (rate === 10) {
    return isDebit ? '課税仕入10%' : '課税売上10%';
  } else if (rate === 8) {
    return isDebit ? '課税仕入8%（軽減）' : '課税売上8%（軽減）';
  } else if (rate === 0) {
    return '対象外';
  }

  return isDebit ? '課税仕入10%' : '対象外';
}

// 科目名から借方科目を推定
function inferDebitAccount(
  accountName: string | undefined,
  productName: string | undefined,
  sourceType: SourceDocType
): { code: string; name: string } {
  // 既存の科目名があればそれを使用
  if (accountName) {
    const mapped = DEBIT_ACCOUNT_MAPPING[accountName];
    if (mapped) return mapped;
  }

  // 商品名からキーワード推定
  if (productName) {
    const keywords: Record<string, { code: string; name: string }> = {
      '会議': DEBIT_ACCOUNT_MAPPING['会議費'],
      '交通': DEBIT_ACCOUNT_MAPPING['旅費交通費'],
      '電車': DEBIT_ACCOUNT_MAPPING['旅費交通費'],
      'タクシー': DEBIT_ACCOUNT_MAPPING['旅費交通費'],
      '通信': DEBIT_ACCOUNT_MAPPING['通信費'],
      '電話': DEBIT_ACCOUNT_MAPPING['通信費'],
      '水道': DEBIT_ACCOUNT_MAPPING['水道光熱費'],
      '電気': DEBIT_ACCOUNT_MAPPING['水道光熱費'],
      'ガス': DEBIT_ACCOUNT_MAPPING['水道光熱費'],
      '広告': DEBIT_ACCOUNT_MAPPING['広告宣伝費'],
      '保険': DEBIT_ACCOUNT_MAPPING['保険料'],
      '修繕': DEBIT_ACCOUNT_MAPPING['修繕費'],
      '家賃': DEBIT_ACCOUNT_MAPPING['地代家賃'],
    };

    for (const [keyword, account] of Object.entries(keywords)) {
      if (productName.includes(keyword)) {
        return account;
      }
    }
  }

  // ソースタイプに基づくデフォルト
  switch (sourceType) {
    case 'receipt':
      return { code: '6110', name: '消耗品費' };
    case 'vendor_invoice':
      return { code: '5100', name: '仕入高' };
    case 'expense':
      return { code: '6900', name: '雑費' };
    default:
      return { code: '6110', name: '消耗品費' };
  }
}

// デフォルトの貸方科目
function getDefaultCreditAccount(): { code: string; name: string } {
  return { code: '1000', name: '現金' };
}

/**
 * OCR結果から標準仕訳を生成
 */
export function generateCanonicalJournal(
  voucherDraft: OcrVoucherDraft,
  sourceType: SourceDocType,
  options?: {
    creditAccountName?: string;
    departmentCode?: string;
    departmentName?: string;
  }
): CanonicalJournal {
  const warnings: ExportWarning[] = [];
  const lines: CanonicalJournalLine[] = [];

  // 日付
  const journalDate = voucherDraft.invoice_date || new Date().toISOString().slice(0, 10);

  // 貸方科目の決定
  const creditAccount = options?.creditAccountName
    ? (CREDIT_ACCOUNT_MAPPING[options.creditAccountName] || getDefaultCreditAccount())
    : getDefaultCreditAccount();

  // 行項目から借方を生成
  if (voucherDraft.line_items && voucherDraft.line_items.length > 0) {
    let lineNo = 1;

    for (const item of voucherDraft.line_items) {
      if (!item.amount || item.amount === 0) continue;

      const debitAccount = inferDebitAccount(item.account_name, item.product_name, sourceType);
      const taxCategory = inferTaxCategory(item.tax_rate, true);

      lines.push({
        lineNo: lineNo++,
        debitCredit: '借方',
        accountCode: debitAccount.code,
        accountName: debitAccount.name,
        taxCategory,
        taxRate: item.tax_rate ? parseFloat(String(item.tax_rate).replace('%', '')) : 10,
        amount: item.amount,
        description: item.product_name || '',
        departmentCode: options?.departmentCode,
        departmentName: options?.departmentName,
      });
    }

    // 合計金額で貸方を生成
    const totalDebit = lines.reduce((sum, l) => sum + l.amount, 0);

    lines.push({
      lineNo: lineNo++,
      debitCredit: '貸方',
      accountCode: creditAccount.code,
      accountName: creditAccount.name,
      taxCategory: '対象外',
      taxRate: 0,
      amount: totalDebit,
      departmentCode: options?.departmentCode,
      departmentName: options?.departmentName,
    });
  } else {
    // 行項目がない場合は合計金額から生成
    const amount = voucherDraft.amount_total || 0;

    if (amount === 0) {
      warnings.push({
        type: 'ZERO_AMOUNT',
        message: 'Total amount is zero',
        messageJa: '合計金額が0です',
        severity: 'error',
      });
    }

    const debitAccount = inferDebitAccount(undefined, undefined, sourceType);

    lines.push({
      lineNo: 1,
      debitCredit: '借方',
      accountCode: debitAccount.code,
      accountName: debitAccount.name,
      taxCategory: '課税仕入10%',
      taxRate: 10,
      amount,
      departmentCode: options?.departmentCode,
      departmentName: options?.departmentName,
    });

    lines.push({
      lineNo: 2,
      debitCredit: '貸方',
      accountCode: creditAccount.code,
      accountName: creditAccount.name,
      taxCategory: '対象外',
      taxRate: 0,
      amount,
      departmentCode: options?.departmentCode,
      departmentName: options?.departmentName,
    });
  }

  // 借貸バランスチェック
  const debitTotal = lines.filter(l => l.debitCredit === '借方').reduce((sum, l) => sum + l.amount, 0);
  const creditTotal = lines.filter(l => l.debitCredit === '貸方').reduce((sum, l) => sum + l.amount, 0);
  const isBalanced = Math.abs(debitTotal - creditTotal) < 1; // 1円未満の誤差は許容

  if (!isBalanced) {
    warnings.push({
      type: 'UNBALANCED',
      message: `Debit (${debitTotal}) and Credit (${creditTotal}) do not match`,
      messageJa: `借方(${debitTotal})と貸方(${creditTotal})が一致しません`,
      severity: 'error',
    });
  }

  // 摘要の生成
  const summary = buildSummary(voucherDraft, sourceType);

  // 必須項目チェック
  const isComplete = Boolean(
    journalDate &&
    lines.length >= 2 &&
    lines.every(l => l.accountCode && l.accountName)
  );

  if (!isComplete) {
    warnings.push({
      type: 'MISSING_ACCOUNT',
      message: 'Some required fields are missing',
      messageJa: '必須項目が不足しています',
      severity: 'warning',
    });
  }

  // OCR信頼度チェック
  if (voucherDraft.ocr_confidence && voucherDraft.ocr_confidence < 0.7) {
    warnings.push({
      type: 'LOW_CONFIDENCE',
      message: `OCR confidence is low (${Math.round(voucherDraft.ocr_confidence * 100)}%)`,
      messageJa: `OCR認識精度が低いです (${Math.round(voucherDraft.ocr_confidence * 100)}%)`,
      severity: 'warning',
      suggestion: '画像を確認し、必要に応じて手動で修正してください',
    });
  }

  return {
    id: voucherDraft.id,
    documentId: voucherDraft.id,
    journalDate,
    journalNumber: voucherDraft.invoice_number || undefined,
    partnerName: voucherDraft.partner_name || undefined,
    partnerTaxId: voucherDraft.partner_vat || undefined,
    summary,
    lines,
    sourceType,
    ocrConfidence: voucherDraft.ocr_confidence || undefined,
    warnings,
    editHistory: [],
    isBalanced,
    isComplete,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 摘要を生成
 */
function buildSummary(voucherDraft: OcrVoucherDraft, sourceType: SourceDocType): string {
  const parts: string[] = [];

  // 取引先名
  if (voucherDraft.partner_name) {
    parts.push(voucherDraft.partner_name);
  }

  // ソースタイプに応じた接尾辞
  switch (sourceType) {
    case 'receipt':
      parts.push('領収書');
      break;
    case 'vendor_invoice':
      parts.push('請求書');
      break;
    case 'expense':
      parts.push('経費');
      break;
  }

  // 請求書番号
  if (voucherDraft.invoice_number) {
    parts.push(`(${voucherDraft.invoice_number})`);
  }

  return parts.join(' ');
}

/**
 * CanonicalJournalを更新（編集後）
 */
export function updateCanonicalJournal(
  canonical: CanonicalJournal,
  updates: Partial<CanonicalJournal>,
  userId?: string,
  userName?: string
): CanonicalJournal {
  const now = new Date().toISOString();
  const editHistory = [...canonical.editHistory];

  // 変更を記録
  for (const [key, newValue] of Object.entries(updates)) {
    if (key === 'lines' || key === 'editHistory' || key === 'warnings') continue;

    const oldValue = canonical[key as keyof CanonicalJournal];
    if (oldValue !== newValue) {
      editHistory.push({
        timestamp: now,
        userId,
        userName,
        field: key,
        oldValue: oldValue as string | number | null,
        newValue: newValue as string | number | null,
      });
    }
  }

  // 行の更新があれば
  if (updates.lines) {
    for (let i = 0; i < updates.lines.length; i++) {
      const newLine = updates.lines[i];
      const oldLine = canonical.lines[i];

      if (!oldLine) continue;

      for (const [key, newValue] of Object.entries(newLine)) {
        const oldValue = oldLine[key as keyof CanonicalJournalLine];
        if (oldValue !== newValue) {
          editHistory.push({
            timestamp: now,
            userId,
            userName,
            field: key,
            lineNo: newLine.lineNo,
            oldValue: oldValue as string | number | null,
            newValue: newValue as string | number | null,
          });
        }
      }
    }
  }

  // 借貸バランス再チェック
  const lines = updates.lines || canonical.lines;
  const debitTotal = lines.filter(l => l.debitCredit === '借方').reduce((sum, l) => sum + l.amount, 0);
  const creditTotal = lines.filter(l => l.debitCredit === '貸方').reduce((sum, l) => sum + l.amount, 0);
  const isBalanced = Math.abs(debitTotal - creditTotal) < 1;

  return {
    ...canonical,
    ...updates,
    editHistory,
    isBalanced,
    updatedAt: now,
    updatedBy: userId,
  };
}

/**
 * 勘定科目のサジェスト
 */
export function suggestAccounts(keyword: string, type: 'debit' | 'credit'): Array<{ code: string; name: string }> {
  const mapping = type === 'debit' ? DEBIT_ACCOUNT_MAPPING : CREDIT_ACCOUNT_MAPPING;
  const results: Array<{ code: string; name: string }> = [];

  for (const [name, account] of Object.entries(mapping)) {
    if (name.includes(keyword) || account.code.includes(keyword)) {
      results.push(account);
    }
  }

  return results;
}
