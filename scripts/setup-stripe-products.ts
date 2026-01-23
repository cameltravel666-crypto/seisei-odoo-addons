#!/usr/bin/env npx tsx
/**
 * Setup Stripe Products Script
 * Creates products and prices in Stripe, then updates the database with IDs
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx npx tsx scripts/setup-stripe-products.ts
 *
 * Prerequisites:
 *   - Stripe account configured for Japan (JPY currency)
 *   - STRIPE_SECRET_KEY environment variable set
 *   - Database has subscription_products table populated
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
  console.error('Usage: STRIPE_SECRET_KEY=sk_live_xxx npx tsx scripts/setup-stripe-products.ts');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey!, {
  typescript: true,
});

async function main() {
  console.log('='.repeat(60));
  console.log('Stripe Products Setup Script');
  console.log('='.repeat(60));

  // Check if we're in live mode
  const isLiveMode = stripeSecretKey!.startsWith('sk_live_');
  console.log(`Mode: ${isLiveMode ? 'LIVE (Production)' : 'TEST'}`);
  console.log('');

  if (isLiveMode) {
    console.log('WARNING: You are in LIVE mode. Products will be created in production.');
    console.log('Press Ctrl+C within 5 seconds to cancel...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Get all products from database
  const products = await prisma.subscriptionProduct.findMany({
    where: { isActive: true },
    orderBy: [
      { productType: 'asc' },
      { sortOrder: 'asc' },
    ],
  });

  console.log(`Found ${products.length} products in database\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of products) {
    console.log(`Processing: ${product.productCode} - ${product.nameJa || product.name}`);

    // Check if already has Stripe IDs
    if (product.stripeProductId && product.stripePriceMonthly) {
      console.log(`  -> Skipped (already has Stripe IDs)`);
      skipped++;
      continue;
    }

    try {
      // Create or get Stripe product
      let stripeProduct: Stripe.Product;

      if (product.stripeProductId) {
        // Already has product ID, retrieve it
        stripeProduct = await stripe.products.retrieve(product.stripeProductId);
        console.log(`  -> Using existing product: ${stripeProduct.id}`);
      } else {
        // Create new product
        stripeProduct = await stripe.products.create({
          name: product.nameJa || product.name,
          description: product.description || undefined,
          metadata: {
            productCode: product.productCode,
            productType: product.productType,
            category: product.category,
          },
        });
        console.log(`  -> Created product: ${stripeProduct.id}`);
      }

      // Create monthly price if needed
      let monthlyPriceId = product.stripePriceMonthly;
      if (!monthlyPriceId && product.priceMonthly) {
        const monthlyPrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(Number(product.priceMonthly)), // JPY is zero-decimal
          currency: 'jpy',
          recurring: {
            interval: 'month',
          },
          metadata: {
            productCode: product.productCode,
            billingCycle: 'monthly',
          },
        });
        monthlyPriceId = monthlyPrice.id;
        console.log(`  -> Created monthly price: ${monthlyPriceId} (¥${product.priceMonthly}/月)`);
      }

      // Create yearly price if needed
      let yearlyPriceId = product.stripePriceYearly;
      if (!yearlyPriceId && product.priceYearly) {
        const yearlyPrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(Number(product.priceYearly)), // JPY is zero-decimal
          currency: 'jpy',
          recurring: {
            interval: 'year',
          },
          metadata: {
            productCode: product.productCode,
            billingCycle: 'yearly',
          },
        });
        yearlyPriceId = yearlyPrice.id;
        console.log(`  -> Created yearly price: ${yearlyPriceId} (¥${product.priceYearly}/年)`);
      }

      // Update database
      await prisma.subscriptionProduct.update({
        where: { id: product.id },
        data: {
          stripeProductId: stripeProduct.id,
          stripePriceMonthly: monthlyPriceId,
          stripePriceYearly: yearlyPriceId,
        },
      });
      console.log(`  -> Database updated`);

      created++;
    } catch (error) {
      console.error(`  -> ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errors++;
    }

    console.log('');
  }

  console.log('='.repeat(60));
  console.log('Summary:');
  console.log(`  Created/Updated: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log('='.repeat(60));

  // Print webhook setup instructions
  console.log('\n');
  console.log('NEXT STEPS:');
  console.log('-'.repeat(60));
  console.log('1. Configure Webhook in Stripe Dashboard:');
  console.log('   URL: https://your-domain.com/api/stripe/webhook');
  console.log('   Events to listen for:');
  console.log('     - checkout.session.completed');
  console.log('     - customer.subscription.created');
  console.log('     - customer.subscription.updated');
  console.log('     - customer.subscription.deleted');
  console.log('     - customer.subscription.trial_will_end');
  console.log('     - invoice.paid');
  console.log('     - invoice.payment_failed');
  console.log('');
  console.log('2. Copy the Webhook Signing Secret and add to .env:');
  console.log('   STRIPE_WEBHOOK_SECRET=whsec_xxx');
  console.log('');
  console.log('3. Add Stripe keys to production .env:');
  console.log('   STRIPE_SECRET_KEY=sk_live_xxx');
  console.log('   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx');
  console.log('-'.repeat(60));
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
