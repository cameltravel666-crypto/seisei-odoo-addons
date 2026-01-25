/**
 * Billing OCR Scan API
 * POST: Perform OCR using Odoo 18 and record usage to Odoo 19 for billing
 *
 * This endpoint:
 * 1. Uses Odoo 18's mature OCR functionality
 * 2. Records usage to local DB (TenantUsageEvent)
 * 3. Records usage to Odoo 19 for billing
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { entitlementsService } from '@/lib/entitlements-service';
import { getOdoo19Client } from '@/lib/odoo19';
import { prisma } from '@/lib/db';

// ============================================
// Schema
// ============================================

const ocrScanRequestSchema = z.object({
  docType: z.enum(['purchase', 'sale', 'expense']),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  imageData: z.string().min(1), // Base64 encoded
});

// Map doc type to Odoo move type
const DOC_TYPE_MAP: Record<string, string> = {
  purchase: 'in_invoice',
  sale: 'out_invoice',
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

// ============================================
// Record usage to Odoo 19
// ============================================

async function recordUsageToOdoo19(
  tenantId: string,
  tenantName: string,
  odoo19PartnerId: number | null
): Promise<void> {
  try {
    const odoo19 = getOdoo19Client();
    await odoo19.authenticate();

    // Get or create partner in Odoo 19
    let partnerId = odoo19PartnerId;
    if (!partnerId) {
      partnerId = await odoo19.createOrGetPartner({
        name: tenantName,
      });
    }

    // Get current billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get billing rules
    const rules = await odoo19.getBillingRules();
    const ocrRule = rules.find(r => r.productCode === 'METERED-OCR');

    // Get current usage count
    const usageCount = await prisma.tenantUsageEvent.count({
      where: {
        tenantId,
        featureKey: 'ocr',
        status: 'SUCCEEDED',
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    // Calculate billable
    const freeQuota = ocrRule?.freeQuota || 30;
    const billableQty = Math.max(0, usageCount - freeQuota);
    const unitPrice = ocrRule?.overagePrice || 20;

    if (billableQty > 0) {
      // Record to Odoo 19
      await odoo19.recordUsageToOdoo({
        tenantId,
        tenantName,
        partnerId,
        featureKey: 'ocr',
        periodStart,
        periodEnd,
        totalUsed: usageCount,
        freeQuota,
        billableQty,
        unitPrice,
        totalAmount: billableQty * unitPrice,
      });

      console.log(`[Billing] Recorded ${billableQty} billable OCR uses to Odoo 19 for tenant ${tenantId}`);
    }
  } catch (error) {
    console.error('[Billing] Failed to record usage to Odoo 19:', error);
    // Don't fail the OCR request if billing recording fails
  }
}

// ============================================
// API Handler
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'ログインが必要です',
          },
        },
        { status: 401 }
      );
    }

    const { tenantId, userId } = session;

    // Check if OCR usage is allowed
    const canUse = await entitlementsService.canUseFeature(tenantId, 'ocr');
    if (!canUse.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: '無料枠を使い切りました。お支払い方法を設定して続けてご利用ください。',
            reason: canUse.reason,
          },
        },
        { status: 429 }
      );
    }

    // Parse request
    const body = await request.json();
    const parsed = ocrScanRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '画像データが必要です',
          },
        },
        { status: 400 }
      );
    }

    const { docType, fileName, mimeType, imageData } = parsed.data;
    const moveType = DOC_TYPE_MAP[docType] || 'in_invoice';
    const jobId = crypto.randomUUID();
    const idempotencyKey = `ocr_${tenantId}_${jobId}`;

    // Get Odoo 18 client for the tenant
    const odoo = await getOdooClientForSession(session);

    // Create draft invoice in Odoo 18 for OCR processing
    const moveId = await odoo.create('account.move', {
      move_type: moveType,
    });

    console.log(`[Billing OCR] Created draft invoice ${moveId} for OCR`);

    // Create attachment
    const attachmentId = await odoo.create('ir.attachment', {
      name: fileName || `scan_${Date.now()}.jpg`,
      type: 'binary',
      datas: imageData,
      res_model: 'account.move',
      res_id: moveId,
      mimetype: mimeType || 'image/jpeg',
    });

    console.log(`[Billing OCR] Created attachment ${attachmentId}`);

    // Set as main attachment
    try {
      await odoo.write('account.move', [moveId], {
        message_main_attachment_id: attachmentId,
      });
    } catch {
      console.log('[Billing OCR] Could not set main attachment (may not be supported)');
    }

    // Call Odoo 18's OCR processing
    console.log(`[Billing OCR] Calling action_send_to_ocr for move ${moveId}`);
    await odoo.callKw('account.move', 'action_send_to_ocr', [[moveId]], {});

    // Read back OCR results
    const [invoice] = await odoo.searchRead<{
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
    }>('account.move', [['id', '=', moveId]], {
      fields: [
        'partner_id', 'ref', 'invoice_date', 'state',
        'ocr_status', 'ocr_line_items', 'ocr_confidence', 'ocr_pages',
        'ocr_error_message', 'amount_total', 'amount_untaxed', 'amount_tax',
        'invoice_line_ids',
      ],
    });

    // Check if OCR failed
    if (invoice.ocr_status === 'failed') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'OCR_FAILED',
            message: invoice.ocr_error_message || 'OCR処理に失敗しました。別の画像でお試しください。',
          },
        },
        { status: 500 }
      );
    }

    // Parse line items
    let lineItems: OcrLineItem[] = [];

    // Read from invoice_line_ids
    if (invoice.invoice_line_ids && invoice.invoice_line_ids.length > 0) {
      const lines = await odoo.searchRead<{
        name: string;
        quantity: number;
        price_unit: number;
        price_subtotal: number;
        product_uom_id: [number, string] | false;
        account_id: [number, string] | false;
        tax_ids: number[];
      }>('account.move.line', [['id', 'in', invoice.invoice_line_ids]], {
        fields: ['name', 'quantity', 'price_unit', 'price_subtotal', 'product_uom_id', 'account_id', 'tax_ids'],
      });

      lineItems = lines
        .filter(line => line.quantity > 0)
        .map(line => {
          let accountName = '仕入';
          if (line.account_id) {
            const engName = line.account_id[1];
            accountName = ACCOUNT_NAMES_JA[engName] || engName.split(' ')[0] || '仕入';
          }

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
      } catch {
        console.error('[Billing OCR] Failed to parse line items');
      }
    }

    // Record usage to local DB
    await entitlementsService.recordUsage({
      tenantId,
      featureKey: 'ocr',
      idempotencyKey,
      status: 'SUCCEEDED',
      meta: {
        jobId,
        moveId,
        docType,
        userId,
      },
    });

    // Record usage to Odoo 19 (async, don't wait)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, odooPartnerId: true },
    });

    if (tenant) {
      recordUsageToOdoo19(tenantId, tenant.name, tenant.odooPartnerId).catch(err => {
        console.error('[Billing] Async Odoo 19 recording failed:', err);
      });
    }

    // Calculate totals
    let amountUntaxed = invoice.amount_untaxed || 0;
    let amountTotal = invoice.amount_total || 0;

    if (amountTotal === 0 && lineItems.length > 0) {
      amountUntaxed = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const amountTax = Math.round(amountUntaxed * 0.08);
      amountTotal = amountUntaxed + amountTax;
    }

    // Normalize confidence
    const normalizedConfidence = invoice.ocr_confidence
      ? (invoice.ocr_confidence > 1 ? invoice.ocr_confidence / 100 : invoice.ocr_confidence)
      : null;

    // Get partner VAT
    let partnerVat: string | null = null;
    if (invoice.partner_id) {
      try {
        const [partner] = await odoo.searchRead<{ vat: string | false }>('res.partner', [['id', '=', invoice.partner_id[0]]], {
          fields: ['vat'],
        });
        partnerVat = partner.vat || null;
      } catch {
        console.log('[Billing OCR] Could not read partner VAT');
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
  } catch (error) {
    console.error('[Billing OCR Scan Error]', error);

    const errorMessage = error instanceof Error ? error.message : 'OCR処理に失敗しました';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
