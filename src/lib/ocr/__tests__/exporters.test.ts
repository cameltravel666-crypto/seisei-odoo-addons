/**
 * Exporter Unit Tests
 * Tests for freee, MoneyForward, and Yayoi exporters
 *
 * Fixtures:
 * - A: expense (消耗品費 / 現金 / 1100 / 2026-01-25)
 * - B: purchase (仕入高 / 未払金)
 * - C: sale (売掛金 / 売上高)
 */

import { describe, it, expect } from 'vitest';
import { generateExport, generatePreview } from '../exporters';
import type { CanonicalJournal } from '../types';

// ============================================
// Test Fixtures
// ============================================

const DOCUMENT_ID_A = 'cltest001expense';
const DOCUMENT_ID_B = 'cltest002purchase';
const DOCUMENT_ID_C = 'cltest003sale';

// Fixture A: Expense
const fixtureExpense: CanonicalJournal = {
  txn_date: '2026-01-25',
  description: 'オフィス用品購入',
  counterparty_name: '株式会社テスト商店',
  amount_gross: 1100,
  amount_tax: 100,
  tax_rate: 10,
  tax_included: true,
  debit: {
    account_name: '消耗品費',
    tax_category: '課税仕入10%',
  },
  credit: {
    account_name: '現金',
  },
  invoice_reg_no: 'T1234567890123',
  doc_no: 'REC-2026-001',
  payment_method: '現金',
  warnings: [],
};

// Fixture B: Purchase
const fixturePurchase: CanonicalJournal = {
  txn_date: '2026-01-20',
  description: '商品仕入',
  counterparty_name: 'サプライヤー株式会社',
  amount_gross: 55000,
  amount_tax: 5000,
  tax_rate: 10,
  tax_included: true,
  debit: {
    account_name: '仕入高',
    tax_category: '課税仕入10%',
  },
  credit: {
    account_name: '未払金',
  },
  invoice_reg_no: 'T9876543210123',
  doc_no: 'INV-2026-045',
  warnings: [],
};

// Fixture C: Sale
const fixtureSale: CanonicalJournal = {
  txn_date: '2026-01-22',
  description: '商品売上',
  counterparty_name: 'お客様株式会社',
  amount_gross: 110000,
  amount_tax: 10000,
  tax_rate: 10,
  tax_included: true,
  debit: {
    account_name: '売掛金',
  },
  credit: {
    account_name: '売上高',
    tax_category: '課税売上10%',
  },
  doc_no: 'SALES-2026-123',
  warnings: [],
};

// ============================================
// freee Tests
// ============================================

describe('freee Exporter', () => {
  it('should generate correct columns', () => {
    const result = generatePreview(fixtureExpense, DOCUMENT_ID_A, 'FREEE');
    expect(result.columns).toEqual([
      '取引日付',
      '借方勘定科目',
      '借方金額',
      '貸方勘定科目',
      '貸方金額',
      '摘要',
    ]);
  });

  it('should generate correct rows for expense', () => {
    const result = generatePreview(fixtureExpense, DOCUMENT_ID_A, 'FREEE');
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]).toEqual([
      '2026-01-25',
      '消耗品費',
      '1100',
      '現金',
      '1100',
      'オフィス用品購入',
    ]);
  });

  it('should generate CSV with UTF-8 BOM', () => {
    const result = generateExport(fixtureExpense, DOCUMENT_ID_A, 'FREEE');
    expect(result.validation.valid).toBe(true);
    expect(result.content.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(result.encoding).toBe('UTF8_BOM');
  });

  it('should escape CSV values correctly', () => {
    const journalWithComma: CanonicalJournal = {
      ...fixtureExpense,
      description: '商品A, 商品B購入',
    };
    const result = generateExport(journalWithComma, DOCUMENT_ID_A, 'FREEE');
    expect(result.content).toContain('"商品A, 商品B購入"');
  });

  it('should generate correct filename', () => {
    const result = generateExport(fixtureExpense, DOCUMENT_ID_A, 'FREEE');
    expect(result.filename).toMatch(/^freee_20260125_cltest00\.csv$/);
  });
});

// ============================================
// MoneyForward Tests
// ============================================

describe('MoneyForward Exporter', () => {
  it('should generate correct columns', () => {
    const result = generatePreview(fixturePurchase, DOCUMENT_ID_B, 'MONEYFORWARD');
    expect(result.columns).toEqual([
      '取引No',
      '取引日',
      '借方勘定科目',
      '貸方勘定科目',
      '金額',
      '摘要',
    ]);
  });

  it('should generate correct rows for purchase', () => {
    const result = generatePreview(fixturePurchase, DOCUMENT_ID_B, 'MONEYFORWARD');
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]).toEqual([
      'cltest00', // shortId
      '2026-01-20',
      '仕入高',
      '未払金',
      '55000',
      '商品仕入',
    ]);
  });

  it('should generate CSV with UTF-8 BOM', () => {
    const result = generateExport(fixturePurchase, DOCUMENT_ID_B, 'MONEYFORWARD');
    expect(result.validation.valid).toBe(true);
    expect(result.content.charCodeAt(0)).toBe(0xfeff); // BOM
  });

  it('should generate correct filename', () => {
    const result = generateExport(fixturePurchase, DOCUMENT_ID_B, 'MONEYFORWARD');
    expect(result.filename).toMatch(/^mf_20260120_cltest00\.csv$/);
  });
});

