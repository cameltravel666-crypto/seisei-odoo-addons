/**
 * Export Preview API
 * POST: 生成导出预览（列名 + 样例行）
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExporter, isValidTarget, EXPORT_TARGETS } from '@/lib/exporters';
import { generateCanonicalJournal, type OcrVoucherDraft } from '@/lib/canonical-generator';
import {
  validateSession,
  getJob,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';
import type { ExportTarget, CanonicalJournal } from '@/types/export';

const previewRequestSchema = z.object({
  documentId: z.string().min(1),
  target: z.enum(['freee', 'moneyforward', 'yayoi']),
  canonical: z.any().optional(), // 用户编辑后的数据
  voucherDraft: z.any().optional(), // OCR结果的VoucherDraft
  docType: z.enum(['receipt', 'vendor_invoice', 'expense']).optional(),
});

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
          },
        },
        { status: 400 }
      );
    }

    const { documentId, target, canonical: userCanonical, voucherDraft, docType } = parsed.data;

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

    // 获取文档数据
    let canonical: CanonicalJournal;

    if (userCanonical) {
      // 使用用户编辑后的数据
      canonical = userCanonical as CanonicalJournal;
    } else if (voucherDraft) {
      // 使用前端传递的voucherDraft生成canonical
      canonical = generateCanonicalJournal(
        voucherDraft as OcrVoucherDraft,
        (docType || 'receipt') as 'receipt' | 'vendor_invoice' | 'expense'
      );
    } else if (sessionId) {
      // 从会话中获取OCR结果
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

      // 生成标准仕訳
      canonical = generateCanonicalJournal(
        job.ocrResult.voucherDraft as OcrVoucherDraft,
        job.docType as 'receipt' | 'vendor_invoice' | 'expense'
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_SESSION',
            message: 'セッションがありません',
          },
        },
        { status: 401 }
      );
    }

    // 获取导出器
    const exporter = getExporter(target as ExportTarget);

    // 生成预览
    const preview = exporter.preview(canonical, 10);
    const config = exporter.getConfig();

    // 生成文件名
    const date = canonical.journalDate
      ? canonical.journalDate.replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `${target}_journal_${date}.${config.fileFormat}`;

    // Transform columns from string[] to { key, label }[]
    const transformedColumns = preview.columns.map((col, idx) => ({
      key: `col_${idx}`,
      label: col,
      labelJa: col,
    }));

    // Transform rows from string[][] to Record<string, string | number>[]
    const transformedRows = preview.rows.map(row => {
      const rowObj: Record<string, string | number> = {};
      preview.columns.forEach((col, idx) => {
        rowObj[`col_${idx}`] = row[idx] ?? '';
      });
      return rowObj;
    });

    return NextResponse.json({
      success: true,
      data: {
        target,
        targetInfo: EXPORT_TARGETS[target as ExportTarget],
        columns: transformedColumns,
        rowsSample: transformedRows,
        totalRows: preview.rows.length,
        warnings: preview.warnings,
        encoding: config.defaultEncoding,
        fileFormat: config.fileFormat,
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
