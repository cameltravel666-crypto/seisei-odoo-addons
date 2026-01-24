import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { entitlementsService } from '@/lib/entitlements-service';
import { randomUUID } from 'crypto';

/**
 * OCR Document API - Direct Odoo Integration
 *
 * POST /api/ocr/document - Upload document to Odoo and process with OCR
 *
 * Supports:
 * - Purchase Orders (purchase.order) -> creates draft PO
 * - Vendor Bills (account.move) -> creates draft vendor bill
 * - Customer Invoices (account.move) -> creates draft customer invoice
 *
 * Metered Usage:
 * - Free quota: 30 pages/month
 * - Overage: ¥20/page
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Document type configuration
const DOC_TYPE_CONFIG: Record<string, {
  model: string;
  moveType?: string;
  ocrMethod: string;
  idField: string;
}> = {
  purchase_order: {
    model: 'purchase.order',
    ocrMethod: 'action_ocr_scan',
    idField: 'order_id',
  },
  vendor_bill: {
    model: 'account.move',
    moveType: 'in_invoice',
    ocrMethod: 'action_send_to_ocr',
    idField: 'invoice_id',
  },
  customer_invoice: {
    model: 'account.move',
    moveType: 'out_invoice',
    ocrMethod: 'action_send_to_ocr',
    idField: 'invoice_id',
  },
  expense: {
    model: 'account.move',
    moveType: 'in_invoice',
    ocrMethod: 'action_send_to_ocr',
    idField: 'invoice_id',
  },
};

/**
 * POST /api/ocr/document - Upload and process document with Odoo OCR
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

    // 2. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('documentType') as string) || 'vendor_bill';

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_FILE', message: 'File is required' } },
        { status: 400 }
      );
    }

    // 3. Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TYPE', message: 'Unsupported file type. Use JPEG, PNG, WebP, or PDF.' } },
        { status: 400 }
      );
    }

    // 4. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TOO_LARGE', message: `File must be ≤${MAX_FILE_SIZE / 1024 / 1024}MB` } },
        { status: 400 }
      );
    }

    // 5. Check metered usage - OCR feature
    const usageCheck = await entitlementsService.canUseFeature(session.tenantId, 'ocr');
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USAGE_LIMIT_EXCEEDED',
            message: usageCheck.reason === 'PAYMENT_REQUIRED'
              ? 'OCR free quota exceeded. Please add a payment method to continue.'
              : 'OCR quota exceeded',
          }
        },
        { status: 402 }
      );
    }

    // Generate idempotency key for this OCR request
    const idempotencyKey = `ocr_${session.tenantId}_${randomUUID()}`;

    // 6. Get document type configuration
    const config = DOC_TYPE_CONFIG[documentType] || DOC_TYPE_CONFIG.vendor_bill;

    // 7. Get Odoo client
    const odoo = await getOdooClientForSession(session);

    // 7. Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // 8. Create document based on type
    let docId: number;

    if (config.model === 'purchase.order') {
      // Find any existing vendor for draft PO (required by Odoo)
      // The OCR process will update the vendor after extraction
      let existingVendors = await odoo.searchRead<{ id: number }>('res.partner',
        [['supplier_rank', '>', 0]],
        { fields: ['id'], limit: 1 }
      );

      if (existingVendors.length === 0) {
        // Try to find any partner if no suppliers exist
        const anyPartners = await odoo.searchRead<{ id: number }>('res.partner',
          [['is_company', '=', true]],
          { fields: ['id'], limit: 1 }
        );

        if (anyPartners.length === 0) {
          // Auto-create a default vendor (consistent with Odoo 18 behavior)
          console.log('[OCR] No vendors found, creating default vendor');
          const newVendorId = await odoo.create('res.partner', {
            name: 'OCR临时供应商',
            is_company: true,
            supplier_rank: 1,
            comment: '由OCR系统自动创建的临时供应商，请在识别后更新为正确的供应商信息',
          });
          existingVendors = [{ id: newVendorId }];
          console.log(`[OCR] Created default vendor ${newVendorId}`);
        } else {
          existingVendors = anyPartners;
        }
      }

      const placeholderVendorId = existingVendors[0].id;
      console.log(`[OCR] Using vendor ${placeholderVendorId} as placeholder`);

      // Create draft purchase order with placeholder vendor
      docId = await odoo.create('purchase.order', {
        partner_id: placeholderVendorId,
      });
      console.log(`[OCR] Created draft purchase order ${docId} for OCR processing`);
    } else {
      // Create draft invoice/bill
      docId = await odoo.create('account.move', {
        move_type: config.moveType,
      });
      console.log(`[OCR] Created draft invoice ${docId} for OCR processing`);
    }

    // 9. Create attachment and link to document
    const attachmentId = await odoo.create('ir.attachment', {
      name: file.name,
      type: 'binary',
      datas: base64Data,
      res_model: config.model,
      res_id: docId,
      mimetype: file.type,
    });

    console.log(`[OCR] Created attachment ${attachmentId}`);

    // 10. Set attachment as main attachment (for account.move only, purchase.order finds attachments by res_model/res_id)
    if (config.model === 'account.move') {
      try {
        await odoo.write(config.model, [docId], {
          message_main_attachment_id: attachmentId,
        });
      } catch (e) {
        console.log(`[OCR] Could not set main attachment, continuing: ${e}`);
      }
    }

    // 11. Call Odoo's OCR processing
    console.log(`[OCR] Calling ${config.ocrMethod} for ${config.model} ${docId}`);
    await odoo.callKw(config.model, config.ocrMethod, [[docId]], {});

    // 12. Read back document with OCR results
    let result: Record<string, unknown>;

    if (config.model === 'purchase.order') {
      result = await readPurchaseOrderResult(odoo, docId, documentType);
    } else {
      result = await readInvoiceResult(odoo, docId, documentType);
    }

    console.log(`[OCR] ${config.model} ${docId}: ${result.ocr_pages || 1} pages, ${(result.line_items as unknown[])?.length || 0} items`);

    // 13. Record successful OCR usage
    const ocrPages = (result.ocr_pages as number) || 1;
    // Record one usage event per page for accurate metering
    for (let i = 0; i < ocrPages; i++) {
      await entitlementsService.recordUsage({
        tenantId: session.tenantId,
        featureKey: 'ocr',
        idempotencyKey: `${idempotencyKey}_page_${i}`,
        status: 'SUCCEEDED',
        meta: {
          documentType,
          documentId: docId,
          model: config.model,
          page: i + 1,
          totalPages: ocrPages,
        },
      });
    }
    console.log(`[OCR] Recorded ${ocrPages} page(s) of usage for tenant ${session.tenantId}`);

    // 14. Sync usage to Odoo 18's ocr.file.usage model for billing integration
    try {
      await odoo.callKw('ocr.file.usage', 'increment_usage', [ocrPages], {});
      console.log(`[OCR] Synced ${ocrPages} page(s) to Odoo ocr.file.usage`);
    } catch (syncError) {
      // Log but don't fail the request - usage is already recorded in BizNexus
      console.warn('[OCR] Failed to sync usage to Odoo ocr.file.usage:', syncError);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('[OCR Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'OCR processing failed';
    return NextResponse.json(
      { success: false, error: { code: 'OCR_FAILED', message: errorMessage } },
      { status: 500 }
    );
  }
}

/**
 * Read purchase order OCR result
 */
