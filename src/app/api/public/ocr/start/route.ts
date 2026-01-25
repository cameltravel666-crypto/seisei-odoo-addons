/**
 * Public OCR Start API
 * POST: Start OCR processing for public (anonymous) users
 * Uses Odoo 18's OCR functionality via public tenant
 * Records usage to Odoo 19 for billing under TEN-MKQZYN00
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
import { getPublicOdooClient, resetPublicOdooClient } from '@/lib/odoo-public';
import { getOdoo19Client } from '@/lib/odoo19';

// Default tenant for public OCR billing
const PUBLIC_BILLING_TENANT = 'TEN-MKQZYN00';

const startRequestSchema = z.object({
  docType: z.enum(['receipt', 'vendor_invoice', 'expense']).default('receipt'),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  // Base64 encoded file data
  imageData: z.string().min(1),
});

// Map doc type to Odoo move type
const DOC_TYPE_MAP: Record<string, string> = {
  receipt: 'in_invoice',
  vendor_invoice: 'in_invoice',
  expense: 'in_invoice',
};

interface OcrLineItem {
  product_name: string;
  account_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate: string;
  amount: number;
}

interface VoucherDraft {
  id: string;
  odoo_move_id: number;
  move_type: string;
  partner_name: string | null;
  partner_vat: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  amount_total: number | null;
  amount_untaxed: number | null;
  amount_tax: number | null;
  line_items: OcrLineItem[];
  ocr_confidence: number | null;
  ocr_status: string;
  status: 'draft';
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

    const { docType, fileName, mimeType, imageData } = parsed.data;
    const moveType = DOC_TYPE_MAP[docType] || 'in_invoice';

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
      // Get public Odoo client
      let odoo = await getPublicOdooClient();

      // Create draft invoice in public tenant
      let moveId: number;
      try {
        moveId = await odoo.create('account.move', {
          move_type: moveType,
        });
      } catch (authError) {
        // Session might have expired, retry with fresh client
        console.log('[Public OCR] Retrying with fresh Odoo client');
        resetPublicOdooClient();
        odoo = await getPublicOdooClient();
        moveId = await odoo.create('account.move', {
          move_type: moveType,
        });
      }

      console.log(`[Public OCR] Created draft invoice ${moveId} for OCR`);

      // Create attachment
      const attachmentId = await odoo.create('ir.attachment', {
        name: fileName || `scan_${Date.now()}.jpg`,
        type: 'binary',
        datas: imageData,
        res_model: 'account.move',
        res_id: moveId,
        mimetype: mimeType || 'image/jpeg',
      });

      console.log(`[Public OCR] Created attachment ${attachmentId}`);

      // Set as main attachment
      try {
        await odoo.write('account.move', [moveId], {
          message_main_attachment_id: attachmentId,
        });
      } catch (e) {
        console.log(`[Public OCR] Could not set main attachment: ${e}`);
      }

      // Call Odoo's OCR processing
      console.log(`[Public OCR] Calling action_send_to_ocr for move ${moveId}`);
      await odoo.callKw('account.move', 'action_send_to_ocr', [[moveId]], {});

      // Read back OCR results
      const [invoice] = await odoo.read<{
        id: number;
        partner_id: [number, string] | false;
        ref: string | false;
        invoice_date: string | false;
        state: string;
        ocr_status: string;
        ocr_line_items: string | false;
        ocr_confidence: number;
        ocr_pages: number;
        ocr_error_message: string | false;
        amount_total: number;
        amount_untaxed: number;
        amount_tax: number;
        invoice_line_ids: number[];
      }>('account.move', [moveId], [
        'partner_id', 'ref', 'invoice_date', 'state',
        'ocr_status', 'ocr_line_items', 'ocr_confidence', 'ocr_pages',
        'ocr_error_message', 'amount_total', 'amount_untaxed', 'amount_tax',
        'invoice_line_ids'
      ]);

      // Check if OCR failed
      if (invoice.ocr_status === 'failed') {
        // Clean up the failed document
        try {
          await odoo.callKw('account.move', 'unlink', [[moveId]], {});
        } catch (e) {
          console.log(`[Public OCR] Could not delete failed move: ${e}`);
        }

        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'OCR_FAILED',
              message: invoice.ocr_error_message || 'OCR処理に失敗しました。別の画像でお試しください。',
            },
            data: { jobId, status: 'error' },
          },
          { status: 500 }
        );
      }

      // Parse line items
      let lineItems: OcrLineItem[] = [];

      // Account name translations (Japanese)
      const ACCOUNT_NAMES_JA: Record<string, string> = {
        'Cost of Goods Sold': '売上原価',
        'Expenses': '経費',
        'Purchase': '仕入',
        'Consumables': '消耗品費',
        'Office Supplies': '事務用品費',
        'Travel Expenses': '旅費交通費',
        'Entertainment': '交際費',
        'Utilities': '水道光熱費',
        'Communication': '通信費',
        'Rent': '地代家賃',
        'Insurance': '保険料',
        'Depreciation': '減価償却費',
        'Miscellaneous': '雑費',
      };

      // First try to read from invoice_line_ids
      if (invoice.invoice_line_ids && invoice.invoice_line_ids.length > 0) {
        const lines = await odoo.read<{
          name: string;
          quantity: number;
          price_unit: number;
          price_subtotal: number;
          product_uom_id: [number, string] | false;
          account_id: [number, string] | false;
          tax_ids: number[];
        }>('account.move.line', invoice.invoice_line_ids, [
          'name', 'quantity', 'price_unit', 'price_subtotal', 'product_uom_id', 'account_id', 'tax_ids'
        ]);

        lineItems = lines
          .filter(line => line.quantity > 0) // Filter out tax/total lines
          .map(line => {
            // Get account name and translate
            let accountName = '仕入';
            if (line.account_id) {
              const engName = line.account_id[1];
              // Try to find translation or use as-is
              accountName = ACCOUNT_NAMES_JA[engName] || engName.split(' ')[0] || '仕入';
            }

            // Determine tax rate (default 8% for food in Japan)
            const taxRate = line.tax_ids && line.tax_ids.length > 0 ? '8%' : '0%';

            return {
              product_name: line.name || '',
              account_name: accountName,
              quantity: line.quantity || 1,
              unit: line.product_uom_id ? line.product_uom_id[1] : '個',
              unit_price: line.price_unit || 0,
              tax_rate: taxRate,
              amount: line.price_subtotal || 0,
            };
          });
      }

      // Fallback to ocr_line_items JSON
      if (lineItems.length === 0 && invoice.ocr_line_items) {
        try {
          const rawItems = JSON.parse(invoice.ocr_line_items);
          lineItems = rawItems.map((item: Record<string, unknown>) => ({
            product_name: String(item.product_name || item.product || item.name || ''),
            account_name: '仕入',
            quantity: Number(item.quantity) || 1,
            unit: String(item.unit || '個'),
            unit_price: Number(item.unit_price || item.price) || 0,
            tax_rate: '8%',
            amount: Number(item.amount || item.total) || 0,
          }));
        } catch (e) {
          console.error('[Public OCR] Failed to parse line items:', e);
        }
      }

      // Increment quota after successful processing
      incrementQuota(sessionId);

      // Record usage to Odoo 19 for billing (under TEN-MKQZYN00)
      try {
        const odoo19 = getOdoo19Client();
        const usageResult = await odoo19.recordOcrUsage(PUBLIC_BILLING_TENANT, 1);
        console.log(`[Public OCR] Recorded usage to Odoo 19 for ${PUBLIC_BILLING_TENANT}:`, usageResult);
      } catch (billingError) {
        // Don't fail OCR if billing fails - just log the error
        console.error('[Public OCR] Failed to record billing to Odoo 19:', billingError);
      }

      // Calculate totals from line items if Odoo hasn't calculated them yet
      let amountUntaxed = invoice.amount_untaxed || 0;
      let amountTotal = invoice.amount_total || 0;

      if (amountTotal === 0 && lineItems.length > 0) {
        amountUntaxed = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
        // Assume 8% tax for food in Japan (軽減税率)
        const amountTax = Math.round(amountUntaxed * 0.08);
        amountTotal = amountUntaxed + amountTax;
      }

      // Normalize confidence (Odoo returns 0-100, we want 0-1)
      const normalizedConfidence = invoice.ocr_confidence
        ? (invoice.ocr_confidence > 1 ? invoice.ocr_confidence / 100 : invoice.ocr_confidence)
        : null;

      // Get partner VAT (登録番号) if partner exists
      let partnerVat: string | null = null;
      if (invoice.partner_id) {
        try {
          const [partner] = await odoo.read<{ vat: string | false }>('res.partner', [invoice.partner_id[0]], ['vat']);
          partnerVat = partner.vat || null;
        } catch (e) {
          console.log(`[Public OCR] Could not read partner VAT: ${e}`);
        }
      }

      // Build voucher draft
      const voucherDraft: VoucherDraft = {
        id: jobId,
        odoo_move_id: moveId,
        move_type: moveType,
        partner_name: invoice.partner_id ? invoice.partner_id[1] : null,
        partner_vat: partnerVat || '0',
        invoice_date: invoice.invoice_date || null,
        invoice_number: invoice.ref || null,
        amount_total: amountTotal || null,
        amount_untaxed: amountUntaxed || null,
        amount_tax: invoice.amount_tax || (amountTotal - amountUntaxed) || null,
        line_items: lineItems,
        ocr_confidence: normalizedConfidence,
        ocr_status: invoice.ocr_status,
        status: 'draft',
      };

      // Store job with results
      storeJob(sessionId, {
        id: jobId,
        s3Key: '',
        docType,
        status: 'done',
        draftMoveId: moveId,
        ocrResult: {
          merchant: voucherDraft.partner_name,
          date: voucherDraft.invoice_date,
          amount_total: voucherDraft.amount_total,
          confidence: voucherDraft.ocr_confidence,
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
            merchant: voucherDraft.partner_name,
            date: voucherDraft.invoice_date,
            amount_total: voucherDraft.amount_total,
            confidence: voucherDraft.ocr_confidence,
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

      console.error('[Public OCR] Processing failed:', ocrError);

      const errorMessage = ocrError instanceof Error ? ocrError.message : 'OCR処理に失敗しました';

      // Don't expose internal errors
      const userMessage = errorMessage.includes('credentials') || errorMessage.includes('configured')
        ? 'OCRサービスが一時的に利用できません。しばらくしてからお試しください。'
        : 'OCR処理に失敗しました。別の画像でお試しください。';

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'OCR_FAILED',
            message: userMessage,
          },
          data: { jobId, status: 'error' },
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
