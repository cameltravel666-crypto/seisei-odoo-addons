/**
 * Database Resolver
 * Central module for resolving database names based on route type
 * Ensures three-chain isolation: TENANT, TRY_OCR, ADMIN
 */

import { RouteType, RouteContext } from './routeType';
import { prisma } from '../db';

// Configuration from environment
const OCR_PUBLIC_DB = process.env.OCR_PUBLIC_DB || 'TEN-OCR-DEMO';
const TEMPLATE_DB_FULL = process.env.TEMPLATE_DB_FULL || 'TPL-FULL';
const TEMPLATE_DB_QR = process.env.TEMPLATE_DB_QR || 'TPL-QR';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seisei.tokyo';
const ADMIN_DOMAINS = (process.env.ADMIN_DOMAINS || '*.erp.seisei.tokyo').split(',');

// Debug mode for development/staging
const DEBUG_DB_RESOLUTION = process.env.DEBUG_DB_RESOLUTION === 'true';

export interface ResolveResult {
  success: boolean;
  dbName: string | null;
  routeType: RouteType;
  error?: string;
  errorCode?: string;
}

export interface RequestContext {
  path: string;
  host: string;
  tenantCode?: string;
  userId?: string;
  userEmail?: string;
  isAuthenticated: boolean;
  qrToken?: string;
  // Request params that might try to override DB (should be rejected for TRY_OCR)
  requestDbParam?: string;
}

/**
 * Main database resolver function
 * Determines route type and resolves appropriate database
 */
