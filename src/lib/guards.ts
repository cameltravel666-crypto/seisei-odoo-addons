/**
 * Authorization Guards for API Routes
 *
 * These guards provide server-side enforcement of:
 * - Tenant isolation (TenantGuard)
 * - Role-based access control (RoleGuard)
 * - Module/feature entitlements (EntitlementGuard)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, JWTPayload } from './auth';
import { prisma } from './db';
import { Role, MembershipStatus, EntitlementStatus } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface GuardContext {
  session: JWTPayload;
  tenantId: string;
  userId: string;
  role: Role;
  storeScope: string[];
  entitlements: {
    modules: string[];
    maxUsers: number;
    maxStores: number;
    maxTerminals: number;
    status: EntitlementStatus;
  } | null;
}

export type GuardResult =
  | { success: true; context: GuardContext }
  | { success: false; error: string; status: number };

// ============================================
// Helper Functions
// ============================================

async function getMembershipAndEntitlements(userId: string, tenantId: string) {
  const [membership, entitlements] = await Promise.all([
    prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId, tenantId }
      }
    }),
    prisma.entitlements.findUnique({
      where: { tenantId }
    })
  ]);

  return { membership, entitlements };
}

// ============================================
// TenantGuard
// ============================================

/**
 * Validates that the request has a valid session and belongs to an active tenant.
 * Returns the base context for further guards.
 */
export async function tenantGuard(): Promise<GuardResult> {
  const session = await getSession();

  if (!session) {
    return {
      success: false,
      error: 'Unauthorized: No valid session',
      status: 401
    };
  }

  // Verify tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, isActive: true }
  });

  if (!tenant) {
    return {
      success: false,
      error: 'Unauthorized: Tenant not found',
      status: 401
    };
  }

  if (!tenant.isActive) {
    return {
      success: false,
      error: 'Forbidden: Tenant is inactive',
      status: 403
    };
  }

  // Get membership and entitlements
  const { membership, entitlements } = await getMembershipAndEntitlements(
    session.userId,
    session.tenantId
  );

  // If no membership exists (legacy user), create one based on isAdmin
  const role = membership?.role ?? (session.isAdmin ? 'ORG_ADMIN' : 'OPERATOR');
  const storeScope = membership?.storeScope ?? [];

  return {
    success: true,
    context: {
      session,
      tenantId: session.tenantId,
      userId: session.userId,
      role,
      storeScope,
      entitlements: entitlements ? {
        modules: entitlements.modules,
        maxUsers: entitlements.maxUsers,
        maxStores: entitlements.maxStores,
        maxTerminals: entitlements.maxTerminals,
        status: entitlements.status
      } : null
    }
  };
}

// ============================================
// RoleGuard
// ============================================

/**
 * Role hierarchy: BILLING_ADMIN > ORG_ADMIN > MANAGER > OPERATOR
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  BILLING_ADMIN: 4,
  ORG_ADMIN: 3,
  MANAGER: 2,
  OPERATOR: 1
};

/**
 * Checks if the user has the required role or higher.
 * Must be called after tenantGuard.
 */
export async function roleGuard(
  requiredRole: Role,
  context?: GuardContext
): Promise<GuardResult> {
  // Get context if not provided
  if (!context) {
    const tenantResult = await tenantGuard();
    if (!tenantResult.success) return tenantResult;
    context = tenantResult.context;
  }

  const userRoleLevel = ROLE_HIERARCHY[context.role];
  const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

  if (userRoleLevel < requiredRoleLevel) {
    return {
      success: false,
      error: `Forbidden: Requires ${requiredRole} role or higher`,
      status: 403
    };
  }

  return { success: true, context };
}

// ============================================
// EntitlementGuard
// ============================================

/**
 * Checks if the tenant has the required module enabled.
 * Must be called after tenantGuard.
 */
export async function entitlementGuard(
  requiredModule: string,
  context?: GuardContext
): Promise<GuardResult> {
  // Get context if not provided
  if (!context) {
    const tenantResult = await tenantGuard();
    if (!tenantResult.success) return tenantResult;
    context = tenantResult.context;
  }

  // Check entitlements exist
  if (!context.entitlements) {
    return {
      success: false,
      error: 'Forbidden: No entitlements configured',
      status: 403
    };
  }

  // Check entitlement status
  const activeStatuses: EntitlementStatus[] = ['ACTIVE', 'TRIAL'];
  if (!activeStatuses.includes(context.entitlements.status)) {
    return {
      success: false,
      error: `Forbidden: Subscription ${context.entitlements.status.toLowerCase()}`,
      status: 403
    };
  }

  // Check module is enabled
  if (!context.entitlements.modules.includes(requiredModule)) {
    return {
      success: false,
      error: `Forbidden: Module ${requiredModule} not enabled`,
      status: 403
    };
  }

  return { success: true, context };
}

// ============================================
// Store Scope Guard
// ============================================

/**
 * Checks if the user has access to the specified store.
 * Empty storeScope means access to all stores.
 */
export async function storeScopeGuard(
  storeId: string,
  context?: GuardContext
): Promise<GuardResult> {
  // Get context if not provided
  if (!context) {
    const tenantResult = await tenantGuard();
    if (!tenantResult.success) return tenantResult;
    context = tenantResult.context;
  }

  // Empty store scope means all stores
  if (context.storeScope.length === 0) {
    return { success: true, context };
  }

  // Check if store is in user's scope
  if (!context.storeScope.includes(storeId)) {
    return {
      success: false,
      error: 'Forbidden: Store not in user scope',
      status: 403
    };
  }

  return { success: true, context };
}

