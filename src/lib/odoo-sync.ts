/**
 * Odoo 19 Sync Service
 * Handles bidirectional sync between Stripe and Odoo
 *
 * Also handles entitlement sync from Odoo to BizNexus.
 */

import { prisma } from '@/lib/db';
import { getOdoo19Client } from '@/lib/odoo19';
import { entitlementsService } from '@/lib/entitlements-service';
import { ModuleCode, EntitlementStatus } from '@prisma/client';

const odoo = getOdoo19Client();

/**
 * Sync Stripe payment to Odoo
 * Called when Stripe invoice is paid
 */
export async function syncStripePaymentToOdoo(params: {
  subscriptionId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  paidAt: Date;
}): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: params.subscriptionId },
      include: { tenant: true },
    });

    if (!subscription?.odoo19PartnerId) {
      console.log('[Odoo Sync] No Odoo partner for subscription:', params.subscriptionId);
      return;
    }

    // Get bank journal for payment registration
    const journals = await odoo.getJournals('bank');
    if (journals.length === 0) {
      console.log('[Odoo Sync] No bank journal found in Odoo');
      return;
    }

    // Find or create invoice in Odoo
    // First check if we have an existing invoice with Odoo ID
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        subscriptionId: subscription.id,
        odoo19InvoiceId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    let odooInvoiceId = existingInvoice?.odoo19InvoiceId;

    if (!odooInvoiceId && subscription.odoo19OrderId) {
      // Create invoice from order
      odooInvoiceId = await odoo.createInvoice(subscription.odoo19OrderId);
      if (odooInvoiceId) {
        await odoo.postInvoice(odooInvoiceId);
      }
    }

    if (odooInvoiceId) {
      // Register payment in Odoo
      await odoo.registerPayment({
        invoiceId: odooInvoiceId,
        amount: params.amount,
        paymentDate: params.paidAt,
        journalId: journals[0].id,
      });

      console.log('[Odoo Sync] Payment synced to Odoo invoice:', odooInvoiceId);
    }
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync payment:', error);
    // Don't throw - Odoo sync failure shouldn't break the main flow
  }
}

/**
 * Sync Stripe subscription to Odoo
 * Called when subscription is created or updated in Stripe
 */
export async function syncStripeSubscriptionToOdoo(params: {
  tenantId: string;
  stripeSubscriptionId: string;
  status: string;
  items: Array<{
    productCode: string;
    quantity: number;
    amount: number;
  }>;
}): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
    });

    if (!tenant) return;

    // Create or get Odoo partner
    let partnerId = tenant.odoo19PartnerId;
    if (!partnerId) {
      partnerId = await odoo.createOrGetPartner({
        name: tenant.name,
        email: tenant.billingEmail || undefined,
      });

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { odoo19PartnerId: partnerId },
      });
    }

    // Get product mappings from database
    const products = await prisma.subscriptionProduct.findMany({
      where: {
        productCode: { in: params.items.map((i) => i.productCode) },
        odoo19ProductId: { not: null },
      },
    });

    // Create order lines
    const orderLines = params.items
      .map((item) => {
        const product = products.find((p) => p.productCode === item.productCode);
        if (!product?.odoo19ProductId) return null;
        return [
          0,
          0,
          {
            product_id: product.odoo19ProductId,
            product_uom_qty: item.quantity,
            price_unit: item.amount / item.quantity,
          },
        ];
      })
      .filter(Boolean);

    if (orderLines.length === 0) {
      console.log('[Odoo Sync] No Odoo products found for subscription items');
      return;
    }

    // Check if subscription already has Odoo order
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: params.tenantId,
        stripeSubscriptionId: params.stripeSubscriptionId,
      },
    });

    if (subscription?.odoo19OrderId) {
      // Update existing order
      await odoo.write('sale.order', [subscription.odoo19OrderId], {
        order_line: orderLines,
      });
      console.log('[Odoo Sync] Updated Odoo order:', subscription.odoo19OrderId);
    } else {
      // Create new order
      const orderId = await odoo.create('sale.order', {
        partner_id: partnerId,
        date_order: new Date().toISOString().split('T')[0],
        order_line: orderLines,
      });

      // Confirm order if subscription is active
      if (params.status === 'active') {
        await odoo.callKw('sale.order', 'action_confirm', [[orderId]]);
      }

      // Update subscription with Odoo order ID
      if (subscription) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { odoo19OrderId: orderId },
        });
      }

      console.log('[Odoo Sync] Created Odoo order:', orderId);
    }
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync subscription:', error);
  }
}

