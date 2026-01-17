/**
 * /api/admin/users/[id]
 *
 * GET    - Get a specific user's details (ORG_ADMIN+)
 * PATCH  - Update a user's role/storeScope/status (ORG_ADMIN+)
 * DELETE - Remove a user from the tenant (ORG_ADMIN+)
 */

import { NextRequest, NextResponse } from 'next/server';
import { roleGuard, guardErrorResponse } from '@/lib/guards';
import { membershipService } from '@/lib/membership-service';
import { Role, MembershipStatus } from '@prisma/client';
import { z } from 'zod';

// ============================================
// GET /api/admin/users/[id] - Get user details
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await roleGuard('ORG_ADMIN');
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId } = guard.context;
  const { id: targetUserId } = await params;

  const membership = await membershipService.get(targetUserId, tenantId);
  if (!membership) {
    return NextResponse.json(
      { error: 'User not found in this tenant' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: membership.user.id,
    displayName: membership.user.displayName,
    email: membership.user.email,
    odooLogin: membership.user.odooLogin,
    lastLoginAt: membership.user.lastLoginAt?.toISOString() || null,
    membership: {
      role: membership.role,
      storeScope: membership.storeScope,
      status: membership.status
    }
  });
}

// ============================================
// PATCH /api/admin/users/[id] - Update user
// ============================================

const updateSchema = z.object({
  role: z.enum(['BILLING_ADMIN', 'ORG_ADMIN', 'MANAGER', 'OPERATOR']).optional(),
  storeScope: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await roleGuard('ORG_ADMIN');
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId, userId: actorId, role: actorRole } = guard.context;
  const { id: targetUserId } = await params;

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

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const input = validation.data;

  // Only BILLING_ADMIN can assign BILLING_ADMIN role
  if (input.role === 'BILLING_ADMIN' && actorRole !== 'BILLING_ADMIN') {
    return NextResponse.json(
      { error: 'Only BILLING_ADMIN can assign BILLING_ADMIN role' },
      { status: 403 }
    );
  }

  try {
    const membership = await membershipService.update(
      targetUserId,
      tenantId,
      {
        role: input.role as Role | undefined,
        storeScope: input.storeScope,
        status: input.status as MembershipStatus | undefined
      },
      actorId
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

// ============================================
// DELETE /api/admin/users/[id] - Remove user
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await roleGuard('ORG_ADMIN');
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId, userId: actorId } = guard.context;
  const { id: targetUserId } = await params;

  // Cannot remove yourself
  if (targetUserId === actorId) {
    return NextResponse.json(
      { error: 'Cannot remove yourself' },
      { status: 400 }
    );
  }

  try {
    await membershipService.remove(targetUserId, tenantId, actorId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove user';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
