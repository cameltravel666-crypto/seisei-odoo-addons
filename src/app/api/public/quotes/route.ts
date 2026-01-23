/**
 * Public Quote API - Create Quote & CRM Lead
 * POST /api/public/quotes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';
import crypto from 'crypto';

// Rate limiting
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(ip: string, limit: number = 10, window: number = 60000): boolean {
  const now = Date.now();
  const requests = rateLimiter.get(ip) || [];
  const recent = requests.filter(time => now - time < window);
  
  if (recent.length >= limit) return false;
  
  recent.push(now);
  rateLimiter.set(ip, recent);
  return true;
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] ||
         request.headers.get('x-real-ip') ||
         'unknown';
}

function generateShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

interface QuoteRequest {
  contact: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  };
  config: {
    storeCount: number;
    planId: string;
    modules: string[];
    posSeats: number;
    kdsScreens: number;
    printhubEnabled: boolean;
    printhubEndpoints: number;
    maintenancePlan: string;
    onboardingPackage: string;
    onboardingInstallments: number;
    hardwareConfig: Record<string, any>;
  };
  pricing: {
    softwareMonthly: number;
    softwareMonthlyOriginal: number;
    discountRate: number;
    hardwareMonthly: number;
    onboardingFee: number;
    onboardingMonthly: number;
    firstMonthTotal: number;
    recurringMonthly: number;
  };
  source: {
    url: string;
    utmSource?: string;
    utmCampaign?: string;
  };
}

function validateQuoteRequest(data: any): boolean {
  // Required fields
  if (!data.contact?.name || !data.contact?.email) return false;
  if (!data.config?.storeCount || data.config.storeCount < 1) return false;
  if (!data.config?.planId) return false;
  if (!data.pricing?.recurringMonthly) return false;
  
  // Email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.contact.email)) return false;
  
  // Store count range
  if (data.config.storeCount > 1000) return false;
  
  return true;
}

function formatQuoteDescription(body: QuoteRequest, shareToken: string): string {
  const planNames: Record<string, string> = {
    'starter': 'Starter',
    'professional': 'Professional',
    'enterprise': 'Enterprise',
  };

  return `
<h3>Quote Configuration</h3>
<ul>
  <li><strong>Plan:</strong> ${planNames[body.config.planId] || body.config.planId}</li>
  <li><strong>Store Count:</strong> ${body.config.storeCount}</li>
  <li><strong>POS Seats:</strong> ${body.config.posSeats}</li>
  <li><strong>KDS Screens:</strong> ${body.config.kdsScreens}</li>
  <li><strong>Modules:</strong> ${body.config.modules.join(', ')}</li>
  <li><strong>PrintHub:</strong> ${body.config.printhubEnabled ? `Yes (${body.config.printhubEndpoints} endpoints)` : 'No'}</li>
  <li><strong>Maintenance:</strong> ${body.config.maintenancePlan}</li>
  <li><strong>Onboarding:</strong> ${body.config.onboardingPackage} (${body.config.onboardingInstallments} installments)</li>
</ul>

<h3>Pricing</h3>
<ul>
  <li><strong>Software Monthly:</strong> ¥${body.pricing.softwareMonthly.toLocaleString()}</li>
  <li><strong>Hardware Monthly:</strong> ¥${body.pricing.hardwareMonthly.toLocaleString()}</li>
  <li><strong>Onboarding Fee:</strong> ¥${body.pricing.onboardingFee.toLocaleString()}</li>
  <li><strong>First Month Total:</strong> ¥${body.pricing.firstMonthTotal.toLocaleString()}</li>
  <li><strong>Recurring Monthly:</strong> ¥${body.pricing.recurringMonthly.toLocaleString()}</li>
  <li><strong>Discount:</strong> ${(body.pricing.discountRate * 100).toFixed(0)}%</li>
</ul>

<h3>Source</h3>
<ul>
  <li><strong>URL:</strong> ${body.source.url}</li>
  <li><strong>UTM Source:</strong> ${body.source.utmSource || '-'}</li>
  <li><strong>UTM Campaign:</strong> ${body.source.utmCampaign || '-'}</li>
</ul>

<h3>Share Token</h3>
<p>${shareToken}</p>

<h3>Raw Config (JSON)</h3>
<pre>${JSON.stringify({ config: body.config, pricing: body.pricing }, null, 2)}</pre>
`.trim();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    if (!checkRateLimit(ip, 10, 60000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Parse body
    const body: QuoteRequest = await request.json();

    // Validate
    if (!validateQuoteRequest(body)) {
      return NextResponse.json(
        { success: false, error: 'Invalid quote request data' },
        { status: 400 }
      );
    }

    // Create Odoo client for Odoo 19 CRM
    const odoo = createOdooClient({
      baseUrl: process.env.ODOO_CRM_URL || 'http://13.159.193.191:8069',
      db: process.env.ODOO_CRM_DB || 'ERP',
    });

    // Authenticate with Odoo 19
    await odoo.authenticate(
      process.env.ODOO_CRM_USER || 'admin',
      process.env.ODOO_CRM_PASSWORD || ''
    );

    // Generate share token
    const shareToken = generateShareToken();

    // Generate quote reference number
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    const quoteRef = `QR-${timestamp}-${random}`;

    // Prepare crm.lead data
    const leadVals = {
      name: `[Quote] ${body.contact.company || body.contact.name} - ${body.config.storeCount} stores`,
      contact_name: body.contact.name,
      email_from: body.contact.email,
      phone: body.contact.phone || '',
      partner_name: body.contact.company || '',

      // Expected revenue
      expected_revenue: body.pricing.recurringMonthly * 12, // Annual value

      // Description with all quote details
      description: formatQuoteDescription(body, shareToken),

      // Tags/source
      referred: body.source.utmSource || 'website',
    };

    // Create crm.lead in Odoo 19
    const leadId = await odoo.create('crm.lead', leadVals);

    const baseUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://seisei.tokyo';

    // Response
    const response = {
      success: true,
      data: {
        quoteId: quoteRef,
        leadId: leadId,
        shareToken: shareToken,
        shareUrl: `${baseUrl}/quote/${shareToken}`,
        pdfUrl: `/api/public/quotes/${quoteRef}/pdf`,
      },
    };

    console.log(`[Quote API] Created lead ${leadId} with quote ${quoteRef}`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('[Quote API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create quote request' },
      { status: 500 }
    );
  }
}