async function readPurchaseOrderResult(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  orderId: number,
  documentType: string
) {
  const [order] = await odoo.read<{
    id: number;
    name: string;
    partner_id: [number, string] | false;
    date_order: string | false;
    partner_ref: string | false;
    state: string;
    ocr_status: string;
    ocr_line_items: string | false;
    ocr_cost: number;
    ocr_pages: number;
    ocr_error_message: string | false;
    ocr_matched_count: number;
    amount_total: number;
    amount_untaxed: number;
    amount_tax: number;
    order_line: number[];
  }>('purchase.order', [orderId], [
    'name', 'partner_id', 'date_order', 'partner_ref', 'state',
    'ocr_status', 'ocr_line_items', 'ocr_cost', 'ocr_pages',
    'ocr_error_message', 'ocr_matched_count',
    'amount_total', 'amount_untaxed', 'amount_tax', 'order_line'
  ]);

  // Read order lines
  let lineItems: Array<{
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
  }> = [];

  if (order.order_line && order.order_line.length > 0) {
    const lines = await odoo.read<{
      id: number;
      name: string;
      product_qty: number;
      price_unit: number;
      price_subtotal: number;
      product_uom: [number, string] | false;
    }>('purchase.order.line', order.order_line, [
      'name', 'product_qty', 'price_unit', 'price_subtotal', 'product_uom'
    ]);

    lineItems = lines.map(line => ({
      product_name: line.name || '',
      quantity: line.product_qty || 1,
      unit: line.product_uom ? line.product_uom[1] : 'pcs',
      unit_price: line.price_unit || 0,
      amount: line.price_subtotal || 0,
    }));
  }

  // Fallback to ocr_line_items
  if (lineItems.length === 0 && order.ocr_line_items) {
    try {
      const rawItems = JSON.parse(order.ocr_line_items);
      lineItems = rawItems.map((item: Record<string, unknown>) => ({
        product_name: item.product_name || item.product || item.name || '',
        quantity: Number(item.quantity) || 1,
        unit: String(item.unit || 'pcs'),
        unit_price: Number(item.unit_price || item.price) || 0,
        amount: Number(item.amount || item.total) || 0,
      }));
    } catch (e) {
      console.error('[OCR] Failed to parse line items:', e);
    }
  }

  return {
    order_id: orderId,
    invoice_id: orderId, // For compatibility
    name: order.name,
    state: order.state,
    document_type: documentType,
    vendor_name: order.partner_id ? order.partner_id[1] : undefined,
    date: order.date_order || undefined,
    invoice_number: order.partner_ref || undefined,
    line_items: lineItems,
    subtotal: order.amount_untaxed || 0,
    tax: order.amount_tax || 0,
    total: order.amount_total || 0,
    ocr_status: order.ocr_status,
    ocr_confidence: order.ocr_cost || 0,
    ocr_pages: order.ocr_pages || 1,
    ocr_matched_count: order.ocr_matched_count || 0,
  };
}

