/**
 * Stripe Customer Portal API
 * Creates portal sessions for subscription management
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createPortalSession } from "@/lib/stripe";

// POST: Create a Stripe Customer Portal session
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

    // Check if tenant has a Stripe customer ID
    if (!user.tenant.stripeCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_CUSTOMER",
            message: "No Stripe customer found. Please subscribe first.",
          },
        },
        { status: 400 },
      );
    }

    // Build return URL
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "localhost:3000";
    const baseUrl = `${forwardedProto}://${host}`;
    const returnUrl = `${baseUrl}/settings/subscription`;

    // Create portal session
    const portalSession = await createPortalSession(
      user.tenant.stripeCustomerId,
      returnUrl,
    );

    return NextResponse.json({
      success: true,
      data: {
        url: portalSession.url,
      },
    });
  } catch (error) {
    console.error("[Stripe Portal Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create portal session",
        },
      },
      { status: 500 },
    );
  }
}
