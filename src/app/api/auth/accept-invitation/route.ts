/**
 * POST /api/auth/accept-invitation - Accept invitation and set password
 *
 * This endpoint is public (no auth required) as users access it via invitation link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { acceptInvitation, getInvitationByToken } from '@/lib/invitation-service';
import { z } from 'zod';

const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = acceptInvitationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { token, password, displayName } = parsed.data;

    // Accept invitation
    const result = await acceptInvitation({
      token,
      password,
      displayName,
    });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName,
        },
        membership: {
          role: result.membership.role,
          storeScope: result.membership.storeScope,
          status: result.membership.status,
        },
        message: 'Password set successfully. You can now log in.',
      },
    });
  } catch (error) {
    console.error('[Accept Invitation Error]', error);

    const message = error instanceof Error ? error.message : 'Failed to accept invitation';

    // Map common errors to appropriate status codes
    let status = 500;
    let code = 'INTERNAL_ERROR';

    if (message.includes('Invalid invitation')) {
      status = 400;
      code = 'INVALID_TOKEN';
    } else if (message.includes('expired')) {
      status = 400;
      code = 'TOKEN_EXPIRED';
    } else if (message.includes('revoked') || message.includes('accepted')) {
      status = 400;
      code = 'TOKEN_USED';
    } else if (message.includes('Password must')) {
      status = 400;
      code = 'WEAK_PASSWORD';
    }

    return NextResponse.json(
      { success: false, error: { code, message } },
      { status }
    );
  }
}
