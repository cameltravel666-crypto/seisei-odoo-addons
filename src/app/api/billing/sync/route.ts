/**
 * Billing Sync API
 * Syncs usage data to Odoo 19 and creates invoices
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOdoo19Client, UsageRecord } from '@/lib/odoo19';

const CRON_SECRET = process.env.CRON_SECRET;

interface SyncResult {
  tenantId: string;
  tenantName: string;
  ocrUsed: number;
  ocrBillable: number;
  tableUsed: number;
  tableBillable: number;
  orderId: number | null;
  error?: string;
}

/**
 * POST: Sync usage to Odoo 19
 * Can be called by cron job or admin
 */
export async function POST(request: NextRequest) {
  try {
    // Check for cron secret or admin session
    const cronSecret = request.headers.get('x-cron-secret');
    const isCronRequest = cronSecret && cronSecret === CRON_SECRET;

    if (!isCronRequest) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        );
      }

      // Check if admin
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
      });

      if (!user?.isAdmin) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'sync_usage';
    const tenantId = body.tenantId; // Optional: sync specific tenant

    const odoo19 = getOdoo19Client();

    switch (action) {
      case 'sync_usage': {
        // Get billing rules
        const rules = await odoo19.getBillingRules();
        const ocrRule = rules.find(r => r.productCode === 'METERED-OCR');
        const tableRule = rules.find(r => r.productCode === 'METERED-TABLE');

        // Get current billing period (this month)
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Get all tenants with usage (or specific tenant)
        const whereClause = tenantId ? { id: tenantId } : { isActive: true };
        const tenants = await prisma.tenant.findMany({
          where: whereClause,
          include: {
            entitlements: true,
          },
        });

        const results: SyncResult[] = [];

        for (const tenant of tenants) {
          try {
            // Get usage for this period
            const usageEvents = await prisma.tenantUsageEvent.groupBy({
              by: ['featureKey'],
              where: {
                tenantId: tenant.id,
                createdAt: {
                  gte: periodStart,
                  lte: periodEnd,
                },
                status: 'SUCCEEDED',
              },
              _count: {
                id: true,
              },
            });

            const ocrUsed = usageEvents.find(u => u.featureKey === 'ocr')?._count.id || 0;
            const tableUsed = usageEvents.find(u => u.featureKey === 'table')?._count.id || 0;

            const ocrFreeQuota = ocrRule?.freeQuota || 30;
            const tableFreeQuota = tableRule?.freeQuota || 5;

            const ocrBillable = Math.max(0, ocrUsed - ocrFreeQuota);
            const tableBillable = Math.max(0, tableUsed - tableFreeQuota);

            // Skip if no billable usage
            if (ocrBillable === 0 && tableBillable === 0) {
              results.push({
                tenantId: tenant.id,
                tenantName: tenant.name,
                ocrUsed,
                ocrBillable: 0,
                tableUsed,
                tableBillable: 0,
                orderId: null,
              });
              continue;
            }

            // Ensure tenant has Odoo 19 partner
            let partnerId = tenant.odoo19PartnerId;
            if (!partnerId) {
              partnerId = await odoo19.createOrGetPartner({
                name: tenant.name,
                email: tenant.ownerEmail || undefined,
                phone: tenant.ownerPhone || undefined,
              });

              // Save partner ID
              await prisma.tenant.update({
                where: { id: tenant.id },
                data: { odoo19PartnerId: partnerId },
              });
            }

            // Record OCR usage
            let orderId: number | null = null;
            if (ocrBillable > 0) {
              const ocrRecord: UsageRecord = {
                tenantId: tenant.id,
                tenantName: tenant.name,
                partnerId,
                featureKey: 'ocr',
                periodStart,
                periodEnd,
                totalUsed: ocrUsed,
                freeQuota: ocrFreeQuota,
                billableQty: ocrBillable,
                unitPrice: ocrRule?.overagePrice || 20,
                totalAmount: ocrBillable * (ocrRule?.overagePrice || 20),
              };
              orderId = await odoo19.recordUsageToOdoo(ocrRecord);
            }

            // Record Table usage
            if (tableBillable > 0) {
              const tableRecord: UsageRecord = {
                tenantId: tenant.id,
                tenantName: tenant.name,
                partnerId,
                featureKey: 'table',
                periodStart,
                periodEnd,
                totalUsed: tableUsed,
                freeQuota: tableFreeQuota,
                billableQty: tableBillable,
                unitPrice: tableRule?.overagePrice || 50,
                totalAmount: tableBillable * (tableRule?.overagePrice || 50),
              };
              const tableOrderId = await odoo19.recordUsageToOdoo(tableRecord);
              if (!orderId) orderId = tableOrderId;
            }

            results.push({
              tenantId: tenant.id,
              tenantName: tenant.name,
              ocrUsed,
              ocrBillable,
              tableUsed,
              tableBillable,
              orderId,
            });

          } catch (error) {
            console.error(`[Billing Sync] Error for tenant ${tenant.id}:`, error);
            results.push({
              tenantId: tenant.id,
              tenantName: tenant.name,
              ocrUsed: 0,
              ocrBillable: 0,
              tableUsed: 0,
              tableBillable: 0,
              orderId: null,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return NextResponse.json({
          success: true,
          data: {
            action: 'sync_usage',
            period: {
              start: periodStart.toISOString(),
              end: periodEnd.toISOString(),
            },
            results,
            summary: {
              totalTenants: results.length,
              tenantsWithBillable: results.filter(r => r.ocrBillable > 0 || r.tableBillable > 0).length,
              totalOcrBillable: results.reduce((sum, r) => sum + r.ocrBillable, 0),
              totalTableBillable: results.reduce((sum, r) => sum + r.tableBillable, 0),
              errors: results.filter(r => r.error).length,
            },
            timestamp: new Date().toISOString(),
          },
        });
      }

      case 'create_invoices': {
        // Create invoices for all draft usage orders
        const periodKey = body.period || new Date().toISOString().slice(0, 7);

        // Get tenants with Odoo 19 partner
        const tenants = await prisma.tenant.findMany({
          where: {
            isActive: true,
            odoo19PartnerId: { not: null },
          },
        });

        const invoiceResults: Array<{
          tenantId: string;
          tenantName: string;
          invoiceId: number | null;
          error?: string;
        }> = [];

        for (const tenant of tenants) {
          if (!tenant.odoo19PartnerId) continue;

          try {
            const invoiceId = await odoo19.createUsageInvoice(tenant.odoo19PartnerId, []);
            invoiceResults.push({
              tenantId: tenant.id,
              tenantName: tenant.name,
              invoiceId,
            });
          } catch (error) {
            invoiceResults.push({
              tenantId: tenant.id,
              tenantName: tenant.name,
              invoiceId: null,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return NextResponse.json({
          success: true,
          data: {
            action: 'create_invoices',
            period: periodKey,
            results: invoiceResults,
            summary: {
              totalTenants: invoiceResults.length,
              invoicesCreated: invoiceResults.filter(r => r.invoiceId).length,
              errors: invoiceResults.filter(r => r.error).length,
            },
            timestamp: new Date().toISOString(),
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Billing Sync Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Billing sync failed' } },
      { status: 500 }
    );
  }
}

/**
 * GET: Get billing sync status
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Get current period usage summary
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const usageSummary = await prisma.tenantUsageEvent.groupBy({
      by: ['featureKey'],
      where: {
        tenantId: session.tenantId,
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
        status: 'SUCCEEDED',
      },
      _count: {
        id: true,
      },
    });

    // Get billing rules
    const odoo19 = getOdoo19Client();
    let rules;
    try {
      rules = await odoo19.getBillingRules();
    } catch {
      rules = [
        { productCode: 'METERED-OCR', freeQuota: 30, overagePrice: 20 },
        { productCode: 'METERED-TABLE', freeQuota: 5, overagePrice: 50 },
      ];
    }

    const ocrRule = rules.find(r => r.productCode === 'METERED-OCR');
    const tableRule = rules.find(r => r.productCode === 'METERED-TABLE');

    const ocrUsed = usageSummary.find(u => u.featureKey === 'ocr')?._count.id || 0;
    const tableUsed = usageSummary.find(u => u.featureKey === 'table')?._count.id || 0;

    const ocrFreeQuota = ocrRule?.freeQuota || 30;
    const tableFreeQuota = tableRule?.freeQuota || 5;

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
        usage: {
          ocr: {
            used: ocrUsed,
            freeQuota: ocrFreeQuota,
            billable: Math.max(0, ocrUsed - ocrFreeQuota),
            unitPrice: ocrRule?.overagePrice || 20,
          },
          table: {
            used: tableUsed,
            freeQuota: tableFreeQuota,
            billable: Math.max(0, tableUsed - tableFreeQuota),
            unitPrice: tableRule?.overagePrice || 50,
          },
        },
        estimatedCharge:
          Math.max(0, ocrUsed - ocrFreeQuota) * (ocrRule?.overagePrice || 20) +
          Math.max(0, tableUsed - tableFreeQuota) * (tableRule?.overagePrice || 50),
        currency: 'JPY',
      },
    });
  } catch (error) {
    console.error('[Billing Status Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get billing status' } },
      { status: 500 }
    );
  }
}
