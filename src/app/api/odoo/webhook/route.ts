import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

/**
 * Odoo 19 Webhook Endpoint
 * Receives events from Odoo when subscriptions, invoices, or payments change
 *
 * Configure in Odoo 19:
 * 1. Install Odoo Webhooks module
 * 2. Create webhook pointing to: https://erp.seisei.tokyo/api/odoo/webhook
 * 3. Set secret in .env: ODOO_WEBHOOK_SECRET
 */

interface OdooWebhookPayload {
  event: string;
  model: string;
  record_id: number;
  data: Record<string, unknown>;
  timestamp: string;
}

// Verify webhook signature from Odoo
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.ODOO_WEBHOOK_SECRET;

    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('x-odoo-signature') || '';

    // Verify signature if secret is configured
    if (secret && signature) {
      if (!verifySignature(rawBody, signature, secret)) {
        console.error('[Odoo Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload: OdooWebhookPayload = JSON.parse(rawBody);
    console.log('[Odoo Webhook] Received:', payload.event, payload.model, payload.record_id);

    switch (payload.model) {
      case 'sale.order':
        await handleSaleOrderEvent(payload);
        break;

      case 'account.move':
        await handleInvoiceEvent(payload);
        break;

      case 'account.payment':
        await handlePaymentEvent(payload);
        break;

      default:
        console.log('[Odoo Webhook] Unhandled model:', payload.model);
    }

    return NextResponse.json({ success: true, received: payload.event });
  } catch (error) {
    console.error('[Odoo Webhook Error]', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Handle sale order (subscription) events
async function handleSaleOrderEvent(payload: OdooWebhookPayload) {
  const { event, record_id, data } = payload;

  // Find subscription by Odoo order ID
  const subscription = await prisma.subscription.findFirst({
    where: { odoo19OrderId: record_id },
    include: { tenant: true },
  });

  if (!subscription) {
    console.log('[Odoo Webhook] No subscription found for order:', record_id);
    return;
  }

  switch (event) {
    case 'order_confirmed':
      // Order confirmed in Odoo - update subscription status
      if (subscription.status === 'TRIAL') {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE', isInTrial: false },
        });
      }
      break;

    case 'order_cancelled':
      // Order cancelled in Odoo
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLED',
          endDate: new Date(),
          autoRenew: false,
        },
      });
      break;

    case 'order_updated':
      // Order lines updated - sync items
      if (data.order_line && Array.isArray(data.order_line)) {
        // Handle order line updates
        console.log('[Odoo Webhook] Order updated with', data.order_line.length, 'lines');
      }
      break;
  }
}

// Handle invoice events
async function handleInvoiceEvent(payload: OdooWebhookPayload) {
  const { event, record_id, data } = payload;

  // Find subscription by partner ID from invoice
  const partnerId = data.partner_id;
  if (!partnerId) return;

  const subscription = await prisma.subscription.findFirst({
    where: {
      odoo19PartnerId: typeof partnerId === 'number' ? partnerId : (partnerId as number[])[0],
      status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
    },
  });

  if (!subscription) {
    console.log('[Odoo Webhook] No subscription found for partner:', partnerId);
    return;
  }

  switch (event) {
    case 'invoice_posted': {
      // Invoice posted - create invoice record
      const invoiceNumber = (data.name as string) || `ODOO-${record_id}`;
      const issueDate = new Date(data.invoice_date as string || Date.now());
      const dueDate = new Date(data.invoice_date_due as string || Date.now());

      // Get tenant from subscription
      const subscriptionData = await prisma.subscription.findUnique({
        where: { id: subscription.id },
        select: { tenantId: true },
      });

      if (!subscriptionData) break;

      await prisma.invoice.upsert({
        where: { invoiceNumber },
        create: {
          subscriptionId: subscription.id,
          tenantId: subscriptionData.tenantId,
          odoo19InvoiceId: record_id,
          invoiceNumber,
          amount: data.amount_total as number || 0,
          currency: 'JPY',
          status: 'OPEN',
          issueDate,
          dueDate,
          periodStart: issueDate,
          periodEnd: dueDate,
        },
        update: {
          odoo19InvoiceId: record_id,
          amount: data.amount_total as number || undefined,
          status: 'OPEN',
        },
      });
      break;
    }

    case 'invoice_paid':
      // Invoice paid - update status
      await prisma.invoice.updateMany({
        where: {
          subscriptionId: subscription.id,
          odoo19InvoiceId: record_id,
        },
        data: {
          status: 'PAID',
          paidDate: new Date(),
        },
      });

      // Update subscription status if it was past due
      if (subscription.status === 'PAST_DUE') {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE' },
        });
      }
      break;

    case 'invoice_cancelled':
      await prisma.invoice.updateMany({
        where: {
          subscriptionId: subscription.id,
          odoo19InvoiceId: record_id,
        },
        data: { status: 'VOID' },
      });
      break;
  }
}

// Handle payment events
async function handlePaymentEvent(payload: OdooWebhookPayload) {
  const { event, data } = payload;

  if (event === 'payment_posted') {
    // Payment received - log it
    console.log('[Odoo Webhook] Payment received:', data.amount, data.currency);

    // Find related invoice and update
    const invoiceIds = data.reconciled_invoice_ids as number[] || [];
    for (const invoiceId of invoiceIds) {
      await prisma.invoice.updateMany({
        where: { odoo19InvoiceId: invoiceId },
        data: {
          status: 'PAID',
          paidDate: new Date(),
        },
      });
    }
  }
}

// GET endpoint for webhook verification
export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/odoo/webhook',
    supported_models: ['sale.order', 'account.move', 'account.payment'],
    supported_events: [
      'order_confirmed',
      'order_cancelled',
      'order_updated',
      'invoice_posted',
      'invoice_paid',
      'invoice_cancelled',
      'payment_posted',
    ],
  });
}
