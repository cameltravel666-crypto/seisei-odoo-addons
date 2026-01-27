/**
 * TRY_OCR Database Guard
 * Ensures public OCR requests cannot override database selection
 */

import { NextRequest, NextResponse } from 'next/server';

// Forbidden parameters that could be used to override DB
const FORBIDDEN_PARAMS = ['db', 'dbname', 'database', 'tenant', 'tenant_code'];

export interface GuardResult {
  allowed: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Guard middleware for TRY_OCR routes
 * Rejects any request attempting to override the database
 */
export function tryOcrDbGuard(request: NextRequest): GuardResult {
  // Check URL parameters
  const url = new URL(request.url);
  for (const param of FORBIDDEN_PARAMS) {
    if (url.searchParams.has(param)) {
      return {
        allowed: false,
        error: `Parameter '${param}' is not allowed for public OCR`,
        errorCode: 'DB_OVERRIDE_FORBIDDEN',
      };
    }
  }

  // Check headers (some clients might try to pass db via header)
  const forbiddenHeaders = ['x-database', 'x-db', 'x-tenant'];
  for (const header of forbiddenHeaders) {
    if (request.headers.get(header)) {
      return {
        allowed: false,
        error: `Header '${header}' is not allowed for public OCR`,
        errorCode: 'DB_OVERRIDE_FORBIDDEN',
      };
    }
  }

  return { allowed: true };
}

/**
 * Middleware function that can be used in API routes
 */
export function withTryOcrDbGuard(
  handler: (request: NextRequest) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const guardResult = tryOcrDbGuard(request);

    if (!guardResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: guardResult.errorCode,
            message: guardResult.error,
          },
        },
        { status: 400 }
      );
    }

    return handler(request);
  };
}

/**
 * Check if request body contains forbidden db parameters
 * Call this after parsing the JSON body
 */
export function checkBodyForDbOverride(body: Record<string, unknown>): GuardResult {
  for (const param of FORBIDDEN_PARAMS) {
    if (param in body) {
      return {
        allowed: false,
        error: `Body parameter '${param}' is not allowed for public OCR`,
        errorCode: 'DB_OVERRIDE_FORBIDDEN',
      };
    }
  }

  return { allowed: true };
}
