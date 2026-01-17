/**
 * POST /api/admin/invitations - Create new invitation
 * GET /api/admin/invitations - List invitations
 *
 * Required role: ORG_ADMIN or higher
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { roleGuard, combinedGuard } from '@/lib/guards';
import { createInvitation, listInvitations } from '@/lib/invitation-service';
import { Role, InvitationStatus } from '@prisma/client';
import { z } from 'zod';

const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['BILLING_ADMIN', 'ORG_ADMIN', 'MANAGER', 'OPERATOR']).default('OPERATOR'),
  storeScope: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check role - must be ORG_ADMIN or higher to invite
    const guard = await combinedGuard(session.tenantId, session.userId, {
      minRole: 'ORG_ADMIN',
    });

    if (!guard.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: guard.reason || 'Insufficient permissions' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createInvitationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { email, role, storeScope } = parsed.data;

    // Prevent inviting higher role than self
    const roleHierarchy: Record<string, number> = {
      BILLING_ADMIN: 4,
      ORG_ADMIN: 3,
      MANAGER: 2,
      OPERATOR: 1,
    };

    const inviterRole = guard.membership?.role || 'OPERATOR';
    if (roleHierarchy[role] > roleHierarchy[inviterRole]) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot invite user with higher role than yourself' } },
        { status: 403 }
      );
    }

    const result = await createInvitation({
      tenantId: session.tenantId,
      email,
      role: role as Role,
      storeScope,
      invitedById: session.userId,
    });

    // Generate invitation URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://biznexus.seisei.tokyo';
    const invitationUrl = `${baseUrl}/set-password?token=${encodeURIComponent(result.token)}`;

    // TODO: Send email with invitation URL
    // For now, return URL in response (remove in production)

    return NextResponse.json({
      success: true,
      data: {
        invitation: {
          id: result.invitation.id,
          email: result.invitation.email,
          role: result.invitation.role,
          storeScope: result.invitation.storeScope,
          status: result.invitation.status,
          expiresAt: result.invitation.expiresAt.toISOString(),
          createdAt: result.invitation.createdAt.toISOString(),
        },
        // Include URL in development only
        invitationUrl: process.env.NODE_ENV === 'development' ? invitationUrl : undefined,
      },
    });
  } catch (error) {
    console.error('[Invitation Create Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create invitation' } },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check role - must be ORG_ADMIN or higher to view invitations
    const guard = await combinedGuard(session.tenantId, session.userId, {
      minRole: 'ORG_ADMIN',
    });

    if (!guard.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: guard.reason || 'Insufficient permissions' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as InvitationStatus | null;
    const email = searchParams.get('email');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const result = await listInvitations(session.tenantId, {
      status: status || undefined,
      email: email || undefined,
      page,
      pageSize: Math.min(pageSize, 100), // Max 100 per page
    });

    return NextResponse.json({
      success: true,
      data: {
        invitations: result.invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          storeScope: inv.storeScope,
          status: inv.status,
          type: inv.type,
          expiresAt: inv.expiresAt.toISOString(),
          usedAt: inv.usedAt?.toISOString(),
          resentCount: inv.resentCount,
          createdAt: inv.createdAt.toISOString(),
          sender: (inv as { sender?: { displayName: string; email: string } }).sender,
        })),
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('[Invitation List Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list invitations' } },
      { status: 500 }
    );
  }
}
