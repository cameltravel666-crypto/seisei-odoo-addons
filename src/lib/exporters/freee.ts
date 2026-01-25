/**
 * freee Exporter
 * freee会計 仕訳CSVインポート形式
 *
 * 参考: freee仕訳インポートCSVフォーマット
 * https://support.freee.co.jp/hc/ja/articles/202847470
 */

import { BaseExporter } from './base';
import type {
  CanonicalJournal,
  CanonicalJournalLine,
  ExporterConfig,
  ExportWarning,
  TaxCategory,
} from '@/types/export';

// freee税区分マッピング
const FREEE_TAX_MAPPING: Record<TaxCategory, string> = {
  '課税売上10%': '課税売上 10%',
  '課税売上8%（軽減）': '課税売上 8%（軽）',
  '課税仕入10%': '課税仕入 10%',
  '課税仕入8%（軽減）': '課税仕入 8%（軽）',
  '非課税': '非課税',
  '対象外': '対象外',
  '不課税': '不課税',
};

// freee仕訳CSV列定義
// TODO: freeeの正式なCSVフォーマットに合わせて調整が必要
const FREEE_COLUMNS = [
  '収支区分',       // 収入/支出/その他
  '管理番号',       // 任意
  '発生日',         // YYYY/MM/DD
  '決済期日',       // 空欄可
  '取引先',         // 取引先名
  '勘定科目',       // 勘定科目名
  '税区分',         // freee形式の税区分
  '金額',           // 税込金額
  '税計算区分',     // 内税/外税/対象外
  '税額',           // 手動入力時のみ
  '備考',           // 摘要
  '品目',           // 任意
  '部門',           // 部門名
  'メモタグ',       // カンマ区切り
  '決済口座',       // 口座名
  '決済金額',       // 決済額
  'セグメント1',    // 任意
  'セグメント2',    // 任意
  'セグメント3',    // 任意
];

export class FreeeExporter extends BaseExporter {
  constructor() {
    super({
      target: 'freee',
      name: 'freee',
      nameJa: 'freee会計',
      fileFormat: 'csv',
      defaultEncoding: 'utf-8-bom',
      supportedEncodings: ['utf-8-bom', 'utf-8', 'shift-jis'],
      templateVersion: '1.0',
    });
  }

  columns(): string[] {
    return FREEE_COLUMNS;
  }

  buildRows(canonical: CanonicalJournal): string[][] {
    const rows: string[][] = [];

    // freeeは1取引=1行の形式
    // 複数行仕訳の場合は行を分ける必要がある

    // 借方行を処理
    const debitLines = canonical.lines.filter(l => l.debitCredit === '借方');
    const creditLines = canonical.lines.filter(l => l.debitCredit === '貸方');

    // 単純な1借方1貸方の場合
    if (debitLines.length === 1 && creditLines.length === 1) {
      const debit = debitLines[0];
      const credit = creditLines[0];

      rows.push(this.buildSingleRow(canonical, debit, credit));
    } else {
      // 複数行の場合、各借方行に対応する貸方を割り当て
      // TODO: より複雑な仕訳パターンへの対応
      for (let i = 0; i < Math.max(debitLines.length, creditLines.length); i++) {
        const debit = debitLines[i] || debitLines[debitLines.length - 1];
        const credit = creditLines[i] || creditLines[creditLines.length - 1];
        rows.push(this.buildSingleRow(canonical, debit, credit));
      }
    }

    return rows;
  }

  private buildSingleRow(
    canonical: CanonicalJournal,
    debit: CanonicalJournalLine,
    credit: CanonicalJournalLine
  ): string[] {
    // 収支区分の判定
    const incomeExpense = this.determineIncomeExpense(debit.accountCode);

    // 税区分のマッピング
    const taxCategory = FREEE_TAX_MAPPING[debit.taxCategory] || '対象外';

    // 税計算区分
    const taxCalcType = debit.taxAmount ? '内税' : '対象外';

    return [
      incomeExpense,                                    // 収支区分
      canonical.journalNumber || '',                    // 管理番号
      this.formatDate(canonical.journalDate, 'YYYY/MM/DD'), // 発生日
      '',                                              // 決済期日
      canonical.partnerName || '',                     // 取引先
      debit.accountName,                               // 勘定科目
      taxCategory,                                     // 税区分
      this.formatAmount(debit.amount),                 // 金額
      taxCalcType,                                     // 税計算区分
      debit.taxAmount ? this.formatAmount(debit.taxAmount) : '', // 税額
      canonical.summary || debit.description || '',    // 備考
      '',                                              // 品目
      debit.departmentName || '',                      // 部門
      '',                                              // メモタグ
      credit.accountName,                              // 決済口座
      this.formatAmount(credit.amount),                // 決済金額
      '',                                              // セグメント1
      '',                                              // セグメント2
      '',                                              // セグメント3
    ];
  }

  private determineIncomeExpense(accountCode: string): string {
    // 勘定科目コードから収支区分を判定
    // 4xxx: 売上 -> 収入
    // 5xxx, 6xxx, 7xxx: 費用 -> 支出
    // その他: その他

    const firstDigit = accountCode.charAt(0);

    switch (firstDigit) {
      case '4':
        return '収入';
      case '5':
      case '6':
      case '7':
        return '支出';
      default:
        return 'その他';
    }
  }

  validate(canonical: CanonicalJournal): ExportWarning[] {
    const warnings = this.validateCommon(canonical);

    // freee固有のバリデーション

    // 税区分の確認
    for (const line of canonical.lines) {
      if (!FREEE_TAX_MAPPING[line.taxCategory]) {
        warnings.push({
          type: 'MISSING_TAX_CATEGORY',
          field: 'taxCategory',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Tax category "${line.taxCategory}" is not supported by freee`,
          messageJa: `行${line.lineNo}: 税区分「${line.taxCategory}」はfreeeでサポートされていません`,
          severity: 'warning',
          suggestion: '税区分を選択し直してください',
        });
      }
    }

    // 取引先の確認（推奨）
    if (!canonical.partnerName) {
      warnings.push({
        type: 'MISSING_PARTNER',
        field: 'partnerName',
        message: 'Partner name is recommended for freee import',
        messageJa: '取引先名を入力することをお勧めします',
        severity: 'info',
      });
    }

    return warnings;
  }
}

export default FreeeExporter;
