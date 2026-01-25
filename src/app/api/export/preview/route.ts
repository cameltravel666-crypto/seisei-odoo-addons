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

const previewRequestSchema = z.object({
  documentId: z.string().min(1),
  target: z.enum(['FREEE', 'MONEYFORWARD', 'YAYOI']),
  canonical: z.any().optional(), // 用户编辑后的数据 (new CanonicalJournal format)
  ocrResult: z.any().optional(), // OCR结果 (用于生成CanonicalJournal)
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

    const { documentId, target, canonical: userCanonical, ocrResult, docType } = parsed.data;

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

    // 使用新的導出系统生成预览
    const preview = generatePreview(canonical, documentId, target);

    // 生成文件名
    const date = canonical.txn_date.replace(/-/g, '');
    const shortDocId = documentId.slice(0, 8);
    const fileName = `${target.toLowerCase()}_${date}_${shortDocId}.csv`;

    // Transform columns to { key, label } format for frontend
    const transformedColumns = preview.columns.map((col, idx) => ({
      key: `col_${idx}`,
      label: col,
    }));

    // Transform rows to Record<string, string> format for frontend
    const transformedRows = preview.rows.map(row => {
      const rowObj: Record<string, string> = {};
      preview.columns.forEach((_, idx) => {
        rowObj[`col_${idx}`] = row[idx] ?? '';
      });
      return rowObj;
    });

    return NextResponse.json({
      success: true,
      data: {
        target,
        targetInfo: TARGET_INFO[target],
        columns: transformedColumns,
        rowsSample: transformedRows,
        totalRows: preview.rows.length,
        warnings: preview.warnings,
        encoding: 'UTF8_BOM',
        fileFormat: 'csv',
        fileName,
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
