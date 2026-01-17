import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

// GET subscription items for current tenant
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
    });

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: { items: [], totalAmount: 0 },
      });
    }

    const items = await prisma.subscriptionItem.findMany({
      where: {
        subscriptionId: subscription.id,
      },
      include: {
        product: true,
      },
      orderBy: [
        { product: { productType: 'asc' } },
        { product: { sortOrder: 'asc' } },
      ],
    });

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productCode: item.product.productCode,
          productName: item.product.name,
          productNameZh: item.product.nameZh,
          productNameJa: item.product.nameJa,
          productType: item.product.productType,
          category: item.product.category,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.unitPrice) * item.quantity,
          status: item.status,
          startDate: item.startDate.toISOString(),
          endDate: item.endDate?.toISOString(),
          odoo19LineId: item.odoo19LineId,
        })),
        totalAmount: Number(subscription.totalAmount),
      },
    });
  } catch (error) {
    console.error('[Subscription Items Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch subscription items' } },
      { status: 500 }
    );
  }
}

// POST add a product to subscription
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const { productId, quantity = 1 } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'productId is required' } },
        { status: 400 }
      );
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: {
        items: true,
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'No active subscription found' } },
        { status: 404 }
      );
    }

    // Validate product
    const product = await prisma.subscriptionProduct.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_PRODUCT', message: 'Invalid or inactive product' } },
        { status: 400 }
      );
    }

    // Check if product already exists in subscription
    const existingItem = subscription.items.find((i) => i.productId === productId);

    let item;
    if (existingItem) {
      // Update quantity if already exists
      item = await prisma.subscriptionItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
          status: 'ACTIVE',
          endDate: null,
        },
        include: { product: true },
      });
    } else {
      // Create new item
      item = await prisma.subscriptionItem.create({
        data: {
          subscriptionId: subscription.id,
          productId,
          quantity,
          unitPrice: product.priceMonthly,
          status: subscription.status,
          startDate: new Date(),
        },
        include: { product: true },
      });
    }

    // Recalculate total amount
    const allItems = await prisma.subscriptionItem.findMany({
      where: {
        subscriptionId: subscription.id,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
    });

    let newTotal = new Prisma.Decimal(0);
    for (const i of allItems) {
      newTotal = newTotal.add(i.unitPrice.mul(i.quantity));
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { totalAmount: newTotal },
    });

    // Update tenant features if product enables a module
    if (product.enablesModule || product.includedModules.length > 0) {
      const modulesToAdd = new Set<string>();
      if (product.enablesModule) modulesToAdd.add(product.enablesModule);
      product.includedModules.forEach((m) => modulesToAdd.add(m));

      for (const moduleCode of modulesToAdd) {
        await prisma.tenantFeature.upsert({
          where: {
            tenantId_moduleCode: {
              tenantId: session.tenantId,
              moduleCode: moduleCode as 'POS' | 'INVENTORY' | 'PURCHASE' | 'SALES' | 'CRM' | 'EXPENSES' | 'ACCOUNTING' | 'FINANCE' | 'APPROVALS' | 'HR' | 'MAINTENANCE' | 'DOCUMENTS' | 'DASHBOARD' | 'PRODUCTS' | 'CONTACTS',
            },
          },
          create: {
            tenantId: session.tenantId,
            moduleCode: moduleCode as 'POS' | 'INVENTORY' | 'PURCHASE' | 'SALES' | 'CRM' | 'EXPENSES' | 'ACCOUNTING' | 'FINANCE' | 'APPROVALS' | 'HR' | 'MAINTENANCE' | 'DOCUMENTS' | 'DASHBOARD' | 'PRODUCTS' | 'CONTACTS',
            isAllowed: true,
            isVisible: true,
          },
          update: {
            isAllowed: true,
            isVisible: true,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        item: {
          id: item.id,
          productId: item.productId,
          productCode: item.product.productCode,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.unitPrice) * item.quantity,
          status: item.status,
        },
        newTotal: Number(newTotal),
      },
    });
  } catch (error) {
    console.error('[Add Subscription Item Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add subscription item' } },
      { status: 500 }
    );
  }
}

// DELETE remove a product from subscription
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'itemId is required' } },
        { status: 400 }
      );
    }

    // Get the item
    const item = await prisma.subscriptionItem.findUnique({
      where: { id: itemId },
      include: {
        product: true,
        subscription: true,
      },
    });

    if (!item || item.subscription.tenantId !== session.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } },
        { status: 404 }
      );
    }

    // Cannot remove base plan if it's the only one
    if (item.product.productType === 'BASE_PLAN') {
      const basePlansCount = await prisma.subscriptionItem.count({
        where: {
          subscriptionId: item.subscriptionId,
          product: { productType: 'BASE_PLAN' },
          status: { in: ['TRIAL', 'ACTIVE'] },
        },
      });

      if (basePlansCount <= 1) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_ACTION', message: 'Cannot remove the only base plan' } },
          { status: 400 }
        );
      }
    }

    // Mark item as cancelled
    await prisma.subscriptionItem.update({
      where: { id: itemId },
      data: {
        status: 'CANCELLED',
        endDate: new Date(),
      },
    });

    // Recalculate total amount
    const remainingItems = await prisma.subscriptionItem.findMany({
      where: {
        subscriptionId: item.subscriptionId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: { product: true },
    });

    let newTotal = new Prisma.Decimal(0);
    for (const i of remainingItems) {
      newTotal = newTotal.add(i.unitPrice.mul(i.quantity));
    }

    await prisma.subscription.update({
      where: { id: item.subscriptionId },
      data: { totalAmount: newTotal },
    });

    // Rebuild tenant features based on remaining items
    const enabledModules = new Set<string>();
    for (const i of remainingItems) {
      if (i.product.includedModules) {
        i.product.includedModules.forEach((m) => enabledModules.add(m));
      }
      if (i.product.enablesModule) {
        enabledModules.add(i.product.enablesModule);
      }
    }

    await prisma.tenantFeature.deleteMany({
      where: { tenantId: session.tenantId },
    });

    if (enabledModules.size > 0) {
      await prisma.tenantFeature.createMany({
        data: Array.from(enabledModules).map((moduleCode) => ({
          tenantId: session.tenantId,
          moduleCode: moduleCode as 'POS' | 'INVENTORY' | 'PURCHASE' | 'SALES' | 'CRM' | 'EXPENSES' | 'ACCOUNTING' | 'FINANCE' | 'APPROVALS' | 'HR' | 'MAINTENANCE' | 'DOCUMENTS' | 'DASHBOARD' | 'PRODUCTS' | 'CONTACTS',
          isAllowed: true,
          isVisible: true,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        removedItemId: itemId,
        newTotal: Number(newTotal),
        remainingItemCount: remainingItems.length,
      },
    });
  } catch (error) {
    console.error('[Remove Subscription Item Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove subscription item' } },
      { status: 500 }
    );
  }
}
