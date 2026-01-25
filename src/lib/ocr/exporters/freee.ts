/**
 * freee Exporter
 * Generates CSV compatible with freee accounting software
 *
 * freee CSV format (簡易版):
 * - 取引日付: YYYY-MM-DD
 * - 借方勘定科目: 勘定科目名
 * - 借方金額: 金額
 * - 貸方勘定科目: 勘定科目名
 * - 貸方金額: 金額
 * - 摘要: 自由テキスト
 */

import type { CanonicalJournal, Exporter, ExportEncoding, ValidationResult } from '../types';
import { validateBase, formatDateISO, shortId, timestamp } from './base';

// ============================================
// Column Definitions
// ============================================

const FREEE_COLUMNS = [
  '取引日付',
  '借方勘定科目',
  '借方金額',
  '貸方勘定科目',
  '貸方金額',
  '摘要',
] as const;

// ============================================
// Exporter Implementation
// ============================================

export const freeeExporter: Exporter = {
  target: 'FREEE',

  columns(): string[] {
    return [...FREEE_COLUMNS];
  },

  buildRows(journal: CanonicalJournal, documentId: string): string[][] {
    const amount = Math.round(journal.amount_gross);

    const row = [
      formatDateISO(journal.txn_date),       // 取引日付
      journal.debit.account_name,             // 借方勘定科目
      String(amount),                         // 借方金額
      journal.credit.account_name,            // 貸方勘定科目
      String(amount),                         // 貸方金額
      journal.description,                    // 摘要
    ];

    return [row];
  },

  validate(journal: CanonicalJournal): ValidationResult {
    const base = validateBase(journal);

    // freee-specific validations can be added here
    // For now, use base validation

    return base;
  },

  defaultEncoding(): ExportEncoding {
    return 'UTF8_BOM';
  },

  filename(journal: CanonicalJournal, documentId: string): string {
    const date = journal.txn_date.replace(/-/g, '');
    return `freee_${date}_${shortId(documentId)}.csv`;
  },
};

export default freeeExporter;
