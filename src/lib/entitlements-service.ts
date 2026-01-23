/**
 * Entitlements Service
 *
 * Manages tenant-level subscription entitlements:
 * - Module access (with 30-day trial for new tenants)
 * - Usage limits (users, stores, terminals)
 * - Subscription status
 * - Metered usage tracking (OCR / Table Engine)
 *
 * Syncs with Stripe webhooks and Odoo 19 billing.
 */

import { prisma } from './db';
import { EntitlementStatus, ModuleCode } from '@prisma/client';
import { auditService } from './audit-service';
import { ALL_MODULES } from './modules';

// ============================================
// Constants
// ============================================

/** Trial duration in days */
export const TRIAL_DURATION_DAYS = 30;

/** Free quotas per billing period */
export const OCR_FREE_QUOTA = 30;
export const TABLE_FREE_QUOTA = 5;

/** Overage pricing (JPY) */
export const OCR_OVERAGE_JPY = 20;
export const TABLE_OVERAGE_JPY = 50;

/** Usage cycle: 'billing' (subscription period) or 'calendar' (natural month) */
export const USAGE_CYCLE = process.env.USAGE_CYCLE || 'billing';

/** Gating mode: 'lock' (show with upgrade prompt) or 'hide' (completely hide) */
export const GATING_MODE = (process.env.GATING_MODE || 'lock') as 'lock' | 'hide';

// ============================================
// Types
// ============================================

export interface EntitlementsData {
  modules: string[];
  maxUsers: number;
  maxStores: number;
  maxTerminals: number;
  status: EntitlementStatus;
  periodStart?: Date;
  periodEnd?: Date;
  trialStartAt?: Date;
  trialEndAt?: Date;
  source: string;
}

export interface EntitlementsUpdateInput {
  modules?: string[];
  maxUsers?: number;
  maxStores?: number;
  maxTerminals?: number;
  status?: EntitlementStatus;
  periodStart?: Date;
  periodEnd?: Date;
  trialStartAt?: Date;
  trialEndAt?: Date;
  source?: string;
  stripeSubId?: string;
  odoo19OrderId?: number;
}

/**
 * Effective entitlements after trial/subscription computation
 */
export interface EffectiveEntitlements {
  modules: Array<{
    key: string;
    name: string;
    path: string;
    enabled: boolean;
    reason: 'trial' | 'subscribed' | 'expired' | 'admin_override';
  }>;
  limits: {
    maxUsers: number;
    maxStores: number;
    maxTerminals: number;
  };
  status: EntitlementStatus;
  isTrialing: boolean;
  trialDaysRemaining: number | null;
  trialEndAt: string | null;
  periodEnd: string | null;
  source: string;
  gatingMode: 'lock' | 'hide';
}

/**
 * Usage data for OCR/Table Engine
 */
export interface UsageData {
  ocr: {
    used: number;
    free: number;
    remaining: number;
    billable: number;
    overageCost: number;
  };
  table: {
    used: number;
    free: number;
    remaining: number;
    billable: number;
    overageCost: number;
  };
  periodStart: string;
  periodEnd: string;
  hasPaymentMethod: boolean;
  locked: boolean;
  lockReason: string | null;
}

// ============================================
// Default Entitlements by Plan
// ============================================

