/**
 * Export System Types
 * OCR识别 → 会计软件导入模板导出
 */

// 导出目标软件
export type ExportTarget = 'freee' | 'moneyforward' | 'yayoi';

// 导出文件格式
export type ExportFileFormat = 'csv' | 'txt';

// 编码格式
export type ExportEncoding = 'utf-8' | 'shift-jis' | 'utf-8-bom';

// 税区分
export type TaxCategory =
  | '課税売上10%'
  | '課税売上8%（軽減）'
  | '課税仕入10%'
  | '課税仕入8%（軽減）'
  | '非課税'
  | '対象外'
  | '不課税';

// 借贷方向
export type DebitCredit = '借方' | '貸方';

// ===== Canonical Journal (標準中間格式) =====

export interface CanonicalJournalLine {
  lineNo: number;
  debitCredit: DebitCredit;
  accountCode: string;       // 勘定科目コード
  accountName: string;       // 勘定科目名
  subAccountCode?: string;   // 補助科目コード
  subAccountName?: string;   // 補助科目名
  taxCategory: TaxCategory;
  taxRate: number;           // 10, 8, 0
  amount: number;            // 金額
  taxAmount?: number;        // 税額（内税の場合）
  description?: string;      // 摘要
  departmentCode?: string;   // 部門コード
  departmentName?: string;   // 部門名
  projectCode?: string;      // プロジェクトコード
}

export interface CanonicalJournal {
  id: string;
  documentId: string;

  // 伝票情報
  journalDate: string;       // YYYY-MM-DD
  journalNumber?: string;    // 伝票番号

  // 取引先
  partnerName?: string;
  partnerCode?: string;
  partnerTaxId?: string;     // 登録番号（インボイス）

  // 摘要
  summary: string;

  // 仕訳明細
  lines: CanonicalJournalLine[];

  // メタ情報
  sourceType: 'receipt' | 'vendor_invoice' | 'expense';
  ocrConfidence?: number;

  // 警告・修正履歴
  warnings: ExportWarning[];
  editHistory: EditHistoryEntry[];

