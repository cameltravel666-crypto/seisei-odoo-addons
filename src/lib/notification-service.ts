/**
 * Notification Service
 * Handles sending billing notifications via email
 */

import { prisma } from '@/lib/db';
import {
  sendEmail,
  trialStartedEmail,
  trialEndingSoonEmail,
  paymentSuccessEmail,
  paymentFailedEmail,
  subscriptionCancelledEmail,
  invoiceCreatedEmail,
} from '@/lib/email';

/**
 * Send trial started notification
 */
export async function notifyTrialStarted(subscriptionId: string): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        tenant: true,
        items: {
          where: { product: { productType: 'BASE_PLAN' } },
          include: { product: true },
        },
      },
    });

    if (!subscription?.tenant.billingEmail) {
      console.log('[Notification] No billing email for tenant:', subscription?.tenantId);
      return;
    }

    const basePlan = subscription.items[0]?.product;
    const trialDays = basePlan?.trialDays || 14;

    const email = trialStartedEmail({
      tenantName: subscription.tenant.name,
      planName: basePlan?.nameJa || basePlan?.name || 'プラン',
      trialDays,
      trialEndDate: subscription.trialEndDate || new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
    });

    await sendEmail({
      to: subscription.tenant.billingEmail,
      subject: email.subject,
      html: email.html,
    });

    console.log('[Notification] Trial started email sent to:', subscription.tenant.billingEmail);
  } catch (error) {
    console.error('[Notification] Failed to send trial started email:', error);
  }
}

/**
 * Send trial ending soon notification
 */
export async function notifyTrialEndingSoon(subscriptionId: string, daysRemaining: number): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { tenant: true },
    });

    if (!subscription?.tenant.billingEmail) return;

    // Check if Stripe payment method exists
    const hasPaymentMethod = !!subscription.tenant.stripeCustomerId;

    const email = trialEndingSoonEmail({
      tenantName: subscription.tenant.name,
      daysRemaining,
      trialEndDate: subscription.trialEndDate || new Date(),
      hasPaymentMethod,
    });

    await sendEmail({
      to: subscription.tenant.billingEmail,
      subject: email.subject,
      html: email.html,
    });

    console.log('[Notification] Trial ending email sent, days remaining:', daysRemaining);
  } catch (error) {
    console.error('[Notification] Failed to send trial ending email:', error);
  }
}

/**
 * Send payment success notification
 */
export async function notifyPaymentSuccess(params: {
  tenantId: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  nextBillingDate: Date;
}): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
    });

    if (!tenant?.billingEmail) return;

    const email = paymentSuccessEmail({
      tenantName: tenant.name,
      amount: params.amount,
      currency: params.currency,
      invoiceNumber: params.invoiceNumber,
      nextBillingDate: params.nextBillingDate,
    });

    await sendEmail({
      to: tenant.billingEmail,
      subject: email.subject,
      html: email.html,
    });

    console.log('[Notification] Payment success email sent to:', tenant.billingEmail);
  } catch (error) {
    console.error('[Notification] Failed to send payment success email:', error);
  }
}

/**
 * Send payment failed notification
 */
export async function notifyPaymentFailed(params: {
  tenantId: string;
  amount: number;
  currency: string;
  failureReason?: string;
  retryDate?: Date;
}): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
    });

    if (!tenant?.billingEmail) return;

    const email = paymentFailedEmail({
      tenantName: tenant.name,
      amount: params.amount,
      currency: params.currency,
      failureReason: params.failureReason,
      retryDate: params.retryDate,
    });

    await sendEmail({
      to: tenant.billingEmail,
      subject: email.subject,
      html: email.html,
    });

    console.log('[Notification] Payment failed email sent to:', tenant.billingEmail);
  } catch (error) {
    console.error('[Notification] Failed to send payment failed email:', error);
  }
}

/**
 * Send subscription cancelled notification
 */
export async function notifySubscriptionCancelled(subscriptionId: string): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { tenant: true },
    });

    if (!subscription?.tenant.billingEmail) return;

    const email = subscriptionCancelledEmail({
      tenantName: subscription.tenant.name,
      endDate: subscription.endDate || new Date(),
    });

    await sendEmail({
      to: subscription.tenant.billingEmail,
      subject: email.subject,
      html: email.html,
    });

    console.log('[Notification] Cancellation email sent to:', subscription.tenant.billingEmail);
  } catch (error) {
    console.error('[Notification] Failed to send cancellation email:', error);
  }
}

/**
 * Send invoice created notification
 */
export async function notifyInvoiceCreated(invoiceId: string): Promise<void> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: {
          include: {
            tenant: true,
            items: {
              where: { status: { in: ['TRIAL', 'ACTIVE'] } },
              include: { product: true },
            },
          },
        },
      },
    });

    if (!invoice?.subscription.tenant.billingEmail) return;

    const items = invoice.subscription.items.map((item: { product: { nameJa: string | null; name: string }; quantity: number; unitPrice: unknown }) => ({
      name: item.product.nameJa || item.product.name,
      quantity: item.quantity,
      amount: Number(item.unitPrice) * item.quantity,
    }));

    const email = invoiceCreatedEmail({
      tenantName: invoice.subscription.tenant.name,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      items,
    });

    await sendEmail({
      to: invoice.subscription.tenant.billingEmail,
      subject: email.subject,
      html: email.html,
    });

    console.log('[Notification] Invoice email sent to:', invoice.subscription.tenant.billingEmail);
  } catch (error) {
    console.error('[Notification] Failed to send invoice email:', error);
  }
}

/**
 * Check and send trial expiration warnings
 * Should be called by cron job daily
 */
export async function sendTrialExpirationWarnings(): Promise<{
  sent: number;
  errors: number;
}> {
  let sent = 0;
  let errors = 0;

  try {
    // Find trials expiring in 7, 3, and 1 days
    const warningDays = [7, 3, 1];

    for (const days of warningDays) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const expiringSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'TRIAL',
          isInTrial: true,
          trialEndDate: {
            gte: targetDate,
            lt: nextDay,
          },
        },
      });

      for (const subscription of expiringSubscriptions) {
        try {
          await notifyTrialEndingSoon(subscription.id, days);
          sent++;
        } catch {
          errors++;
        }
      }
    }
  } catch (error) {
    console.error('[Notification] Failed to process trial warnings:', error);
    errors++;
  }

  return { sent, errors };
}
