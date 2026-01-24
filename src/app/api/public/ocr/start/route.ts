/**
 * Public OCR Start API
 * POST: Start OCR processing for public (anonymous) users
 * Uses the centralized OCR service managed by Odoo
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import {
  validateSession,
  checkQuota,
  incrementQuota,
  storeJob,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';
import { callCentralOcrService } from '@/lib/ocr-service-client';

const startRequestSchema = z.object({
  s3Key: z.string().min(1).optional(),
  docType: z.enum(['receipt', 'vendor_invoice', 'expense']).default('receipt'),
  fileMeta: z.object({
    name: z.string(),
    type: z.string(),
    size: z.number(),
  }).optional(),
  // For direct upload (base64 image)
  imageData: z.string().min(1),
  mimeType: z.string().optional(),
});

// Extended OCR result for voucher draft
interface VoucherDraft {
  id: string;
  move_type: 'in_invoice' | 'out_invoice' | 'entry';
  partner_name: string | null;
  invoice_date: string | null;
  amount_total: number | null;
  amount_untaxed: number | null;
  amount_tax: number | null;
  line_items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  ocr_confidence: number | null;
  status: 'draft';
}

interface OcrExtracted {
  merchant?: string;
  date?: string;
  amount_total?: number;
  confidence?: number;
}

/**
 * Generate voucher draft from OCR result
 */
function generateVoucherDraft(ocrResult: OcrExtracted, docType: string): VoucherDraft {
  const voucherId = crypto.randomUUID();

  // Map doc type to move type
  let moveType: 'in_invoice' | 'out_invoice' | 'entry' = 'entry';
  if (docType === 'vendor_invoice' || docType === 'expense') {
    moveType = 'in_invoice';
  } else if (docType === 'receipt') {
    moveType = 'in_invoice'; // Receipts are typically expenses
  }

  // Calculate tax (assume 10% consumption tax in Japan)
  const total = ocrResult.amount_total || 0;
  const taxRate = 0.1;
  const amountUntaxed = Math.round(total / (1 + taxRate));
  const amountTax = total - amountUntaxed;

  return {
    id: voucherId,
    move_type: moveType,
    partner_name: ocrResult.merchant || null,
    invoice_date: ocrResult.date || new Date().toISOString().split('T')[0],
    amount_total: total || null,
    amount_untaxed: amountUntaxed || null,
    amount_tax: amountTax || null,
    line_items: total ? [{
      product_name: docType === 'expense' ? '経費' : '仕入',
      quantity: 1,
      unit_price: amountUntaxed,
      amount: amountUntaxed,
    }] : [],
    ocr_confidence: ocrResult.confidence || null,
    status: 'draft',
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get session from cookie
    const sessionId = request.cookies.get(ANON_SESSION_COOKIE)?.value;

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_SESSION',
            message: 'セッションがありません。ページを再読み込みしてください。',
          },
        },
        { status: 401 }
      );
    }

    // Validate session exists
    if (!validateSession(sessionId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_SESSION',
            message: 'セッションが無効です。ページを再読み込みしてください。',
          },
        },
        { status: 401 }
      );
    }

    // Check quota
    if (!checkQuota(sessionId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: '本日の無料枠を使い切りました（3回/日）。無料アカウントを作成すると続けてご利用いただけます。',
            quotaExceeded: true,
          },
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const parsed = startRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '画像データが必要です。',
          },
        },
        { status: 400 }
      );
    }

    const { docType, imageData, mimeType } = parsed.data;

    // Generate job ID
    const jobId = crypto.randomUUID();

    // Store initial job state
    storeJob(sessionId, {
      id: jobId,
      s3Key: '',
      docType,
      status: 'processing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      // Call the centralized OCR service
      const ocrResult = await callCentralOcrService({
        imageData,
        mimeType: mimeType || 'image/jpeg',
        tenantId: 'public', // Use 'public' tenant for anonymous users
      });

      if (!ocrResult.success) {
        // Update job with error
        storeJob(sessionId, {
          id: jobId,
          s3Key: '',
          docType,
          status: 'error',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'OCR_FAILED',
              message: 'OCR処理に失敗しました。別の画像でお試しください。',
            },
            data: {
              jobId,
              status: 'error',
            },
          },
          { status: 500 }
        );
      }

      // Increment quota after successful processing
      incrementQuota(sessionId);

      const extracted = ocrResult.extracted || {};

      // Generate voucher draft from OCR result
      const voucherDraft = generateVoucherDraft(extracted, docType);

      // Update job with results
      storeJob(sessionId, {
        id: jobId,
        s3Key: '',
        docType,
        status: 'done',
        ocrResult: {
          ...extracted,
          voucherDraft,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const processingTime = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        data: {
          jobId,
          status: 'done',
          processingTimeMs: processingTime,
          ocrResult: {
            merchant: extracted.merchant || null,
            date: extracted.date || null,
            amount_total: extracted.amount_total || null,
            confidence: extracted.confidence || null,
          },
          voucherDraft,
        },
      });
    } catch (ocrError) {
      // Update job with error
      storeJob(sessionId, {
        id: jobId,
        s3Key: '',
        docType,
        status: 'error',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.error('[Public OCR] OCR processing failed:', ocrError);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'OCR_FAILED',
            message: 'OCR処理に失敗しました。しばらくしてからお試しください。',
          },
          data: {
            jobId,
            status: 'error',
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Public OCR Start API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'エラーが発生しました。しばらくしてからお試しください。',
        },
      },
      { status: 500 }
    );
  }
}
