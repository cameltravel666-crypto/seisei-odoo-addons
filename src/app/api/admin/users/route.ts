/**
 * /api/admin/users
 *
 * GET  - List all users in the tenant (ORG_ADMIN+)
 * POST - Invite a new user to the tenant (ORG_ADMIN+)
 */

import { NextRequest, NextResponse } from 'next/server';
import { roleGuard, guardErrorResponse } from '@/lib/guards';
import { membershipService } from '@/lib/membership-service';
import { Role, MembershipStatus } from '@prisma/client';
import { z } from 'zod';

// ============================================
// GET /api/admin/users - List users
// ============================================

export async function GET(request: NextRequest) {
  // Require ORG_ADMIN role
  const guard = await roleGuard('ORG_ADMIN');
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId } = guard.context;

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') as MembershipStatus | null;
  const role = searchParams.get('role') as Role | null;
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  // Get memberships
  const { memberships, total } = await membershipService.listByTenant(tenantId, {
    status: status || undefined,
    role: role || undefined,
    limit,
    offset
  });

  return NextResponse.json({
    users: memberships.map(m => ({
      id: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      odooLogin: m.user.odooLogin,
      lastLoginAt: m.user.lastLoginAt?.toISOString() || null,
      membership: {
        role: m.role,
        storeScope: m.storeScope,
        status: m.status
      }
    })),
    total,
    limit,
    offset
  });
}

// ============================================
// POST /api/admin/users - Invite user
// ============================================

const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: z.enum(['BILLING_ADMIN', 'ORG_ADMIN', 'MANAGER', 'OPERATOR']),
  storeScope: z.array(z.string()).optional(),
  odooUserId: z.number().int().positive(),
  odooLogin: z.string().min(1).max(100)
});

export async function POST(request: NextRequest) {
  // Require ORG_ADMIN role
  const guard = await roleGuard('ORG_ADMIN');
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId, userId, role: actorRole } = guard.context;

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const validation = inviteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const input = validation.data;

  // Only BILLING_ADMIN can create BILLING_ADMIN
  if (input.role === 'BILLING_ADMIN' && actorRole !== 'BILLING_ADMIN') {
    return NextResponse.json(
      { error: 'Only BILLING_ADMIN can create BILLING_ADMIN users' },
      { status: 403 }
    );
  }

  // Create user and membership
  try {
    const membership = await membershipService.inviteUser(
      tenantId,
      {
        email: input.email,
        displayName: input.displayName,
        role: input.role as Role,
        storeScope: input.storeScope,
        odooUserId: input.odooUserId,
        odooLogin: input.odooLogin
      },
      userId
    );

    return NextResponse.json({
      success: true,
      user: {
        id: membership.user.id,
        displayName: membership.user.displayName,
        email: membership.user.email,
        odooLogin: membership.user.odooLogin,
        membership: {
          role: membership.role,
          storeScope: membership.storeScope,
          status: membership.status
        }
      }
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to invite user';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
