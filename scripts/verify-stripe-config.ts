#!/usr/bin/env npx tsx
/**
 * Verify Stripe Configuration Script
 * Checks if all Stripe products are properly configured
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx npx tsx scripts/verify-stripe-config.ts
 */

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error('Error: STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey!, {
  typescript: true,
});

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Stripe Configuration Verification');
  console.log('='.repeat(60));

  const isLiveMode = stripeSecretKey!.startsWith('sk_live_');
  console.log(`Mode: ${isLiveMode ? 'LIVE (Production)' : 'TEST'}\n`);

  const results: CheckResult[] = [];

  // Check 1: Stripe API connection
  try {
    const balance = await stripe.balance.retrieve();
    results.push({
      name: 'Stripe API Connection',
      status: 'pass',
      message: `Connected. Available balance: ${balance.available.map((b) => `${b.currency.toUpperCase()} ${b.amount}`).join(', ') || 'N/A'}`,
    });
  } catch (error) {
    results.push({
      name: 'Stripe API Connection',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check 2: Database connection
  try {
    const productCount = await prisma.subscriptionProduct.count();
    results.push({
      name: 'Database Connection',
      status: 'pass',
      message: `Connected. ${productCount} subscription products found.`,
    });
  } catch (error) {
    results.push({
      name: 'Database Connection',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check 3: Products with Stripe IDs
  const productsWithStripe = await prisma.subscriptionProduct.findMany({
    where: {
      isActive: true,
      stripeProductId: { not: null },
    },
  });

  const productsWithoutStripe = await prisma.subscriptionProduct.findMany({
    where: {
      isActive: true,
      stripeProductId: null,
    },
  });

  if (productsWithoutStripe.length > 0) {
    results.push({
      name: 'Products with Stripe IDs',
      status: 'warn',
      message: `${productsWithStripe.length} configured, ${productsWithoutStripe.length} missing: ${productsWithoutStripe.map((p) => p.productCode).join(', ')}`,
    });
  } else {
    results.push({
      name: 'Products with Stripe IDs',
      status: 'pass',
      message: `All ${productsWithStripe.length} products have Stripe IDs`,
    });
  }

  // Check 4: Verify Stripe products exist
  let invalidProducts: string[] = [];
  for (const product of productsWithStripe) {
    try {
      await stripe.products.retrieve(product.stripeProductId!);
    } catch {
      invalidProducts.push(product.productCode);
    }
  }

  if (invalidProducts.length > 0) {
    results.push({
      name: 'Stripe Products Valid',
      status: 'fail',
      message: `Invalid Stripe product IDs: ${invalidProducts.join(', ')}`,
    });
  } else if (productsWithStripe.length > 0) {
    results.push({
      name: 'Stripe Products Valid',
      status: 'pass',
      message: 'All Stripe product IDs are valid',
    });
  }

  // Check 5: Verify prices exist
  const productsWithPrices = await prisma.subscriptionProduct.findMany({
    where: {
      isActive: true,
      stripePriceMonthly: { not: null },
    },
  });

  let invalidPrices: string[] = [];
  for (const product of productsWithPrices) {
    try {
      await stripe.prices.retrieve(product.stripePriceMonthly!);
    } catch {
      invalidPrices.push(product.productCode);
    }
  }

  if (invalidPrices.length > 0) {
    results.push({
      name: 'Stripe Prices Valid',
      status: 'fail',
      message: `Invalid price IDs: ${invalidPrices.join(', ')}`,
    });
  } else if (productsWithPrices.length > 0) {
    results.push({
      name: 'Stripe Prices Valid',
      status: 'pass',
      message: `All ${productsWithPrices.length} price IDs are valid`,
    });
  }

  // Check 6: Webhook endpoints
  try {
    const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
    const productionWebhook = webhooks.data.find((w) => w.url.includes('erp.seisei.tokyo') || w.url.includes('/api/stripe/webhook'));

    if (productionWebhook) {
      results.push({
        name: 'Webhook Endpoint',
        status: productionWebhook.status === 'enabled' ? 'pass' : 'warn',
        message: `Found: ${productionWebhook.url} (${productionWebhook.status})`,
      });
    } else {
      results.push({
        name: 'Webhook Endpoint',
        status: 'warn',
        message: 'No production webhook found. Configure at https://dashboard.stripe.com/webhooks',
      });
    }
  } catch (error) {
    results.push({
      name: 'Webhook Endpoint',
      status: 'warn',
      message: 'Could not check webhooks (may require different permissions)',
    });
  }

  // Check 7: Customer Portal
  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
    if (configs.data.length > 0) {
      results.push({
        name: 'Customer Portal',
        status: 'pass',
        message: 'Portal configuration found',
      });
    } else {
      results.push({
        name: 'Customer Portal',
        status: 'warn',
        message: 'No portal configuration. Configure at https://dashboard.stripe.com/settings/billing/portal',
      });
    }
  } catch {
    results.push({
      name: 'Customer Portal',
      status: 'warn',
      message: 'Could not check portal configuration',
    });
  }

  // Check 8: Active subscriptions
  try {
    const subscriptions = await prisma.subscription.count({
      where: {
        stripeSubscriptionId: { not: null },
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
    });
    results.push({
      name: 'Active Stripe Subscriptions',
      status: 'pass',
      message: `${subscriptions} active subscriptions with Stripe IDs`,
    });
  } catch {
    results.push({
      name: 'Active Stripe Subscriptions',
      status: 'warn',
      message: 'Could not count subscriptions',
    });
  }

  // Print results
  console.log('\nResults:');
  console.log('-'.repeat(60));

  const icons = { pass: '✓', fail: '✗', warn: '⚠' };
  const colors = { pass: '\x1b[32m', fail: '\x1b[31m', warn: '\x1b[33m' };
  const reset = '\x1b[0m';

  for (const result of results) {
    console.log(`${colors[result.status]}${icons[result.status]}${reset} ${result.name}`);
    console.log(`  ${result.message}`);
  }

  console.log('\n' + '='.repeat(60));

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;

  console.log(`Summary: ${passed} passed, ${failed} failed, ${warned} warnings`);

  if (failed > 0) {
    console.log('\nAction Required: Fix the failed checks before going live.');
    process.exit(1);
  } else if (warned > 0) {
    console.log('\nRecommended: Review warnings to ensure optimal configuration.');
  } else {
    console.log('\nAll checks passed! Ready for production.');
  }

  console.log('='.repeat(60));
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
