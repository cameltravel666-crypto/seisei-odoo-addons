import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ModuleCode } from '@prisma/client';

// Module code mapping from Odoo feature names to Prisma enum values
const FEATURE_TO_MODULE: Record<string, string> = {
  module_pos: 'POS',
  module_inventory: 'INVENTORY',
  module_purchase: 'PURCHASE',
  module_sales: 'SALES',
  module_crm: 'CRM',
  module_expenses: 'EXPENSES',
  module_accounting: 'ACCOUNTING',
  module_finance: 'FINANCE',
  module_approvals: 'APPROVALS',
  module_hr: 'HR',
  module_maintenance: 'MAINTENANCE',
  module_documents: 'DOCUMENTS',
  module_dashboard: 'DASHBOARD',
  module_products: 'PRODUCTS',
  module_contacts: 'CONTACTS',
  // Also support direct module codes
  POS: 'POS',
  INVENTORY: 'INVENTORY',
  PURCHASE: 'PURCHASE',
  SALES: 'SALES',
  CRM: 'CRM',
  EXPENSES: 'EXPENSES',
  ACCOUNTING: 'ACCOUNTING',
  FINANCE: 'FINANCE',
  APPROVALS: 'APPROVALS',
  HR: 'HR',
  MAINTENANCE: 'MAINTENANCE',
  DOCUMENTS: 'DOCUMENTS',
  DASHBOARD: 'DASHBOARD',
  PRODUCTS: 'PRODUCTS',
  CONTACTS: 'CONTACTS',
  // Starter plan features
  module_starter: 'DASHBOARD',
};

/**
 * POST /seisei/entitlements/apply
 *
 * Receives entitlements from Odoo 19 billing system and updates tenant_features.
 *
 * Expected headers:
 * - X-API-KEY: The API key for authentication
 *
 * Expected body:
 * {
 *   "tenant_code": "TEN-MKQZYN00",
 *   "features": ["module_pos", "module_inventory"],
 *   "source": "odoo19_billing",
 *   "timestamp": "2026-01-23T12:00:00Z"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get API key from header
    const apiKey = request.headers.get('X-API-KEY');
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing X-API-KEY header' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { tenant_code, features, source, timestamp } = body;

    if (!tenant_code) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant_code' },
        { status: 400 }
      );
    }

    // Find tenant by code
    const tenant = await prisma.tenant.findFirst({
      where: { tenantCode: tenant_code },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Tenant not found: ${tenant_code}` },
        { status: 404 }
      );
    }

    // Validate API key against tenant
    // For now, accept any key that starts with "sk-" (generated keys)
    // In production, you might want to store and validate keys per tenant
    if (!apiKey.startsWith('sk-')) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key format' },
        { status: 401 }
      );
    }

    // Map features to module codes
    const moduleCodes: ModuleCode[] = [];
    const invalidFeatures: string[] = [];

    for (const feature of (features || [])) {
      const moduleCode = FEATURE_TO_MODULE[feature] as ModuleCode | undefined;
      if (moduleCode && !moduleCodes.includes(moduleCode)) {
        moduleCodes.push(moduleCode);
      } else if (!FEATURE_TO_MODULE[feature]) {
        invalidFeatures.push(feature);
      }
    }

    // Get current features
    const currentFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId: tenant.id },
    });

    const currentModules = currentFeatures.map(f => f.moduleCode);

    // Calculate changes
    const toActivate = moduleCodes.filter(m => !currentModules.includes(m));
    const toDeactivate = currentModules.filter(m => !moduleCodes.includes(m));

    // Apply changes in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete features that should be deactivated
      if (toDeactivate.length > 0) {
        await tx.tenantFeature.deleteMany({
          where: {
            tenantId: tenant.id,
            moduleCode: { in: toDeactivate },
          },
        });
      }

      // Create features that should be activated
      if (toActivate.length > 0) {
        await tx.tenantFeature.createMany({
          data: toActivate.map(moduleCode => ({
            tenantId: tenant.id,
            moduleCode,
            isAllowed: true,
            isVisible: true,
          })),
          skipDuplicates: true,
        });
      }
    });

    console.log(
      `[Entitlements] Applied for ${tenant_code}: activated=${toActivate.join(',') || 'none'}, ` +
      `deactivated=${toDeactivate.join(',') || 'none'}, source=${source}, timestamp=${timestamp}`
    );

    return NextResponse.json({
      success: true,
      message: 'Entitlements applied successfully',
      result: {
        tenant_code,
        activated: toActivate,
        deactivated: toDeactivate,
        total_active: moduleCodes.length,
        invalid_features: invalidFeatures.length > 0 ? invalidFeatures : undefined,
      },
    });
  } catch (error) {
    console.error('[Entitlements Error]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'seisei_entitlements',
    version: '1.0.0',
  });
}
