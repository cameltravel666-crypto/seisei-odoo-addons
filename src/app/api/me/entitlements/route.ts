/**
 * GET /api/me/entitlements
 *
 * Returns the current tenant's effective entitlements including:
 * - Module access (with enabled status and reason: trial/subscribed/expired/admin_override)
 * - Usage limits (users, stores, terminals)
 * - Trial status and remaining days
 * - Metered usage (OCR / Table Engine)
 * - Gating mode (lock vs hide)
 *
 * This is THE authoritative endpoint for frontend feature gating.
 */

import { NextResponse } from 'next/server';
import { tenantGuard, guardErrorResponse } from '@/lib/guards';
import { entitlementsService, EffectiveEntitlements, UsageData } from '@/lib/entitlements-service';

export interface EntitlementsApiResponse {
  entitlements: EffectiveEntitlements;
  usage: UsageData;
}

export async function GET() {
  // Validate session and tenant
  const guard = await tenantGuard();
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId } = guard.context;

  try {
    // Get effective entitlements (handles trial logic)
    const entitlements = await entitlementsService.computeEffective(tenantId);

    // Get usage data for metered features
    const usage = await entitlementsService.getUsage(tenantId);

    const response: EntitlementsApiResponse = {
      entitlements,
      usage
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Entitlements API Error]', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch entitlements' } },
      { status: 500 }
    );
  }
}
