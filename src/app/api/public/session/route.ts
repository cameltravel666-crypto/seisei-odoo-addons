/**
 * Public Session API
 * GET: Get or create anonymous session
 * Returns session info and quota remaining
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateAnonSession,
  ANON_SESSION_COOKIE,
  COOKIE_MAX_AGE,
} from '@/lib/public-session';

export async function GET(request: NextRequest) {
  try {
    const session = await getOrCreateAnonSession();

    // Create response
    const response = NextResponse.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        quotaRemaining: session.quotaRemaining,
        quotaUsed: session.quotaUsed,
        dailyLimit: 3,
        isNew: session.isNew,
      },
    });

    // Set cookie if new session
    if (session.isNew) {
      response.cookies.set(ANON_SESSION_COOKIE, session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('[Public Session API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SESSION_ERROR',
          message: 'Failed to create or retrieve session',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // POST can be used to create session with metadata
  try {
    const body = await request.json().catch(() => ({}));
    const session = await getOrCreateAnonSession();

    const response = NextResponse.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        quotaRemaining: session.quotaRemaining,
        quotaUsed: session.quotaUsed,
        dailyLimit: 3,
        isNew: session.isNew,
        docType: body.docType || 'receipt',
      },
    });

    // Set cookie if new session
    if (session.isNew) {
      response.cookies.set(ANON_SESSION_COOKIE, session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('[Public Session API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SESSION_ERROR',
          message: 'Failed to create or retrieve session',
        },
      },
      { status: 500 }
    );
  }
}
