/**
 * 弥生会計 Exporter
 * Generates CSV compatible with Yayoi accounting software
 *
 * 弥生会計 CSV format (簡易版):
 * - 識別フラグ: "2000" for normal journal entry
 * - 日付: YYYY/MM/DD
 * - 借方科目: 勘定科目名
 * - 貸方科目: 勘定科目名
 * - 金額: 金額
 * - 摘要: 自由テキスト
 *
 * Note: 弥生 traditionally uses Shift_JIS encoding
 */

import type { CanonicalJournal, Exporter, ExportEncoding, ValidationResult } from '../types';
import { validateBase, formatDateSlash, shortId, timestamp } from './base';

// ============================================
// Column Definitions
// ============================================

const YAYOI_COLUMNS = [
  '識別フラグ',
  '日付',
  '借方科目',
  '貸方科目',
  '金額',
  '摘要',
] as const;

// ============================================
// Constants
// ============================================

// 識別フラグ: 2000 = 通常仕訳
const YAYOI_NORMAL_ENTRY_FLAG = '2000';

// ============================================
// Exporter Implementation
// ============================================

export const yayoiExporter: Exporter = {
  target: 'YAYOI',

  columns(): string[] {
    return [...YAYOI_COLUMNS];
  },

  buildRows(journal: CanonicalJournal, documentId: string): string[][] {
    const amount = Math.round(journal.amount_gross);

    const row = [
      YAYOI_NORMAL_ENTRY_FLAG,                // 識別フラグ
      formatDateSlash(journal.txn_date),      // 日付 (YYYY/MM/DD)
      journal.debit.account_name,             // 借方科目
      journal.credit.account_name,            // 貸方科目
      String(amount),                         // 金額
      journal.description,                    // 摘要
    ];

    return [row];
  },

  validate(journal: CanonicalJournal): ValidationResult {
    const base = validateBase(journal);

    // Yayoi-specific validations can be added here
    // For now, use base validation

    return base;
  },

  defaultEncoding(): ExportEncoding {
    // Yayoi traditionally uses Shift_JIS, but UTF-8 BOM also works
    // Default to UTF8_BOM for easier handling; user can choose Shift_JIS
    return 'UTF8_BOM';
  },

  filename(journal: CanonicalJournal, documentId: string): string {
    const date = journal.txn_date.replace(/-/g, '');
    return `yayoi_${date}_${shortId(documentId)}.csv`;
  },
};

export default yayoiExporter;
