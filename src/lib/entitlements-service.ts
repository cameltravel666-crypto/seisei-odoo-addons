/**
 * Entitlements Service
 *
 * Manages tenant-level subscription entitlements:
 * - Module access
 * - Usage limits (users, stores, terminals)
 * - Subscription status
 *
 * Syncs with Stripe webhooks and Odoo 19 billing.
 */

import { prisma } from './db';
import { EntitlementStatus, ModuleCode, Prisma } from '@prisma/client';
import { auditService } from './audit-service';

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
  source?: string;
  stripeSubId?: string;
  odoo19OrderId?: number;
}

// ============================================
// Default Entitlements by Plan
// ============================================

const PLAN_DEFAULTS: Record<string, EntitlementsData> = {
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
// Entitlements Service
// ============================================

export const entitlementsService = {
  /**
   * Get entitlements for a tenant
   */
  async get(tenantId: string) {
    return prisma.entitlements.findUnique({
      where: { tenantId }
    });
  },

  /**
   * Get entitlements for API response (safe format)
   */
  async getForApi(tenantId: string) {
    const entitlements = await this.get(tenantId);

    if (!entitlements) {
      // Return default trial entitlements if none exist
      return {
        modules: PLAN_DEFAULTS.trial.modules,
        limits: {
          maxUsers: PLAN_DEFAULTS.trial.maxUsers,
          maxStores: PLAN_DEFAULTS.trial.maxStores,
          maxTerminals: PLAN_DEFAULTS.trial.maxTerminals
        },
        status: 'TRIAL',
        periodEnd: null,
        source: 'manual'
      };
    }

    return {
      modules: entitlements.modules,
      limits: {
        maxUsers: entitlements.maxUsers,
        maxStores: entitlements.maxStores,
        maxTerminals: entitlements.maxTerminals
      },
      status: entitlements.status,
      periodEnd: entitlements.periodEnd?.toISOString() || null,
      source: entitlements.source
    };
  },

  /**
   * Initialize entitlements for a new tenant
   */
  async initialize(tenantId: string, planCode: string = 'basic') {
    const defaults = PLAN_DEFAULTS[planCode] || PLAN_DEFAULTS.basic;

    const entitlements = await prisma.entitlements.create({
      data: {
        tenantId,
        modules: defaults.modules,
        maxUsers: defaults.maxUsers,
        maxStores: defaults.maxStores,
        maxTerminals: defaults.maxTerminals,
        status: defaults.status,
        source: defaults.source
      }
    });

    return entitlements;
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
    return this.update(params.tenantId, {
      modules: [...new Set(modules)], // Dedupe
      maxUsers,
      maxStores,
      maxTerminals,
      status: statusMap[params.status] || 'ACTIVE',
      periodEnd: params.currentPeriodEnd,
      source: 'stripe',
      stripeSubId: params.stripeSubId
    });
  },

  /**
   * Check if module is enabled for tenant
   */
  async isModuleEnabled(tenantId: string, moduleCode: string): Promise<boolean> {
    const entitlements = await this.get(tenantId);
    if (!entitlements) return false;

    const activeStatuses: EntitlementStatus[] = ['ACTIVE', 'TRIAL'];
    if (!activeStatuses.includes(entitlements.status)) return false;

    return entitlements.modules.includes(moduleCode);
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
   * Enable a module for tenant
   */
  async enableModule(tenantId: string, moduleCode: string, actorId?: string) {
    const current = await this.get(tenantId);
    if (!current) {
      throw new Error('Entitlements not found');
    }

    if (current.modules.includes(moduleCode)) {
      return current; // Already enabled
    }

    const updated = await prisma.entitlements.update({
      where: { tenantId },
      data: {
        modules: [...current.modules, moduleCode]
      }
    });

    await auditService.logModuleChange({
      tenantId,
      actorId,
      moduleCode,
      enabled: true,
      source: 'manual'
    });

    return updated;
  },

  /**
   * Disable a module for tenant
   */
  async disableModule(tenantId: string, moduleCode: string, actorId?: string) {
    const current = await this.get(tenantId);
    if (!current) {
      throw new Error('Entitlements not found');
    }

    if (!current.modules.includes(moduleCode)) {
      return current; // Already disabled
    }

    const updated = await prisma.entitlements.update({
      where: { tenantId },
      data: {
        modules: current.modules.filter(m => m !== moduleCode)
      }
    });

    await auditService.logModuleChange({
      tenantId,
      actorId,
      moduleCode,
      enabled: false,
      source: 'manual'
    });

    return updated;
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
  }
};

export default entitlementsService;
