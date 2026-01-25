/**
 * MoneyForward Exporter
 * Generates CSV compatible with MoneyForward (MFクラウド会計)
 *
 * MoneyForward CSV format (簡易版):
 * - 取引No: 任意の識別番号
 * - 取引日: YYYY-MM-DD or YYYY/MM/DD
 * - 借方勘定科目: 勘定科目名
 * - 貸方勘定科目: 勘定科目名
 * - 金額: 金額
 * - 摘要: 自由テキスト
 */

import type { CanonicalJournal, Exporter, ExportEncoding, ValidationResult } from '../types';
import { validateBase, formatDateISO, shortId, timestamp } from './base';

// ============================================
// Column Definitions
// ============================================

const MONEYFORWARD_COLUMNS = [
  '取引No',
  '取引日',
  '借方勘定科目',
  '貸方勘定科目',
  '金額',
  '摘要',
] as const;

// ============================================
// Exporter Implementation
// ============================================

export const moneyforwardExporter: Exporter = {
  target: 'MONEYFORWARD',

  columns(): string[] {
    return [...MONEYFORWARD_COLUMNS];
  },

  buildRows(journal: CanonicalJournal, documentId: string): string[][] {
    const amount = Math.round(journal.amount_gross);

    const row = [
      shortId(documentId),                    // 取引No
      formatDateISO(journal.txn_date),        // 取引日
      journal.debit.account_name,             // 借方勘定科目
      journal.credit.account_name,            // 貸方勘定科目
      String(amount),                         // 金額
      journal.description,                    // 摘要
    ];

    return [row];
  },

  validate(journal: CanonicalJournal): ValidationResult {
    const base = validateBase(journal);

    // MoneyForward-specific validations can be added here
    // For now, use base validation

    return base;
  },

  defaultEncoding(): ExportEncoding {
    return 'UTF8_BOM';
  },

  filename(journal: CanonicalJournal, documentId: string): string {
    const date = journal.txn_date.replace(/-/g, '');
    return `mf_${date}_${shortId(documentId)}.csv`;
  },
};

export default moneyforwardExporter;