/**
 * Sync subscription cancellation to Odoo
 */
export async function syncCancellationToOdoo(subscriptionId: string): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription?.odoo19OrderId) return;

    await odoo.cancelSubscription(subscription.odoo19OrderId);
    console.log('[Odoo Sync] Cancelled Odoo order:', subscription.odoo19OrderId);
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync cancellation:', error);
  }
}

/**
 * Sync subscription update to Odoo (add/remove/update items)
 * Called when subscription items are modified via PUT or DELETE
 */
export async function syncSubscriptionUpdateToOdoo(subscriptionId: string): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        items: {
          where: { status: { in: ['TRIAL', 'ACTIVE'] } },
          include: { product: true },
        },
        tenant: true,
      },
    });

    if (!subscription) {
      console.log('[Odoo Sync] Subscription not found:', subscriptionId);
      return;
    }

    if (!subscription.odoo19OrderId) {
      console.log('[Odoo Sync] No Odoo order for subscription:', subscriptionId);
      return;
    }

    // Build order lines from active subscription items
    const orderLines = subscription.items
      .filter((item) => item.product.odoo19ProductId)
      .map((item) => [
        0,
        0,
        {
          product_id: item.product.odoo19ProductId,
          product_uom_qty: item.quantity,
          price_unit: Number(item.unitPrice),
        },
      ]);

    // Delete existing order lines first, then add new ones
    // Get existing order lines
    const existingLines = await odoo.searchRead<{ id: number }>(
      'sale.order.line',
      [['order_id', '=', subscription.odoo19OrderId]],
      ['id']
    );

    if (existingLines.length > 0) {
      // Delete existing lines (use unlink)
      await odoo.callKw('sale.order.line', 'unlink', [existingLines.map((l) => l.id)]);
    }

    // Add new order lines
    if (orderLines.length > 0) {
      await odoo.write('sale.order', [subscription.odoo19OrderId], {
        order_line: orderLines,
      });
    }

    console.log('[Odoo Sync] Updated Odoo order:', subscription.odoo19OrderId, 'with', orderLines.length, 'items');
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync subscription update:', error);
    // Don't throw - Odoo sync failure shouldn't break the main flow
  }
}

/**
 * Sync subscription item quantity update to Odoo
 */
export async function syncSubscriptionItemUpdateToOdoo(params: {
  subscriptionId: string;
  productId: string;
  quantity: number;
}): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: params.subscriptionId },
      include: {
        items: {
          where: { productId: params.productId },
          include: { product: true },
        },
      },
    });

    if (!subscription?.odoo19OrderId) {
      console.log('[Odoo Sync] No Odoo order for subscription:', params.subscriptionId);
      return;
    }

    const item = subscription.items[0];
    if (!item?.product.odoo19ProductId) {
      console.log('[Odoo Sync] No Odoo product ID for item');
      return;
    }

    // Find the order line in Odoo
    const orderLines = await odoo.searchRead<{ id: number; product_id: [number, string] }>(
      'sale.order.line',
      [
        ['order_id', '=', subscription.odoo19OrderId],
        ['product_id', '=', item.product.odoo19ProductId],
      ],
      ['id', 'product_id']
    );

    if (orderLines.length > 0) {
      // Update existing line
      await odoo.write('sale.order.line', [orderLines[0].id], {
        product_uom_qty: params.quantity,
      });
      console.log('[Odoo Sync] Updated order line quantity:', orderLines[0].id, '->', params.quantity);
    } else {
      // Line doesn't exist in Odoo, add it
      await odoo.create('sale.order.line', {
        order_id: subscription.odoo19OrderId,
        product_id: item.product.odoo19ProductId,
        product_uom_qty: params.quantity,
        price_unit: Number(item.unitPrice),
      });
      console.log('[Odoo Sync] Created order line for product:', item.product.odoo19ProductId);
    }
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync item update:', error);
  }
}

