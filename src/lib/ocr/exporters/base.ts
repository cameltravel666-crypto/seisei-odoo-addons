/**
 * Base Exporter utilities
 * Common functions for all exporters
 */

import type { CanonicalJournal, ValidationResult, ExportEncoding } from '../types';

// ============================================
// CSV Utilities
// ============================================

/**
 * Escape a value for CSV format
 * - Double quotes are escaped as ""
 * - Values containing commas, quotes, or newlines are wrapped in quotes
 */
export function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if escaping is needed
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    // Escape double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Build a CSV row from array of values
 */
export function buildCSVRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCSV).join(',');
}

/**
 * Build complete CSV content with headers and rows
 */
export function buildCSVContent(
  columns: string[],
  rows: (string | number | null | undefined)[][],
  encoding: ExportEncoding = 'UTF8_BOM'
): string {
  const lines: string[] = [];

  // Header row
  lines.push(buildCSVRow(columns));

  // Data rows
  for (const row of rows) {
    lines.push(buildCSVRow(row));
  }

  // Join with CRLF (Windows line endings for Excel compatibility)
  let content = lines.join('\r\n');

  // Add BOM for UTF-8 if needed
  if (encoding === 'UTF8_BOM') {
    content = '\ufeff' + content;
  }

  return content;
}

/**
 * Convert content to specified encoding
 * Note: For Shift_JIS, this needs to be handled by the caller using iconv-lite
 */
export function getEncodingHeader(encoding: ExportEncoding): string {
  if (encoding === 'SHIFT_JIS') {
    return 'text/csv; charset=Shift_JIS';
  }
  return 'text/csv; charset=utf-8';
}

// ============================================
// Date Formatting
// ============================================

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateISO(date: string): string {
  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  // Try to parse and format
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return date;
  }
  return d.toISOString().split('T')[0];
}

/**
 * Format date as YYYY/MM/DD (for Yayoi)
 */
export function formatDateSlash(date: string): string {
  const iso = formatDateISO(date);
  return iso.replace(/-/g, '/');
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Base validation for all exporters
 */
export function validateBase(journal: CanonicalJournal): ValidationResult {
  const blocking_errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!journal.txn_date) {
    blocking_errors.push('取引日は必須です');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(journal.txn_date)) {
    blocking_errors.push('取引日の形式が不正です（YYYY-MM-DD）');
  }

  if (!journal.amount_gross || journal.amount_gross <= 0) {
    blocking_errors.push('金額は0より大きい値が必要です');
  }

  if (!journal.debit?.account_name) {
    blocking_errors.push('借方勘定科目は必須です');
  }

  if (!journal.credit?.account_name) {
    blocking_errors.push('貸方勘定科目は必須です');
  }

  // Warnings
  if (journal.tax_rate === undefined) {
    warnings.push('税率が設定されていません');
  }

  if (!journal.invoice_reg_no) {
    warnings.push('インボイス登録番号がありません');
  }

  if (!journal.counterparty_name) {
    warnings.push('取引先名がありません');
  }

  return {
    valid: blocking_errors.length === 0,
    blocking_errors,
    warnings,
  };
}

// ============================================
// Filename Generation
// ============================================

/**
 * Generate a short ID from document ID (first 8 chars)
 */
export function shortId(documentId: string): string {
  return documentId.slice(0, 8);
}

/**
 * Generate timestamp string for filename
 */
export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
