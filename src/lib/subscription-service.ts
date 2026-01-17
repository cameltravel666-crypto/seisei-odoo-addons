/**
 * Subscription Service
 * Handles subscription lifecycle management, auto-renewal, and status sync
 */

import { prisma } from './db';
import { stripe } from './stripe';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

/**
 * Check and update subscription status for all tenants
 * Called by cron job or manual trigger
 */
export async function syncAllSubscriptions(): Promise<{
  total: number;
  updated: number;
  expired: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updated = 0;
  let expired = 0;

  // Get all active subscriptions
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
    },
    include: {
      tenant: true,
      items: {
        include: { product: true },
      },
    },
  });

  for (const subscription of subscriptions) {
    try {
      const result = await syncSubscription(subscription.id);
      if (result.statusChanged) {
        updated++;
        if (result.newStatus === 'EXPIRED' || result.newStatus === 'CANCELLED') {
          expired++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Subscription ${subscription.id}: ${message}`);
    }
  }

  return {
    total: subscriptions.length,
    updated,
    expired,
    errors,
  };
}

/**
 * Sync a single subscription's status
 */
export async function syncSubscription(subscriptionId: string): Promise<{
  statusChanged: boolean;
  oldStatus: SubscriptionStatus;
  newStatus: SubscriptionStatus;
}> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      tenant: true,
      items: {
        include: { product: true },
      },
    },
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  const oldStatus = subscription.status as SubscriptionStatus;
  let newStatus = oldStatus;
  const now = new Date();

  // If subscription has Stripe ID, sync from Stripe
  if (subscription.stripeSubscriptionId) {
    try {
      const stripeSubscription: Stripe.Subscription = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId
      );
      newStatus = mapStripeStatus(stripeSubscription.status);
    } catch (error) {
      console.error(`[Subscription Sync] Failed to fetch Stripe subscription ${subscription.stripeSubscriptionId}:`, error);
      // If Stripe fetch fails, fall through to local status check
    }
  }

  // Local status checks (for non-Stripe or as fallback)
  if (newStatus === oldStatus) {
    // Check trial expiration
    if (subscription.status === 'TRIAL' && subscription.trialEndDate) {
      if (now > subscription.trialEndDate) {
        // Trial has expired
        if (subscription.autoRenew && subscription.stripeSubscriptionId) {
          // Has Stripe subscription - should auto-convert to ACTIVE
          newStatus = 'ACTIVE';
        } else {
          // No payment method - expire the subscription
          newStatus = 'EXPIRED';
        }
      }
    }

    // Check if subscription has passed billing date without renewal
    if (subscription.status === 'ACTIVE' && subscription.nextBillingDate) {
      const gracePeriodDays = 7;
      const graceEndDate = new Date(subscription.nextBillingDate);
      graceEndDate.setDate(graceEndDate.getDate() + gracePeriodDays);

      if (now > graceEndDate && !subscription.stripeSubscriptionId) {
        // Past grace period without payment (non-Stripe subscription)
        newStatus = 'EXPIRED';
      }
    }
  }

  // Update status if changed
  if (newStatus !== oldStatus) {
    await updateSubscriptionStatus(subscription.id, newStatus);
  }

  return {
    statusChanged: newStatus !== oldStatus,
    oldStatus,
    newStatus,
  };
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  const statusMap: Record<string, SubscriptionStatus> = {
    trialing: 'TRIAL',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    unpaid: 'PAST_DUE',
    incomplete: 'TRIAL',
    incomplete_expired: 'EXPIRED',
    paused: 'CANCELLED',
  };
  return statusMap[stripeStatus] || 'ACTIVE';
}

/**
 * Update subscription status and handle side effects
 */
export async function updateSubscriptionStatus(
  subscriptionId: string,
  newStatus: SubscriptionStatus
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      items: { include: { product: true } },
    },
  });

  if (!subscription) return;

  const updateData: Prisma.SubscriptionUpdateInput = {
    status: newStatus,
    lastSyncAt: new Date(),
  };

  // Handle status-specific updates
  switch (newStatus) {
    case 'EXPIRED':
    case 'CANCELLED':
      updateData.endDate = new Date();
      // Also cancel all items
      await prisma.subscriptionItem.updateMany({
        where: {
          subscriptionId,
          status: { in: ['TRIAL', 'ACTIVE'] },
        },
        data: {
          status: 'CANCELLED',
          endDate: new Date(),
        },
      });
      // Disable tenant features
      await disableTenantFeatures(subscription.tenantId);
      break;

    case 'ACTIVE':
      // If transitioning from TRIAL to ACTIVE
      updateData.isInTrial = false;
      updateData.trialEndDate = null;
      // Update items status too
      await prisma.subscriptionItem.updateMany({
        where: {
          subscriptionId,
          status: 'TRIAL',
        },
        data: {
          status: 'ACTIVE',
        },
      });
      break;

    case 'PAST_DUE':
      // Log but don't disable features immediately
      console.log(`[Subscription] Subscription ${subscriptionId} is past due`);
      break;
  }

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
  });

  console.log(`[Subscription] Updated subscription ${subscriptionId} status: ${subscription.status} -> ${newStatus}`);
}

/**
 * Disable all features for a tenant (when subscription expires)
 */
async function disableTenantFeatures(tenantId: string): Promise<void> {
  await prisma.tenantFeature.updateMany({
    where: { tenantId },
    data: {
      isAllowed: false,
      isVisible: false,
    },
  });

  console.log(`[Subscription] Disabled features for tenant ${tenantId}`);
}

/**
 * Check if a trial is about to expire (within specified days)
 */
export async function getExpiringTrials(daysAhead: number = 3): Promise<Array<{
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  trialEndDate: Date;
  daysRemaining: number;
}>> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const expiringTrials = await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      trialEndDate: {
        gte: new Date(),
        lte: futureDate,
      },
    },
    include: {
      tenant: true,
    },
  });

  return expiringTrials.map((sub) => {
    const daysRemaining = Math.ceil(
      (sub.trialEndDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return {
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      tenantName: sub.tenant.name,
      trialEndDate: sub.trialEndDate!,
      daysRemaining,
    };
  });
}

/**
 * Extend trial period for a subscription
 */
export async function extendTrial(
  subscriptionId: string,
  additionalDays: number
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription || subscription.status !== 'TRIAL') {
    throw new Error('Subscription is not in trial status');
  }

  const currentEnd = subscription.trialEndDate || new Date();
  const newEndDate = new Date(currentEnd);
  newEndDate.setDate(newEndDate.getDate() + additionalDays);

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      trialEndDate: newEndDate,
      nextBillingDate: newEndDate,
    },
  });

  // If Stripe subscription exists, update trial there too
  if (subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        trial_end: Math.floor(newEndDate.getTime() / 1000),
      });
    } catch (error) {
      console.error('[Subscription] Failed to extend Stripe trial:', error);
    }
  }

  console.log(`[Subscription] Extended trial for ${subscriptionId} by ${additionalDays} days`);
}

/**
 * Get subscription health status
 */
export async function getSubscriptionHealth(tenantId: string): Promise<{
  status: 'healthy' | 'warning' | 'critical' | 'none';
  message: string;
  subscription: {
    status: string;
    daysUntilExpiry?: number;
    isInTrial: boolean;
    hasPaymentMethod: boolean;
  } | null;
}> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
    },
    include: {
      tenant: true,
    },
  });

  if (!subscription) {
    return {
      status: 'none',
      message: 'No active subscription',
      subscription: null,
    };
  }

  const now = new Date();
  const hasPaymentMethod = !!subscription.tenant.stripeCustomerId;

  // Calculate days until expiry (trial end or next billing)
  const expiryDate = subscription.isInTrial
    ? subscription.trialEndDate
    : subscription.nextBillingDate;
  const daysUntilExpiry = expiryDate
    ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  let message = 'Subscription is active';

  if (subscription.status === 'PAST_DUE') {
    status = 'critical';
    message = 'Payment is past due';
  } else if (subscription.isInTrial) {
    if (!hasPaymentMethod) {
      if (daysUntilExpiry !== undefined && daysUntilExpiry <= 3) {
        status = 'critical';
        message = `Trial expires in ${daysUntilExpiry} days. Add payment method to continue.`;
      } else if (daysUntilExpiry !== undefined && daysUntilExpiry <= 7) {
        status = 'warning';
        message = `Trial expires in ${daysUntilExpiry} days. Consider adding a payment method.`;
      } else {
        message = `Trial period active. ${daysUntilExpiry} days remaining.`;
      }
    } else {
      message = `Trial period active. Will auto-renew in ${daysUntilExpiry} days.`;
    }
  }

  return {
    status,
    message,
    subscription: {
      status: subscription.status,
      daysUntilExpiry,
      isInTrial: subscription.isInTrial,
      hasPaymentMethod,
    },
  };
}
