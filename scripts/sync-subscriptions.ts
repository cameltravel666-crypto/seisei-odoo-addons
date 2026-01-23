#!/usr/bin/env npx tsx
/**
 * Subscription Sync Cron Script
 * Run this script periodically (e.g., every hour) to sync subscription statuses
 *
 * Usage:
 *   npx tsx scripts/sync-subscriptions.ts
 *
 * Or via crontab:
 *   0 * * * * cd /path/to/app && npx tsx scripts/sync-subscriptions.ts >> /var/log/subscription-sync.log 2>&1
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

async function syncAllSubscriptions() {
  console.log(`[${new Date().toISOString()}] Starting subscription sync...`);

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

  console.log(`Found ${subscriptions.length} active subscriptions to check`);

  const now = new Date();

  for (const subscription of subscriptions) {
    try {
      const oldStatus = subscription.status as SubscriptionStatus;
      let newStatus = oldStatus;

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

      // Update if status changed
      if (newStatus !== oldStatus) {
        console.log(`Updating subscription ${subscription.id}: ${oldStatus} -> ${newStatus}`);

        // Update subscription
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: newStatus,
            lastSyncAt: now,
            ...(newStatus === 'EXPIRED' || newStatus === 'CANCELLED'
              ? { endDate: now }
              : {}),
            ...(newStatus === 'ACTIVE'
              ? { isInTrial: false, trialEndDate: null }
              : {}),
          },
        });

        // Update items if needed
        if (newStatus === 'EXPIRED' || newStatus === 'CANCELLED') {
          await prisma.subscriptionItem.updateMany({
            where: {
              subscriptionId: subscription.id,
              status: { in: ['TRIAL', 'ACTIVE'] },
            },
            data: {
              status: 'CANCELLED',
              endDate: now,
            },
          });

          // Disable tenant features
          await prisma.tenantFeature.updateMany({
            where: { tenantId: subscription.tenantId },
            data: {
              isAllowed: false,
              isVisible: false,
            },
          });
        } else if (newStatus === 'ACTIVE') {
          await prisma.subscriptionItem.updateMany({
            where: {
              subscriptionId: subscription.id,
              status: 'TRIAL',
            },
            data: { status: 'ACTIVE' },
          });
        }

        updated++;
        if (newStatus === 'EXPIRED' || newStatus === 'CANCELLED') {
          expired++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Subscription ${subscription.id}: ${message}`);
      console.error(`Error processing subscription ${subscription.id}:`, error);
    }
  }

  console.log(`[${new Date().toISOString()}] Sync complete:`);
  console.log(`  Total: ${subscriptions.length}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Expired: ${expired}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    errors.forEach((e) => console.log(`    - ${e}`));
  }

  return { total: subscriptions.length, updated, expired, errors };
}

async function checkExpiringTrials() {
  console.log(`\n[${new Date().toISOString()}] Checking expiring trials...`);

  const daysAhead = 3;
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

  if (expiringTrials.length > 0) {
    console.log(`Found ${expiringTrials.length} trials expiring within ${daysAhead} days:`);
    for (const trial of expiringTrials) {
      const daysRemaining = Math.ceil(
        (trial.trialEndDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      console.log(`  - ${trial.tenant.name}: ${daysRemaining} days remaining`);
    }
  } else {
    console.log('No trials expiring soon');
  }

  return expiringTrials;
}

async function main() {
  try {
    await syncAllSubscriptions();
    await checkExpiringTrials();
  } catch (error) {
    console.error('Sync script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
