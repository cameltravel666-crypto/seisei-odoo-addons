/**
 * Public Quote API - Download PDF
 * GET /api/public/quotes/:quoteId/pdf
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';
import { generateQuotePDF } from '@/lib/pdf-generator-quote';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  try {
    const { quoteId } = await params;

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

    // Search for quote by name or ID
    let domain: any[];
    if (quoteId.startsWith('Q-')) {
      domain = [['name', '=', quoteId]];
    } else {
      domain = [['id', '=', parseInt(quoteId)]];
    }

    const quotes = await odoo.searchRead<any>('quote.request', domain, {
      fields: [
        'name', 'contact_name', 'email', 'phone', 'company',
        'store_count', 'plan_id', 'modules',
        'pos_seats', 'kds_screens', 'printhub_enabled', 'printhub_endpoints',
        'maintenance_plan', 'onboarding_package', 'onboarding_installments',
        'hardware_config',
        'software_monthly', 'software_monthly_original', 'discount_rate',
        'hardware_monthly', 'onboarding_fee', 'onboarding_monthly',
        'first_month_total', 'recurring_monthly',
        'create_date',
      ],
      limit: 1,
    });

    if (quotes.length === 0) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    const quote = quotes[0];

    // Mark as downloaded
    await odoo.callKw('quote.request', 'action_mark_downloaded', [[quote.id]]);

    // Parse modules and hardware config
    let modules = [];
    let hardwareConfig = {};
    try {
      modules = JSON.parse(quote.modules || '[]');
      hardwareConfig = JSON.parse(quote.hardware_config || '{}');
    } catch (e) {
      console.error('Error parsing JSON fields:', e);
    }

    // Generate PDF
    const pdfBuffer = await generateQuotePDF({
      quoteId: quote.name,
      contact: {
        name: quote.contact_name,
        email: quote.email,
        phone: quote.phone,
        company: quote.company,
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
    });

    // Return PDF (convert Buffer to Uint8Array)
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Seisei-Quote-${quote.name}.pdf"`,
      },
    });

  } catch (error) {
    console.error('[Quote PDF] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
