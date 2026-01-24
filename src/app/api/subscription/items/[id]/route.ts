import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { syncSubscriptionItemUpdateToOdoo, syncSubscriptionItemRemovalToOdoo } from '@/lib/odoo-sync';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single subscription item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const item = await prisma.subscriptionItem.findUnique({
      where: { id },
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

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('[Get Subscription Item Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch subscription item' } },
      { status: 500 }
    );
  }
}

// PUT update subscription item (quantity)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    const { quantity } = await request.json();

    if (typeof quantity !== 'number' || quantity < 1) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'quantity must be a positive number' } },
        { status: 400 }
      );
    }

    // Get the item
    const item = await prisma.subscriptionItem.findUnique({
      where: { id },
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

    // Update item quantity
    const updatedItem = await prisma.subscriptionItem.update({
      where: { id },
      data: { quantity },
      include: { product: true },
    });

    // Recalculate subscription total
    const allItems = await prisma.subscriptionItem.findMany({
      where: {
        subscriptionId: item.subscriptionId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
    });

    let newTotal = new Prisma.Decimal(0);
    for (const i of allItems) {
      newTotal = newTotal.add(i.unitPrice.mul(i.quantity));
    }

    await prisma.subscription.update({
      where: { id: item.subscriptionId },
      data: { totalAmount: newTotal },
    });

    // Sync quantity change to Odoo 19 (fire and forget)
    syncSubscriptionItemUpdateToOdoo({
      subscriptionId: item.subscriptionId,
      productId: item.productId,
      quantity,
    }).catch((err) => {
      console.error('[Update Subscription Item] Odoo sync failed:', err);
    });

    return NextResponse.json({
      success: true,
      data: {
        item: {
          id: updatedItem.id,
          productId: updatedItem.productId,
          productCode: updatedItem.product.productCode,
          productName: updatedItem.product.name,
          quantity: updatedItem.quantity,
          unitPrice: Number(updatedItem.unitPrice),
          subtotal: Number(updatedItem.unitPrice) * updatedItem.quantity,
          status: updatedItem.status,
        },
        newTotal: Number(newTotal),
      },
    });
  } catch (error) {
    console.error('[Update Subscription Item Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update subscription item' } },
      { status: 500 }
    );
  }
}

// DELETE (cancel) subscription item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    // Get the item
    const item = await prisma.subscriptionItem.findUnique({
      where: { id },
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

    // Store product info for Odoo sync before marking as cancelled
    const odoo19ProductId = item.product.odoo19ProductId;
    const subscriptionId = item.subscriptionId;

    // Mark item as cancelled
    await prisma.subscriptionItem.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        endDate: new Date(),
      },
    });

    // Sync removal to Odoo 19 (fire and forget)
    if (odoo19ProductId) {
      syncSubscriptionItemRemovalToOdoo({
        subscriptionId,
        odoo19ProductId,
      }).catch((err) => {
        console.error('[Delete Subscription Item] Odoo sync failed:', err);
      });
    }

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

    // Rebuild tenant features
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
        removedItemId: id,
        newTotal: Number(newTotal),
        remainingItemCount: remainingItems.length,
        enabledModules: Array.from(enabledModules),
      },
    });
  } catch (error) {
    console.error('[Delete Subscription Item Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete subscription item' } },
      { status: 500 }
    );
  }
}
