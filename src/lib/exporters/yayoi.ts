/**
 * Yayoi (弥生会計) Exporter
 * 弥生会計 仕訳日記帳インポート形式
 *
 * 参考: 弥生会計 仕訳データインポート形式
 * https://www.yayoi-kk.co.jp/products/account/
 */

import { BaseExporter } from './base';
import type {
  CanonicalJournal,
  CanonicalJournalLine,
  ExporterConfig,
  ExportWarning,
  TaxCategory,
} from '@/types/export';

// 弥生税区分マッピング
const YAYOI_TAX_MAPPING: Record<TaxCategory, string> = {
  '課税売上10%': '課税売上10%',
  '課税売上8%（軽減）': '課税売上8%（軽）',
  '課税仕入10%': '課税仕入10%',
  '課税仕入8%（軽減）': '課税仕入8%（軽）',
  '非課税': '非課税',
  '対象外': '対象外',
  '不課税': '不課税',
};

// 弥生会計 仕訳日記帳CSV列定義
// TODO: 弥生の正式なCSVフォーマットに合わせて調整が必要
const YAYOI_COLUMNS = [
  '識別フラグ',     // 2000=単一仕訳, 2110=複合仕訳ヘッダ, 2100=複合仕訳明細
  '伝票No.',        // 伝票番号
  '決算',           // 0=通常, 1=決算
  '取引日付',       // YYYY/MM/DD
  '借方勘定科目',   // 勘定科目名
  '借方補助科目',   // 補助科目名
  '借方部門',       // 部門名
  '借方税区分',     // 弥生形式の税区分
  '借方金額',       // 税込金額
  '借方税金額',     // 消費税額
  '貸方勘定科目',   // 勘定科目名
  '貸方補助科目',   // 補助科目名
  '貸方部門',       // 部門名
  '貸方税区分',     // 弥生形式の税区分
  '貸方金額',       // 税込金額
  '貸方税金額',     // 消費税額
  '摘要',           // 取引の説明
  '番号',           // 任意の番号
  '期日',           // 支払期日等
  'タイプ',         // 0=通常
  '生成元',         // インポート元の識別
  '仕訳メモ',       // 内部メモ
  '付箋1',          // フラグ
  '付箋2',          // フラグ
  '調整',           // 決算整理仕訳フラグ
];

// 識別フラグの定義
const YAYOI_FLAGS = {
  SINGLE: '2000',           // 単一仕訳（1借1貸）
  COMPOUND_HEADER: '2110',  // 複合仕訳ヘッダ行
  COMPOUND_DETAIL: '2100',  // 複合仕訳明細行
};

export class YayoiExporter extends BaseExporter {
  constructor() {
    super({
      target: 'yayoi',
      name: 'Yayoi',
      nameJa: '弥生会計',
      fileFormat: 'csv',
      defaultEncoding: 'shift-jis',
      supportedEncodings: ['shift-jis', 'utf-8-bom', 'utf-8'],
      templateVersion: '1.0',
    });
  }

  columns(): string[] {
    return YAYOI_COLUMNS;
  }

  buildRows(canonical: CanonicalJournal): string[][] {
    const rows: string[][] = [];

    const debitLines = canonical.lines.filter(l => l.debitCredit === '借方');
    const creditLines = canonical.lines.filter(l => l.debitCredit === '貸方');

    // 伝票番号
    const slipNo = canonical.journalNumber || this.generateSlipNo(canonical);

    // 単一仕訳の場合（1借1貸）
    if (debitLines.length === 1 && creditLines.length === 1) {
      rows.push(this.buildSingleRow(canonical, debitLines[0], creditLines[0], slipNo));
    } else {
      // 複合仕訳の場合
      rows.push(...this.buildCompoundRows(canonical, debitLines, creditLines, slipNo));
    }

    return rows;
  }

