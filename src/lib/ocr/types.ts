/**
 * OCR Types - 極簡三モジュール
 * Canonical Journal format and related types
 */

// ============================================
// Enums (matching Prisma schema)
// ============================================

export type OcrDocumentType = 'PURCHASE' | 'SALE' | 'EXPENSE';
export type ExportTarget = 'FREEE' | 'MONEYFORWARD' | 'YAYOI';
export type ExportEncoding = 'UTF8_BOM' | 'SHIFT_JIS';

// ============================================
// Canonical Journal (統一中間格式)
// ============================================

export interface CanonicalAccount {
  account_name: string;      // 勘定科目名: 仕入, 売上高, 旅費交通費, etc.
  tax_category?: string;     // 税区分: 課税仕入10%, 課税売上10%, etc.
}

export interface CanonicalJournal {
  // Core transaction data
  txn_date: string;          // YYYY-MM-DD
  description: string;       // 摘要
  counterparty_name?: string;// 取引先名

  // Amounts
  amount_gross: number;      // 税込金額
  amount_tax?: number;       // 税額
  tax_rate?: number;         // 税率 (10, 8, 0)
  tax_included: boolean;     // 税込フラグ (default: true)

  // Debit/Credit
  debit: CanonicalAccount;   // 借方
  credit: CanonicalAccount;  // 貸方

  // Optional metadata
  invoice_reg_no?: string;   // インボイス登録番号 (T + 13桁)
  doc_no?: string;           // 伝票番号
  payment_method?: string;   // 支払方法: 現金, 銀行振込, クレジットカード

  // Validation warnings
  warnings: string[];
}

// ============================================
// OCR Extracted Fields (from OCR service)
// ============================================

export interface OcrExtractedFields {
  date?: string;             // 取引日
  counterparty?: string;     // 取引先
  total?: number;            // 合計金額
  subtotal?: number;         // 税抜金額
  tax?: number;              // 税額
  tax_rate?: number;         // 税率
  invoice_reg_no?: string;   // インボイス登録番号
  doc_no?: string;           // 伝票番号/請求書番号
  items?: OcrLineItem[];     // 明細行
  payment_method?: string;   // 支払方法
  description?: string;      // 摘要/備考

  // Expense-specific
  category?: string;         // 費用カテゴリ (交通費, 会議費, etc.)
}

export interface OcrLineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  tax_rate?: number;
}

// ============================================
// API Request/Response Types
// ============================================

export interface RecognizeRequest {
  type: OcrDocumentType;
  // file is sent as multipart/form-data
}

export interface RecognizeResponse {
  document_id: string;
  extracted_summary: {
    date: string | null;
    counterparty: string | null;
    total: number | null;
    tax_rate: number | null;
    tax: number | null;
    invoice_reg_no: string | null;
  };
  canonical_journal: CanonicalJournal;
  warnings: string[];
  usage: {
    remaining_free: number;
    billed_count: number;
    unit_price: number;
  };
}

export interface PreviewRequest {
  document_id: string;
  target: ExportTarget;
}

export interface PreviewResponse {
  columns: string[];
  rows_sample: string[][];
  warnings: string[];
}

export interface DownloadRequest {
  document_id: string;
  target: ExportTarget;
  encoding?: ExportEncoding;
}

export interface DownloadResponse {
  download_url: string;
  filename: string;
  expires_at: string; // ISO timestamp
}

export interface WritebackRequest {
  document_id: string;
}

export interface WritebackResponse {
  odoo_model: string;
  odoo_record_id: number;
  odoo_url: string;
}

// ============================================
// Validation Types
// ============================================

export interface ValidationResult {
  valid: boolean;
  blocking_errors: string[];  // 阻断级错误
  warnings: string[];         // 警告级
}

// ============================================
// Exporter Interface
// ============================================

export interface Exporter {
  /** Target name for this exporter */
  target: ExportTarget;

  /** Get column headers */
  columns(): string[];

  /** Build CSV rows from canonical journal */
  buildRows(journal: CanonicalJournal, documentId: string): string[][];

  /** Validate journal before export */
  validate(journal: CanonicalJournal): ValidationResult;

  /** Default encoding for this target */
  defaultEncoding(): ExportEncoding;

  /** Generate filename */
  filename(journal: CanonicalJournal, documentId: string): string;
}
