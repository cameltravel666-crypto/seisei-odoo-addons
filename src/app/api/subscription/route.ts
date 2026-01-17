import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { combinedGuard } from '@/lib/guards';
import { odoo19 } from '@/lib/odoo19';
import { Prisma } from '@prisma/client';

// GET current subscription info (with items)
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Get tenant with subscription info
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 }
      );
    }

    // Get active subscription with items
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: {
        items: {
          where: { status: { in: ['TRIAL', 'ACTIVE'] } },
          include: {
            product: true,
          },
          orderBy: [
            { product: { productType: 'asc' } },
            { product: { sortOrder: 'asc' } },
          ],
        },
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 10,
        },
      },
    });

    // Get tenant features
    const features = await prisma.tenantFeature.findMany({
      where: { tenantId: session.tenantId },
    });

    // Calculate enabled modules from subscription items
    const enabledModules = new Set<string>();
    if (subscription?.items) {
      for (const item of subscription.items) {
        // Add modules from base plan
        if (item.product.includedModules) {
          item.product.includedModules.forEach((m) => enabledModules.add(m));
        }
        // Add module enabled by this product
        if (item.product.enablesModule) {
          enabledModules.add(item.product.enablesModule);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          tenantCode: tenant.tenantCode,
          name: tenant.name,
          planCode: tenant.planCode,
          odoo19PartnerId: tenant.odoo19PartnerId,
        },
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              startDate: subscription.startDate.toISOString(),
              nextBillingDate: subscription.nextBillingDate.toISOString(),
              endDate: subscription.endDate?.toISOString(),
              totalAmount: Number(subscription.totalAmount),
              currency: subscription.currency,
              billingCycle: subscription.billingCycle,
              isInTrial: subscription.isInTrial,
              trialEndDate: subscription.trialEndDate?.toISOString(),
              autoRenew: subscription.autoRenew,
              items: subscription.items.map((item) => ({
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
              })),
              invoices: subscription.invoices.map((inv) => ({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                amount: Number(inv.amount),
                status: inv.status,
                issueDate: inv.issueDate.toISOString(),
                dueDate: inv.dueDate.toISOString(),
                paidDate: inv.paidDate?.toISOString(),
              })),
            }
          : null,
        features: features.map((f) => ({
          moduleCode: f.moduleCode,
          isAllowed: f.isAllowed,
          isVisible: f.isVisible,
        })),
        enabledModules: Array.from(enabledModules),
      },
    });
  } catch (error) {
    console.error('[Subscription Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch subscription' } },
      { status: 500 }
    );
  }
}

// POST create new subscription with selected products
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check for BILLING_ADMIN role (subscription management is owner-only)
    const guard = await combinedGuard(session.tenantId, session.userId, {
      minRole: 'BILLING_ADMIN',
    });

    if (!guard.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Billing admin access required for subscription management' } },
        { status: 403 }
      );
    }

    const { products, startTrial = true, billingCycle = 'MONTHLY' } = await request.json();

    // Validate products array
    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'At least one product is required' } },
        { status: 400 }
      );
    }

    // Validate that at least one BASE_PLAN is selected
    const productRecords = await prisma.subscriptionProduct.findMany({
      where: {
        id: { in: products.map((p: { productId: string }) => p.productId) },
        isActive: true,
      },
    });

    const basePlan = productRecords.find((p) => p.productType === 'BASE_PLAN');
    if (!basePlan) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'A base plan is required' } },
        { status: 400 }
      );
    }

    // Get tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 }
      );
    }

    // Check for existing active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { success: false, error: { code: 'SUBSCRIPTION_EXISTS', message: 'Active subscription already exists. Use PUT to modify.' } },
        { status: 400 }
      );
    }

    // Calculate total amount
    let totalAmount = new Prisma.Decimal(0);
    const itemsData: Array<{
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      status: 'TRIAL' | 'ACTIVE';
      startDate: Date;
      odoo19LineId?: number;
    }> = [];

    for (const p of products as Array<{ productId: string; quantity?: number }>) {
      const product = productRecords.find((pr) => pr.id === p.productId);
      if (!product) continue;

      const quantity = p.quantity || 1;
      const unitPrice = billingCycle === 'YEARLY' && product.priceYearly
        ? product.priceYearly
        : product.priceMonthly;

      totalAmount = totalAmount.add(unitPrice.mul(quantity));
      itemsData.push({
        productId: product.id,
        quantity,
        unitPrice,
        status: startTrial ? 'TRIAL' : 'ACTIVE',
        startDate: new Date(),
      });
    }

    // Calculate dates
    const startDate = new Date();
    const trialDays = startTrial ? basePlan.trialDays : 0;
    const trialEndDate = startTrial && trialDays > 0
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    // Next billing date depends on billing cycle
    const cycleDays = billingCycle === 'YEARLY' ? 365 : billingCycle === 'QUARTERLY' ? 90 : 30;
    const nextBillingDate = trialEndDate || new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000);

    // Create partner in Odoo 19 (if configured)
    let odoo19PartnerId: number | null = tenant.odoo19PartnerId || null;
    let odoo19OrderId: number | null = null;

    if (process.env.ODOO19_URL && process.env.ODOO19_PASSWORD) {
      try {
        // Create or get partner
        odoo19PartnerId = await odoo19.createOrGetPartner({
          name: tenant.name,
        });

        // Update tenant with Odoo 19 partner ID
        if (odoo19PartnerId && !tenant.odoo19PartnerId) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { odoo19PartnerId },
          });
        }

        // Create subscription order in Odoo 19 with multiple products
        const orderLines = productRecords
          .filter((p) => p.odoo19ProductId)
          .map((p) => {
            const item = products.find((ip: { productId: string }) => ip.productId === p.id);
            return [
              0,
              0,
              {
                product_id: p.odoo19ProductId,
                product_uom_qty: item?.quantity || 1,
              },
            ];
          });

        if (orderLines.length > 0) {
          odoo19OrderId = await odoo19.create('sale.order', {
            partner_id: odoo19PartnerId,
            date_order: startDate.toISOString().split('T')[0],
            state: 'draft',
            order_line: orderLines,
          });

          // Confirm the order
          if (odoo19OrderId) {
            await odoo19.callKw('sale.order', 'action_confirm', [[odoo19OrderId]]);
          }
        }
      } catch (odooError) {
        console.error('[Subscription] Odoo 19 sync error:', odooError);
        // Continue without Odoo 19 integration
      }
    }

    // Create subscription with items in a transaction
    const subscription = await prisma.$transaction(async (tx) => {
      // Create subscription
      const sub = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          odoo19OrderId,
          odoo19PartnerId,
          status: startTrial ? 'TRIAL' : 'ACTIVE',
          startDate,
          nextBillingDate,
          trialEndDate,
          isInTrial: startTrial,
          billingCycle: billingCycle as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
          totalAmount,
          currency: 'JPY',
          autoRenew: true,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      // Update tenant features based on subscribed products
      const enabledModules = new Set<string>();
      for (const item of sub.items) {
        if (item.product.includedModules) {
          item.product.includedModules.forEach((m) => enabledModules.add(m));
        }
        if (item.product.enablesModule) {
          enabledModules.add(item.product.enablesModule);
        }
      }

      // Clear existing features and create new ones
      await tx.tenantFeature.deleteMany({
        where: { tenantId: tenant.id },
      });

      if (enabledModules.size > 0) {
        await tx.tenantFeature.createMany({
          data: Array.from(enabledModules).map((moduleCode) => ({
            tenantId: tenant.id,
            moduleCode: moduleCode as 'POS' | 'INVENTORY' | 'PURCHASE' | 'SALES' | 'CRM' | 'EXPENSES' | 'ACCOUNTING' | 'FINANCE' | 'APPROVALS' | 'HR' | 'MAINTENANCE' | 'DOCUMENTS' | 'DASHBOARD' | 'PRODUCTS' | 'CONTACTS',
            isAllowed: true,
            isVisible: true,
          })),
        });
      }

      // Update tenant plan code to base plan code
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { planCode: basePlan.productCode },
      });

      return sub;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate.toISOString(),
        nextBillingDate: subscription.nextBillingDate.toISOString(),
        totalAmount: Number(subscription.totalAmount),
        currency: subscription.currency,
        billingCycle: subscription.billingCycle,
        isInTrial: subscription.isInTrial,
        trialEndDate: subscription.trialEndDate?.toISOString(),
        itemCount: subscription.items.length,
      },
    });
  } catch (error) {
    console.error('[Create Subscription Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create subscription' } },
      { status: 500 }
    );
  }
}

