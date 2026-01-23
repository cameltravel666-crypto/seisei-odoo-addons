import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * OCR Confirm Document API - Direct Odoo Integration
 *
 * POST /api/ocr/create-document - Confirm the OCR-processed invoice in Odoo
 *
 * Since OCR already creates a draft invoice with lines in Odoo, this endpoint:
 * 1. Updates the invoice with any user edits
 * 2. Optionally posts (confirms) the invoice
 */

interface OcrLineItem {
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

interface OcrData {
  invoice_id: number; // The invoice ID from OCR processing
  vendor_name?: string;
  customer_name?: string;
  date?: string;
  invoice_number?: string;
  line_items: OcrLineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
}

interface ConfirmDocumentRequest {
  documentType: 'vendor_bill' | 'customer_invoice' | 'expense';
  ocrData: OcrData;
  autoPost?: boolean; // Whether to automatically post the invoice
}

/**
 * POST /api/ocr/create-document - Confirm OCR document in Odoo
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body: ConfirmDocumentRequest = await request.json();
    const { documentType, ocrData, autoPost = false } = body;

    if (!documentType || !ocrData) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'documentType and ocrData are required' } },
        { status: 400 }
      );
    }

    // 3. Get invoice ID - it should already exist from OCR processing
    const invoiceId = ocrData.invoice_id;
    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_INVOICE', message: 'Invoice ID is required' } },
        { status: 400 }
      );
    }

    // 4. Get Odoo client
    const odoo = await getOdooClientForSession(session);

    // 5. Verify invoice exists and is in draft state
    const [invoice] = await odoo.read<{
      id: number;
      state: string;
      move_type: string;
      partner_id: [number, string] | false;
    }>('account.move', [invoiceId], ['state', 'move_type', 'partner_id']);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
        { status: 404 }
      );
    }

    if (invoice.state !== 'draft') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Invoice is not in draft state' } },
        { status: 400 }
      );
    }

    // 6. Update invoice with any edits from user
    const updateData: Record<string, unknown> = {};

    // Update date if provided
    if (ocrData.date) {
      updateData.invoice_date = ocrData.date;
    }

    // Update invoice reference/number if provided
    if (ocrData.invoice_number) {
      updateData.ref = ocrData.invoice_number;
    }

    // Update partner if user edited vendor/customer name and it changed
    const partnerName = documentType === 'customer_invoice' ? ocrData.customer_name : ocrData.vendor_name;
    const currentPartnerName = invoice.partner_id ? invoice.partner_id[1] : '';

    if (partnerName && partnerName !== currentPartnerName) {
      // Search for existing partner or create new one
      const partnerId = await findOrCreatePartner(odoo, partnerName, documentType);
      if (partnerId) {
        updateData.partner_id = partnerId;
      }
    }

    // Only update if there are changes
    if (Object.keys(updateData).length > 0) {
      console.log(`[OCR] Updating invoice ${invoiceId} with:`, updateData);
      await odoo.write('account.move', [invoiceId], updateData);
    }

    // 7. Optionally post the invoice
    let posted = false;
    if (autoPost) {
      try {
        console.log(`[OCR] Posting invoice ${invoiceId}`);
        await odoo.callKw('account.move', 'action_post', [[invoiceId]], {});
        posted = true;
      } catch (postError) {
        console.error('[OCR] Failed to post invoice:', postError);
        // Don't fail the whole operation, invoice is still saved as draft
      }
    }

    // 8. Read back final invoice state
    const [finalInvoice] = await odoo.read<{
      id: number;
      name: string;
      state: string;
      amount_total: number;
      partner_id: [number, string] | false;
    }>('account.move', [invoiceId], ['name', 'state', 'amount_total', 'partner_id']);

    // 9. Return result
    return NextResponse.json({
      success: true,
      data: {
        id: invoiceId,
        name: finalInvoice.name,
        state: finalInvoice.state,
        amount_total: finalInvoice.amount_total,
        partner_name: finalInvoice.partner_id ? finalInvoice.partner_id[1] : null,
        documentType,
        posted,
        message: posted ? 'Document confirmed and posted' : 'Document saved as draft',
      },
    });

  } catch (error) {
    console.error('[Confirm Document Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to confirm document';
    return NextResponse.json(
      { success: false, error: { code: 'CONFIRM_FAILED', message: errorMessage } },
      { status: 500 }
    );
  }
}

/**
 * Find or create a partner in Odoo
 */
async function findOrCreatePartner(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  name: string,
  documentType: string
): Promise<number | null> {
  if (!name || name.length < 2) {
    return null;
  }

  const isCustomer = documentType === 'customer_invoice';

  try {
    // Search for existing partner
    const partners = await odoo.searchRead<{ id: number; name: string }>(
      'res.partner',
      [['name', 'ilike', name]],
      { fields: ['id', 'name'], limit: 1 }
    );

    if (partners && partners.length > 0) {
      const partnerId = partners[0].id;
      // Update rank if needed
      const rankField = isCustomer ? 'customer_rank' : 'supplier_rank';
      await odoo.write('res.partner', [partnerId], { [rankField]: 1 });
      return partnerId;
    }

    // Create new partner
    console.log(`[OCR] Creating partner: ${name} (${isCustomer ? 'customer' : 'supplier'})`);
    const partnerId = await odoo.create('res.partner', {
      name,
      company_type: 'company',
      customer_rank: isCustomer ? 1 : 0,
      supplier_rank: isCustomer ? 0 : 1,
    });

    return partnerId;

  } catch (e) {
    console.error('[OCR] Failed to find/create partner:', e);
    return null;
  }
}