// ============================================
// Yayoi Tests
// ============================================

describe('Yayoi Exporter', () => {
  it('should generate correct columns', () => {
    const result = generatePreview(fixtureSale, DOCUMENT_ID_C, 'YAYOI');
    expect(result.columns).toEqual([
      '識別フラグ',
      '日付',
      '借方科目',
      '貸方科目',
      '金額',
      '摘要',
    ]);
  });

  it('should generate correct rows for sale', () => {
    const result = generatePreview(fixtureSale, DOCUMENT_ID_C, 'YAYOI');
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]).toEqual([
      '2000', // 識別フラグ
      '2026/01/22', // Date with slashes
      '売掛金',
      '売上高',
      '110000',
      '商品売上',
    ]);
  });

  it('should generate CSV with UTF-8 BOM by default', () => {
    const result = generateExport(fixtureSale, DOCUMENT_ID_C, 'YAYOI');
    expect(result.validation.valid).toBe(true);
    expect(result.content.charCodeAt(0)).toBe(0xfeff); // BOM
  });

  it('should use YYYY/MM/DD date format', () => {
    const result = generatePreview(fixtureSale, DOCUMENT_ID_C, 'YAYOI');
    expect(result.rows[0][1]).toBe('2026/01/22');
  });

  it('should generate correct filename', () => {
    const result = generateExport(fixtureSale, DOCUMENT_ID_C, 'YAYOI');
    expect(result.filename).toMatch(/^yayoi_20260122_cltest00\.csv$/);
  });
});

// ============================================
// Validation Tests
// ============================================

describe('Validation', () => {
  it('should fail validation for missing date', () => {
    const invalidJournal: CanonicalJournal = {
      ...fixtureExpense,
      txn_date: '',
    };
    const result = generateExport(invalidJournal, DOCUMENT_ID_A, 'FREEE');
    expect(result.validation.valid).toBe(false);
    expect(result.validation.blocking_errors).toContain('取引日は必須です');
  });

  it('should fail validation for invalid amount', () => {
    const invalidJournal: CanonicalJournal = {
      ...fixtureExpense,
      amount_gross: 0,
    };
    const result = generateExport(invalidJournal, DOCUMENT_ID_A, 'FREEE');
    expect(result.validation.valid).toBe(false);
    expect(result.validation.blocking_errors).toContain('金額は0より大きい値が必要です');
  });

  it('should warn for missing invoice registration number', () => {
    const journalWithoutInvoiceNo: CanonicalJournal = {
      ...fixtureExpense,
      invoice_reg_no: undefined,
    };
    const result = generateExport(journalWithoutInvoiceNo, DOCUMENT_ID_A, 'FREEE');
    expect(result.validation.valid).toBe(true);
    expect(result.validation.warnings).toContain('インボイス登録番号がありません');
  });

  it('should warn for missing tax rate', () => {
    const journalWithoutTax: CanonicalJournal = {
      ...fixtureExpense,
      tax_rate: undefined,
    };
    const result = generateExport(journalWithoutTax, DOCUMENT_ID_A, 'FREEE');
    expect(result.validation.valid).toBe(true);
    expect(result.validation.warnings).toContain('税率が設定されていません');
  });
});

// ============================================
// CSV Format Tests
// ============================================

describe('CSV Format', () => {
  it('should use CRLF line endings', () => {
    const result = generateExport(fixtureExpense, DOCUMENT_ID_A, 'FREEE');
    // Check for CRLF between header and data row
    expect(result.content).toContain('\r\n');
    // Should not have bare LF
    const lines = result.content.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('should escape double quotes by doubling them', () => {
    const journalWithQuotes: CanonicalJournal = {
      ...fixtureExpense,
      description: '商品"A"購入',
    };
    const result = generateExport(journalWithQuotes, DOCUMENT_ID_A, 'FREEE');
    expect(result.content).toContain('"商品""A""購入"');
  });

  it('should handle newlines in values', () => {
    const journalWithNewline: CanonicalJournal = {
      ...fixtureExpense,
      description: '商品購入\n備考あり',
    };
    const result = generateExport(journalWithNewline, DOCUMENT_ID_A, 'FREEE');
    expect(result.content).toContain('"商品購入\n備考あり"');
  });
});
