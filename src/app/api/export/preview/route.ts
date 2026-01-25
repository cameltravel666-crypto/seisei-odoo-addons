/**
 * Export Preview API
 * POST: 生成导出预览（列名 + 样例行）
 *
 * 使用新的極簡三モジュール导出系统
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generatePreview, getAvailableTargets } from '@/lib/ocr/exporters';
import type { CanonicalJournal, ExportTarget } from '@/lib/ocr/types';
import {
  getJob,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';
import { generateCanonicalJournal as generateFromOcrResult } from '@/lib/ocr/canonical-generator';

// ============================================
// Schema & Constants
// ============================================

// Line item type from frontend
const lineItemSchema = z.object({
  product_name: z.string(),
  account_name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unit_price: z.number(),
  tax_rate: z.string(),
  amount: z.number(),
});

const previewRequestSchema = z.object({
  documentId: z.string().min(1),
  target: z.enum(['FREEE', 'MONEYFORWARD', 'YAYOI']),
  canonical: z.any().optional(), // 用户编辑后的数据 (new CanonicalJournal format)
  ocrResult: z.any().optional(), // OCR结果 (用于生成CanonicalJournal)
  lineItems: z.array(lineItemSchema).optional(), // 明细行数据
  exportMode: z.enum(['detailed', 'summary']).optional().default('summary'), // 导出模式
  docType: z.enum(['purchase', 'sale', 'expense']).optional(),
});

// Target info for frontend
const TARGET_INFO: Record<ExportTarget, { name: string; nameJa: string }> = {
  FREEE: { name: 'freee', nameJa: 'freee会計' },
  MONEYFORWARD: { name: 'MoneyForward', nameJa: 'MFクラウド会計' },
  YAYOI: { name: 'Yayoi', nameJa: '弥生会計' },
};

// ============================================
// Helper Functions
// ============================================

function isValidTarget(target: string): target is ExportTarget {
  return getAvailableTargets().includes(target as ExportTarget);
}

// Map lowercase docType to uppercase OcrDocumentType
function mapDocType(docType: 'purchase' | 'sale' | 'expense'): 'PURCHASE' | 'SALE' | 'EXPENSE' {
  const mapping: Record<string, 'PURCHASE' | 'SALE' | 'EXPENSE'> = {
    purchase: 'PURCHASE',
    sale: 'SALE',
    expense: 'EXPENSE',
  };
  return mapping[docType] || 'EXPENSE';
}

// Convert OCR result to CanonicalJournal
function ocrResultToCanonical(
  ocrResult: Record<string, unknown>,
  docType: 'purchase' | 'sale' | 'expense'
): CanonicalJournal {
  // Extract fields from OCR result to OcrExtractedFields format
  const extracted = {
    date: (ocrResult.invoice_date as string) ||
      (ocrResult.date as string) ||
      new Date().toISOString().slice(0, 10),
    total: (ocrResult.amount_total as number) ||
      (ocrResult.total as number) ||
      0,
    tax: (ocrResult.amount_tax as number) ||
      (ocrResult.tax as number),
    counterparty: (ocrResult.partner_name as string) ||
      (ocrResult.counterparty as string) ||
      (ocrResult.merchant as string),
    invoice_reg_no: (ocrResult.partner_vat as string) ||
      (ocrResult.invoice_reg_no as string),
    description: (ocrResult.description as string),
    tax_rate: (ocrResult.tax_rate as number) || 10,
    payment_method: (ocrResult.payment_method as string),
    doc_no: (ocrResult.doc_no as string) ||
      (ocrResult.invoice_number as string),
  };

  // Use the canonical generator from /lib/ocr
  return generateFromOcrResult(mapDocType(docType), extracted);
}

// ============================================
// API Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    // 获取会话
    const sessionId = request.cookies.get(ANON_SESSION_COOKIE)?.value;

    // 解析请求
    const body = await request.json();
    const parsed = previewRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '無効なリクエストです',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { documentId, target, canonical: userCanonical, ocrResult, lineItems, exportMode, docType } = parsed.data;

    // 验证导出目标
    if (!isValidTarget(target)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TARGET',
            message: `サポートされていない導出先です: ${target}`,
          },
        },
        { status: 400 }
      );
    }

    // 获取/生成 CanonicalJournal
    let canonical: CanonicalJournal;

    if (userCanonical) {
      // 使用用户编辑后的数据
      canonical = userCanonical as CanonicalJournal;
    } else if (ocrResult) {
      // 使用前端传递的ocrResult生成canonical
      canonical = ocrResultToCanonical(
        ocrResult as Record<string, unknown>,
        docType || 'expense'
      );
    } else if (sessionId) {
      // 从会话中获取OCR结果
      const job = getJob(sessionId, documentId);

      if (!job || !job.ocrResult) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'DOCUMENT_NOT_FOUND',
              message: 'ドキュメントが見つかりません',
            },
          },
          { status: 404 }
        );
      }

      // 从session的OCR结果生成canonical
      const sessionDocType = job.docType === 'vendor_invoice' ? 'purchase' :
                            job.docType === 'receipt' ? 'expense' :
                            (job.docType as 'purchase' | 'sale' | 'expense') || 'expense';

      canonical = ocrResultToCanonical(
        job.ocrResult as Record<string, unknown>,
        sessionDocType
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_DATA',
            message: 'canonical または ocrResult が必要です',
          },
        },
        { status: 400 }
      );
    }

    // 生成文件名
    const date = canonical.txn_date.replace(/-/g, '');
    const shortDocId = documentId.slice(0, 8);
    const modeSuffix = exportMode === 'detailed' ? '_detail' : '';
    const fileName = `${target.toLowerCase()}_${date}_${shortDocId}${modeSuffix}.csv`;

    // Generate preview based on export mode
    let transformedColumns: { key: string; label: string }[];
    let transformedRows: Record<string, string>[];
    let warnings: string[] = [];

    if (exportMode === 'detailed' && lineItems && lineItems.length > 0) {
      // 明細模式: 每条明细一行
      // Columns: 日付, 借方科目, 借方金額, 借方税額, 貸方科目, 貸方金額, 摘要
      transformedColumns = [
        { key: 'date', label: '取引日付' },
        { key: 'debit_account', label: '借方勘定科目' },
        { key: 'debit_amount', label: '借方金額' },
        { key: 'debit_tax', label: '借方消費税' },
        { key: 'credit_account', label: '貸方勘定科目' },
        { key: 'credit_amount', label: '貸方金額' },
        { key: 'description', label: '摘要' },
        { key: 'tax_rate', label: '税率' },
      ];

      transformedRows = lineItems.map((item, idx) => {
        // Calculate tax for each line item
        const taxRateNum = parseInt(item.tax_rate) || 10;
        const itemTax = Math.round(item.amount * taxRateNum / (100 + taxRateNum));

        return {
          date: canonical.txn_date,
          debit_account: item.account_name || canonical.debit.account_name,
          debit_amount: item.amount.toString(),
          debit_tax: itemTax.toString(),
          credit_account: canonical.credit.account_name,
          credit_amount: item.amount.toString(),
          description: item.product_name || `明細${idx + 1}`,
          tax_rate: item.tax_rate,
        };
      });

      if (!canonical.invoice_reg_no) {
        warnings.push('インボイス登録番号がありません');
      }
    } else {
      // 汇总模式: 使用原有逻辑，单行汇总
      const preview = generatePreview(canonical, documentId, target);

      transformedColumns = preview.columns.map((col, idx) => ({
        key: `col_${idx}`,
        label: col,
      }));

      transformedRows = preview.rows.map(row => {
        const rowObj: Record<string, string> = {};
        preview.columns.forEach((_, idx) => {
          rowObj[`col_${idx}`] = row[idx] ?? '';
        });
        return rowObj;
      });

      warnings = preview.warnings;
    }

    return NextResponse.json({
      success: true,
      data: {
        target,
        targetInfo: TARGET_INFO[target],
        columns: transformedColumns,
        rowsSample: transformedRows,
        totalRows: transformedRows.length,
        warnings,
        encoding: 'UTF8_BOM',
        fileFormat: 'csv',
        fileName,
        exportMode,
        canonical, // 返回标准仕訳供前端编辑
      },
    });
  } catch (error) {
    console.error('[Export Preview API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'プレビューの生成中にエラーが発生しました',
        },
      },
      { status: 500 }
    );
  }
}
