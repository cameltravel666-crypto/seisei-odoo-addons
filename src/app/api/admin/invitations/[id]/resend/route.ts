/**
 * POST /api/admin/invitations/[id]/resend - Resend invitation
 *
 * Required role: ORG_ADMIN or higher
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { combinedGuard } from '@/lib/guards';
import { resendInvitation } from '@/lib/invitation-service';
import { prisma } from '@/lib/db';

export async function POST(
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

    const result = await resendInvitation(id, session.userId);

    // Generate new invitation URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://biznexus.seisei.tokyo';
    const invitationUrl = `${baseUrl}/set-password?token=${encodeURIComponent(result.token)}`;

    // TODO: Send email with new invitation URL

    return NextResponse.json({
      success: true,
      data: {
        invitation: {
          id: result.invitation.id,
          email: result.invitation.email,
          status: result.invitation.status,
          expiresAt: result.invitation.expiresAt.toISOString(),
          resentCount: result.invitation.resentCount,
        },
        // Include URL in development only
        invitationUrl: process.env.NODE_ENV === 'development' ? invitationUrl : undefined,
      },
    });
  } catch (error) {
    console.error('[Invitation Resend Error]', error);

    const message = error instanceof Error ? error.message : 'Failed to resend invitation';

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
