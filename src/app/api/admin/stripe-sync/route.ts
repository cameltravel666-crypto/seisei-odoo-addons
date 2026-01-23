import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncProductToStripe } from '@/lib/stripe';
import { getSession } from '@/lib/auth';

/**
 * POST /api/admin/stripe-sync
 * Sync all subscription products to Stripe (admin only)
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session?.isAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    // Get all active products without Stripe price IDs
    const products = await prisma.subscriptionProduct.findMany({
      where: {
        isActive: true,
        priceMonthly: { gt: 0 }, // Only sync products with a price
        stripePriceMonthly: null, // Only sync products without Stripe price
      },
      orderBy: { sortOrder: 'asc' },
    });

    console.log(`[Stripe Sync] Found ${products.length} products to sync`);

    const results: Array<{
      productCode: string;
      success: boolean;
      stripeProductId?: string;
      stripePriceMonthly?: string;
      error?: string;
    }> = [];

    for (const product of products) {
      try {
        const stripeResult = await syncProductToStripe({
          productCode: product.productCode,
          name: product.name,
          nameJa: product.nameJa || product.name,
          description: product.descriptionJa || product.description || undefined,
          priceMonthly: Number(product.priceMonthly),
          priceYearly: product.priceYearly ? Number(product.priceYearly) : undefined,
        });

        // Update database with Stripe IDs
        await prisma.subscriptionProduct.update({
          where: { id: product.id },
          data: {
            stripeProductId: stripeResult.productId,
            stripePriceMonthly: stripeResult.monthlyPriceId,
            stripePriceYearly: stripeResult.yearlyPriceId,
          },
        });

        results.push({
          productCode: product.productCode,
          success: true,
          stripeProductId: stripeResult.productId,
          stripePriceMonthly: stripeResult.monthlyPriceId,
        });

        console.log(`[Stripe Sync] Synced ${product.productCode}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          productCode: product.productCode,
          success: false,
          error: errorMessage,
        });
        console.error(`[Stripe Sync] Failed to sync ${product.productCode}:`, error);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      data: {
        total: products.length,
        synced: successCount,
        failed: failCount,
        results,
      },
    });
  } catch (error) {
    console.error('[Stripe Sync Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Sync failed' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/stripe-sync
 * Get sync status
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.isAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const [total, synced, unsynced] = await Promise.all([
      prisma.subscriptionProduct.count({ where: { isActive: true } }),
      prisma.subscriptionProduct.count({ where: { isActive: true, stripePriceMonthly: { not: null } } }),
      prisma.subscriptionProduct.count({ where: { isActive: true, stripePriceMonthly: null, priceMonthly: { gt: 0 } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        synced,
        unsynced,
        complete: unsynced === 0,
      },
    });
  } catch (error) {
    console.error('[Stripe Sync Status Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get status' } },
      { status: 500 }
    );
  }
}
