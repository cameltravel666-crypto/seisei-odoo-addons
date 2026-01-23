import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * OCR Invoice API
 *
 * POST /api/ocr/invoices - Trigger batch OCR processing
 * GET  /api/ocr/invoices?ids=1,2,3 - Get OCR status for invoices
 *
 * Calls Odoo's custom_ocr_finance module methods
 */

// OCR status type
interface OcrInvoice {
  id: number;
  name: string;
  ocr_status: 'pending' | 'processing' | 'done' | 'failed';
  ocr_confidence: number;
  ocr_pages: number;
  ocr_matched_count: number;
  ocr_error_message: string | false;
  ocr_processed_at: string | false;
  move_type: string;
  partner_id: [number, string] | false;
}

/**
 * GET /api/ocr/invoices - Get OCR status for specific invoices
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');

    if (!idsParam) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_IDS', message: 'Invoice IDs required' } },
        { status: 400 }
      );
    }

    const ids = idsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_IDS', message: 'Valid invoice IDs required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Fetch OCR status for the invoices
    const invoices = await odoo.searchRead<OcrInvoice>(
      'account.move',
      [['id', 'in', ids]],
      {
        fields: [
          'id', 'name', 'ocr_status', 'ocr_confidence', 'ocr_pages',
          'ocr_matched_count', 'ocr_error_message', 'ocr_processed_at',
          'move_type', 'partner_id'
        ],
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        invoices: invoices.map(inv => ({
          id: inv.id,
          name: inv.name,
          ocrStatus: inv.ocr_status || 'pending',
          ocrConfidence: inv.ocr_confidence || 0,
          ocrPages: inv.ocr_pages || 0,
          ocrMatchedCount: inv.ocr_matched_count || 0,
          ocrErrorMessage: inv.ocr_error_message || null,
          ocrProcessedAt: inv.ocr_processed_at || null,
          moveType: inv.move_type,
          partnerName: inv.partner_id ? inv.partner_id[1] : null,
        })),
      },
    });
  } catch (error) {
    console.error('[OCR Status Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get OCR status' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ocr/invoices - Trigger batch OCR processing
 *
 * Body: { invoiceIds: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { invoiceIds } = body;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Invoice IDs array required' } },
        { status: 400 }
      );
    }

    // Validate invoice IDs
    const validIds = invoiceIds.filter(id => typeof id === 'number' && id > 0);
    if (validIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_IDS', message: 'No valid invoice IDs provided' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Call Odoo's batch OCR method
    // This method processes invoices with a delay between each to avoid rate limiting
    const result = await odoo.callKw<{
      type: string;
      tag?: string;
      params?: {
        title: string;
        message: string;
        type: string;
      };
    }>(
      'account.move',
      'action_batch_send_to_ocr',
      [validIds],
      {}
    );

    // Extract result info
    let successCount = 0;
    let failCount = 0;
    let message = '';

    if (result && result.params) {
      message = result.params.message || '';
      // Parse message like "Batch OCR completed: 5 succeeded, 2 failed out of 7 total."
      const match = message.match(/(\d+)\s+succeeded.*?(\d+)\s+failed/);
      if (match) {
        successCount = parseInt(match[1], 10);
        failCount = parseInt(match[2], 10);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: validIds.length,
        successCount,
        failCount,
        message,
      },
    });
  } catch (error) {
    console.error('[OCR Batch Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'OCR processing failed';
    return NextResponse.json(
      { success: false, error: { code: 'OCR_FAILED', message: errorMessage } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ocr/invoices - Reset OCR status for invoices
 *
 * Body: { invoiceIds: number[] }
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { invoiceIds } = body;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Invoice IDs array required' } },
        { status: 400 }
      );
    }

    const validIds = invoiceIds.filter(id => typeof id === 'number' && id > 0);
    if (validIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_IDS', message: 'No valid invoice IDs provided' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Call Odoo's reset OCR method
    await odoo.callKw(
      'account.move',
      'action_reset_ocr',
      [validIds],
      {}
    );

    return NextResponse.json({
      success: true,
      data: {
        reset: validIds.length,
      },
    });
  } catch (error) {
    console.error('[OCR Reset Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reset OCR status' } },
      { status: 500 }
    );
  }
}