const PLAN_DEFAULTS: Record<string, EntitlementsData> = {
  // Starter plan - basic features for new registrations (before trial setup)
  starter: {
    modules: Object.values(ModuleCode) as string[], // All modules during trial
    maxUsers: 5,
    maxStores: 1,
    maxTerminals: 2,
    status: 'TRIAL',
    source: 'manual'
  },
  basic: {
    modules: ['DASHBOARD', 'POS', 'PRODUCTS', 'CONTACTS'],
    maxUsers: 3,
    maxStores: 1,
    maxTerminals: 2,
    status: 'ACTIVE',
    source: 'manual'
  },
  standard: {
    modules: ['DASHBOARD', 'POS', 'PRODUCTS', 'CONTACTS', 'INVENTORY', 'PURCHASE', 'SALES'],
    maxUsers: 10,
    maxStores: 3,
    maxTerminals: 5,
    status: 'ACTIVE',
    source: 'manual'
  },
  premium: {
    modules: Object.values(ModuleCode) as string[],
    maxUsers: 50,
    maxStores: 10,
    maxTerminals: 20,
    status: 'ACTIVE',
    source: 'manual'
  },
  trial: {
    modules: Object.values(ModuleCode) as string[],
    maxUsers: 5,
    maxStores: 1,
    maxTerminals: 2,
    status: 'TRIAL',
    source: 'manual'
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate if currently in trial period
 */
function isInTrialPeriod(trialEndAt: Date | null | undefined): boolean {
  if (!trialEndAt) return false;
  return new Date() < trialEndAt;
}

/**
 * Calculate days remaining in trial
 */
function getTrialDaysRemaining(trialEndAt: Date | null | undefined): number | null {
  if (!trialEndAt) return null;
  const now = new Date();
  if (now >= trialEndAt) return 0;
  return Math.ceil((trialEndAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get current usage period boundaries
 */
function getCurrentPeriodBoundaries(periodEnd?: Date | null): { start: Date; end: Date } {
  const now = new Date();

  if (USAGE_CYCLE === 'calendar') {
    // Natural month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // Billing cycle - use subscription period or default to monthly
  if (periodEnd) {
    // Work backwards from period end to find period start (assume monthly)
    const end = new Date(periodEnd);
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    return { start, end };
  }

  // Default to current month if no period defined
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// ============================================
// Entitlements Service
// ============================================

export const entitlementsService = {
  /**
   * Get raw entitlements for a tenant
   */
  async get(tenantId: string) {
    return prisma.entitlements.findUnique({
      where: { tenantId }
    });
  },

  /**
   * Compute effective entitlements (THE authoritative function)
   *
   * Logic:
   * - If now < trial_end_at: ALL modules enabled (reason: trial)
   * - Else: Check subscription and per-module entitlements
   */
  async computeEffective(tenantId: string): Promise<EffectiveEntitlements> {
    const entitlements = await this.get(tenantId);
    const now = new Date();

    // Default if no entitlements exist
    if (!entitlements) {
      return {
        modules: ALL_MODULES.map(m => ({
          key: m.code,
          name: m.name,
          path: m.path,
          enabled: false,
          reason: 'expired' as const
        })),
        limits: { maxUsers: 5, maxStores: 1, maxTerminals: 2 },
        status: 'EXPIRED',
        isTrialing: false,
        trialDaysRemaining: null,
        trialEndAt: null,
        periodEnd: null,
        source: 'none',
        gatingMode: GATING_MODE
      };
    }

    const inTrial = isInTrialPeriod(entitlements.trialEndAt);
    const trialDays = getTrialDaysRemaining(entitlements.trialEndAt);

    // During trial: all modules enabled
    if (inTrial) {
      return {
        modules: ALL_MODULES.map(m => ({
          key: m.code,
          name: m.name,
          path: m.path,
          enabled: true,
          reason: 'trial' as const
        })),
        limits: {
          maxUsers: entitlements.maxUsers,
          maxStores: entitlements.maxStores,
          maxTerminals: entitlements.maxTerminals
        },
        status: 'TRIAL',
        isTrialing: true,
        trialDaysRemaining: trialDays,
        trialEndAt: entitlements.trialEndAt?.toISOString() || null,
        periodEnd: entitlements.periodEnd?.toISOString() || null,
        source: entitlements.source,
        gatingMode: GATING_MODE
      };
    }

    // After trial: check subscription status and module entitlements
    const activeStatuses: EntitlementStatus[] = ['ACTIVE', 'TRIAL'];
    const isActive = activeStatuses.includes(entitlements.status);

    // Get per-module entitlements if exist
    const moduleEntitlements = await prisma.tenantModuleEntitlement.findMany({
      where: { tenantId }
    });
    const moduleMap = new Map(moduleEntitlements.map(me => [me.moduleKey, me]));

    return {
      modules: ALL_MODULES.map(m => {
        const moduleEnt = moduleMap.get(m.code);

        // Check if module is in the entitlements.modules list
        const inModuleList = entitlements.modules.includes(m.code);

        // Check per-module entitlement
        const moduleEnabled = moduleEnt?.enabled ?? inModuleList;
        const moduleNotExpired = !moduleEnt?.enabledUntil || moduleEnt.enabledUntil > now;

        const enabled = isActive && moduleEnabled && moduleNotExpired;

        let reason: 'trial' | 'subscribed' | 'expired' | 'admin_override' = 'expired';
        if (enabled) {
          reason = moduleEnt?.reason === 'admin_override' ? 'admin_override' : 'subscribed';
        }

        return {
          key: m.code,
          name: m.name,
          path: m.path,
          enabled,
          reason
        };
      }),
      limits: {
        maxUsers: entitlements.maxUsers,
        maxStores: entitlements.maxStores,
        maxTerminals: entitlements.maxTerminals
      },
      status: entitlements.status,
      isTrialing: false,
      trialDaysRemaining: 0,
      trialEndAt: entitlements.trialEndAt?.toISOString() || null,
      periodEnd: entitlements.periodEnd?.toISOString() || null,
      source: entitlements.source,
      gatingMode: GATING_MODE
    };
  },

  /**
   * Get entitlements for API response (legacy format for backward compatibility)
   */
  async getForApi(tenantId: string) {
    const effective = await this.computeEffective(tenantId);

    return {
      modules: effective.modules.filter(m => m.enabled).map(m => m.key),
      limits: effective.limits,
      status: effective.status,
      periodEnd: effective.periodEnd,
      source: effective.source,
      isTrialing: effective.isTrialing,
      trialDaysRemaining: effective.trialDaysRemaining,
      trialEndAt: effective.trialEndAt
    };
  },

  /**
   * Initialize entitlements for a new tenant with 30-day trial
   */
  async initializeWithTrial(tenantId: string) {
    // Check if entitlements already exist
    const existing = await prisma.entitlements.findUnique({
      where: { tenantId }
    });
    if (existing) {
      return existing;
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

    const allModules = Object.values(ModuleCode) as string[];

    // Create entitlements with trial
    const entitlements = await prisma.entitlements.create({
      data: {
        tenantId,
        modules: allModules,
        maxUsers: 5,
        maxStores: 1,
        maxTerminals: 2,
        status: 'TRIAL',
        trialStartAt: now,
        trialEndAt: trialEnd,
        source: 'manual'
      }
    });

    // Create per-module entitlements for trial
    await prisma.tenantModuleEntitlement.createMany({
      data: allModules.map(moduleKey => ({
        tenantId,
        moduleKey,
        enabled: true,
        reason: 'trial'
      })),
      skipDuplicates: true
    });

    return entitlements;
  },

  /**
   * Initialize entitlements for a new tenant (legacy, calls initializeWithTrial)
   */
  async initialize(tenantId: string, planCode: string = 'starter') {
    // Always start with trial for new registrations
    return this.initializeWithTrial(tenantId);
  },

  /**
   * Update entitlements (internal use)
   */
  async update(tenantId: string, input: EntitlementsUpdateInput) {
    // Get current state for audit log
    const current = await this.get(tenantId);

    const entitlements = await prisma.entitlements.upsert({
      where: { tenantId },
      create: {
        tenantId,
        modules: input.modules || PLAN_DEFAULTS.basic.modules,
        maxUsers: input.maxUsers ?? 5,
        maxStores: input.maxStores ?? 1,
        maxTerminals: input.maxTerminals ?? 2,
        status: input.status || 'ACTIVE',
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        trialStartAt: input.trialStartAt,
        trialEndAt: input.trialEndAt,
        source: input.source || 'manual',
        stripeSubId: input.stripeSubId,
        odoo19OrderId: input.odoo19OrderId
      },
      update: {
        modules: input.modules,
        maxUsers: input.maxUsers,
        maxStores: input.maxStores,
        maxTerminals: input.maxTerminals,
        status: input.status,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        trialStartAt: input.trialStartAt,
        trialEndAt: input.trialEndAt,
        source: input.source,
        stripeSubId: input.stripeSubId,
        odoo19OrderId: input.odoo19OrderId,
        lastSyncAt: new Date(),
        syncError: null
      }
    });

    // Log the change
    if (current) {
      await auditService.logEntitlementsUpdated({
        tenantId,
        oldEntitlements: {
          modules: current.modules,
          maxUsers: current.maxUsers,
          status: current.status
        },
        newEntitlements: {
          modules: entitlements.modules,
          maxUsers: entitlements.maxUsers,
          status: entitlements.status
        },
        source: input.source || 'manual'
      });
    }

    return entitlements;
  },

  /**
   * Sync entitlements from Stripe subscription
   */
  async syncFromStripe(params: {
    tenantId: string;
    stripeSubId: string;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    items: Array<{
      productCode: string;
      quantity: number;
    }>;
  }) {
    // Map Stripe status to EntitlementStatus
    const statusMap: Record<string, EntitlementStatus> = {
      active: 'ACTIVE',
      trialing: 'TRIAL',
      past_due: 'PAST_DUE',
      canceled: 'EXPIRED',
      unpaid: 'SUSPENDED'
    };

    // Get modules from subscription items
    const modules: string[] = [];
    let maxUsers = 5;
    let maxStores = 1;
    let maxTerminals = 2;

    for (const item of params.items) {
      // Look up product to get included modules
      const product = await prisma.subscriptionProduct.findUnique({
        where: { productCode: item.productCode }
      });

      if (product) {
        // Base plan includes multiple modules
        if (product.productType === 'BASE_PLAN' && product.includedModules) {
          modules.push(...product.includedModules);
          if (product.maxUsers) maxUsers = Math.max(maxUsers, product.maxUsers);
          if (product.maxTerminals) maxTerminals = Math.max(maxTerminals, product.maxTerminals);
        }

        // Individual module
        if (product.productType === 'MODULE' && product.enablesModule) {
          modules.push(product.enablesModule);
        }

        // Addon for additional limits
        if (product.productType === 'ADDON') {
          if (product.productCode.includes('USER')) {
            maxUsers += item.quantity;
          }
          if (product.productCode.includes('TERMINAL')) {
            maxTerminals += item.quantity;
          }
          if (product.productCode.includes('STORE')) {
            maxStores += item.quantity;
          }
        }
      }
    }

    // Update entitlements
    const entitlements = await this.update(params.tenantId, {
      modules: [...new Set(modules)], // Dedupe
      maxUsers,
      maxStores,
      maxTerminals,
      status: statusMap[params.status] || 'ACTIVE',
      periodStart: params.currentPeriodStart,
      periodEnd: params.currentPeriodEnd,
      source: 'stripe',
      stripeSubId: params.stripeSubId
    });

    // Update per-module entitlements
    const uniqueModules = [...new Set(modules)];
    for (const moduleKey of uniqueModules) {
      await prisma.tenantModuleEntitlement.upsert({
        where: {
          tenantId_moduleKey: {
            tenantId: params.tenantId,
            moduleKey
          }
        },
        create: {
          tenantId: params.tenantId,
          moduleKey,
          enabled: true,
          reason: 'plan'
        },
        update: {
          enabled: true,
          reason: 'plan'
        }
      });
    }

    return entitlements;
  },

  /**
   * Check if module is enabled for tenant (uses computeEffective)
   */
  async isModuleEnabled(tenantId: string, moduleCode: string): Promise<boolean> {
    const effective = await this.computeEffective(tenantId);
    const module = effective.modules.find(m => m.key === moduleCode);
    return module?.enabled ?? false;
  },

  /**
   * Check usage limits
   */
  async checkLimits(tenantId: string): Promise<{
    users: { current: number; max: number; exceeded: boolean };
    stores: { current: number; max: number; exceeded: boolean };
  }> {
    const [entitlements, userCount] = await Promise.all([
      this.get(tenantId),
      prisma.membership.count({
        where: {
          tenantId,
          status: 'ACTIVE'
        }
      })
    ]);

    const maxUsers = entitlements?.maxUsers ?? 5;
    const maxStores = entitlements?.maxStores ?? 1;

    // TODO: Get actual store count from Odoo
    const storeCount = 1;

    return {
      users: {
        current: userCount,
        max: maxUsers,
        exceeded: userCount >= maxUsers
      },
      stores: {
        current: storeCount,
        max: maxStores,
        exceeded: storeCount >= maxStores
      }
    };
  },

  /**
   * Admin override: Enable a module for tenant
   */
  async adminEnableModule(tenantId: string, moduleCode: string, actorId?: string) {
    await prisma.tenantModuleEntitlement.upsert({
      where: {
        tenantId_moduleKey: { tenantId, moduleKey: moduleCode }
      },
      create: {
        tenantId,
        moduleKey: moduleCode,
        enabled: true,
        reason: 'admin_override'
      },
      update: {
        enabled: true,
        reason: 'admin_override'
      }
    });

    await auditService.logModuleChange({
      tenantId,
      actorId,
      moduleCode,
      enabled: true,
      source: 'admin_override'
    });
  },

  /**
   * Admin override: Disable a module for tenant
   */
  async adminDisableModule(tenantId: string, moduleCode: string, actorId?: string) {
    await prisma.tenantModuleEntitlement.upsert({
      where: {
        tenantId_moduleKey: { tenantId, moduleKey: moduleCode }
      },
      create: {
        tenantId,
        moduleKey: moduleCode,
        enabled: false,
        reason: 'admin_override'
      },
      update: {
        enabled: false,
        reason: 'admin_override'
      }
    });

    await auditService.logModuleChange({
      tenantId,
      actorId,
      moduleCode,
      enabled: false,
      source: 'admin_override'
    });
  },

  /**
   * Set entitlement status (for admin/cron)
   */
  async setStatus(tenantId: string, status: EntitlementStatus, reason?: string) {
    const current = await this.get(tenantId);

    const updated = await prisma.entitlements.update({
      where: { tenantId },
      data: { status }
    });

    if (current) {
      await auditService.log({
        tenantId,
        action: 'ENTITLEMENTS_UPDATED',
        resource: 'entitlements',
        resourceId: tenantId,
        changes: {
          old: { status: current.status },
          new: { status }
        },
        metadata: reason ? { reason } : undefined
      });
    }

    return updated;
  },

  /**
   * Handle subscription expired
   */
  async handleExpired(tenantId: string) {
    return this.setStatus(tenantId, 'EXPIRED', 'Subscription expired');
  },

  /**
   * Handle payment failed
   */
  async handlePaymentFailed(tenantId: string) {
    return this.setStatus(tenantId, 'PAST_DUE', 'Payment failed');
  },

  // ============================================
  // Metered Usage Functions
  // ============================================

  /**
   * Record a usage event (OCR or Table Engine)
   * Returns true if recorded, false if already exists (idempotent)
   */
  async recordUsage(params: {
    tenantId: string;
    featureKey: 'ocr' | 'table';
    idempotencyKey: string;
    status?: 'SUCCEEDED' | 'FAILED' | 'CANCELED';
    meta?: Record<string, unknown>;
  }): Promise<boolean> {
    const entitlements = await this.get(params.tenantId);
    if (!entitlements) {
      throw new Error('Entitlements not found');
    }

    try {
      await prisma.tenantUsageEvent.create({
        data: {
          tenantId: params.tenantId,
          entitlementsId: entitlements.id,
          featureKey: params.featureKey,
          idempotencyKey: params.idempotencyKey,
          status: params.status || 'SUCCEEDED',
          meta: params.meta as object || undefined
        }
      });
      return true;
    } catch (error: unknown) {
      // Idempotency key already exists
      if ((error as { code?: string }).code === 'P2002') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Get current usage for a tenant
   */
  async getUsage(tenantId: string): Promise<UsageData> {
    const entitlements = await this.get(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeCustomerId: true }
    });

    const { start, end } = getCurrentPeriodBoundaries(entitlements?.periodEnd);

    // Count successful usage events in current period
    const [ocrCount, tableCount] = await Promise.all([
      prisma.tenantUsageEvent.count({
        where: {
          tenantId,
          featureKey: 'ocr',
          status: 'SUCCEEDED',
          createdAt: { gte: start, lte: end }
        }
      }),
      prisma.tenantUsageEvent.count({
        where: {
          tenantId,
          featureKey: 'table',
          status: 'SUCCEEDED',
          createdAt: { gte: start, lte: end }
        }
      })
    ]);

    const ocrBillable = Math.max(0, ocrCount - OCR_FREE_QUOTA);
    const tableBillable = Math.max(0, tableCount - TABLE_FREE_QUOTA);

    const hasPaymentMethod = !!tenant?.stripeCustomerId;
    const isOverQuota = ocrBillable > 0 || tableBillable > 0;
    const locked = isOverQuota && !hasPaymentMethod;

    return {
      ocr: {
        used: ocrCount,
        free: OCR_FREE_QUOTA,
        remaining: Math.max(0, OCR_FREE_QUOTA - ocrCount),
        billable: ocrBillable,
        overageCost: ocrBillable * OCR_OVERAGE_JPY
      },
      table: {
        used: tableCount,
        free: TABLE_FREE_QUOTA,
        remaining: Math.max(0, TABLE_FREE_QUOTA - tableCount),
        billable: tableBillable,
        overageCost: tableBillable * TABLE_OVERAGE_JPY
      },
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      hasPaymentMethod,
      locked,
      lockReason: locked ? 'PAYMENT_REQUIRED' : null
    };
  },

  /**
   * Check if usage is allowed (for gating)
   */
  async canUseFeature(tenantId: string, featureKey: 'ocr' | 'table'): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const usage = await this.getUsage(tenantId);

    if (usage.locked) {
      return {
        allowed: false,
        reason: 'PAYMENT_REQUIRED'
      };
    }

    return { allowed: true };
  },

  /**
   * Admin: Adjust usage (for compensation/correction)
   */
  async adjustUsage(params: {
    tenantId: string;
    featureKey: 'ocr' | 'table';
    adjustment: number; // Negative to reduce billable
    reason: string;
    actorId: string;
  }) {
    // Record as a special event with negative count
    const idempotencyKey = `admin_adjust_${params.tenantId}_${params.featureKey}_${Date.now()}`;

    await this.recordUsage({
      tenantId: params.tenantId,
      featureKey: params.featureKey,
      idempotencyKey,
      status: params.adjustment < 0 ? 'CANCELED' : 'SUCCEEDED',
      meta: {
        adjustment: params.adjustment,
        reason: params.reason,
        adjustedBy: params.actorId
      }
    });

    await auditService.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      action: 'ENTITLEMENTS_UPDATED',
      resource: 'usage',
      resourceId: idempotencyKey,
      changes: {
        old: { adjustment: 0 },
        new: { adjustment: params.adjustment, featureKey: params.featureKey }
      },
      metadata: { reason: params.reason }
    });
  }
};

export default entitlementsService;