/**
 * Sync subscription item removal to Odoo
 */
export async function syncSubscriptionItemRemovalToOdoo(params: {
  subscriptionId: string;
  odoo19ProductId: number;
}): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: params.subscriptionId },
    });

    if (!subscription?.odoo19OrderId) {
      console.log('[Odoo Sync] No Odoo order for subscription:', params.subscriptionId);
      return;
    }

    // Find the order line in Odoo
    const orderLines = await odoo.searchRead<{ id: number }>(
      'sale.order.line',
      [
        ['order_id', '=', subscription.odoo19OrderId],
        ['product_id', '=', params.odoo19ProductId],
      ],
      ['id']
    );

    if (orderLines.length > 0) {
      // Delete the line
      await odoo.callKw('sale.order.line', 'unlink', [orderLines.map((l) => l.id)]);
      console.log('[Odoo Sync] Removed order line for product:', params.odoo19ProductId);
    }
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync item removal:', error);
  }
}

/**
 * Sync customer data to Odoo
 */
export async function syncCustomerToOdoo(tenantId: string): Promise<number | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) return null;

    const partnerId = await odoo.createOrGetPartner({
      name: tenant.name,
      email: tenant.billingEmail || undefined,
    });

    if (partnerId && partnerId !== tenant.odoo19PartnerId) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { odoo19PartnerId: partnerId },
      });
    }

    return partnerId;
  } catch (error) {
    console.error('[Odoo Sync] Failed to sync customer:', error);
    return null;
  }
}

/**
 * Get sync status for a tenant
 */
