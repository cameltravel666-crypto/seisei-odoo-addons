import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET available subscription plans
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: plans.map((plan) => ({
        id: plan.id,
        planCode: plan.planCode,
        name: plan.name,
        allowedModules: plan.allowedModules,
        maxUsers: plan.maxUsers,
        priceMonthly: Number(plan.priceMonthly),
      })),
    });
  } catch (error) {
    console.error('[Subscription Plans Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch plans' } },
      { status: 500 }
    );
  }
}