  private buildSingleRow(
    canonical: CanonicalJournal,
    debit: CanonicalJournalLine,
    credit: CanonicalJournalLine,
    slipNo: string
  ): string[] {
    return [
      YAYOI_FLAGS.SINGLE,                                   // 識別フラグ
      slipNo,                                               // 伝票No.
      '0',                                                  // 決算
      this.formatDate(canonical.journalDate, 'YYYY/MM/DD'), // 取引日付
      debit.accountName,                                    // 借方勘定科目
      debit.subAccountName || '',                           // 借方補助科目
      debit.departmentName || '',                           // 借方部門
      YAYOI_TAX_MAPPING[debit.taxCategory] || '対象外',    // 借方税区分
      this.formatAmount(debit.amount),                      // 借方金額
      debit.taxAmount ? this.formatAmount(debit.taxAmount) : '', // 借方税金額
      credit.accountName,                                   // 貸方勘定科目
      credit.subAccountName || '',                          // 貸方補助科目
      credit.departmentName || '',                          // 貸方部門
      YAYOI_TAX_MAPPING[credit.taxCategory] || '対象外',   // 貸方税区分
      this.formatAmount(credit.amount),                     // 貸方金額
      credit.taxAmount ? this.formatAmount(credit.taxAmount) : '', // 貸方税金額
      this.buildSummary(canonical, debit),                  // 摘要
      '',                                                   // 番号
      '',                                                   // 期日
      '0',                                                  // タイプ
      'OCR Import',                                         // 生成元
      '',                                                   // 仕訳メモ
      '0',                                                  // 付箋1
      '0',                                                  // 付箋2
      '',                                                   // 調整
    ];
  }

  private buildCompoundRows(
    canonical: CanonicalJournal,
    debitLines: CanonicalJournalLine[],
    creditLines: CanonicalJournalLine[],
    slipNo: string
  ): string[][] {
    const rows: string[][] = [];

    // ヘッダ行（最初の借方と貸方）
    const firstDebit = debitLines[0];
    const firstCredit = creditLines[0];

    rows.push([
      YAYOI_FLAGS.COMPOUND_HEADER,                          // 識別フラグ
      slipNo,                                               // 伝票No.
      '0',                                                  // 決算
      this.formatDate(canonical.journalDate, 'YYYY/MM/DD'), // 取引日付
      firstDebit?.accountName || '',                        // 借方勘定科目
      firstDebit?.subAccountName || '',                     // 借方補助科目
      firstDebit?.departmentName || '',                     // 借方部門
      firstDebit ? (YAYOI_TAX_MAPPING[firstDebit.taxCategory] || '対象外') : '', // 借方税区分
      firstDebit ? this.formatAmount(firstDebit.amount) : '', // 借方金額
      firstDebit?.taxAmount ? this.formatAmount(firstDebit.taxAmount) : '', // 借方税金額
      firstCredit?.accountName || '',                       // 貸方勘定科目
      firstCredit?.subAccountName || '',                    // 貸方補助科目
      firstCredit?.departmentName || '',                    // 貸方部門
      firstCredit ? (YAYOI_TAX_MAPPING[firstCredit.taxCategory] || '対象外') : '', // 貸方税区分
      firstCredit ? this.formatAmount(firstCredit.amount) : '', // 貸方金額
      firstCredit?.taxAmount ? this.formatAmount(firstCredit.taxAmount) : '', // 貸方税金額
      this.buildSummary(canonical, firstDebit),             // 摘要
      '',                                                   // 番号
      '',                                                   // 期日
      '0',                                                  // タイプ
      'OCR Import',                                         // 生成元
      '',                                                   // 仕訳メモ
      '0',                                                  // 付箋1
      '0',                                                  // 付箋2
      '',                                                   // 調整
    ]);

    // 明細行（2行目以降）
    const maxLines = Math.max(debitLines.length, creditLines.length);

    for (let i = 1; i < maxLines; i++) {
      const debit = debitLines[i];
      const credit = creditLines[i];

      rows.push([
        YAYOI_FLAGS.COMPOUND_DETAIL,                        // 識別フラグ
        slipNo,                                             // 伝票No.
        '0',                                                // 決算
        '',                                                 // 取引日付（明細行は空）
        debit?.accountName || '',                           // 借方勘定科目
        debit?.subAccountName || '',                        // 借方補助科目
        debit?.departmentName || '',                        // 借方部門
        debit ? (YAYOI_TAX_MAPPING[debit.taxCategory] || '対象外') : '', // 借方税区分
        debit ? this.formatAmount(debit.amount) : '',       // 借方金額
        debit?.taxAmount ? this.formatAmount(debit.taxAmount) : '', // 借方税金額
        credit?.accountName || '',                          // 貸方勘定科目
        credit?.subAccountName || '',                       // 貸方補助科目
        credit?.departmentName || '',                       // 貸方部門
        credit ? (YAYOI_TAX_MAPPING[credit.taxCategory] || '対象外') : '', // 貸方税区分
        credit ? this.formatAmount(credit.amount) : '',     // 貸方金額
        credit?.taxAmount ? this.formatAmount(credit.taxAmount) : '', // 貸方税金額
        '',                                                 // 摘要（明細行は空）
        '',                                                 // 番号
        '',                                                 // 期日
        '0',                                                // タイプ
        '',                                                 // 生成元
        '',                                                 // 仕訳メモ
        '0',                                                // 付箋1
        '0',                                                // 付箋2
        '',                                                 // 調整
      ]);
    }

    return rows;
  }

