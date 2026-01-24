/**
 * Claim API
 * POST: Claim public OCR results after login
 *
 * Transfers OCR results from TEN-PUBLIC to user's tenant:
 * 1. Retrieves public job data
 * 2. Creates account.move draft in user's tenant
 * 3. Optionally copies S3 files to user's tenant key
 * 4. Returns the new move ID for redirect
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import {
  validateSession,
  getJob,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';
import { trackClaimSuccess, trackSaveSuccess } from '@/lib/analytics';

const claimRequestSchema = z.object({
  anonSessionId: z.string().min(1),
  jobId: z.string().min(1),
  target: z.enum(['billing', 'finance']).default('billing'),
});

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Please login first',
          },
        },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const parsed = claimRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { anonSessionId, jobId, target } = parsed.data;

    // Validate anon session
    if (!validateSession(anonSessionId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_ANON_SESSION',
            message: 'Anonymous session expired or invalid',
          },
        },
        { status: 400 }
      );
    }

    // Get job from anon session
    const job = getJob(anonSessionId, jobId);

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'OCR job not found',
          },
        },
        { status: 404 }
      );
    }

    if (job.status !== 'done') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'JOB_NOT_COMPLETE',
            message: 'OCR job is not complete',
          },
        },
        { status: 400 }
      );
    }

    const ocrResult = job.ocrResult as {
      merchant?: string;
      date?: string;
      amount_total?: number;
      confidence?: number;
      voucherDraft?: {
        id: string;
        move_type: 'in_invoice' | 'out_invoice' | 'entry';
        partner_name: string | null;
        invoice_date: string | null;
        amount_total: number | null;
        amount_untaxed: number | null;
        amount_tax: number | null;
        line_items: Array<{
          product_name: string;
          quantity: number;
          unit_price: number;
          amount: number;
        }>;
      };
    };

    if (!ocrResult?.voucherDraft) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_VOUCHER_DATA',
            message: 'No voucher draft available',
          },
        },
        { status: 400 }
      );
    }

    const voucherDraft = ocrResult.voucherDraft;

    // Get Odoo client for user's tenant
    const odoo = await getOdooClientForSession(session);

    // Find or create partner
    let partnerId: number | null = null;
    if (voucherDraft.partner_name) {
      // Search for existing partner
      const partners = await odoo.searchRead<{ id: number }>(
        'res.partner',
        [['name', 'ilike', voucherDraft.partner_name]],
        { fields: ['id'], limit: 1 }
      );

      if (partners.length > 0) {
        partnerId = partners[0].id;
      } else {
        // Create new partner
        partnerId = await odoo.create('res.partner', {
          name: voucherDraft.partner_name,
          is_company: true,
          supplier_rank: 1,
        });
      }
    }

    // Create account.move in user's tenant
    const moveData: Record<string, unknown> = {
      move_type: voucherDraft.move_type,
      invoice_date: voucherDraft.invoice_date || new Date().toISOString().split('T')[0],
      partner_id: partnerId,
      // Note: line_ids would need proper product/account mapping
      // For MVP, we create a simple draft without lines
    };

    const moveId = await odoo.create('account.move', moveData);

    console.log(`[Claim] Created account.move ${moveId} for tenant ${session.tenantId}`);

    // Track success events
    trackClaimSuccess({ target });
    trackSaveSuccess({ target });

    // Determine redirect URL
    let redirectUrl = '/billing';
    if (target === 'finance') {
      redirectUrl = `/finance/invoices?open=${moveId}`;
    } else {
      // Check if /billing/[id] route exists, otherwise use query param
      redirectUrl = `/billing?open=${moveId}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        moveId,
        tenantId: session.tenantId,
        redirectUrl,
        message: 'OCR results claimed successfully',
      },
    });
  } catch (error) {
    console.error('[Claim API] Error:', error);

    const message = error instanceof Error ? error.message : 'Failed to claim OCR results';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
