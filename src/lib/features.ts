/**
 * Feature / Module Management (Server-side)
 * Handles subscription-based and user preference-based module visibility
 *
 * NOTE: For module definitions that can be used in client components,
 * import from '@/lib/modules' instead.
 */

import { prisma } from './db';
import { ModuleCode } from '@prisma/client';
import { ALL_MODULES, CORE_MODULES, PREMIUM_MODULES, getModuleInfo } from './modules';
import type { ModuleInfo } from './modules';

// Re-export module definitions for backwards compatibility
export { ALL_MODULES, CORE_MODULES, PREMIUM_MODULES, getModuleInfo };
export type { ModuleInfo };

// Get visible modules for a user
export async function getVisibleModules(userId: string, tenantId: string): Promise<ModuleInfo[]> {
  // Get tenant features (subscription-based)
  const tenantFeatures = await prisma.tenantFeature.findMany({
    where: {
      tenantId,
      isAllowed: true,
      isVisible: true,
    },
  });

  const allowedModuleCodes = tenantFeatures.map(f => f.moduleCode);

  // Get user preferences
  const userPrefs = await prisma.userModulePref.findMany({
    where: {
      userId,
      moduleCode: { in: allowedModuleCodes },
    },
  });

  // Build visible modules list
  const userPrefMap = new Map(userPrefs.map(p => [p.moduleCode, p]));

  const visibleModules = ALL_MODULES
    .filter(module => {
      // Must be allowed by subscription
      if (!allowedModuleCodes.includes(module.code)) return false;

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

// Check if a module is accessible
export async function isModuleAccessible(
  moduleCode: ModuleCode,
  userId: string,
  tenantId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Check tenant subscription
  const tenantFeature = await prisma.tenantFeature.findUnique({
    where: {
      tenantId_moduleCode: {
        tenantId,
        moduleCode,
      },
    },
  });

  if (!tenantFeature || !tenantFeature.isAllowed) {
    return { allowed: false, reason: 'not_subscribed' };
  }

  if (!tenantFeature.isVisible) {
    return { allowed: false, reason: 'disabled_by_admin' };
  }

  // Check user preference
  const userPref = await prisma.userModulePref.findUnique({
    where: {
      userId_moduleCode: {
        userId,
        moduleCode,
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

// Initialize default features for a new tenant based on plan
export async function initializeTenantFeatures(tenantId: string, planCode: string) {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { planCode },
  });

  const allowedModules = plan?.allowedModules || ['DASHBOARD', 'POS'];

  const features = ALL_MODULES.map(module => ({
    tenantId,
    moduleCode: module.code,
    isAllowed: allowedModules.includes(module.code),
    isVisible: allowedModules.includes(module.code),
  }));

  await prisma.tenantFeature.createMany({
    data: features,
    skipDuplicates: true,
  });
}
