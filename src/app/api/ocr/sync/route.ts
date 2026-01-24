/**
 * OCR Usage Sync API
 *
 * Syncs OCR usage from Odoo 18 to BizNexus
 * This is needed because users can trigger OCR directly from Odoo 18 interface,
 * bypassing the BizNexus API and thus not recording usage.
 *
 * POST /api/ocr/sync - Sync OCR usage for current tenant
 *
 * For admin use:
 * POST /api/ocr/sync?tenantId=xxx - Sync specific tenant (requires admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { entitlementsService } from '@/lib/entitlements-service';

// Odoo 18 admin credentials for service account access
const ODOO18_SERVICE_USER = process.env.ODOO18_SERVICE_USER || 'admin@seisei.tokyo';
const ODOO18_SERVICE_PASSWORD = process.env.ODOO18_SERVICE_PASSWORD || 'Seisei@2026';

interface Odoo18OcrDocument {
  id: number;
  name?: string;
  ocr_status?: string;
  ocr_pages?: number;
  create_date?: string;
  write_date?: string;
}

interface SyncResult {
  tenantId: string;
  tenantName: string;
  ocrDocumentsFound: number;
  ocrPagesTotal: number;
  newUsageRecorded: number;
  alreadyRecorded: number;
  error?: string;
}

/**
 * Connect to Odoo 18 and authenticate
 */
async function authenticateOdoo18(baseUrl: string, db: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          db,
          login: ODOO18_SERVICE_USER,
          password: ODOO18_SERVICE_PASSWORD,
        },
        id: Date.now(),
      }),
    });

    const data = await response.json();
    if (data.error || !data.result?.uid) {
      console.error('[OCR Sync] Odoo 18 auth failed:', data.error?.message || 'Invalid credentials');
      return null;
    }

    // Extract session from cookie
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/session_id=([^;]+)/);
      if (match) return match[1];
    }
    return data.result.session_id || null;
  } catch (error) {
    console.error('[OCR Sync] Odoo 18 auth error:', error);
    return null;
  }
}

/**
 * Query Odoo 18 for OCR-processed documents in the current billing period
 */
async function queryOdoo18OcrUsage(
  baseUrl: string,
  db: string,
  sessionId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ invoices: Odoo18OcrDocument[]; purchaseOrders: Odoo18OcrDocument[] }> {
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `session_id=${sessionId}`,
  };

  const startDate = periodStart.toISOString().split('T')[0];
  const endDate = periodEnd.toISOString().split('T')[0];

  // Query account.move (invoices/bills) with OCR data
  const invoiceResponse = await fetch(`${baseUrl}/web/dataset/call_kw`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'search_read',
        args: [
          [
            ['ocr_status', 'in', ['done', 'processing', 'pending']],
            ['create_date', '>=', `${startDate} 00:00:00`],
            ['create_date', '<=', `${endDate} 23:59:59`],
          ],
        ],
        kwargs: {
          fields: ['id', 'name', 'ocr_status', 'ocr_pages', 'create_date', 'write_date'],
          limit: 1000,
        },
      },
      id: Date.now(),
    }),
  });

  const invoiceData = await invoiceResponse.json();
  const invoices: Odoo18OcrDocument[] = invoiceData.result || [];

  // Query purchase.order with OCR data (if module installed)
  let purchaseOrders: Odoo18OcrDocument[] = [];
  try {
    const poResponse = await fetch(`${baseUrl}/web/dataset/call_kw`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'purchase.order',
          method: 'search_read',
          args: [
            [
              ['ocr_status', 'in', ['done', 'processing', 'pending']],
              ['create_date', '>=', `${startDate} 00:00:00`],
              ['create_date', '<=', `${endDate} 23:59:59`],
            ],
          ],
          kwargs: {
            fields: ['id', 'name', 'ocr_status', 'ocr_pages', 'create_date', 'write_date'],
            limit: 1000,
          },
        },
        id: Date.now(),
      }),
    });

    const poData = await poResponse.json();
    purchaseOrders = poData.result || [];
  } catch {
    // Purchase order OCR module might not be installed
    console.log('[OCR Sync] Purchase order OCR not available');
  }

  return { invoices, purchaseOrders };
}

