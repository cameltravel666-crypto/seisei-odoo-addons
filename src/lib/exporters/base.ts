/**
 * Base Exporter Class
 * 导出器基类，定义通用接口和工具方法
 */

import type {
  CanonicalJournal,
  ExporterConfig,
  ExporterResult,
  ExportWarning,
  ExportEncoding,
  ExportTarget,
} from '@/types/export';

export abstract class BaseExporter {
  protected config: ExporterConfig;

  constructor(config: ExporterConfig) {
    this.config = config;
  }

  /**
   * 获取导出器配置
   */
  getConfig(): ExporterConfig {
    return this.config;
  }

  /**
   * 获取模板列名
   */
  abstract columns(): string[];

  /**
   * 从标准仕訳生成行数据
   */
  abstract buildRows(canonical: CanonicalJournal): string[][];

  /**
   * 验证标准仕訳，返回警告列表
   */
  abstract validate(canonical: CanonicalJournal): ExportWarning[];

  /**
   * 生成导出文件
   */
  export(canonical: CanonicalJournal, encoding?: ExportEncoding): ExporterResult {
    const warnings = this.validate(canonical);
    const rows = this.buildRows(canonical);
    const columns = this.columns();

    // 生成CSV内容
    const content = this.generateContent(columns, rows, encoding);

    // 生成文件名
    const fileName = this.generateFileName(canonical);

    return {
      content,
      encoding: encoding || this.config.defaultEncoding,
      fileName,
      mimeType: this.getMimeType(),
      warnings,
    };
  }

  /**
   * 生成预览（前N行）
   */
  preview(canonical: CanonicalJournal, maxRows: number = 10): {
    columns: string[];
    rows: string[][];
    warnings: ExportWarning[];
  } {
    const warnings = this.validate(canonical);
    const allRows = this.buildRows(canonical);
    const rows = allRows.slice(0, maxRows);

    return {
      columns: this.columns(),
      rows,
      warnings,
    };
  }

  /**
   * 生成CSV/TXT内容
   */
  protected generateContent(
    columns: string[],
    rows: string[][],
    encoding?: ExportEncoding
  ): string {
    const lines: string[] = [];

    // 添加列头
    lines.push(this.formatRow(columns));

    // 添加数据行
    for (const row of rows) {
      lines.push(this.formatRow(row));
    }

    let content = lines.join('\r\n');

    // UTF-8 BOM
    if (encoding === 'utf-8-bom') {
      content = '\uFEFF' + content;
    }

    return content;
  }

  /**
   * 格式化单行（CSV格式）
   */
  protected formatRow(values: string[]): string {
    return values.map(v => this.escapeCSV(v)).join(',');
  }

  /**
   * CSV转义
   */
  protected escapeCSV(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // 如果包含逗号、引号或换行，需要用引号包裹
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  /**
   * 格式化日期
   */
  protected formatDate(date: string, format: 'YYYY/MM/DD' | 'YYYY-MM-DD' | 'YYYYMMDD'): string {
    if (!date) return '';

    // 尝试解析日期
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    switch (format) {
      case 'YYYY/MM/DD':
        return `${year}/${month}/${day}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'YYYYMMDD':
        return `${year}${month}${day}`;
      default:
        return `${year}/${month}/${day}`;
    }
  }

  /**
   * 格式化金额
   */
  protected formatAmount(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return '0';
    return Math.round(amount).toString();
  }

  /**
   * 生成文件名
   */
  protected generateFileName(canonical: CanonicalJournal): string {
    const date = canonical.journalDate
      ? this.formatDate(canonical.journalDate, 'YYYYMMDD')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const ext = this.config.fileFormat;
    return `${this.config.target}_journal_${date}.${ext}`;
  }

  /**
   * 获取MIME类型
   */
  protected getMimeType(): string {
    return this.config.fileFormat === 'csv' ? 'text/csv' : 'text/plain';
  }

  /**
   * 通用验证
   */
  protected validateCommon(canonical: CanonicalJournal): ExportWarning[] {
    const warnings: ExportWarning[] = [];

    // 检查日期
    if (!canonical.journalDate) {
      warnings.push({
        type: 'INVALID_DATE',
        field: 'journalDate',
        message: 'Journal date is missing',
        messageJa: '仕訳日付が未入力です',
        severity: 'error',
      });
    }

    // 检查借贷平衡
    if (!canonical.isBalanced) {
      const debitTotal = canonical.lines
        .filter(l => l.debitCredit === '借方')
        .reduce((sum, l) => sum + l.amount, 0);
      const creditTotal = canonical.lines
        .filter(l => l.debitCredit === '貸方')
        .reduce((sum, l) => sum + l.amount, 0);

      warnings.push({
        type: 'UNBALANCED',
        message: `Debit (${debitTotal}) and Credit (${creditTotal}) do not match`,
        messageJa: `借方(${debitTotal})と貸方(${creditTotal})が一致しません`,
        severity: 'error',
      });
    }

    // 检查科目
    for (const line of canonical.lines) {
      if (!line.accountCode || !line.accountName) {
        warnings.push({
          type: 'MISSING_ACCOUNT',
          field: 'accountCode',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Account code or name is missing`,
          messageJa: `行${line.lineNo}: 勘定科目コードまたは名称が未入力です`,
          severity: 'error',
        });
      }

      // 检查金额
      if (line.amount === 0) {
        warnings.push({
          type: 'ZERO_AMOUNT',
          field: 'amount',
          lineNo: line.lineNo,
          message: `Line ${line.lineNo}: Amount is zero`,
          messageJa: `行${line.lineNo}: 金額が0です`,
          severity: 'warning',
        });
      }
    }

    // 检查OCR置信度
    if (canonical.ocrConfidence && canonical.ocrConfidence < 0.7) {
      warnings.push({
        type: 'LOW_CONFIDENCE',
        message: `OCR confidence is low (${Math.round(canonical.ocrConfidence * 100)}%)`,
        messageJa: `OCR認識精度が低いです (${Math.round(canonical.ocrConfidence * 100)}%)`,
        severity: 'warning',
        suggestion: '画像を確認し、必要に応じて手動で修正してください',
      });
    }

    return warnings;
  }
}

/**
 * 导出器工厂
 */
export type ExporterFactory = (target: ExportTarget) => BaseExporter;