// PUT update subscription (add/remove products)
export async function PUT(request: NextRequest) {
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

    const { action, productId, quantity = 1 } = await request.json();

    // Get existing subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: {
        items: {
          include: { product: true },
        },
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

    if (action === 'add') {
      // Check if product already in subscription
      const existingItem = subscription.items.find((i) => i.productId === productId);
      if (existingItem) {
        // Update quantity
        await prisma.subscriptionItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + quantity },
        });
      } else {
        // Add new item
        await prisma.subscriptionItem.create({
          data: {
            subscriptionId: subscription.id,
            productId,
            quantity,
            unitPrice: product.priceMonthly,
            status: subscription.status,
            startDate: new Date(),
          },
        });
      }
    } else if (action === 'remove') {
      // Cannot remove base plan
      if (product.productType === 'BASE_PLAN') {
        const basePlansCount = subscription.items.filter(
          (i) => i.product.productType === 'BASE_PLAN' && i.status !== 'CANCELLED'
        ).length;
        if (basePlansCount <= 1) {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_ACTION', message: 'Cannot remove the only base plan' } },
            { status: 400 }
          );
        }
      }

      // Find and cancel item
      const itemToRemove = subscription.items.find((i) => i.productId === productId);
      if (itemToRemove) {
        await prisma.subscriptionItem.update({
          where: { id: itemToRemove.id },
          data: {
            status: 'CANCELLED',
            endDate: new Date(),
          },
        });
      }
    } else if (action === 'update_quantity') {
      const itemToUpdate = subscription.items.find((i) => i.productId === productId);
      if (itemToUpdate) {
        await prisma.subscriptionItem.update({
          where: { id: itemToUpdate.id },
          data: { quantity },
        });
      }
    }

    // Recalculate total amount
    const updatedItems = await prisma.subscriptionItem.findMany({
      where: {
        subscriptionId: subscription.id,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: { product: true },
    });

    let newTotal = new Prisma.Decimal(0);
    for (const item of updatedItems) {
      newTotal = newTotal.add(item.unitPrice.mul(item.quantity));
    }

    // Update subscription total
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { totalAmount: newTotal },
    });

    // Update tenant features
    const enabledModules = new Set<string>();
    for (const item of updatedItems) {
      if (item.product.includedModules) {
        item.product.includedModules.forEach((m) => enabledModules.add(m));
      }
      if (item.product.enablesModule) {
        enabledModules.add(item.product.enablesModule);
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
        subscriptionId: subscription.id,
        totalAmount: Number(newTotal),
        itemCount: updatedItems.length,
        enabledModules: Array.from(enabledModules),
      },
    });
  } catch (error) {
    console.error('[Update Subscription Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update subscription' } },
      { status: 500 }
    );
  }
}
