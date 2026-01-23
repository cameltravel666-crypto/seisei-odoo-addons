/**
 * Public Quote API - Access Shared Quote
 * GET /api/public/quotes/token/:shareToken
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] ||
         request.headers.get('x-real-ip') ||
         'unknown';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  try {
    const { shareToken } = await params;

    // Create Odoo client for Odoo 19
    const odoo = createOdooClient({
      baseUrl: process.env.ODOO_CRM_URL || 'http://13.159.193.191:8069',
      db: process.env.ODOO_CRM_DB || 'ERP',
    });

    // Authenticate
    await odoo.authenticate(
      process.env.ODOO_CRM_USER || 'admin',
      process.env.ODOO_CRM_PASSWORD || ''
    );

    // Search for quote by share_token
    const quotes = await odoo.searchRead<any>('quote.request', [['share_token', '=', shareToken]], {
      fields: [
        'name', 'contact_name', 'company',
        // Don't return email and phone for privacy
        'store_count', 'plan_id', 'modules',
        'pos_seats', 'kds_screens', 'printhub_enabled', 'printhub_endpoints',
        'maintenance_plan', 'onboarding_package', 'onboarding_installments',
        'hardware_config',
        'software_monthly', 'software_monthly_original', 'discount_rate',
        'hardware_monthly', 'onboarding_fee', 'onboarding_monthly',
        'first_month_total', 'recurring_monthly',
        'create_date', 'shared_at',
      ],
      limit: 1,
    });

    if (quotes.length === 0) {
      return NextResponse.json(
        { error: 'Quote not found or expired' },
        { status: 404 }
      );
    }

    const quote = quotes[0];

    // Mark as viewed
    const ip = getClientIp(request);
    await odoo.callKw('quote.request', 'action_mark_viewed', [[quote.id]], {
      ip_address: ip,
    });

    // Parse modules and hardware config
    let modules = [];
    let hardwareConfig = {};
    try {
      modules = JSON.parse(quote.modules || '[]');
      hardwareConfig = JSON.parse(quote.hardware_config || '{}');
    } catch (e) {
      console.error('Error parsing JSON fields:', e);
    }

    // Calculate expiry (30 days from shared_at or create_date)
    const sharedDate = quote.shared_at || quote.create_date;
    const expiresAt = new Date(sharedDate);
    expiresAt.setDate(expiresAt.getDate() + 30);

    return NextResponse.json({
      success: true,
      data: {
        quoteId: quote.name,
        contact: {
          name: quote.contact_name,
          company: quote.company,
          // Email and phone are intentionally omitted for privacy
        },
        config: {
          storeCount: quote.store_count,
          planId: quote.plan_id,
          modules,
          posSeats: quote.pos_seats,
          kdsScreens: quote.kds_screens,
          printhubEnabled: quote.printhub_enabled,
          printhubEndpoints: quote.printhub_endpoints,
          maintenancePlan: quote.maintenance_plan,
          onboardingPackage: quote.onboarding_package,
          onboardingInstallments: quote.onboarding_installments,
          hardwareConfig,
        },
        pricing: {
          softwareMonthly: quote.software_monthly,
          softwareMonthlyOriginal: quote.software_monthly_original,
          discountRate: quote.discount_rate,
          hardwareMonthly: quote.hardware_monthly,
          onboardingFee: quote.onboarding_fee,
          onboardingMonthly: quote.onboarding_monthly,
          firstMonthTotal: quote.first_month_total,
          recurringMonthly: quote.recurring_monthly,
        },
        createdAt: quote.create_date,
        expiresAt: expiresAt.toISOString(),
      },
    });

  } catch (error) {
    console.error('[Quote Token] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}
