/**
 * Route Type Definitions
 * Defines the three isolated routing chains for multi-tenant architecture
 */

export enum RouteType {
  /**
   * TENANT - Normal tenant operations via BizNexus
   * DB is resolved from tenant mapping (TEN-xxxxx)
   * Used for: login, dashboard, purchases, sales, etc.
   */
  TENANT = 'TENANT',

  /**
   * TRY_OCR - Public OCR demo
   * DB is ALWAYS fixed to OCR_PUBLIC_DB (e.g., TEN-OCR-DEMO)
   * No db override allowed from request parameters
   */
  TRY_OCR = 'TRY_OCR',

  /**
   * ADMIN - Admin-only access to Odoo backend
   * Only admin@seisei.tokyo can access *.erp.seisei.tokyo
   * DB resolved from host/dbfilter rules
   */
  ADMIN = 'ADMIN',

  /**
   * QR_ORDERING - Per-tenant QR ordering
   * DB resolved from QR token -> tenant mapping
   * Isolated from TRY_OCR chain
   */
  QR_ORDERING = 'QR_ORDERING',
}

/**
 * Route context containing resolved routing information
 */
export interface RouteContext {
  routeType: RouteType;
  dbName: string | null;
  tenantCode: string | null;
  userId: string | null;
  isAdmin: boolean;
  requestPath: string;
  host: string;
}

/**
 * Check if a route type allows db override from request
 */
export function allowsDbOverride(routeType: RouteType): boolean {
  // TRY_OCR NEVER allows db override - fixed to public DB
  // ADMIN allows override for admin users only
  // TENANT resolves from tenant mapping, not request params
  // QR_ORDERING resolves from token, not request params
  return false; // All routes use server-side resolution
}

/**
 * Get human-readable description for route type
 */
export function getRouteTypeDescription(routeType: RouteType): string {
  switch (routeType) {
    case RouteType.TENANT:
      return 'Tenant business operations';
    case RouteType.TRY_OCR:
      return 'Public OCR demo (fixed DB)';
    case RouteType.ADMIN:
      return 'Admin backend access';
    case RouteType.QR_ORDERING:
      return 'QR ordering per-tenant';
    default:
      return 'Unknown';
  }
}