  // ステータス
  isBalanced: boolean;       // 借方・貸方一致
  isComplete: boolean;       // 必須項目入力済み

  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// ===== Export Warning =====

export type WarningType =
  | 'UNBALANCED'           // 借贷不平衡
  | 'MISSING_TAX_CATEGORY' // 缺少税区分
  | 'MISSING_ACCOUNT'      // 缺少科目
  | 'ZERO_AMOUNT'          // 金额为0
  | 'INVALID_DATE'         // 无效日期
  | 'MISSING_PARTNER'      // 缺少取引先
  | 'LOW_CONFIDENCE';      // OCR置信度低

export interface ExportWarning {
  type: WarningType;
  field?: string;
  lineNo?: number;
  message: string;
  messageJa: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

// ===== Edit History =====

export interface EditHistoryEntry {
  timestamp: string;
  userId?: string;
  userName?: string;
  field: string;
  lineNo?: number;
  oldValue: string | number | null;
  newValue: string | number | null;
}

// ===== Export Preview =====

export interface ExportPreviewRequest {
  documentId: string;
  target: ExportTarget;
  canonical?: Partial<CanonicalJournal>; // 可选：用户编辑后的数据
}

export interface ExportPreviewResponse {
  success: boolean;
  data?: {
    target: ExportTarget;
    columns: string[];           // 模板列名
    rowsSample: string[][];      // 预览行数据（3-10行）
    totalRows: number;
    warnings: ExportWarning[];
    encoding: ExportEncoding;
    fileFormat: ExportFileFormat;
    fileName: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ===== Export Download =====

export interface ExportDownloadRequest {
  documentId: string;
  target: ExportTarget;
  canonical?: Partial<CanonicalJournal>;
  encoding?: ExportEncoding;
}

export interface ExportDownloadResponse {
  success: boolean;
  data?: {
    downloadUrl: string;         // S3签名URL或直接下载链接
    fileName: string;
    fileSize: number;
    expiresAt: string;
    exportJobId: string;
  };
  error?: {
    code: string;
    message: string;
    requiresAuth?: boolean;
    requiresUpgrade?: boolean;
    upgradeUrl?: string;
  };
}

// ===== Export Job =====

export interface ExportJob {
  id: string;
  documentId: string;
  target: ExportTarget;

  // 文件信息
  s3Key?: string;
  fileName: string;
  fileSize?: number;
  checksum?: string;
  encoding: ExportEncoding;

  // 状态
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;

  // 审计
  createdAt: string;
  createdBy?: string;
  downloadedAt?: string;
  downloadedBy?: string;
  downloadCount: number;

  // 过期
  expiresAt?: string;
}

// ===== Document with Export =====

export interface DocumentWithExport {
  id: string;
  tenantId?: string;
  userId?: string;

  // 来源
  source: 'try-ocr' | 'system-upload' | 'email-import';
  sourceSessionId?: string;    // 匿名会话ID

  // 文件
  originalFileName?: string;
  s3Key?: string;
  mimeType?: string;
  fileSize?: number;

  // OCR结果
  ocrStatus: 'pending' | 'processing' | 'done' | 'failed';
  ocrResult?: OcrResultSummary;
  ocrConfidence?: number;
  ocrProcessedAt?: string;

  // 标准仕訳
  canonical?: CanonicalJournal;

  // 导出历史
  exports: ExportJob[];

  // 状态
  status: 'draft' | 'reviewed' | 'exported' | 'archived';

  // 时间戳
  createdAt: string;
  updatedAt: string;
}

export interface OcrResultSummary {
  merchant?: string;
  date?: string;
  amountTotal?: number;
  amountUntaxed?: number;
  amountTax?: number;
  invoiceNumber?: string;
  lineItemCount: number;
}

// ===== Entitlement =====

export interface ExportEntitlement {
  canPreview: boolean;
  canDownload: boolean;
  availableTargets: ExportTarget[];
  reason?: 'not_logged_in' | 'no_subscription' | 'quota_exceeded' | 'feature_disabled';
  upgradeUrl?: string;
}

// ===== Exporter Interface =====

export interface ExporterConfig {
  target: ExportTarget;
  name: string;
  nameJa: string;
  fileFormat: ExportFileFormat;
  defaultEncoding: ExportEncoding;
  supportedEncodings: ExportEncoding[];
  templateVersion: string;
}

export interface ExporterResult {
  content: string;
  encoding: ExportEncoding;
  fileName: string;
  mimeType: string;
  warnings: ExportWarning[];
}

// ===== Default Account Mappings =====

export const DEFAULT_DEBIT_ACCOUNTS: Record<string, { code: string; name: string }> = {
  receipt: { code: '6110', name: '消耗品費' },
  vendor_invoice: { code: '5100', name: '仕入高' },
  expense: { code: '6200', name: '旅費交通費' },
  meeting: { code: '6150', name: '会議費' },
  entertainment: { code: '6160', name: '交際費' },
};

export const DEFAULT_CREDIT_ACCOUNTS: Record<string, { code: string; name: string }> = {
  cash: { code: '1000', name: '現金' },
  bank: { code: '1100', name: '普通預金' },
  credit_card: { code: '2150', name: 'クレジットカード' },
  accounts_payable: { code: '2100', name: '買掛金' },
};

// ===== Analytics Events =====

export type ExportAnalyticsEvent =
  | 'exporter_selected'
  | 'preview_loaded'
  | 'preview_error'
  | 'download_clicked'
  | 'auth_gate_shown'
  | 'paywall_shown'
  | 'export_generated'
  | 'export_downloaded'
  | 'export_failed'
  | 'canonical_edited';

export interface ExportAnalyticsPayload {
  event: ExportAnalyticsEvent;
  documentId?: string;
  target?: ExportTarget;
  isAuthenticated?: boolean;
  hasEntitlement?: boolean;
  errorCode?: string;
  editedFields?: string[];
}
