/**
 * Export Download API
 * POST: 生成并下载导出文件
 *
 * 使用新的極簡三モジュール导出系统
 *
 * 流程：
 * 1. 校验登录
 * 2. entitlement 校验（导出权限）
 * 3. 生成文件
 * 4. 返回下载流
 * 5. 记录审计日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateExport, getAvailableTargets } from '@/lib/ocr/exporters';
import type { CanonicalJournal, ExportTarget, ExportEncoding } from '@/lib/ocr/types';
import { generateCanonicalJournal as generateFromOcrResult } from '@/lib/ocr/canonical-generator';
import { getSession } from '@/lib/auth';
import {
  getJob,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';

// ============================================
// Schema & Types
// ============================================

const downloadRequestSchema = z.object({
  documentId: z.string().min(1),
  target: z.enum(['FREEE', 'MONEYFORWARD', 'YAYOI']),
  canonical: z.any().optional(),
  ocrResult: z.any().optional(),
  docType: z.enum(['purchase', 'sale', 'expense']).optional(),
  encoding: z.enum(['UTF8_BOM', 'SHIFT_JIS']).optional(),
});

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

// Check export entitlement
async function checkExportEntitlement(
  userId: string | undefined,
  tenantId: string | undefined
): Promise<{
  allowed: boolean;
  reason?: 'not_logged_in' | 'no_subscription' | 'quota_exceeded' | 'feature_disabled';
}> {
  // 未登录
  if (!userId || !tenantId) {
    return { allowed: false, reason: 'not_logged_in' };
  }

  // TODO: 调用 Odoo 19 中央服务检查订阅权限
  // const entitlement = await centralClient.checkEntitlement(tenantId, 'export_journal');

  // 临时：登录用户都允许导出
  return { allowed: true };
}

// Record export to audit log
async function recordExportAudit(
  documentId: string,
  target: ExportTarget,
  userId?: string,
  tenantId?: string,
  fileName?: string
): Promise<void> {
  // TODO: 写入审计日志到数据库
  console.log('[Export Audit]', {
    documentId,
    target,
    userId,
    tenantId,
    fileName,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// API Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    // 1. 获取会话（匿名 + 登录）
    const sessionId = request.cookies.get(ANON_SESSION_COOKIE)?.value;
    const session = await getSession();

    // 2. 解析请求
    const body = await request.json();
    const parsed = downloadRequestSchema.safeParse(body);

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

    const { documentId, target, canonical: userCanonical, ocrResult, docType, encoding } = parsed.data;

    // 3. 验证导出目标
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

    // 4. 检查权限
    const entitlement = await checkExportEntitlement(
      session?.odooUserId?.toString(),
      session?.tenantId
    );

    if (!entitlement.allowed) {
      if (entitlement.reason === 'not_logged_in') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'AUTH_REQUIRED',
              message: 'ダウンロードにはログインが必要です',
              requiresAuth: true,
            },
          },
          { status: 401 }
        );
      }

      if (entitlement.reason === 'no_subscription') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'SUBSCRIPTION_REQUIRED',
              message: 'エクスポート機能を利用するには、プランのアップグレードが必要です',
              requiresUpgrade: true,
              upgradeUrl: '/pricing',
            },
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'エクスポート権限がありません',
          },
        },
        { status: 403 }
      );
    }

    // 5. 获取/生成 CanonicalJournal
    let canonical: CanonicalJournal;

    if (userCanonical) {
      canonical = userCanonical as CanonicalJournal;
    } else if (ocrResult) {
      canonical = ocrResultToCanonical(
        ocrResult as Record<string, unknown>,
        docType || 'expense'
      );
    } else if (sessionId) {
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

    // 6. 使用新的導出系统生成文件
    const result = generateExport(
      canonical,
      documentId,
      target,
      encoding as ExportEncoding | undefined
    );

    // 7. 检查验证结果
    if (!result.validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPORT_VALIDATION_FAILED',
            message: 'エクスポートデータにエラーがあります',
            blocking_errors: result.validation.blocking_errors,
          },
        },
        { status: 400 }
      );
    }

    // 8. 记录审计日志
    await recordExportAudit(
      documentId,
      target,
      session?.odooUserId?.toString(),
      session?.tenantId,
      result.filename
    );

    // 9. 返回文件
    const encoder = new TextEncoder();
    const encoded = encoder.encode(result.content);
    const fileBuffer = new Uint8Array(encoded);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', result.contentType);
    responseHeaders.set(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.filename)}"`
    );
    responseHeaders.set('Content-Length', fileBuffer.length.toString());

    // 添加警告到响应头
    if (result.validation.warnings.length > 0) {
      responseHeaders.set('X-Export-Warnings', JSON.stringify(result.validation.warnings));
    }

    return new Response(fileBuffer, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Export Download API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'エクスポート中にエラーが発生しました',
        },
      },
      { status: 500 }
    );
  }
}
