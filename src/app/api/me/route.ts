/**
 * GET /api/me
 *
 * Returns the current user's profile with membership and entitlements.
 * This is the primary endpoint for clients to get user context.
 */

import { NextResponse } from 'next/server';
import { tenantGuard, guardErrorResponse } from '@/lib/guards';
import { prisma } from '@/lib/db';
import { entitlementsService } from '@/lib/entitlements-service';

export async function GET() {
  // Validate session and tenant
  const guard = await tenantGuard();
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { session, tenantId, userId, role, storeScope } = guard.context;

  // Get full user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      odooLogin: true,
      odooUserId: true,
      isAdmin: true,
      lastLoginAt: true,
      tenant: {
        select: {
          id: true,
          tenantCode: true,
          name: true,
          planCode: true,
          isActive: true
        }
      }
    }
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // Get entitlements summary
  const entitlements = await entitlementsService.getForApi(tenantId);

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      odooLogin: user.odooLogin,
      odooUserId: user.odooUserId,
      lastLoginAt: user.lastLoginAt?.toISOString() || null
    },
    tenant: {
      id: user.tenant.id,
      tenantCode: user.tenant.tenantCode,
      name: user.tenant.name,
      planCode: user.tenant.planCode,
      isActive: user.tenant.isActive
    },
    membership: {
      role,
      storeScope,
      isAdmin: role === 'BILLING_ADMIN' || role === 'ORG_ADMIN'
    },
    entitlements
  });
}
