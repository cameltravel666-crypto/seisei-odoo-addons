/**
 * GET /api/me/entitlements
 *
 * Returns the current tenant's entitlements (modules, limits, status).
 * Used by frontend feature gates and mobile app module visibility.
 */

import { NextResponse } from 'next/server';
import { tenantGuard, guardErrorResponse } from '@/lib/guards';
import { entitlementsService } from '@/lib/entitlements-service';

export async function GET() {
  // Validate session and tenant
  const guard = await tenantGuard();
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId } = guard.context;

  // Get entitlements
  const entitlements = await entitlementsService.getForApi(tenantId);

  return NextResponse.json(entitlements);
}
