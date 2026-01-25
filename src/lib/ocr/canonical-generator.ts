/**
 * Canonical Journal Generator
 * Converts OCR extracted fields to unified CanonicalJournal format
 */

import type {
  OcrDocumentType,
  OcrExtractedFields,
  CanonicalJournal,
  CanonicalAccount,
} from './types';

// ============================================
// Default Account Mappings
// ============================================

const PURCHASE_DEBIT_ACCOUNTS: Record<string, string> = {
  default: '仕入高',
  consumables: '消耗品費',
  supplies: '事務用品費',
  utilities: '水道光熱費',
};

const PURCHASE_CREDIT_ACCOUNTS: Record<string, string> = {
  default: '未払金',
  cash: '現金',
  bank: '普通預金',
  credit_card: 'クレジットカード',
};

const SALE_DEBIT_ACCOUNTS: Record<string, string> = {
  default: '売掛金',
  cash: '現金',
  bank: '普通預金',
};

const SALE_CREDIT_ACCOUNTS: Record<string, string> = {
  default: '売上高',
};

const EXPENSE_DEBIT_ACCOUNTS: Record<string, string> = {
  default: '消耗品費',
  travel: '旅費交通費',
  transportation: '旅費交通費',
  meeting: '会議費',
  entertainment: '交際費',
  communication: '通信費',
  supplies: '事務用品費',
  consumables: '消耗品費',
};

const EXPENSE_CREDIT_ACCOUNTS: Record<string, string> = {
  default: '現金',
  cash: '現金',
  bank: '普通預金',
  credit_card: 'クレジットカード',
};

// ============================================
// Tax Category Mapping
// ============================================

function getTaxCategory(taxRate: number | undefined, type: OcrDocumentType): string | undefined {
  if (taxRate === undefined) return undefined;

  if (type === 'PURCHASE') {
    if (taxRate === 10) return '課税仕入10%';
    if (taxRate === 8) return '課税仕入8%（軽減）';
    if (taxRate === 0) return '非課税仕入';
  } else if (type === 'SALE') {
    if (taxRate === 10) return '課税売上10%';
    if (taxRate === 8) return '課税売上8%（軽減）';
    if (taxRate === 0) return '非課税売上';
  } else if (type === 'EXPENSE') {
    if (taxRate === 10) return '課税仕入10%';
    if (taxRate === 8) return '課税仕入8%（軽減）';
    if (taxRate === 0) return '非課税仕入';
  }

  return undefined;
}

// ============================================
// Heuristic Account Selection
// ============================================

function inferExpenseCategory(extracted: OcrExtractedFields): string {
  const description = (extracted.description || '').toLowerCase();
  const category = (extracted.category || '').toLowerCase();

  // Transportation
  if (
    category.includes('交通') ||
    description.includes('電車') ||
    description.includes('タクシー') ||
    description.includes('バス') ||
    description.includes('飛行機') ||
    description.includes('新幹線')
  ) {
    return 'travel';
  }

  // Meeting
  if (
    category.includes('会議') ||
    description.includes('会議') ||
    description.includes('ミーティング')
  ) {
    return 'meeting';
  }

  // Entertainment
  if (
    category.includes('交際') ||
    description.includes('接待') ||
    description.includes('懇親会')
  ) {
    return 'entertainment';
  }

  // Communication
  if (
    category.includes('通信') ||
    description.includes('電話') ||
    description.includes('インターネット')
  ) {
    return 'communication';
  }

  // Supplies
  if (
    category.includes('事務') ||
    description.includes('文房具') ||
    description.includes('コピー')
  ) {
    return 'supplies';
  }

  return 'default';
}

function inferPaymentMethod(extracted: OcrExtractedFields): string {
  const paymentMethod = (extracted.payment_method || '').toLowerCase();

  if (paymentMethod.includes('現金') || paymentMethod.includes('cash')) {
    return 'cash';
  }
  if (
    paymentMethod.includes('振込') ||
    paymentMethod.includes('銀行') ||
    paymentMethod.includes('bank')
  ) {
    return 'bank';
  }
  if (
    paymentMethod.includes('クレジット') ||
    paymentMethod.includes('カード') ||
    paymentMethod.includes('credit')
  ) {
    return 'credit_card';
  }

  return 'default';
}

// ============================================
// Main Generator Function
// ============================================

