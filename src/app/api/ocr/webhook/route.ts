/**
 * OCR Webhook API
 *
 * Receives OCR completion notifications from Odoo 18
 * This endpoint is called by Odoo 18 OCR module when OCR processing completes
 *
 * POST /api/ocr/webhook
 *
 * Expected payload:
 * {
 *   "tenant_code": "TEN-XXXXXX" or "ten_xxxxxx",
 *   "document_id": 123,
 *   "document_model": "account.move" | "purchase.order",
 *   "document_name": "账单/2025/12/0002",
 *   "ocr_status": "done" | "failed",
 *   "ocr_pages": 1,
 *   "api_key": "webhook-secret-key"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { entitlementsService } from '@/lib/entitlements-service';

// Webhook API key for authentication
const WEBHOOK_API_KEY = process.env.OCR_WEBHOOK_API_KEY || 'seisei-ocr-webhook-2026';

interface OcrWebhookPayload {
  tenant_code: string;
  document_id: number;
  document_model: string;
  document_name?: string;
  ocr_status: string;
  ocr_pages?: number;
  api_key: string;
}

/**
 * POST: Receive OCR completion notification from Odoo 18
 */
export async function POST(request: NextRequest) {
  try {
    const body: OcrWebhookPayload = await request.json();

    // Validate API key
    if (body.api_key !== WEBHOOK_API_KEY) {
      console.error('[OCR Webhook] Invalid API key');
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Normalize tenant code
    let tenantCode = body.tenant_code;
    if (tenantCode.startsWith('ten_')) {
      // Convert "ten_mkqzyn00" to "TEN-MKQZYN00"
      tenantCode = 'TEN-' + tenantCode.slice(4).toUpperCase();
    }

    // Find tenant
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { tenantCode: tenantCode },
          { tenantCode: tenantCode.toUpperCase() },
          { odooDb: body.tenant_code.toLowerCase() },
        ],
      },
      include: { entitlements: true },
    });

    if (!tenant) {
      console.error(`[OCR Webhook] Tenant not found: ${body.tenant_code}`);
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    if (!tenant.entitlements) {
      console.error(`[OCR Webhook] Tenant ${tenant.id} has no entitlements`);
      return NextResponse.json(
        { success: false, error: 'Tenant entitlements not configured' },
        { status: 400 }
      );
    }

    // Only record usage for successful OCR
    if (body.ocr_status !== 'done') {
      console.log(`[OCR Webhook] OCR status is ${body.ocr_status}, skipping usage recording`);
      return NextResponse.json({
        success: true,
        data: {
          recorded: false,
          reason: `OCR status is ${body.ocr_status}`,
        },
      });
    }

    const pages = body.ocr_pages || 1;
    let newUsageRecorded = 0;
    let alreadyRecorded = 0;

    // Record each page as a usage event
    for (let i = 0; i < pages; i++) {
      const idempotencyKey = `odoo18_webhook_${tenant.id}_${body.document_model}_${body.document_id}_page_${i}`;

      try {
        const recorded = await entitlementsService.recordUsage({
          tenantId: tenant.id,
          featureKey: 'ocr',
          idempotencyKey,
          status: 'SUCCEEDED',
          meta: {
            source: 'odoo18_webhook',
            documentId: body.document_id,
            documentModel: body.document_model,
            documentName: body.document_name,
            page: i + 1,
            totalPages: pages,
            ocrStatus: body.ocr_status,
            receivedAt: new Date().toISOString(),
          },
        });

        if (recorded) {
          newUsageRecorded++;
        } else {
          alreadyRecorded++;
        }
      } catch (error) {
        console.error(`[OCR Webhook] Error recording usage:`, error);
      }
    }

    // Get updated usage
    const usage = await entitlementsService.getUsage(tenant.id);

    console.log(`[OCR Webhook] ${tenant.name}: Recorded ${newUsageRecorded} pages (${alreadyRecorded} already recorded)`);

    return NextResponse.json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        documentId: body.document_id,
        pagesRecorded: newUsageRecorded,
        alreadyRecorded,
        usage: {
          used: usage.ocr.used,
          free: usage.ocr.free,
          remaining: usage.ocr.remaining,
          billable: usage.ocr.billable,
          cost: usage.ocr.overageCost,
        },
      },
    });
  } catch (error) {
    console.error('[OCR Webhook Error]', error);
    return NextResponse.json(
      { success: false, error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * GET: Health check and usage info
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tenantCode = searchParams.get('tenant_code');
  const apiKey = searchParams.get('api_key');

  // Validate API key
  if (apiKey !== WEBHOOK_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'Invalid API key' },
      { status: 401 }
    );
  }

  if (!tenantCode) {
    return NextResponse.json({
      success: true,
      data: {
        status: 'ok',
        message: 'OCR Webhook endpoint is active',
        version: '1.0',
      },
    });
  }

  // Normalize tenant code
  let normalizedCode = tenantCode;
  if (tenantCode.startsWith('ten_')) {
    normalizedCode = 'TEN-' + tenantCode.slice(4).toUpperCase();
  }

  // Find tenant and get usage
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { tenantCode: normalizedCode },
        { tenantCode: normalizedCode.toUpperCase() },
        { odooDb: tenantCode.toLowerCase() },
      ],
    },
  });

  if (!tenant) {
    return NextResponse.json(
      { success: false, error: 'Tenant not found' },
      { status: 404 }
    );
  }

  const usage = await entitlementsService.getUsage(tenant.id);

  return NextResponse.json({
    success: true,
    data: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantCode: tenant.tenantCode,
      usage: {
        used: usage.ocr.used,
        free: usage.ocr.free,
        remaining: usage.ocr.remaining,
        billable: usage.ocr.billable,
        cost: usage.ocr.overageCost,
        currency: 'JPY',
      },
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
    },
  });
}
