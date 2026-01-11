/**
 * Feature / Module Management
 * Handles subscription-based and user preference-based module visibility
 */

import { prisma } from './db';
import { ModuleCode } from '@prisma/client';

export interface ModuleInfo {
  code: ModuleCode;
  name: string;
  nameZh: string;
  nameJa: string;
  icon: string;
  path: string;
  description?: string;
}

// All available modules
export const ALL_MODULES: ModuleInfo[] = [
  { code: 'DASHBOARD', name: 'Dashboard', nameZh: '数据看板', nameJa: 'ダッシュボード', icon: 'BarChart3', path: '/dashboard' },
  { code: 'POS', name: 'POS', nameZh: 'POS', nameJa: 'POS', icon: 'ShoppingCart', path: '/pos' },
  { code: 'INVENTORY', name: 'Inventory', nameZh: '库存', nameJa: '在庫', icon: 'Package', path: '/inventory' },
  { code: 'PURCHASE', name: 'Purchase', nameZh: '采购', nameJa: '仕入', icon: 'ShoppingBag', path: '/purchase' },
  { code: 'SALES', name: 'Sales', nameZh: '销售', nameJa: '販売', icon: 'TrendingUp', path: '/sales' },
  { code: 'CRM', name: 'CRM', nameZh: 'CRM', nameJa: 'CRM', icon: 'Users', path: '/crm' },
  { code: 'ACCOUNTING', name: 'Expenses', nameZh: '费用', nameJa: '経費', icon: 'Receipt', path: '/accounting' },
  { code: 'FINANCE', name: 'Finance', nameZh: '财务', nameJa: '財務', icon: 'FileText', path: '/finance' },
  { code: 'HR', name: 'Payroll', nameZh: '工资', nameJa: '給与', icon: 'UserCog', path: '/hr' },
];

// Get module info by code
export function getModuleInfo(code: ModuleCode): ModuleInfo | undefined {
  return ALL_MODULES.find(m => m.code === code);
}

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