/**
 * Read invoice/bill OCR result
 */
async function readInvoiceResult(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  invoiceId: number,
  documentType: string
) {
  const [invoice] = await odoo.read<{
    id: number;
    partner_id: [number, string] | false;
    ref: string | false;
    invoice_date: string | false;
    narration: string | false;
    state: string;
    move_type: string;
    ocr_status: string;
    ocr_line_items: string | false;
    ocr_confidence: number;
    ocr_pages: number;
    ocr_error_message: string | false;
    ocr_matched_count: number;
    amount_total: number;
    amount_untaxed: number;
    amount_tax: number;
    invoice_line_ids: number[];
  }>('account.move', [invoiceId], [
    'partner_id', 'ref', 'invoice_date', 'narration', 'state', 'move_type',
    'ocr_status', 'ocr_line_items', 'ocr_confidence', 'ocr_pages',
    'ocr_error_message', 'ocr_matched_count',
    'amount_total', 'amount_untaxed', 'amount_tax', 'invoice_line_ids'
  ]);

  // Check if OCR failed
  if (invoice.ocr_status === 'failed') {
    await odoo.callKw('account.move', 'unlink', [[invoiceId]], {});
    throw new Error(invoice.ocr_error_message || 'OCR processing failed');
  }

  // Read invoice lines
  let lineItems: Array<{
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
  }> = [];

  if (invoice.invoice_line_ids && invoice.invoice_line_ids.length > 0) {
    const lines = await odoo.read<{
      id: number;
      name: string;
      quantity: number;
      price_unit: number;
      price_subtotal: number;
      product_uom_id: [number, string] | false;
    }>('account.move.line', invoice.invoice_line_ids, [
      'name', 'quantity', 'price_unit', 'price_subtotal', 'product_uom_id'
    ]);

    lineItems = lines.map(line => ({
      product_name: line.name || '',
      quantity: line.quantity || 1,
      unit: line.product_uom_id ? line.product_uom_id[1] : 'pcs',
      unit_price: line.price_unit || 0,
      amount: line.price_subtotal || 0,
    }));
  }

  // Fallback to ocr_line_items
  if (lineItems.length === 0 && invoice.ocr_line_items) {
    try {
      const rawItems = JSON.parse(invoice.ocr_line_items);
      lineItems = rawItems.map((item: Record<string, unknown>) => ({
        product_name: item.product_name || item.product || item.name || '',
        quantity: Number(item.quantity) || 1,
        unit: String(item.unit || 'pcs'),
        unit_price: Number(item.unit_price || item.price) || 0,
        amount: Number(item.amount || item.total) || 0,
      }));
    } catch (e) {
      console.error('[OCR] Failed to parse line items:', e);
    }
  }

  return {
    invoice_id: invoiceId,
    state: invoice.state,
    move_type: invoice.move_type,
    document_type: documentType,
    vendor_name: invoice.partner_id ? invoice.partner_id[1] : undefined,
    customer_name: documentType === 'customer_invoice' && invoice.partner_id ? invoice.partner_id[1] : undefined,
    date: invoice.invoice_date || undefined,
    invoice_number: invoice.ref || undefined,
    line_items: lineItems,
    subtotal: invoice.amount_untaxed || 0,
    tax: invoice.amount_tax || 0,
    total: invoice.amount_total || 0,
    ocr_status: invoice.ocr_status,
    ocr_confidence: invoice.ocr_confidence || 0,
    ocr_pages: invoice.ocr_pages || 1,
    ocr_matched_count: invoice.ocr_matched_count || 0,
  };
}
