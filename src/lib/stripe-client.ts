/**
 * Stripe Client-Side Utilities
 * For use in browser/client components
 */

import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null>;

/**
 * Get Stripe.js instance (lazy loaded)
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(publishableKey, {
      locale: 'ja',
    });
  }
  return stripePromise;
}

/**
 * Create checkout session and redirect to Stripe Checkout
 */
export async function startCheckout(options: {
  products: Array<{ productCode: string; quantity?: number }>;
  billingCycle?: 'monthly' | 'yearly';
  trialDays?: number;
}): Promise<void> {
  // Call our API to create checkout session
  const response = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create checkout session');
  }

  const { url } = await response.json();

  // Redirect to Stripe Checkout (using URL from server)
  if (url) {
    window.location.href = url;
  } else {
    throw new Error('No checkout URL returned');
  }
}

/**
 * Open customer portal for subscription management
 */
export async function openCustomerPortal(): Promise<void> {
  const response = await fetch('/api/stripe/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create portal session');
  }

  const { url } = await response.json();
  window.location.href = url;
}
