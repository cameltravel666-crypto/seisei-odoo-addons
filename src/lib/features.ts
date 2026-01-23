/**
 * Feature / Module Management (Server-side)
 * Handles subscription-based and user preference-based module visibility
 *
 * NOTE: For module definitions that can be used in client components,
 * import from '@/lib/modules' instead.
 *
 * This module now uses the unified entitlements system (entitlements-service.ts)
 * for determining module access based on trial/subscription status.
 */

import { prisma } from './db';
import { ModuleCode } from '@prisma/client';
import { ALL_MODULES, CORE_MODULES, PREMIUM_MODULES, getModuleInfo } from './modules';
import type { ModuleInfo } from './modules';
import { entitlementsService } from './entitlements-service';

// Re-export module definitions for backwards compatibility
export { ALL_MODULES, CORE_MODULES, PREMIUM_MODULES, getModuleInfo };
export type { ModuleInfo };

/**
 * Get visible modules for a user based on entitlements
 *
 * Uses the unified entitlement system which handles:
 * - Trial period (all modules enabled)
 * - Subscription-based access
 * - Admin overrides
 * - User preferences
 */
export async function getVisibleModules(userId: string, tenantId: string): Promise<ModuleInfo[]> {
  // Get effective entitlements (handles trial/subscription logic)
  const effective = await entitlementsService.computeEffective(tenantId);

  // Get enabled module codes from entitlements
  const enabledModuleCodes = effective.modules
    .filter(m => m.enabled)
    .map(m => m.key);

  // Get user preferences (for ordering and hiding)
  const userPrefs = await prisma.userModulePref.findMany({
    where: {
      userId,
      moduleCode: { in: enabledModuleCodes as ModuleCode[] },
    },
  });

  const userPrefMap = new Map(userPrefs.map(p => [p.moduleCode, p]));

  // Build visible modules list
  const visibleModules = ALL_MODULES
    .filter(module => {
      // Must be enabled by entitlements
      if (!enabledModuleCodes.includes(module.code)) return false;

      // Check user preference (default to visible if no preference)
      const pref = userPrefMap.get(module.code);
      return pref ? pref.isVisible : true;
    })
    .sort((a, b) => {
      const prefA = userPrefMap.get(a.code);
      const prefB = userPrefMap.get(b.code);
      return (prefA?.sortOrder || 0) - (prefB?.sortOrder || 0);
    });

  return visibleModules;
}

/**
 * Check if a module is accessible for a user
 *
 * Uses the unified entitlement system which handles:
 * - Trial period (all modules enabled)
 * - Subscription-based access
 * - Admin overrides
 */
export async function isModuleAccessible(
  moduleCode: ModuleCode | string,
  userId: string,
  tenantId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Get effective entitlements
  const effective = await entitlementsService.computeEffective(tenantId);

  // Find the module in entitlements
  const moduleEnt = effective.modules.find(m => m.key === moduleCode);

  if (!moduleEnt) {
    return { allowed: false, reason: 'module_not_found' };
  }

  if (!moduleEnt.enabled) {
    // Map reason to user-friendly message
    const reasonMap: Record<string, string> = {
      trial: 'not_subscribed',
      subscribed: 'not_subscribed',
      expired: 'subscription_expired',
      admin_override: 'disabled_by_admin',
    };
    return { allowed: false, reason: reasonMap[moduleEnt.reason] || 'not_subscribed' };
  }

  // Check user preference (user can hide modules they have access to)
  const userPref = await prisma.userModulePref.findUnique({
    where: {
      userId_moduleCode: {
        userId,
        moduleCode: moduleCode as ModuleCode,
      },
    },
  });

  if (userPref && !userPref.isVisible) {
    return { allowed: false, reason: 'hidden_by_user' };
  }

  return { allowed: true };
}

// Update user module preference
export async function updateUserModulePref(
  userId: string,
  moduleCode: ModuleCode,
  isVisible: boolean,
  sortOrder?: number
) {
  return prisma.userModulePref.upsert({
    where: {
      userId_moduleCode: {
        userId,
        moduleCode,
      },
    },
    update: {
      isVisible,
      ...(sortOrder !== undefined && { sortOrder }),
    },
    create: {
      userId,
      moduleCode,
      isVisible,
      sortOrder: sortOrder || 0,
    },
  });
}

// Update tenant module visibility (admin only)
export async function updateTenantModuleVisibility(
  tenantId: string,
  moduleCode: ModuleCode,
  isVisible: boolean
) {
  return prisma.tenantFeature.update({
    where: {
      tenantId_moduleCode: {
        tenantId,
        moduleCode,
      },
    },
    data: { isVisible },
  });
}

/**
 * Initialize features for a new tenant
 *
 * Now uses the unified entitlements system which automatically
 * sets up a 30-day trial with all modules enabled.
 *
 * @deprecated Use entitlementsService.initializeWithTrial() directly
 */
export async function initializeTenantFeatures(tenantId: string, _planCode: string = 'starter') {
  // Use the new entitlements system to initialize with 30-day trial
  await entitlementsService.initializeWithTrial(tenantId);
}
