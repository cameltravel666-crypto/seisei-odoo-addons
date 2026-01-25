/**
 * MoneyForward (MFクラウド会計) Exporter
 * マネーフォワード クラウド会計 仕訳帳インポート形式
 *
 * 参考: MFクラウド会計 仕訳帳インポートCSV形式
 * https://biz.moneyforward.com/support/account/guide/journal/
 */

import { BaseExporter } from './base';
import type {
  CanonicalJournal,
  CanonicalJournalLine,
  ExporterConfig,
  ExportWarning,
  TaxCategory,
} from '@/types/export';

// MF税区分マッピング
const MF_TAX_MAPPING: Record<TaxCategory, string> = {
  '課税売上10%': '課売上10%',
  '課税売上8%（軽減）': '課売上8%(軽)',
  '課税仕入10%': '課仕入10%',
  '課税仕入8%（軽減）': '課仕入8%(軽)',
  '非課税': '非課税',
  '対象外': '対象外',
  '不課税': '不課税',
};

// MFクラウド会計 仕訳帳CSV列定義
// TODO: MFの正式なCSVフォーマットに合わせて調整が必要
const MF_COLUMNS = [
  '取引No',         // 同一仕訳の行は同じ番号
  '取引日',         // YYYY/MM/DD
  '借方勘定科目',   // 勘定科目名
  '借方補助科目',   // 補助科目名
  '借方部門',       // 部門名
  '借方税区分',     // MF形式の税区分
  '借方金額',       // 税込金額
  '借方税額',       // 消費税額
  '貸方勘定科目',   // 勘定科目名
  '貸方補助科目',   // 補助科目名
  '貸方部門',       // 部門名
  '貸方税区分',     // MF形式の税区分
  '貸方金額',       // 税込金額
  '貸方税額',       // 消費税額
  '摘要',           // 取引の説明
  '仕訳メモ',       // 内部メモ
  'タグ',           // カンマ区切り
  '調整',           // 決算整理仕訳フラグ
];

export class MoneyForwardExporter extends BaseExporter {
  constructor() {
    super({
      target: 'moneyforward',
      name: 'MoneyForward',
      nameJa: 'マネーフォワード クラウド会計',
      fileFormat: 'csv',
      defaultEncoding: 'utf-8-bom',
      supportedEncodings: ['utf-8-bom', 'utf-8', 'shift-jis'],
      templateVersion: '1.0',
    });
  }

  columns(): string[] {
    return MF_COLUMNS;
  }

  buildRows(canonical: CanonicalJournal): string[][] {
    const rows: string[][] = [];

    // MFは1行に借方・貸方両方を含む形式
    const debitLines = canonical.lines.filter(l => l.debitCredit === '借方');
    const creditLines = canonical.lines.filter(l => l.debitCredit === '貸方');

    // 取引Noは同一仕訳内で共通
    const transactionNo = canonical.journalNumber || this.generateTransactionNo(canonical);

    // 借方と貸方をペアにして行を生成
    const maxLines = Math.max(debitLines.length, creditLines.length);

    for (let i = 0; i < maxLines; i++) {
      const debit = debitLines[i];
      const credit = creditLines[i];

      rows.push(this.buildRow(
        transactionNo,
        canonical,
        debit,
        credit,
        i === 0 // 最初の行にのみ摘要を入れる
      ));
    }

    return rows;
  }

  private buildRow(
    transactionNo: string,
    canonical: CanonicalJournal,
    debit: CanonicalJournalLine | undefined,
    credit: CanonicalJournalLine | undefined,
    includeSummary: boolean
  ): string[] {
    // 借方情報
    const debitAccount = debit?.accountName || '';
    const debitSubAccount = debit?.subAccountName || '';
    const debitDept = debit?.departmentName || '';
    const debitTax = debit ? (MF_TAX_MAPPING[debit.taxCategory] || '対象外') : '';
    const debitAmount = debit ? this.formatAmount(debit.amount) : '';
    const debitTaxAmount = debit?.taxAmount ? this.formatAmount(debit.taxAmount) : '';

    // 貸方情報
    const creditAccount = credit?.accountName || '';
    const creditSubAccount = credit?.subAccountName || '';
    const creditDept = credit?.departmentName || '';
    const creditTax = credit ? (MF_TAX_MAPPING[credit.taxCategory] || '対象外') : '';
    const creditAmount = credit ? this.formatAmount(credit.amount) : '';
    const creditTaxAmount = credit?.taxAmount ? this.formatAmount(credit.taxAmount) : '';

    // 摘要（取引先名 + 内容）
    const summary = includeSummary
      ? this.buildSummary(canonical, debit, credit)
      : '';

    return [
      transactionNo,                                        // 取引No
      this.formatDate(canonical.journalDate, 'YYYY/MM/DD'), // 取引日
      debitAccount,                                         // 借方勘定科目
      debitSubAccount,                                      // 借方補助科目
      debitDept,                                            // 借方部門
      debitTax,                                             // 借方税区分
      debitAmount,                                          // 借方金額
      debitTaxAmount,                                       // 借方税額
      creditAccount,                                        // 貸方勘定科目
      creditSubAccount,                                     // 貸方補助科目
      creditDept,                                           // 貸方部門
      creditTax,                                            // 貸方税区分
      creditAmount,                                         // 貸方金額
      creditTaxAmount,                                      // 貸方税額
      summary,                                              // 摘要
      '',                                                   // 仕訳メモ
      '',                                                   // タグ
      '',                                                   // 調整
    ];
  }

  private buildSummary(
    canonical: CanonicalJournal,
    debit?: CanonicalJournalLine,
    credit?: CanonicalJournalLine
  ): string {
    const parts: string[] = [];

    // 取引先名
    if (canonical.partnerName) {
      parts.push(canonical.partnerName);
    }

    // 摘要
    if (canonical.summary) {
      parts.push(canonical.summary);
    } else if (debit?.description) {
      parts.push(debit.description);
    }

    return parts.join(' ');
  }

  private generateTransactionNo(canonical: CanonicalJournal): string {
    // 日付ベースの取引番号を生成
    const date = canonical.journalDate
      ? this.formatDate(canonical.journalDate, 'YYYYMMDD')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return `MF${date}001`;
  }

  validate(canonical: CanonicalJournal): ExportWarning[] {
    const warnings = this.validateCommon(canonical);

    // MF固有のバリデーション

    // 税区分の確認
    for (const line of canonical.lines) {
      if (!MF_TAX_MAPPING[line.taxCategory]) {
        warnings.push({
          type: 'MISSING_TAX_CATEGORY',
          field: 'taxCategory',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Tax category "${line.taxCategory}" is not supported by MoneyForward`,
          messageJa: `行${line.lineNo}: 税区分「${line.taxCategory}」はマネーフォワードでサポートされていません`,
          severity: 'warning',
          suggestion: '税区分を選択し直してください',
        });
      }
    }

    // 勘定科目名の確認
    for (const line of canonical.lines) {
      if (!line.accountName) {
        warnings.push({
          type: 'MISSING_ACCOUNT',
          field: 'accountName',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Account name is required for MoneyForward`,
          messageJa: `行${line.lineNo}: マネーフォワードには勘定科目名が必須です`,
          severity: 'error',
        });
      }
    }

    return warnings;
  }
}

export default MoneyForwardExporter;
