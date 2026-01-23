#!/usr/bin/env node
/**
 * Stripe Product Sync Script
 * Run this script to sync all subscription products to Stripe
 *
 * Usage: node scripts/stripe-sync.mjs
 */

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('Error: STRIPE_SECRET_KEY is not configured');
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { typescript: true });

  console.log('[Stripe Sync] Starting product sync...');

  // Get all active products without Stripe price IDs
  const products = await prisma.subscriptionProduct.findMany({
    where: {
      isActive: true,
      priceMonthly: { gt: 0 },
      stripePriceMonthly: null,
    },
    orderBy: { sortOrder: 'asc' },
  });

  console.log(`[Stripe Sync] Found ${products.length} products to sync`);

  if (products.length === 0) {
    console.log('[Stripe Sync] All products are already synced!');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const product of products) {
    try {
      console.log(`[Stripe Sync] Syncing ${product.productCode}...`);

      // Create Stripe product
      const stripeProduct = await stripe.products.create({
        name: product.nameJa || product.name,
        description: product.descriptionJa || product.description || undefined,
        metadata: {
          productCode: product.productCode,
        },
      });

      // Create monthly price
      const monthlyPrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: Math.round(Number(product.priceMonthly)), // JPY doesn't use cents
        currency: 'jpy',
        recurring: {
          interval: 'month',
        },
        metadata: {
          productCode: product.productCode,
          interval: 'monthly',
        },
      });

      let yearlyPriceId = null;

      // Create yearly price if available
      if (product.priceYearly && Number(product.priceYearly) > 0) {
        const yearlyPrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(Number(product.priceYearly)),
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

      // Update database with Stripe IDs
      await prisma.subscriptionProduct.update({
        where: { id: product.id },
        data: {
          stripeProductId: stripeProduct.id,
          stripePriceMonthly: monthlyPrice.id,
          stripePriceYearly: yearlyPriceId,
        },
      });

      console.log(`[Stripe Sync] ✓ Synced ${product.productCode}`);
      console.log(`  - Product ID: ${stripeProduct.id}`);
      console.log(`  - Monthly Price ID: ${monthlyPrice.id}`);
      if (yearlyPriceId) {
        console.log(`  - Yearly Price ID: ${yearlyPriceId}`);
      }

      successCount++;
    } catch (error) {
      console.error(`[Stripe Sync] ✗ Failed to sync ${product.productCode}:`, error.message);
      failCount++;
    }
  }

  console.log('\n[Stripe Sync] Sync complete!');
  console.log(`  Total: ${products.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
