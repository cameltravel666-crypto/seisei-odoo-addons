/**
 * GET /api/auth/invitation/[token] - Verify invitation token
 *
 * This endpoint is public (no auth required) as users access it via invitation link.
 * Returns basic info about the invitation without the token hash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInvitationByToken } from '@/lib/invitation-service';
import { InvitationStatus } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_TOKEN', message: 'Token is required' } },
        { status: 400 }
      );
    }

    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid invitation token' } },
        { status: 400 }
      );
    }

    // Check if already used
    if (invitation.status === InvitationStatus.ACCEPTED) {
      return NextResponse.json(
        { success: false, error: { code: 'TOKEN_USED', message: 'This invitation has already been used' } },
        { status: 400 }
      );
    }

    // Check if revoked
    if (invitation.status === InvitationStatus.REVOKED) {
      return NextResponse.json(
        { success: false, error: { code: 'TOKEN_REVOKED', message: 'This invitation has been cancelled' } },
        { status: 400 }
      );
    }

    // Check if expired
    if (invitation.status === InvitationStatus.EXPIRED || invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: { code: 'TOKEN_EXPIRED', message: 'This invitation has expired' } },
        { status: 400 }
      );
    }

    // Return invitation info
    const tenant = invitation as { tenant?: { tenantCode: string; name: string } };

    return NextResponse.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        type: invitation.type,
        expiresAt: invitation.expiresAt.toISOString(),
        tenant: tenant.tenant ? {
          code: tenant.tenant.tenantCode,
          name: tenant.tenant.name,
        } : null,
      },
    });
  } catch (error) {
    console.error('[Verify Invitation Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to verify invitation' } },
      { status: 500 }
    );
  }
}