/**
 * POST: Sync OCR usage from Odoo 18
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Get optional tenantId from query params (for admin use)
    const searchParams = request.nextUrl.searchParams;
    const requestedTenantId = searchParams.get('tenantId');

    // Determine target tenant
    let targetTenantId = session.tenantId;
    if (requestedTenantId && requestedTenantId !== session.tenantId) {
      // Check if user is admin
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
      });
      if (!user?.isAdmin) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
          { status: 403 }
        );
      }
      targetTenantId = requestedTenantId;
    }

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: targetTenantId },
      include: { entitlements: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 }
      );
    }

    if (!tenant.entitlements) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFIG_ERROR', message: 'Tenant entitlements not found' } },
        { status: 400 }
      );
    }

    // Calculate current billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Authenticate with Odoo 18
    const sessionId = await authenticateOdoo18(tenant.odooBaseUrl, tenant.odooDb);
    if (!sessionId) {
      return NextResponse.json({
        success: true,
        data: {
          tenantId: tenant.id,
          tenantName: tenant.name,
          ocrDocumentsFound: 0,
          ocrPagesTotal: 0,
          newUsageRecorded: 0,
          alreadyRecorded: 0,
          error: 'Failed to authenticate with Odoo 18',
        } as SyncResult,
      });
    }

    // Query OCR usage from Odoo 18
    const { invoices, purchaseOrders } = await queryOdoo18OcrUsage(
      tenant.odooBaseUrl,
      tenant.odooDb,
      sessionId,
      periodStart,
      periodEnd
    );

    // Combine and deduplicate documents
    const allDocuments = [...invoices, ...purchaseOrders];
    let ocrPagesTotal = 0;
    let newUsageRecorded = 0;
    let alreadyRecorded = 0;

    for (const doc of allDocuments) {
      const pages = doc.ocr_pages || 1;
      ocrPagesTotal += pages;

      // Record each page as a usage event
      for (let i = 0; i < pages; i++) {
        const idempotencyKey = `odoo18_ocr_${tenant.id}_${doc.id}_page_${i}`;

        try {
          const recorded = await entitlementsService.recordUsage({
            tenantId: tenant.id,
            featureKey: 'ocr',
            idempotencyKey,
            status: 'SUCCEEDED',
            meta: {
              source: 'odoo18_sync',
              documentId: doc.id,
              documentName: doc.name,
              page: i + 1,
              totalPages: pages,
              ocrStatus: doc.ocr_status,
              syncedAt: new Date().toISOString(),
            },
          });

          if (recorded) {
            newUsageRecorded++;
          } else {
            alreadyRecorded++;
          }
        } catch (error) {
          console.error(`[OCR Sync] Error recording usage for doc ${doc.id}:`, error);
        }
      }
    }

    const result: SyncResult = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      ocrDocumentsFound: allDocuments.length,
      ocrPagesTotal,
      newUsageRecorded,
      alreadyRecorded,
    };

    console.log(`[OCR Sync] Synced ${tenant.name}: ${ocrPagesTotal} pages (${newUsageRecorded} new, ${alreadyRecorded} existing)`);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[OCR Sync Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'OCR sync failed' } },
      { status: 500 }
    );
  }
}

/**
 * GET: Get current OCR usage status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Get optional tenantId from query params (for admin use)
    const searchParams = request.nextUrl.searchParams;
    const requestedTenantId = searchParams.get('tenantId');

    // Determine target tenant
    let targetTenantId = session.tenantId;
    if (requestedTenantId && requestedTenantId !== session.tenantId) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
      });
      if (!user?.isAdmin) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
          { status: 403 }
        );
      }
      targetTenantId = requestedTenantId;
    }

    // Get usage data
    const usage = await entitlementsService.getUsage(targetTenantId);

    // Get last sync time
    const lastSyncEvent = await prisma.tenantUsageEvent.findFirst({
      where: {
        tenantId: targetTenantId,
        featureKey: 'ocr',
        meta: {
          path: ['source'],
          equals: 'odoo18_sync',
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        ocr: usage.ocr,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        lastSyncAt: lastSyncEvent?.createdAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('[OCR Usage Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get OCR usage' } },
      { status: 500 }
    );
  }
}