export async function resolveDb(ctx: RequestContext): Promise<ResolveResult> {
  const startTime = Date.now();

  try {
    // 1. Determine route type from path and host
    const routeType = determineRouteType(ctx);

    // 2. Resolve database based on route type
    let result: ResolveResult;

    switch (routeType) {
      case RouteType.TRY_OCR:
        result = await resolveTryOcrDb(ctx);
        break;

      case RouteType.ADMIN:
        result = await resolveAdminDb(ctx);
        break;

      case RouteType.QR_ORDERING:
        result = await resolveQrOrderingDb(ctx);
        break;

      case RouteType.TENANT:
      default:
        result = await resolveTenantDb(ctx);
        break;
    }

    // Log resolution in debug mode
    if (DEBUG_DB_RESOLUTION) {
      console.log(`[DbResolver] ${ctx.path} -> ${result.routeType}:${result.dbName} (${Date.now() - startTime}ms)`);
    }

    return result;

  } catch (error) {
    console.error('[DbResolver] Error:', error);
    return {
      success: false,
      dbName: null,
      routeType: RouteType.TENANT,
      error: 'Internal resolution error',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Determine route type from request context
 */
function determineRouteType(ctx: RequestContext): RouteType {
  const { path, host } = ctx;

  // TRY_OCR: Public OCR demo paths
  if (
    path.startsWith('/try-ocr') ||
    path.startsWith('/api/public/ocr') ||
    path.startsWith('/api/public/session') ||
    path.startsWith('/api/public/presign')
  ) {
    return RouteType.TRY_OCR;
  }

  // QR_ORDERING: QR code ordering paths
  if (
    path.startsWith('/qr/') ||
    path.startsWith('/api/qr/') ||
    path.startsWith('/api/order/')
  ) {
    return RouteType.QR_ORDERING;
  }

  // ADMIN: Requests to *.erp.seisei.tokyo backend
  if (isAdminDomain(host)) {
    return RouteType.ADMIN;
  }

  // Default: TENANT operations
  return RouteType.TENANT;
}

/**
 * Check if host matches admin domain pattern
 */
function isAdminDomain(host: string): boolean {
  for (const pattern of ADMIN_DOMAINS) {
    if (pattern.startsWith('*.')) {
      // Wildcard pattern
      const suffix = pattern.slice(1); // .erp.seisei.tokyo
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
 * Resolve DB for TRY_OCR route
 * ALWAYS returns fixed public DB, rejects any override attempts
 */
async function resolveTryOcrDb(ctx: RequestContext): Promise<ResolveResult> {
  // CRITICAL: Reject any db parameter override for TRY_OCR
  if (ctx.requestDbParam) {
    console.warn(`[DbResolver] TRY_OCR db override attempt blocked: ${ctx.requestDbParam}`);
    return {
      success: false,
      dbName: null,
      routeType: RouteType.TRY_OCR,
      error: 'Database parameter not allowed for public OCR',
      errorCode: 'DB_OVERRIDE_FORBIDDEN',
    };
  }

  // Always return fixed public DB
  return {
    success: true,
    dbName: OCR_PUBLIC_DB,
    routeType: RouteType.TRY_OCR,
  };
}

/**
 * Resolve DB for ADMIN route
 * Only admin@seisei.tokyo can access
 */
async function resolveAdminDb(ctx: RequestContext): Promise<ResolveResult> {
  // Check if user is admin
  if (!ctx.isAuthenticated) {
    return {
      success: false,
      dbName: null,
      routeType: RouteType.ADMIN,
      error: 'Authentication required for admin access',
      errorCode: 'AUTH_REQUIRED',
    };
  }

  if (ctx.userEmail !== ADMIN_EMAIL) {
    console.warn(`[DbResolver] ADMIN access denied for: ${ctx.userEmail}`);
    return {
      success: false,
      dbName: null,
      routeType: RouteType.ADMIN,
      error: 'Admin access denied',
      errorCode: 'ADMIN_ACCESS_DENIED',
    };
  }

  // Admin can access any DB based on host
  // Extract subdomain from host for DB selection
  const subdomain = extractSubdomain(ctx.host);
  if (subdomain) {
    return {
      success: true,
      dbName: `ten_${subdomain}`,
      routeType: RouteType.ADMIN,
    };
  }

  // Default admin DB
  return {
    success: true,
    dbName: 'ten_testodoo',
    routeType: RouteType.ADMIN,
  };
}

/**
 * Resolve DB for QR_ORDERING route
 * DB is resolved from QR token -> tenant mapping
 */
async function resolveQrOrderingDb(ctx: RequestContext): Promise<ResolveResult> {
  // CRITICAL: QR ordering must never fall back to TRY_OCR DB
  if (!ctx.qrToken && !ctx.tenantCode) {
    return {
      success: false,
      dbName: null,
      routeType: RouteType.QR_ORDERING,
      error: 'QR token or tenant code required',
      errorCode: 'QR_TOKEN_REQUIRED',
    };
  }

  // Resolve tenant from token or code
  let tenantCode = ctx.tenantCode;

  if (ctx.qrToken && !tenantCode) {
    // TODO: Look up tenant from QR token in database
    // For now, extract from token format if possible
    tenantCode = await resolveQrTokenToTenant(ctx.qrToken);
  }

  if (!tenantCode) {
    return {
      success: false,
      dbName: null,
      routeType: RouteType.QR_ORDERING,
      error: 'Unable to resolve tenant from QR token',
      errorCode: 'TENANT_NOT_FOUND',
    };
  }

  // Get DB name from tenant mapping
  const dbName = await getTenantDbName(tenantCode);

  if (!dbName) {
    return {
      success: false,
      dbName: null,
      routeType: RouteType.QR_ORDERING,
      error: 'Tenant database not found',
      errorCode: 'DB_NOT_FOUND',
    };
  }

  // CRITICAL: Ensure QR ordering never routes to OCR public DB
  if (dbName === OCR_PUBLIC_DB) {
    console.error(`[DbResolver] QR_ORDERING attempted to route to OCR public DB!`);
    return {
      success: false,
      dbName: null,
      routeType: RouteType.QR_ORDERING,
      error: 'Invalid tenant configuration',
      errorCode: 'INVALID_TENANT',
    };
  }

  return {
    success: true,
    dbName,
    routeType: RouteType.QR_ORDERING,
  };
}

/**
 * Resolve DB for TENANT route
 * DB is resolved from authenticated user's tenant
 */
async function resolveTenantDb(ctx: RequestContext): Promise<ResolveResult> {
  if (!ctx.isAuthenticated || !ctx.tenantCode) {
    return {
      success: false,
      dbName: null,
      routeType: RouteType.TENANT,
      error: 'Authentication with tenant required',
      errorCode: 'AUTH_REQUIRED',
    };
  }

  // Get DB name from tenant mapping
  const dbName = await getTenantDbName(ctx.tenantCode);

  if (!dbName) {
    return {
      success: false,
      dbName: null,
      routeType: RouteType.TENANT,
      error: 'Tenant database not found',
      errorCode: 'DB_NOT_FOUND',
    };
  }

  // CRITICAL: Tenant operations must never route to OCR public DB
  if (dbName === OCR_PUBLIC_DB) {
    console.error(`[DbResolver] TENANT attempted to route to OCR public DB!`);
    return {
      success: false,
      dbName: null,
      routeType: RouteType.TENANT,
      error: 'Invalid tenant configuration',
      errorCode: 'INVALID_TENANT',
    };
  }

  return {
    success: true,
    dbName,
    routeType: RouteType.TENANT,
  };
}

/**
 * Get tenant DB name from tenant code
 */
async function getTenantDbName(tenantCode: string): Promise<string | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantCode },
      select: { odooDb: true },
    });
    return tenant?.odooDb || null;
  } catch (error) {
    console.error(`[DbResolver] Error looking up tenant ${tenantCode}:`, error);
    return null;
  }
}

/**
 * Resolve QR token to tenant code
 */
async function resolveQrTokenToTenant(qrToken: string): Promise<string | undefined> {
  // TODO: Implement QR token lookup from database
  // For now, return undefined to require explicit tenant code
  return undefined;
}

/**
 * Extract subdomain from host
 */
function extractSubdomain(host: string): string | null {
  // Handle *.erp.seisei.tokyo pattern
  const match = host.match(/^([a-z0-9-]+)\.erp\.seisei\.tokyo$/);
  return match ? match[1] : null;
}

// Export configuration for external use
export const DbConfig = {
  OCR_PUBLIC_DB,
  TEMPLATE_DB_FULL,
  TEMPLATE_DB_QR,
  ADMIN_EMAIL,
  ADMIN_DOMAINS,
  DEBUG_DB_RESOLUTION,
};
