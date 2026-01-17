import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET all subscription products (grouped by category)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const productType = searchParams.get('type');

    // Build where clause
    const where: Record<string, unknown> = { isActive: true };
    if (category) {
      where.category = category;
    }
    if (productType) {
      where.productType = productType;
    }

    const products = await prisma.subscriptionProduct.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' },
        { priceMonthly: 'asc' },
      ],
    });

    // Group by category for easier frontend consumption
    const grouped = products.reduce((acc, product) => {
      const cat = product.category;
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push({
        id: product.id,
        productCode: product.productCode,
        name: product.name,
        nameZh: product.nameZh,
        nameJa: product.nameJa,
        description: product.description,
        descriptionZh: product.descriptionZh,
        descriptionJa: product.descriptionJa,
        productType: product.productType,
        category: product.category,
        priceMonthly: Number(product.priceMonthly),
        priceYearly: product.priceYearly ? Number(product.priceYearly) : null,
        includedModules: product.includedModules,
        enablesModule: product.enablesModule,
        maxUsers: product.maxUsers,
        maxTerminals: product.maxTerminals,
        trialDays: product.trialDays,
        odoo19ProductId: product.odoo19ProductId,
      });
      return acc;
    }, {} as Record<string, unknown[]>);

    return NextResponse.json({
      success: true,
      data: {
        products,
        grouped,
        categories: Object.keys(grouped),
      },
    });
  } catch (error) {
    console.error('[Subscription Products Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch products' } },
      { status: 500 }
    );
  }
}
