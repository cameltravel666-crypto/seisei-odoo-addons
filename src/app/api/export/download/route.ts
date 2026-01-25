/**
 * Export Download API
 * POST: 生成并下载导出文件
 *
 * 流程：
 * 1. 校验登录
 * 2. entitlement 校验（导出权限）
 * 3. 生成文件
 * 4. 上传到 S3（可选）
 * 5. 返回下载链接或直接流式传输
 * 6. 记录 ExportJob（审计）
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExporter, isValidTarget } from '@/lib/exporters';
import { generateCanonicalJournal, type OcrVoucherDraft } from '@/lib/canonical-generator';
import { getSession } from '@/lib/auth';
import {
  validateSession,
  getJob,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';
import type { ExportTarget, CanonicalJournal, ExportEncoding } from '@/types/export';

const downloadRequestSchema = z.object({
  documentId: z.string().min(1),
  target: z.enum(['freee', 'moneyforward', 'yayoi']),
  canonical: z.any().optional(),
  encoding: z.enum(['utf-8', 'shift-jis', 'utf-8-bom']).optional(),
});

// TODO: 从 Odoo 中央服务检查导出权限
async function checkExportEntitlement(
  userId: string | undefined,
  tenantId: string | undefined,
  target: ExportTarget
): Promise<{
  allowed: boolean;
  reason?: 'not_logged_in' | 'no_subscription' | 'quota_exceeded' | 'feature_disabled';
}> {
  // 未登录
  if (!userId || !tenantId) {
    return { allowed: false, reason: 'not_logged_in' };
  }

  // TODO: 调用 Odoo 19 中央服务检查订阅权限
  // const entitlement = await odoo19Client.checkEntitlement(tenantId, 'export_journal');

  // 临时：登录用户都允许导出（后续需要对接订阅系统）
  return { allowed: true };
}

// TODO: 记录导出到审计日志
async function recordExportAudit(
  documentId: string,
  target: ExportTarget,
  userId?: string,
  tenantId?: string,
  fileName?: string
): Promise<void> {
  // TODO: 写入审计日志
  console.log('[Export Audit]', {
    documentId,
    target,
    userId,
    tenantId,
    fileName,
    timestamp: new Date().toISOString(),
  });
}

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
          },
        },
        { status: 400 }
      );
    }

    const { documentId, target, canonical: userCanonical, encoding } = parsed.data;

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
      session?.tenantId,
      target as ExportTarget
    );

    if (!entitlement.allowed) {
      // 根据原因返回不同响应
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

    // 5. 获取文档数据
    let canonical: CanonicalJournal;

    if (userCanonical) {
      canonical = userCanonical as CanonicalJournal;
    } else if (sessionId) {
      const job = getJob(sessionId, documentId);

      if (!job || !job.ocrResult?.voucherDraft) {
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

      canonical = generateCanonicalJournal(
        job.ocrResult.voucherDraft as OcrVoucherDraft,
        job.docType as 'receipt' | 'vendor_invoice' | 'expense'
      );
    } else {
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

    // 6. 验证仕訳数据
    if (!canonical.isBalanced) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '借方と貸方が一致しません。修正してから再度お試しください。',
          },
        },
        { status: 400 }
      );
    }

    // 7. 获取导出器并生成文件
    const exporter = getExporter(target as ExportTarget);
    const result = exporter.export(canonical, encoding as ExportEncoding | undefined);

    // 8. 检查是否有错误级别的警告
    const hasErrors = result.warnings.some(w => w.severity === 'error');
    if (hasErrors) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPORT_VALIDATION_FAILED',
            message: 'エクスポートデータにエラーがあります',
            warnings: result.warnings.filter(w => w.severity === 'error'),
          },
        },
        { status: 400 }
      );
    }

    // 9. 记录审计日志
    await recordExportAudit(
      documentId,
      target as ExportTarget,
      session?.odooUserId?.toString(),
      session?.tenantId,
      result.fileName
    );

    // 10. 返回文件（直接流式传输）
    // TODO: 可选上传到 S3 并返回签名 URL

    // 处理编码
    // Note: For Shift-JIS encoding, we would need iconv-lite
    // Currently using UTF-8 for all exports
    const encoder = new TextEncoder();
    const encoded = encoder.encode(result.content);
    const fileBuffer = new Uint8Array(encoded);

    // 设置响应头
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', `${result.mimeType}; charset=${result.encoding}`);
    responseHeaders.set(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.fileName)}"`
    );
    responseHeaders.set('Content-Length', fileBuffer.length.toString());

    // 添加警告到响应头（供前端显示）
    if (result.warnings.length > 0) {
      responseHeaders.set('X-Export-Warnings', JSON.stringify(result.warnings));
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
