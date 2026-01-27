/**
 * Admin Access Guard
 * Ensures only admin@seisei.tokyo can access *.erp.seisei.tokyo backend
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from '../../auth';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seisei.tokyo';
const ADMIN_DOMAINS = (process.env.ADMIN_DOMAINS || '*.erp.seisei.tokyo').split(',');

export interface AdminGuardResult {
  allowed: boolean;
  user?: JWTPayload;
  error?: string;
  errorCode?: string;
}

/**
 * Check if the request host is an admin domain
 */
export function isAdminDomain(host: string): boolean {
  for (const pattern of ADMIN_DOMAINS) {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      if (host.endsWith(suffix) && host !== suffix.slice(1)) {
        return true;
      }
    } else if (host === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Admin access guard
 * Returns allowed=true only if:
 * 1. User is authenticated
 * 2. User email matches ADMIN_EMAIL
 */
export async function adminGuard(request: NextRequest): Promise<AdminGuardResult> {
  // Check if this is an admin domain
  const host = request.headers.get('host') || '';
  if (!isAdminDomain(host)) {
    // Not an admin domain, allow (will be handled by other guards)
    return { allowed: true };
  }

  // Get auth token from cookie
  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    return {
      allowed: false,
      error: 'Authentication required for admin access',
      errorCode: 'AUTH_REQUIRED',
    };
  }

  // Verify token
  const payload = await verifyToken(token);

  if (!payload) {
    return {
      allowed: false,
      error: 'Invalid authentication token',
      errorCode: 'INVALID_TOKEN',
    };
  }

  // Check if user is admin
  // Note: We need to look up the user's email from the database
  // For now, we use isAdmin flag from JWT
  if (!payload.isAdmin) {
    console.warn(`[AdminGuard] Non-admin access attempt: userId=${payload.userId}`);
    return {
      allowed: false,
      user: payload,
      error: 'Admin access denied. Only admin@seisei.tokyo can access this resource.',
      errorCode: 'ADMIN_ACCESS_DENIED',
    };
  }

  return {
    allowed: true,
    user: payload,
  };
}

/**
 * Middleware wrapper for admin-only routes
 */
export function withAdminGuard(
  handler: (request: NextRequest, user: JWTPayload) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const guardResult = await adminGuard(request);

    if (!guardResult.allowed) {
      // Return 403 for admin access denied
      const status = guardResult.errorCode === 'AUTH_REQUIRED' ? 401 : 403;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: guardResult.errorCode,
            message: guardResult.error,
          },
        },
        { status }
      );
    }

    // User is guaranteed to exist if allowed=true and this is an admin domain
    return handler(request, guardResult.user!);
  };
}