export function generateCanonicalJournal(
  type: OcrDocumentType,
  extracted: OcrExtractedFields
): CanonicalJournal {
  const warnings: string[] = [];

  // Parse date
  let txnDate = extracted.date || '';
  if (!txnDate) {
    txnDate = new Date().toISOString().split('T')[0];
    warnings.push('取引日が認識できませんでした。本日の日付を設定しました。');
  }

  // Parse amount
  const amountGross = extracted.total || 0;
  if (amountGross <= 0) {
    warnings.push('金額が認識できませんでした。手動で入力してください。');
  }

  // Parse tax
  const taxRate = extracted.tax_rate;
  const amountTax = extracted.tax;
  if (taxRate === undefined) {
    warnings.push('税率が認識できませんでした。確認してください。');
  }

  // Description
  let description = extracted.description || '';
  if (!description && extracted.counterparty) {
    description = extracted.counterparty;
  }
  if (!description) {
    description = '（摘要なし）';
    warnings.push('摘要が認識できませんでした。');
  }

  // Counterparty
  const counterpartyName = extracted.counterparty;
  if (!counterpartyName) {
    warnings.push('取引先が認識できませんでした。');
  }

  // Invoice registration number
  const invoiceRegNo = extracted.invoice_reg_no;
  if (!invoiceRegNo) {
    warnings.push('インボイス登録番号がありません。適格請求書でない可能性があります。');
  }

  // Determine accounts based on type
  let debit: CanonicalAccount;
  let credit: CanonicalAccount;
  const paymentMethodKey = inferPaymentMethod(extracted);

  switch (type) {
    case 'PURCHASE':
      debit = {
        account_name: PURCHASE_DEBIT_ACCOUNTS.default,
        tax_category: getTaxCategory(taxRate, type),
      };
      credit = {
        account_name: PURCHASE_CREDIT_ACCOUNTS[paymentMethodKey] || PURCHASE_CREDIT_ACCOUNTS.default,
      };
      break;

    case 'SALE':
      debit = {
        account_name: SALE_DEBIT_ACCOUNTS[paymentMethodKey] || SALE_DEBIT_ACCOUNTS.default,
      };
      credit = {
        account_name: SALE_CREDIT_ACCOUNTS.default,
        tax_category: getTaxCategory(taxRate, type),
      };
      break;

    case 'EXPENSE':
      const expenseCategoryKey = inferExpenseCategory(extracted);
      debit = {
        account_name:
          EXPENSE_DEBIT_ACCOUNTS[expenseCategoryKey] || EXPENSE_DEBIT_ACCOUNTS.default,
        tax_category: getTaxCategory(taxRate, type),
      };
      credit = {
        account_name:
          EXPENSE_CREDIT_ACCOUNTS[paymentMethodKey] || EXPENSE_CREDIT_ACCOUNTS.default,
      };
      break;
  }

  return {
    txn_date: txnDate,
    description,
    counterparty_name: counterpartyName,
    amount_gross: amountGross,
    amount_tax: amountTax,
    tax_rate: taxRate,
    tax_included: true, // Default to tax-included
    debit,
    credit,
    invoice_reg_no: invoiceRegNo,
    doc_no: extracted.doc_no,
    payment_method: extracted.payment_method,
    warnings,
  };
}

// ============================================
// Validation
// ============================================

export function validateCanonicalJournal(journal: CanonicalJournal): {
  valid: boolean;
  blocking_errors: string[];
  warnings: string[];
} {
  const blocking_errors: string[] = [];
  const warnings: string[] = [...journal.warnings];

  // Blocking: txn_date must exist and be valid
  if (!journal.txn_date) {
    blocking_errors.push('取引日は必須です。');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(journal.txn_date)) {
    blocking_errors.push('取引日の形式が不正です（YYYY-MM-DD）。');
  }

  // Blocking: amount_gross must be positive
  if (!journal.amount_gross || journal.amount_gross <= 0) {
    blocking_errors.push('金額は0より大きい値が必要です。');
  }

  // Blocking: debit/credit accounts must exist
  if (!journal.debit?.account_name) {
    blocking_errors.push('借方勘定科目は必須です。');
  }
  if (!journal.credit?.account_name) {
    blocking_errors.push('貸方勘定科目は必須です。');
  }

  // Warning: tax_rate not recognized
  if (journal.tax_rate === undefined) {
    warnings.push('税率が設定されていません。');
  }

  // Warning: invoice_reg_no missing
  if (!journal.invoice_reg_no) {
    warnings.push('インボイス登録番号がありません。');
  }

  // Warning: counterparty missing
  if (!journal.counterparty_name) {
    warnings.push('取引先名がありません。');
  }

  return {
    valid: blocking_errors.length === 0,
    blocking_errors,
    warnings,
  };
}
