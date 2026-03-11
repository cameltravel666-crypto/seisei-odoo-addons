/**
 * Stripe Checkout Session API
 * Creates checkout sessions for subscription purchases
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  stripe,
  getOrCreateStripeCustomer,
  createCheckoutSession,
} from "@/lib/stripe";

// POST: Create a Stripe Checkout Session
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        },
        { status: 401 },
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { tenant: true },
    });

    if (!user?.isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Admin access required" },
        },
        { status: 403 },
      );
    }

    const { products, billingCycle = "monthly" } = await request.json();

    // Validate products array
    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "At least one product is required",
          },
        },
        { status: 400 },
      );
    }

    // Get subscription products with Stripe price IDs
    const productRecords = await prisma.subscriptionProduct.findMany({
      where: {
        productCode: {
          in: products.map((p: { productCode: string }) => p.productCode),
        },
        isActive: true,
      },
    });

    // Validate that we have Stripe price IDs
    const priceIds: Array<{ priceId: string; quantity: number }> = [];
    for (const p of products as Array<{
      productCode: string;
      quantity?: number;
    }>) {
      const product = productRecords.find(
        (pr) => pr.productCode === p.productCode,
      );
      if (!product) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_PRODUCT",
              message: `Product not found: ${p.productCode}`,
            },
          },
          { status: 400 },
        );
      }

      const priceId =
        billingCycle === "yearly"
          ? product.stripePriceYearly
          : product.stripePriceMonthly;
      if (!priceId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "STRIPE_NOT_CONFIGURED",
              message: `Stripe price not configured for: ${p.productCode}`,
            },
          },
          { status: 400 },
        );
      }

      priceIds.push({ priceId, quantity: p.quantity || 1 });
    }

    // Validate that at least one BASE_PLAN is selected
    const hasBasePlan = productRecords.some(
      (p) => p.productType === "BASE_PLAN",
    );
    if (!hasBasePlan) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: "A base plan is required" },
        },
        { status: 400 },
      );
    }

    // Get or create Stripe customer
    const billingEmail =
      user.tenant.billingEmail || `${user.tenant.tenantCode}@seisei.tokyo`;
    let stripeCustomerId = user.tenant.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await getOrCreateStripeCustomer(
        user.tenant.id,
        billingEmail,
        user.tenant.name,
        {
          tenantCode: user.tenant.tenantCode,
        },
      );
      stripeCustomerId = customer.id;

      // Save customer ID to tenant
      await prisma.tenant.update({
        where: { id: user.tenant.id },
        data: { stripeCustomerId },
      });
    }

    // Calculate trial days (from the base plan)
    const basePlan = productRecords.find((p) => p.productType === "BASE_PLAN");
    const trialDays = basePlan?.trialDays || 0;

    // Build success and cancel URLs
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "localhost:3000";
    const baseUrl = `${forwardedProto}://${host}`;
    const successUrl = `${baseUrl}/settings/subscription?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/settings/subscription?cancelled=true`;

    // Create checkout session
    const checkoutSession = await createCheckoutSession({
      customerId: stripeCustomerId,
      priceIds,
      successUrl,
      cancelUrl,
      trialDays,
      metadata: {
        tenantId: user.tenant.id,
        tenantCode: user.tenant.tenantCode,
        billingCycle,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
      },
    });
  } catch (error) {
    console.error("[Stripe Checkout Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create checkout session",
        },
      },
      { status: 500 },
    );
  }
}

// GET: Retrieve checkout session status (for success page)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: "session_id is required" },
        },
        { status: 400 },
      );
    }

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items.data.price.product"],
    });

    // Verify this session belongs to the current tenant
    if (checkoutSession.metadata?.tenantId !== session.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Session does not belong to this tenant",
          },
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        status: checkoutSession.status,
        paymentStatus: checkoutSession.payment_status,
        subscriptionId:
          typeof checkoutSession.subscription === "string"
            ? checkoutSession.subscription
            : checkoutSession.subscription?.id,
        customerEmail: checkoutSession.customer_email,
        amountTotal: checkoutSession.amount_total,
        currency: checkoutSession.currency,
      },
    });
  } catch (error) {
    console.error("[Stripe Session Retrieve Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve session",
        },
      },
      { status: 500 },
    );
  }
}
