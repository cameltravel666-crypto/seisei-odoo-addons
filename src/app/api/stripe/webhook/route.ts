/**
 * Stripe Webhook Handler
 * Handles subscription lifecycle events from Stripe
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { stripe, constructWebhookEvent } from '@/lib/stripe';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import {
  notifyPaymentSuccess,
  notifyPaymentFailed,
  notifyTrialEndingSoon,
  notifySubscriptionCancelled,
} from '@/lib/notification-service';
import { syncStripePaymentToOdoo, syncCancellationToOdoo } from '@/lib/odoo-sync';
import { entitlementsService } from '@/lib/entitlements-service';
import { auditService } from '@/lib/audit-service';

// Disable body parser for webhook signature verification
export const dynamic = 'force-dynamic';

// POST: Handle Stripe webhook events
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    console.error('[Stripe Webhook] Missing signature');
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle checkout session completed
 * This is triggered when a customer completes the checkout
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('[Stripe Webhook] Checkout session completed:', session.id);

  const tenantId = session.metadata?.tenantId;
  if (!tenantId) {
    console.error('[Stripe Webhook] No tenantId in session metadata');
    return;
  }

  // Get subscription details from Stripe
  if (!session.subscription) {
    console.error('[Stripe Webhook] No subscription in checkout session');
    return;
  }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id;

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  await syncStripeSubscription(tenantId, stripeSubscription);
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Subscription created:', subscription.id);

  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) {
    // Try to find tenant by Stripe customer ID
    const tenant = await prisma.tenant.findFirst({
      where: { stripeCustomerId: subscription.customer as string },
    });
    if (tenant) {
      await syncStripeSubscription(tenant.id, subscription);
    }
    return;
  }

  await syncStripeSubscription(tenantId, subscription);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Subscription updated:', subscription.id);

  // Find subscription in our database
  const existingSub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (existingSub) {
    await syncStripeSubscription(existingSub.tenantId, subscription);
  }
}

/**
 * Handle subscription deleted (cancelled)
 */
async function handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Subscription deleted:', stripeSubscription.id);

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'CANCELLED',
      endDate: new Date(),
    },
  });

  // Update entitlements to expired
  await entitlementsService.handleExpired(subscription.tenantId);

  // Log subscription cancellation
  await auditService.logSubscriptionEvent({
    tenantId: subscription.tenantId,
    action: 'SUBSCRIPTION_CANCELLED',
    subscriptionId: subscription.id,
    metadata: {
      stripeSubscriptionId: stripeSubscription.id,
      source: 'stripe_webhook'
    }
  });

  // Send cancellation notification
  await notifySubscriptionCancelled(subscription.id);

  // Sync cancellation to Odoo
  await syncCancellationToOdoo(subscription.id);
}

/**
 * Handle invoice paid - create invoice record
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log('[Stripe Webhook] Invoice paid:', invoice.id);

  // Get subscription ID from parent.subscription_details
  const subscriptionId = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionId) return;

  const stripeSubId = typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id;
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });

  if (!subscription) return;

  // Create or update invoice record
  const invoiceNumber = invoice.number || invoice.id;
  const issueDate = new Date((invoice.created || Date.now() / 1000) * 1000);
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date * 1000)
    : issueDate;
  const paidDate = new Date((invoice.status_transitions?.paid_at || Date.now() / 1000) * 1000);

  // Get tenant ID from subscription
  const subscriptionData = await prisma.subscription.findUnique({
    where: { id: subscription.id },
    select: { tenantId: true },
  });

  if (!subscriptionData) return;

  await prisma.invoice.upsert({
    where: { invoiceNumber },
    update: {
      amount: new Prisma.Decimal(invoice.amount_paid / 100),
      status: 'PAID',
      paidDate,
    },
    create: {
      subscriptionId: subscription.id,
      tenantId: subscriptionData.tenantId,
      invoiceNumber,
      amount: new Prisma.Decimal(invoice.amount_paid / 100),
      status: 'PAID',
      issueDate,
      dueDate,
      paidDate,
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : issueDate,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : dueDate,
    },
  });

  // Update subscription status if it was past due
  if (subscription.status === 'PAST_DUE') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE' },
    });
  }

  // Send payment success notification
  await notifyPaymentSuccess({
    tenantId: subscriptionData.tenantId,
    amount: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(),
    invoiceNumber,
    nextBillingDate: subscription.nextBillingDate,
  });

  // Sync payment to Odoo
  await syncStripePaymentToOdoo({
    subscriptionId: subscription.id,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    paidAt: paidDate,
  });
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('[Stripe Webhook] Invoice payment failed:', invoice.id);

  // Get subscription ID from parent.subscription_details
  const subscriptionId = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionId) return;

  const stripeSubId = typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id;

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
    include: { tenant: true },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'PAST_DUE' },
  });

  // Update entitlements to past_due
  await entitlementsService.handlePaymentFailed(subscription.tenantId);

  // Log payment failure
  await auditService.logSubscriptionEvent({
    tenantId: subscription.tenantId,
    action: 'SUBSCRIPTION_PAYMENT_FAILED',
    subscriptionId: subscription.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      failureReason: invoice.last_finalization_error?.message,
      source: 'stripe_webhook'
    }
  });

  // Send payment failed notification
  await notifyPaymentFailed({
    tenantId: subscription.tenantId,
    amount: invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    failureReason: invoice.last_finalization_error?.message,
    retryDate: invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000)
      : undefined,
  });
}

/**
 * Handle trial will end (3 days before)
 */
