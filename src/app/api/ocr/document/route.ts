import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { entitlementsService } from '@/lib/entitlements-service';
import { randomUUID } from 'crypto';

/**
 * OCR Document API - Central OCR Service Integration
 *
 * POST /api/ocr/document - Upload document and process with Central OCR Service
 *
 * Flow:
 * 1. Receive file upload
 * 2. Call Central OCR Service (Gemini-based)
 * 3. Create document in Odoo 18 with extracted data
 * 4. Record usage for billing
 *
 * Metered Usage:
 * - Free quota: 30 pages/month
 * - Overage: ¥20/page
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Central OCR Service URL (internal network)
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr-service:8080';

// Document type configuration
const DOC_TYPE_CONFIG: Record<string, {
  model: string;
  moveType?: string;
  templateFields: string[];
}> = {
  purchase_order: {
    model: 'purchase.order',
    templateFields: ['vendor_name', 'invoice_number', 'date', 'line_items', 'subtotal', 'tax', 'total'],
  },
  vendor_bill: {
    model: 'account.move',
    moveType: 'in_invoice',
    templateFields: ['vendor_name', 'invoice_number', 'date', 'line_items', 'subtotal', 'tax', 'total'],
  },
  customer_invoice: {
    model: 'account.move',
    moveType: 'out_invoice',
    templateFields: ['customer_name', 'invoice_number', 'date', 'line_items', 'subtotal', 'tax', 'total'],
  },
  expense: {
    model: 'account.move',
    moveType: 'in_invoice',
    templateFields: ['vendor_name', 'receipt_number', 'date', 'description', 'amount', 'tax'],
  },
};

interface OCRExtracted {
  vendor_name?: string;
  customer_name?: string;
  invoice_number?: string;
  receipt_number?: string;
  date?: string;
  description?: string;
  line_items?: Array<{
    product_name?: string;
    name?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    price?: number;
    amount?: number;
    total?: number;
  }>;
  subtotal?: number;
  tax?: number;
  total?: number;
  amount?: number;
}

interface OCRServiceResponse {
  success: boolean;
  extracted?: OCRExtracted;
  raw_response?: string;
  error_code?: string;
  usage?: {
    pages?: number;
    tokens?: number;
  };
}

/**
 * POST /api/ocr/document - Upload and process document with Central OCR Service
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
    const documentType = (formData.get('documentType') as string) || 'purchase_order';

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
    const config = DOC_TYPE_CONFIG[documentType] || DOC_TYPE_CONFIG.purchase_order;

    // 7. Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // 8. Call Central OCR Service
    console.log(`[OCR] Calling Central OCR Service for ${documentType}`);

    const ocrResponse = await fetch(`${OCR_SERVICE_URL}/api/v1/ocr/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': process.env.OCR_SERVICE_KEY || '',
      },
      body: JSON.stringify({
        image_data: base64Data,
        mime_type: file.type,
        template_fields: config.templateFields,
        tenant_id: session.tenantId,
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('[OCR] Service error:', errorText);
      throw new Error(`OCR service error: ${ocrResponse.status}`);
    }

    const ocrResult: OCRServiceResponse = await ocrResponse.json();

    if (!ocrResult.success || !ocrResult.extracted) {
      console.error('[OCR] Extraction failed:', ocrResult.error_code);
      throw new Error(ocrResult.error_code || 'OCR extraction failed');
    }

    console.log('[OCR] Extraction successful:', JSON.stringify(ocrResult.extracted).substring(0, 200));

    // 9. Get Odoo client and create document
    const odoo = await getOdooClientForSession(session);
    let docId: number;
    let result: Record<string, unknown>;

    if (config.model === 'purchase.order') {
      // Create purchase order with extracted data
      docId = await createPurchaseOrder(odoo, ocrResult.extracted);
      result = {
        order_id: docId,
        document_type: documentType,
        ...formatExtractedData(ocrResult.extracted),
        ocr_status: 'completed',
        ocr_pages: ocrResult.usage?.pages || 1,
      };
    } else {
      // Create invoice/bill with extracted data
      docId = await createInvoice(odoo, config.moveType || 'in_invoice', ocrResult.extracted);
      result = {
        invoice_id: docId,
        document_type: documentType,
        move_type: config.moveType,
        ...formatExtractedData(ocrResult.extracted),
        ocr_status: 'completed',
        ocr_pages: ocrResult.usage?.pages || 1,
      };
    }

    console.log(`[OCR] Created ${config.model} ${docId}`);

    // 10. Record successful OCR usage
    const ocrPages = ocrResult.usage?.pages || 1;
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
 * Format extracted data for response
 */
