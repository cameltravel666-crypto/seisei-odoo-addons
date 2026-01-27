/**
 * Database Resolution Module
 * Provides three-chain isolation for multi-tenant architecture
 *
 * Chains:
 * 1. TENANT - Normal business operations (tenant-specific DB)
 * 2. TRY_OCR - Public OCR demo (fixed public DB, no override allowed)
 * 3. ADMIN - Admin backend access (admin-only)
 * 4. QR_ORDERING - Per-tenant QR ordering (isolated from TRY_OCR)
 */

// Route type definitions
export { RouteType, type RouteContext, allowsDbOverride, getRouteTypeDescription } from './routeType';

// Main resolver
export { resolveDb, DbConfig, type ResolveResult, type RequestContext } from './dbResolver';

// Guards
export { tryOcrDbGuard, withTryOcrDbGuard, checkBodyForDbOverride } from './guards/tryOcrDbGuard';
export { adminGuard, withAdminGuard, isAdminDomain, type AdminGuardResult } from './guards/adminGuard';
