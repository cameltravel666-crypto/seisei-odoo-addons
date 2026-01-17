/**
 * DELETE /api/admin/invitations/[id] - Revoke invitation
 *
 * Required role: ORG_ADMIN or higher
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { combinedGuard } from '@/lib/guards';
import { revokeInvitation } from '@/lib/invitation-service';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check role
    const guard = await combinedGuard(session.tenantId, session.userId, {
      minRole: 'ORG_ADMIN',
    });

    if (!guard.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: guard.reason || 'Insufficient permissions' } },
        { status: 403 }
      );
    }

    // Verify invitation belongs to tenant
    const invitation = await prisma.invitation.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found' } },
        { status: 404 }
      );
    }

    const updated = await revokeInvitation(id, session.userId);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        revokedAt: updated.revokedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Invitation Revoke Error]', error);

    const message = error instanceof Error ? error.message : 'Failed to revoke invitation';

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