async function handleTrialWillEnd(stripeSubscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Trial will end:', stripeSubscription.id);

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!subscription) return;

  // Calculate days remaining
  const trialEnd = stripeSubscription.trial_end
    ? new Date(stripeSubscription.trial_end * 1000)
    : null;
  const daysRemaining = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 3;

  // Send trial ending notification
  await notifyTrialEndingSoon(subscription.id, daysRemaining);
}

/**
 * Sync Stripe subscription to our database
 */
async function syncStripeSubscription(tenantId: string, stripeSubscription: Stripe.Subscription) {
  // Get expanded subscription with prices
  const expandedSubscription: Stripe.Subscription = await stripe.subscriptions.retrieve(stripeSubscription.id, {
    expand: ['items.data.price.product'],
  });

  // Map Stripe status to our status
  const statusMap: Record<string, 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'> = {
    trialing: 'TRIAL',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    unpaid: 'PAST_DUE',
    incomplete: 'TRIAL',
    incomplete_expired: 'EXPIRED',
    paused: 'CANCELLED',
  };

  const status = statusMap[expandedSubscription.status] || 'ACTIVE';
  const isInTrial = expandedSubscription.status === 'trialing';
  const trialEndDate = expandedSubscription.trial_end
    ? new Date(expandedSubscription.trial_end * 1000)
    : null;

  // Calculate total amount from subscription items
  let totalAmount = new Prisma.Decimal(0);
  const itemsData: Array<{
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    status: 'TRIAL' | 'ACTIVE';
    startDate: Date;
  }> = [];

  for (const item of expandedSubscription.items.data) {
    const price = item.price;
    const productData = price.product as Stripe.Product;

    // Find our product by Stripe price ID
    const product = await prisma.subscriptionProduct.findFirst({
      where: {
        OR: [
          { stripePriceMonthly: price.id },
          { stripePriceYearly: price.id },
          { stripeProductId: productData.id },
        ],
      },
    });

    if (product) {
      const unitPrice = new Prisma.Decimal((price.unit_amount || 0) / 100);
      const quantity = item.quantity ?? 1;
      totalAmount = totalAmount.add(unitPrice.mul(quantity));
      itemsData.push({
        productId: product.id,
        quantity,
        unitPrice,
        status: isInTrial ? 'TRIAL' : 'ACTIVE',
        startDate: new Date(expandedSubscription.created * 1000),
      });
    }
  }

  // Determine billing cycle from subscription interval
  const interval = expandedSubscription.items.data[0]?.price?.recurring?.interval;
  const billingCycle = interval === 'year' ? 'YEARLY' : interval === 'month' ? 'MONTHLY' : 'MONTHLY';

  // Calculate next billing date from billing_cycle_anchor
  // billing_cycle_anchor is the reference point for future billing dates
  const billingAnchor = expandedSubscription.billing_cycle_anchor;
  const now = Math.floor(Date.now() / 1000);
  let nextBillingTimestamp = billingAnchor;

  // Calculate the next billing date by advancing from anchor
  const intervalSeconds = interval === 'year' ? 365 * 24 * 60 * 60 : 30 * 24 * 60 * 60;
  while (nextBillingTimestamp <= now) {
    nextBillingTimestamp += intervalSeconds;
  }

  const nextBillingDate = new Date(nextBillingTimestamp * 1000);
  const periodEnd = nextBillingDate;

  // Upsert subscription
  const subscription = await prisma.subscription.upsert({
    where: { tenantId },
    update: {
      stripeSubscriptionId: expandedSubscription.id,
      stripeCurrentPeriodEnd: periodEnd,
      status,
      nextBillingDate,
      totalAmount,
      billingCycle: billingCycle as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
      isInTrial,
      trialEndDate,
      autoRenew: !expandedSubscription.cancel_at_period_end,
      lastSyncAt: new Date(),
    },
    create: {
      tenantId,
      stripeSubscriptionId: expandedSubscription.id,
      stripeCurrentPeriodEnd: periodEnd,
      status,
      startDate: new Date(expandedSubscription.created * 1000),
      nextBillingDate,
      totalAmount,
      billingCycle: billingCycle as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
      isInTrial,
      trialEndDate,
      autoRenew: !expandedSubscription.cancel_at_period_end,
    },
  });

  // Sync subscription items
  // First, mark existing items as cancelled
  await prisma.subscriptionItem.updateMany({
    where: {
      subscriptionId: subscription.id,
      status: { in: ['TRIAL', 'ACTIVE'] },
    },
    data: {
      status: 'CANCELLED',
      endDate: new Date(),
    },
  });

  // Then create/update items from Stripe
  for (const itemData of itemsData) {
    await prisma.subscriptionItem.upsert({
      where: {
        subscriptionId_productId: {
          subscriptionId: subscription.id,
          productId: itemData.productId,
        },
      },
      update: {
        quantity: itemData.quantity,
        unitPrice: itemData.unitPrice,
        status: itemData.status,
        endDate: null,
      },
      create: {
        subscriptionId: subscription.id,
        ...itemData,
      },
    });
  }

  // Update tenant features based on subscription items
  const allItems = await prisma.subscriptionItem.findMany({
    where: {
      subscriptionId: subscription.id,
      status: { in: ['TRIAL', 'ACTIVE'] },
    },
    include: { product: true },
  });

  const enabledModules = new Set<string>();
  for (const item of allItems) {
    if (item.product.includedModules) {
      item.product.includedModules.forEach((m) => enabledModules.add(m));
    }
    if (item.product.enablesModule) {
      enabledModules.add(item.product.enablesModule);
    }
  }

  // Rebuild tenant features
  await prisma.tenantFeature.deleteMany({
    where: { tenantId },
  });

  if (enabledModules.size > 0) {
    await prisma.tenantFeature.createMany({
      data: Array.from(enabledModules).map((moduleCode) => ({
        tenantId,
        moduleCode: moduleCode as 'POS' | 'INVENTORY' | 'PURCHASE' | 'SALES' | 'CRM' | 'EXPENSES' | 'ACCOUNTING' | 'FINANCE' | 'APPROVALS' | 'HR' | 'MAINTENANCE' | 'DOCUMENTS' | 'DASHBOARD' | 'PRODUCTS' | 'CONTACTS' | 'ANALYTICS',
        isAllowed: true,
        isVisible: true,
      })),
    });
  }

  // Sync to Entitlements table
  // Calculate max users from subscription items
  let maxUsers = 5;
  let maxTerminals = 2;
  let maxStores = 1;

  for (const item of allItems) {
    if (item.product.maxUsers) {
      maxUsers = Math.max(maxUsers, item.product.maxUsers);
    }
    if (item.product.maxTerminals) {
      maxTerminals = Math.max(maxTerminals, item.product.maxTerminals);
    }
    // Handle addons for additional limits
    if (item.product.productCode.includes('USER')) {
      maxUsers += item.quantity;
    }
    if (item.product.productCode.includes('TERMINAL')) {
      maxTerminals += item.quantity;
    }
    if (item.product.productCode.includes('STORE')) {
      maxStores += item.quantity;
    }
  }

  // Map subscription status to entitlement status
  const entitlementStatusMap: Record<string, 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED'> = {
    TRIAL: 'TRIAL',
    ACTIVE: 'ACTIVE',
    PAST_DUE: 'PAST_DUE',
    CANCELLED: 'EXPIRED',
    EXPIRED: 'EXPIRED',
  };

  await entitlementsService.update(tenantId, {
    modules: Array.from(enabledModules),
    maxUsers,
    maxStores,
    maxTerminals,
    status: entitlementStatusMap[status] || 'ACTIVE',
    periodEnd: periodEnd,
    source: 'stripe',
    stripeSubId: expandedSubscription.id,
  });

  // Log subscription update
  await auditService.logSubscriptionEvent({
    tenantId,
    action: 'SUBSCRIPTION_UPDATED',
    subscriptionId: subscription.id,
    changes: {
      new: {
        status,
        modules: Array.from(enabledModules),
        maxUsers,
        totalAmount: totalAmount.toString(),
      }
    },
    metadata: {
      stripeSubscriptionId: expandedSubscription.id,
      source: 'stripe_webhook'
    }
  });

  console.log(`[Stripe Webhook] Synced subscription for tenant ${tenantId}: status=${status}, items=${itemsData.length}, modules=${enabledModules.size}`);
}
