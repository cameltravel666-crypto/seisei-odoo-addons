/**
 * Public Quote API - Generate Share Link
 * POST /api/public/quotes/:quoteId/share
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOdooClient } from '@/lib/odoo';

export async function POST(
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

    // Search for quote
    let domain: any[];
    if (quoteId.startsWith('Q-')) {
      domain = [['name', '=', quoteId]];
    } else {
      domain = [['id', '=', parseInt(quoteId)]];
    }

    const quotes = await odoo.searchRead<any>('quote.request', domain, {
      fields: ['id', 'name', 'share_token', 'share_url'],
      limit: 1,
    });

    if (quotes.length === 0) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    const quote = quotes[0];

    // Mark as shared
    await odoo.callKw('quote.request', 'action_mark_shared', [[quote.id]]);

    const baseUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://seisei.tokyo';
    const shareUrl = `${baseUrl}/quote/${quote.share_token}`;

    // Calculate expiry (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return NextResponse.json({
      success: true,
      data: {
        shareToken: quote.share_token,
        shareUrl,
        expiresAt: expiresAt.toISOString(),
      },
    });

  } catch (error) {
    console.error('[Quote Share] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate share link' },
      { status: 500 }
    );
  }
}