  private buildSummary(
    canonical: CanonicalJournal,
    line?: CanonicalJournalLine
  ): string {
    const parts: string[] = [];

    // 取引先名
    if (canonical.partnerName) {
      parts.push(canonical.partnerName);
    }

    // 摘要
    if (canonical.summary) {
      parts.push(canonical.summary);
    } else if (line?.description) {
      parts.push(line.description);
    }

    return parts.join(' ');
  }

  private generateSlipNo(canonical: CanonicalJournal): string {
    // 日付ベースの伝票番号を生成
    const date = canonical.journalDate
      ? this.formatDate(canonical.journalDate, 'YYYYMMDD')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return `${date}001`;
  }

  validate(canonical: CanonicalJournal): ExportWarning[] {
    const warnings = this.validateCommon(canonical);

    // 弥生固有のバリデーション

    // 税区分の確認
    for (const line of canonical.lines) {
      if (!YAYOI_TAX_MAPPING[line.taxCategory]) {
        warnings.push({
          type: 'MISSING_TAX_CATEGORY',
          field: 'taxCategory',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Tax category "${line.taxCategory}" is not supported by Yayoi`,
          messageJa: `行${line.lineNo}: 税区分「${line.taxCategory}」は弥生会計でサポートされていません`,
          severity: 'warning',
          suggestion: '税区分を選択し直してください',
        });
      }
    }

    // 勘定科目名の長さチェック（弥生は24文字制限の場合あり）
    for (const line of canonical.lines) {
      if (line.accountName && line.accountName.length > 24) {
        warnings.push({
          type: 'MISSING_ACCOUNT',
          field: 'accountName',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Account name exceeds 24 characters`,
          messageJa: `行${line.lineNo}: 勘定科目名が24文字を超えています`,
          severity: 'warning',
          suggestion: '勘定科目名を短縮してください',
        });
      }
    }

    // 摘要の長さチェック（弥生は64文字制限の場合あり）
    if (canonical.summary && canonical.summary.length > 64) {
      warnings.push({
        type: 'MISSING_PARTNER',
        field: 'summary',
        message: 'Summary exceeds 64 characters limit',
        messageJa: '摘要が64文字を超えています',
        severity: 'warning',
        suggestion: '摘要を短縮してください',
      });
    }

    return warnings;
  }
}

export default YayoiExporter;
