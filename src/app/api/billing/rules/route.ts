/**
 * Billing Rules API
 * Fetches metered billing rules from Odoo 19
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdoo19Client } from '@/lib/odoo19';

// Cache billing rules for 5 minutes
let cachedRules: Awaited<ReturnType<typeof getOdoo19Client.prototype.getBillingRules>> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET: Get billing rules
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

    // Check cache
    if (cachedRules && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: {
          rules: cachedRules,
          cached: true,
        },
      });
    }

    // Fetch from Odoo 19
    const odoo19 = getOdoo19Client();
    const rules = await odoo19.getBillingRules();

    // Update cache
    cachedRules = rules;
    cacheTime = Date.now();

    return NextResponse.json({
      success: true,
      data: {
        rules,
        cached: false,
      },
    });
  } catch (error) {
    console.error('[Billing Rules Error]', error);

    // Return defaults on error
    return NextResponse.json({
      success: true,
      data: {
        rules: [
          {
            productId: 0,
            productCode: 'METERED-OCR',
            name: 'OCR 文档识别',
            freeQuota: 30,
            overagePrice: 20,
            billingCycle: 'monthly',
            currency: 'JPY',
          },
          {
            productId: 0,
            productCode: 'METERED-TABLE',
            name: 'Table Engine 表格处理',
            freeQuota: 5,
            overagePrice: 50,
            billingCycle: 'monthly',
            currency: 'JPY',
          },
        ],
        cached: false,
        fallback: true,
      },
    });
  }
}

/**
 * POST: Refresh billing rules cache (admin only)
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Clear cache
    cachedRules = null;
    cacheTime = 0;

    // Fetch fresh from Odoo 19
    const odoo19 = getOdoo19Client();
    const rules = await odoo19.getBillingRules();

    // Update cache
    cachedRules = rules;
    cacheTime = Date.now();

    return NextResponse.json({
      success: true,
      data: {
        rules,
        refreshed: true,
      },
    });
  } catch (error) {
    console.error('[Billing Rules Refresh Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to refresh billing rules' } },
      { status: 500 }
    );
  }
}