function formatExtractedData(extracted: OCRExtracted) {
  const lineItems = (extracted.line_items || []).map(item => ({
    product_name: item.product_name || item.name || '',
    quantity: item.quantity || 1,
    unit: item.unit || 'pcs',
    unit_price: item.unit_price || item.price || 0,
    amount: item.amount || item.total || 0,
  }));

  return {
    vendor_name: extracted.vendor_name,
    customer_name: extracted.customer_name,
    invoice_number: extracted.invoice_number || extracted.receipt_number,
    date: extracted.date,
    line_items: lineItems,
    subtotal: extracted.subtotal || 0,
    tax: extracted.tax || 0,
    total: extracted.total || extracted.amount || 0,
  };
}

/**
 * Create purchase order from extracted data
 */
async function createPurchaseOrder(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  extracted: OCRExtracted
): Promise<number> {
  // Find or create vendor
  let partnerId: number;

  if (extracted.vendor_name) {
    // Search for existing vendor
    const vendors = await odoo.searchRead<{ id: number }>('res.partner',
      [['name', 'ilike', extracted.vendor_name], ['supplier_rank', '>', 0]],
      { fields: ['id'], limit: 1 }
    );

    if (vendors.length > 0) {
      partnerId = vendors[0].id;
    } else {
      // Create new vendor
      partnerId = await odoo.create('res.partner', {
        name: extracted.vendor_name,
        is_company: true,
        supplier_rank: 1,
      });
      console.log(`[OCR] Created vendor: ${extracted.vendor_name} (${partnerId})`);
    }
  } else {
    // Use or create default vendor
    const defaultVendors = await odoo.searchRead<{ id: number }>('res.partner',
      [['supplier_rank', '>', 0]],
      { fields: ['id'], limit: 1 }
    );

    if (defaultVendors.length > 0) {
      partnerId = defaultVendors[0].id;
    } else {
      partnerId = await odoo.create('res.partner', {
        name: 'OCR临时供应商',
        is_company: true,
        supplier_rank: 1,
        comment: '由OCR系统自动创建',
      });
    }
  }

  // Create purchase order
  const orderData: Record<string, unknown> = {
    partner_id: partnerId,
    partner_ref: extracted.invoice_number,
  };

  if (extracted.date) {
    orderData.date_order = extracted.date;
  }

  const orderId = await odoo.create('purchase.order', orderData);

  // Add order lines
  if (extracted.line_items && extracted.line_items.length > 0) {
    for (const item of extracted.line_items) {
      await odoo.create('purchase.order.line', {
        order_id: orderId,
        name: item.product_name || item.name || 'OCR识别商品',
        product_qty: item.quantity || 1,
        price_unit: item.unit_price || item.price || 0,
      });
    }
  }

  return orderId;
}

/**
 * Create invoice from extracted data
 */
async function createInvoice(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  moveType: string,
  extracted: OCRExtracted
): Promise<number> {
  // Find or create partner
  let partnerId: number | undefined;
  const partnerName = extracted.vendor_name || extracted.customer_name;

  if (partnerName) {
    const partners = await odoo.searchRead<{ id: number }>('res.partner',
      [['name', 'ilike', partnerName]],
      { fields: ['id'], limit: 1 }
    );

    if (partners.length > 0) {
      partnerId = partners[0].id;
    } else {
      partnerId = await odoo.create('res.partner', {
        name: partnerName,
        is_company: true,
        supplier_rank: moveType === 'in_invoice' ? 1 : 0,
        customer_rank: moveType === 'out_invoice' ? 1 : 0,
      });
    }
  }

  // Create invoice
  const invoiceData: Record<string, unknown> = {
    move_type: moveType,
    ref: extracted.invoice_number || extracted.receipt_number,
  };

  if (partnerId) {
    invoiceData.partner_id = partnerId;
  }

  if (extracted.date) {
    invoiceData.invoice_date = extracted.date;
  }

  const invoiceId = await odoo.create('account.move', invoiceData);

  // Add invoice lines
  if (extracted.line_items && extracted.line_items.length > 0) {
    for (const item of extracted.line_items) {
      await odoo.create('account.move.line', {
        move_id: invoiceId,
        name: item.product_name || item.name || 'OCR识别项目',
        quantity: item.quantity || 1,
        price_unit: item.unit_price || item.price || 0,
      });
    }
  }

  return invoiceId;
}
