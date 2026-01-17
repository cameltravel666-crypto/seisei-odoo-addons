/**
 * Stripe Server-Side Client
 * For use in API routes and server components only
 */

import Stripe from 'stripe';

// Lazy initialization of Stripe client
let _stripe: Stripe | null = null;

/**
 * Get Stripe client instance (lazy loaded)
 * Throws error if STRIPE_SECRET_KEY is not configured
 */
function getStripeClient(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(secretKey, {
      typescript: true,
    });
  }
  return _stripe;
}

// Export a proxy object that lazily initializes Stripe on first use
export const stripe = new Proxy({} as Stripe, {
  get(_, prop: keyof Stripe) {
    return getStripeClient()[prop];
  },
});

/**
 * Create or get Stripe customer for a tenant
 */
export async function getOrCreateStripeCustomer(
  tenantId: string,
  email: string,
  name: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  // Search for existing customer by metadata
  const existingCustomers = await stripe.customers.search({
    query: `metadata['tenantId']:'${tenantId}'`,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      tenantId,
      ...metadata,
    },
  });

  return customer;
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession({
  customerId,
  priceIds,
  successUrl,
  cancelUrl,
  trialDays,
  metadata,
}: {
  customerId: string;
  priceIds: Array<{ priceId: string; quantity?: number }>;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const lineItems = priceIds.map(({ priceId, quantity }) => ({
    price: priceId,
    quantity: quantity || 1,
  }));

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: {
      metadata,
    },
    // Japan-specific payment methods
    payment_method_types: ['card'],
    locale: 'ja',
    // Allow promotion codes
    allow_promotion_codes: true,
  };

  // Add trial if specified
  if (trialDays && trialDays > 0) {
    sessionParams.subscription_data = {
      ...sessionParams.subscription_data,
      trial_period_days: trialDays,
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return session;
}

/**
 * Create a customer portal session for managing subscriptions
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session;
}

/**
 * Get subscription details
 */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product', 'latest_invoice'],
    });
    return subscription;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  if (cancelAtPeriodEnd) {
    // Cancel at the end of the billing period
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } else {
    // Cancel immediately
    return stripe.subscriptions.cancel(subscriptionId);
  }
}

/**
 * Update subscription (add/remove items)
 */
export async function updateSubscription(
  subscriptionId: string,
  updates: {
    addItems?: Array<{ priceId: string; quantity?: number }>;
    removeItems?: string[]; // subscription item IDs
    updateItems?: Array<{ itemId: string; quantity: number }>;
  }
): Promise<Stripe.Subscription> {
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];

  // Add new items
  if (updates.addItems) {
    for (const item of updates.addItems) {
      items.push({
        price: item.priceId,
        quantity: item.quantity || 1,
      });
    }
  }

  // Remove items (set quantity to 0 and mark as deleted)
  if (updates.removeItems) {
    for (const itemId of updates.removeItems) {
      items.push({
        id: itemId,
        deleted: true,
      });
    }
  }

  // Update item quantities
  if (updates.updateItems) {
    for (const item of updates.updateItems) {
      items.push({
        id: item.itemId,
        quantity: item.quantity,
      });
    }
  }

  return stripe.subscriptions.update(subscriptionId, {
    items,
    proration_behavior: 'create_prorations',
  });
}

/**
 * Create Stripe products and prices from our subscription products
 * Run this once to sync products to Stripe
 */
export async function syncProductToStripe(product: {
  productCode: string;
  name: string;
  nameJa: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
}): Promise<{ productId: string; monthlyPriceId: string; yearlyPriceId?: string }> {
  // Create or update product
  const stripeProduct = await stripe.products.create({
    name: product.nameJa || product.name,
    description: product.description,
    metadata: {
      productCode: product.productCode,
    },
  });

  // Create monthly price
  const monthlyPrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: Math.round(product.priceMonthly * 100), // Convert to cents
    currency: 'jpy',
    recurring: {
      interval: 'month',
    },
    metadata: {
      productCode: product.productCode,
      interval: 'monthly',
    },
  });

  let yearlyPriceId: string | undefined;

  // Create yearly price if available
  if (product.priceYearly) {
    const yearlyPrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: Math.round(product.priceYearly * 100),
      currency: 'jpy',
      recurring: {
        interval: 'year',
      },
      metadata: {
        productCode: product.productCode,
        interval: 'yearly',
      },
    });
    yearlyPriceId = yearlyPrice.id;
  }

  return {
    productId: stripeProduct.id,
    monthlyPriceId: monthlyPrice.id,
    yearlyPriceId,
  };
}

/**
 * Verify webhook signature
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