export async function getOdooSyncStatus(tenantId: string): Promise<{
  isConnected: boolean;
  partnerId: number | null;
  orderId: number | null;
  lastSyncError: string | null;
}> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['TRIAL', 'ACTIVE'] } },
    });

    // Test Odoo connection
    let isConnected = false;
    try {
      await odoo.authenticate();
      isConnected = true;
    } catch {
      isConnected = false;
    }

    return {
      isConnected,
      partnerId: tenant?.odoo19PartnerId || null,
      orderId: subscription?.odoo19OrderId || null,
      lastSyncError: null,
    };
  } catch (error) {
    return {
      isConnected: false,
      partnerId: null,
      orderId: null,
      lastSyncError: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Entitlement Sync from Odoo
// ============================================

/**
 * Odoo partner subscription fields (from res.partner)
 */
interface OdooPartnerSubscription {
  subscription_status?: 'active' | 'trial' | 'expired' | 'none';
  subscription_modules?: string[]; // Module codes enabled
  subscription_max_users?: number;
  subscription_max_stores?: number;
  subscription_max_terminals?: number;
  subscription_period_start?: string; // ISO date
  subscription_period_end?: string;   // ISO date
}

/**
 * Map Odoo subscription status to BizNexus EntitlementStatus
 */
function mapOdooStatusToEntitlementStatus(odooStatus?: string): EntitlementStatus {
  switch (odooStatus) {
    case 'active':
      return 'ACTIVE';
    case 'trial':
      return 'TRIAL';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'EXPIRED';
  }
}

/**
 * Sync entitlements from Odoo res.partner to BizNexus
 *
 * Reads the partner's subscription fields from Odoo and updates
 * the tenant's entitlements in BizNexus.
 *
 * Call this:
 * - On user login (background refresh)
 * - From a daily cron job
 * - When webhook from Odoo indicates subscription change
 *
 * @param tenantId - BizNexus tenant ID
 * @returns true if sync succeeded, false otherwise
 */
export async function syncEntitlementsFromOdoo(tenantId: string): Promise<boolean> {
  try {
    // Get tenant with Odoo partner ID
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { odoo19PartnerId: true },
    });

    if (!tenant?.odoo19PartnerId) {
      console.log('[Odoo Entitlement Sync] No Odoo partner for tenant:', tenantId);
      return false;
    }

    // Authenticate to Odoo
    await odoo.authenticate();

    // Read partner subscription fields from Odoo using searchRead
    // NOTE: These fields need to be added to the Odoo res.partner model
    const partnerData = await odoo.searchRead<OdooPartnerSubscription>(
      'res.partner',
      [['id', '=', tenant.odoo19PartnerId]],
      [
        'subscription_status',
        'subscription_modules',
        'subscription_max_users',
        'subscription_max_stores',
        'subscription_max_terminals',
        'subscription_period_start',
        'subscription_period_end',
      ],
      { limit: 1 }
    );

    if (!partnerData || partnerData.length === 0) {
      console.log('[Odoo Entitlement Sync] Partner not found in Odoo:', tenant.odoo19PartnerId);
      return false;
    }

    const subscription = partnerData[0];

    // Map Odoo data to entitlement update
    const status = mapOdooStatusToEntitlementStatus(subscription.subscription_status);
    const modules = subscription.subscription_modules || [];

    // Validate module codes
    const validModuleCodes = Object.values(ModuleCode);
    const validModules = modules.filter(m => validModuleCodes.includes(m as ModuleCode));

    // Update entitlements
    await entitlementsService.update(tenantId, {
      modules: validModules,
      maxUsers: subscription.subscription_max_users || 5,
      maxStores: subscription.subscription_max_stores || 1,
      maxTerminals: subscription.subscription_max_terminals || 2,
      status,
      periodStart: subscription.subscription_period_start
        ? new Date(subscription.subscription_period_start)
        : undefined,
      periodEnd: subscription.subscription_period_end
        ? new Date(subscription.subscription_period_end)
        : undefined,
      source: 'odoo19',
    });

    // Update per-module entitlements
    for (const moduleCode of validModules) {
      await prisma.tenantModuleEntitlement.upsert({
        where: {
          tenantId_moduleKey: {
            tenantId,
            moduleKey: moduleCode,
          },
        },
        create: {
          tenantId,
          moduleKey: moduleCode,
          enabled: true,
          reason: 'plan',
        },
        update: {
          enabled: true,
          reason: 'plan',
        },
      });
    }

    // Disable modules not in the subscription
    const allModuleCodes = validModuleCodes as string[];
    const disabledModules = allModuleCodes.filter(m => !validModules.includes(m));

    for (const moduleCode of disabledModules) {
      await prisma.tenantModuleEntitlement.upsert({
        where: {
          tenantId_moduleKey: {
            tenantId,
            moduleKey: moduleCode,
          },
        },
        create: {
          tenantId,
          moduleKey: moduleCode,
          enabled: false,
          reason: 'plan',
        },
        update: {
          enabled: false,
          reason: 'plan',
        },
      });
    }

    console.log('[Odoo Entitlement Sync] Successfully synced entitlements for tenant:', tenantId);
    return true;
  } catch (error) {
    console.error('[Odoo Entitlement Sync] Failed to sync entitlements:', error);

    // Update sync error in entitlements
    try {
      await prisma.entitlements.update({
        where: { tenantId },
        data: {
          syncError: error instanceof Error ? error.message : 'Unknown sync error',
        },
      });
    } catch {
      // Ignore error updating sync error
    }

    return false;
  }
}

/**
 * Background sync entitlements for a tenant
 * Safe to call from login flow - won't block or throw
 */
export async function backgroundSyncEntitlements(tenantId: string): Promise<void> {
  // Fire and forget - don't await
  syncEntitlementsFromOdoo(tenantId).catch(err => {
    console.error('[Odoo Entitlement Sync] Background sync failed:', err);
  });
}
