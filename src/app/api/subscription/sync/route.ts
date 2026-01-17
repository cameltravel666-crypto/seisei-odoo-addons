/**
 * Subscription Sync API
 * Endpoint for cron job or manual subscription status sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  syncAllSubscriptions,
  syncSubscription,
  getExpiringTrials,
  getSubscriptionHealth,
} from '@/lib/subscription-service';
import { sendTrialExpirationWarnings } from '@/lib/notification-service';

// Secret for cron job authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST: Sync all subscriptions (cron job or admin)
 * Requires either cron secret header or admin session
 */
export async function POST(request: NextRequest) {
  try {
    // Check for cron secret
    const cronSecret = request.headers.get('x-cron-secret');
    const isCronRequest = cronSecret && cronSecret === CRON_SECRET;

    // If not cron, check for admin session
    if (!isCronRequest) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: session.userId },
      });

      if (!user?.isAdmin) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
          { status: 403 }
        );
      }
    }

    // Get action from request body
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'sync_all';

    switch (action) {
      case 'sync_all': {
        // Sync all subscriptions
        const result = await syncAllSubscriptions();
        return NextResponse.json({
          success: true,
          data: {
            action: 'sync_all',
            ...result,
            timestamp: new Date().toISOString(),
          },
        });
      }

      case 'sync_one': {
        // Sync a single subscription
        const { subscriptionId } = body;
        if (!subscriptionId) {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_INPUT', message: 'subscriptionId required' } },
            { status: 400 }
          );
        }

        const result = await syncSubscription(subscriptionId);
        return NextResponse.json({
          success: true,
          data: {
            action: 'sync_one',
            subscriptionId,
            ...result,
            timestamp: new Date().toISOString(),
          },
        });
      }

      case 'check_expiring_trials': {
        // Get trials expiring soon
        const daysAhead = body.daysAhead || 3;
        const expiringTrials = await getExpiringTrials(daysAhead);
        return NextResponse.json({
          success: true,
          data: {
            action: 'check_expiring_trials',
            daysAhead,
            count: expiringTrials.length,
            trials: expiringTrials,
            timestamp: new Date().toISOString(),
          },
        });
      }

      case 'send_trial_warnings': {
        // Send trial expiration warning emails (7, 3, 1 days)
        const result = await sendTrialExpirationWarnings();
        return NextResponse.json({
          success: true,
          data: {
            action: 'send_trial_warnings',
            emailsSent: result.sent,
            errors: result.errors,
            timestamp: new Date().toISOString(),
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Subscription Sync Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Sync failed' } },
      { status: 500 }
    );
  }
}

/**
 * GET: Get subscription health for current tenant
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const health = await getSubscriptionHealth(session.tenantId);

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('[Subscription Health Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to check health' } },
      { status: 500 }
    );
  }
}
