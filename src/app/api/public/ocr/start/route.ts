/**
 * Public OCR Start API
 * POST: Start OCR processing for public (anonymous) users
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
import { callOcrService, OcrResult } from '@/lib/ocr';

const startRequestSchema = z.object({
  s3Key: z.string().min(1),
  docType: z.enum(['receipt', 'vendor_invoice', 'expense']).default('receipt'),
  fileMeta: z.object({
    name: z.string(),
    type: z.string(),
    size: z.number(),
  }).optional(),
  // For direct upload (base64 image)
  imageData: z.string().optional(),
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

/**
 * Generate voucher draft from OCR result
 */
function generateVoucherDraft(ocrResult: OcrResult, docType: string): VoucherDraft {
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
    ocr_confidence: ocrResult.confidence,
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
            message: 'Anonymous session required. Call /api/public/session first.',
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
            message: 'Session expired or invalid. Please refresh the page.',
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
            message: 'Daily quota exceeded (3/day). Create a free account to continue.',
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
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { s3Key, docType, fileMeta, imageData } = parsed.data;

    // Generate job ID
    const jobId = crypto.randomUUID();

    // For MVP, we'll process synchronously
    // In production, this would be async with a queue

    // Store initial job state
    storeJob(sessionId, {
      id: jobId,
      s3Key,
      docType,
      status: 'processing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      let ocrResult: OcrResult;

      if (imageData) {
        // Direct base64 image processing
        const imageBuffer = Buffer.from(imageData, 'base64');
        ocrResult = await callOcrService(imageBuffer);
      } else {
        // For S3 files, we would fetch from S3 first
        // For MVP, return an error asking for direct upload
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'S3_NOT_SUPPORTED_YET',
              message: 'Please include imageData (base64) for OCR processing',
            },
          },
          { status: 400 }
        );
      }

      // Increment quota after successful processing
      incrementQuota(sessionId);

      // Generate voucher draft from OCR result
      const voucherDraft = generateVoucherDraft(ocrResult, docType);

      // Update job with results
      storeJob(sessionId, {
        id: jobId,
        s3Key,
        docType,
        status: 'done',
        ocrResult: {
          ...ocrResult,
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
            merchant: ocrResult.merchant,
            date: ocrResult.date,
            amount_total: ocrResult.amount_total,
            confidence: ocrResult.confidence,
          },
          voucherDraft,
        },
      });
    } catch (ocrError) {
      // Update job with error
      storeJob(sessionId, {
        id: jobId,
        s3Key,
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
            message: ocrError instanceof Error ? ocrError.message : 'OCR processing failed',
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

    const message = error instanceof Error ? error.message : 'Failed to start OCR';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