// ============================================
// Combined Guard
// ============================================

export interface CombinedGuardOptions {
  requiredRole?: Role;
  requiredModule?: string;
  storeId?: string;
}

/**
 * Combines multiple guards into a single check.
 * Useful for API routes that need multiple validations.
 */
export async function combinedGuard(
  options: CombinedGuardOptions
): Promise<GuardResult>;

/**
 * Overload: Combined guard with explicit tenantId and userId.
 * Returns a simpler result for easier API route usage.
 */
export async function combinedGuard(
  tenantId: string,
  userId: string,
  options: { minRole?: Role | string; requiredModule?: string; storeId?: string }
): Promise<{ allowed: boolean; reason?: string; membership?: { role: Role; storeScope: string[] } }>;

export async function combinedGuard(
  optionsOrTenantId: CombinedGuardOptions | string,
  userIdOrUndefined?: string,
  optionsAlt?: { minRole?: Role | string; requiredModule?: string; storeId?: string }
): Promise<GuardResult | { allowed: boolean; reason?: string; membership?: { role: Role; storeScope: string[] } }> {
  // Check if called with (tenantId, userId, options) signature
  if (typeof optionsOrTenantId === 'string' && typeof userIdOrUndefined === 'string') {
    const tenantId = optionsOrTenantId;
    const userId = userIdOrUndefined;
    const opts = optionsAlt || {};

    try {
      // Get membership
      const membership = await prisma.membership.findUnique({
        where: {
          userId_tenantId: { userId, tenantId }
        }
      });

      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        return { allowed: false, reason: 'No active membership' };
      }

      // Check role if specified
      if (opts.minRole) {
        const requiredRole = opts.minRole as Role;
        const userRoleLevel = ROLE_HIERARCHY[membership.role];
        const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

        if (userRoleLevel < requiredRoleLevel) {
          return { allowed: false, reason: `Requires ${requiredRole} role or higher` };
        }
      }

      // Check store scope if specified
      if (opts.storeId && membership.storeScope.length > 0) {
        if (!membership.storeScope.includes(opts.storeId)) {
          return { allowed: false, reason: 'Store not in scope' };
        }
      }

      return {
        allowed: true,
        membership: {
          role: membership.role,
          storeScope: membership.storeScope,
        }
      };
    } catch {
      return { allowed: false, reason: 'Guard check failed' };
    }
  }

  // Original implementation with CombinedGuardOptions
  const options = optionsOrTenantId as CombinedGuardOptions;

  // Always run tenant guard first
  const tenantResult = await tenantGuard();
  if (!tenantResult.success) return tenantResult;

  let context = tenantResult.context;

  // Check role if specified
  if (options.requiredRole) {
    const roleResult = await roleGuard(options.requiredRole, context);
    if (!roleResult.success) return roleResult;
    context = roleResult.context;
  }

  // Check entitlement if specified
  if (options.requiredModule) {
    const entitlementResult = await entitlementGuard(options.requiredModule, context);
    if (!entitlementResult.success) return entitlementResult;
    context = entitlementResult.context;
  }

  // Check store scope if specified
  if (options.storeId) {
    const storeResult = await storeScopeGuard(options.storeId, context);
    if (!storeResult.success) return storeResult;
    context = storeResult.context;
  }

  return { success: true, context };
}

// ============================================
// Ops Admin Guard (for internal operations console)
// ============================================

/**
 * Check if the request is from an authenticated ops admin.
 * Ops admins are stored in the OPS_ADMINS env var as comma-separated emails.
 */
export async function opsAdminGuard(): Promise<{ allowed: boolean; email?: string; reason?: string }> {
  const session = await getSession();

  if (!session) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true }
  });

  if (!user?.email) {
    return { allowed: false, reason: 'User not found' };
  }

  // Check if user is in OPS_ADMINS list
  const opsAdmins = (process.env.OPS_ADMINS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (!opsAdmins.includes(user.email.toLowerCase())) {
    return { allowed: false, reason: 'Not an ops admin' };
  }

  return { allowed: true, email: user.email };
}

/**
 * Check if the request has valid ops API key (for automated systems)
 */
export function opsApiKeyGuard(apiKey: string | null): { allowed: boolean; reason?: string } {
  if (!apiKey) {
    return { allowed: false, reason: 'No API key provided' };
  }

  const validKey = process.env.OPS_API_KEY;

  if (!validKey || apiKey !== validKey) {
    return { allowed: false, reason: 'Invalid API key' };
  }

  return { allowed: true };
}

// ============================================
// Response Helpers
// ============================================

/**
 * Creates a JSON error response from a guard result.
 */
export function guardErrorResponse(result: GuardResult): NextResponse {
  if (result.success) {
    throw new Error('guardErrorResponse called with successful result');
  }

  return NextResponse.json(
    { error: result.error },
    { status: result.status }
  );
}

/**
 * Utility function to run guards and return early if failed.
 * Usage:
 *   const guard = await withGuard({ requiredRole: 'ORG_ADMIN' });
 *   if (!guard.success) return guardErrorResponse(guard);
 *   const { context } = guard;
 */
export async function withGuard(
  options: CombinedGuardOptions = {}
): Promise<GuardResult> {
  return combinedGuard(options);
}
