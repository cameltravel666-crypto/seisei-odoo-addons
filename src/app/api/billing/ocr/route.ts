/**
 * Billing OCR API
 * POST: Process OCR and write to Odoo 18 (purchase/sale/expense)
 *
 * Supports:
 * - purchase -> account.move (in_invoice) or purchase.order
 * - sale -> account.move (out_invoice) or sale.order
 * - expense -> hr.expense
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

// ============================================
// Schema
// ============================================

const lineItemSchema = z.object({
  product_name: z.string(),
  account_name: z.string().optional(),
  quantity: z.number().default(1),
  unit: z.string().optional(),
  unit_price: z.number(),
  tax_rate: z.string().optional(),
  amount: z.number(),
});

const ocrWriteRequestSchema = z.object({
  docType: z.enum(['purchase', 'sale', 'expense']),
  // OCR extracted data
  date: z.string(), // YYYY-MM-DD
  counterparty: z.string().optional(),
  total: z.number(),
  tax: z.number().optional(),
  taxRate: z.number().optional().default(10),
  invoiceRegNo: z.string().optional(),
  invoiceNumber: z.string().optional(),
  description: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  // Options
  createAs: z.enum(['invoice', 'order']).optional().default('invoice'),
  postImmediately: z.boolean().optional().default(false),
});

type OcrWriteRequest = z.infer<typeof ocrWriteRequestSchema>;

// ============================================
// Odoo Model Helpers
// ============================================

interface OdooPartner {
  id: number;
  name: string;
  vat?: string;
}

interface OdooProduct {
  id: number;
  name: string;
}

interface OdooAccount {
  id: number;
  name: string;
  code: string;
}

/**
 * Find or create partner by name
 */
async function findOrCreatePartner(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  name: string,
  vat?: string
): Promise<number> {
  // First try to find by VAT (invoice registration number)
  if (vat) {
    const byVat = await odoo.searchRead<OdooPartner>('res.partner', [['vat', '=', vat]], {
      fields: ['id', 'name'],
      limit: 1,
    });
    if (byVat.length > 0) {
      return byVat[0].id;
    }
  }

  // Then try to find by name
  const byName = await odoo.searchRead<OdooPartner>('res.partner', [['name', 'ilike', name]], {
    fields: ['id', 'name'],
    limit: 1,
  });
  if (byName.length > 0) {
    return byName[0].id;
  }

  // Create new partner
  const partnerId = await odoo.create('res.partner', {
    name,
    vat: vat || undefined,
    is_company: true,
  });

  return partnerId;
}

/**
 * Find default expense account
 */
async function findExpenseAccount(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  accountName?: string
): Promise<number | null> {
  // Try to find account by name
  if (accountName) {
    const accounts = await odoo.searchRead<OdooAccount>('account.account', [
      ['name', 'ilike', accountName],
      ['account_type', 'in', ['expense', 'expense_direct_cost']],
    ], {
      fields: ['id', 'name', 'code'],
      limit: 1,
    });
    if (accounts.length > 0) {
      return accounts[0].id;
    }
  }

  // Find default expense account
  const defaultAccounts = await odoo.searchRead<OdooAccount>('account.account', [
    ['account_type', '=', 'expense'],
  ], {
    fields: ['id', 'name', 'code'],
    limit: 1,
    order: 'code',
  });

  return defaultAccounts.length > 0 ? defaultAccounts[0].id : null;
}

/**
 * Find product by name or create a misc product
 */
async function findOrCreateProduct(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  name: string
): Promise<number | null> {
  // Try to find product by name
  const products = await odoo.searchRead<OdooProduct>('product.product', [
    ['name', 'ilike', name],
  ], {
    fields: ['id', 'name'],
    limit: 1,
  });

  if (products.length > 0) {
    return products[0].id;
  }

  // For expenses, we don't need a product
  return null;
}

// ============================================
// Write Functions
// ============================================

/**
 * Create vendor bill (in_invoice)
 */
async function createVendorBill(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  data: OcrWriteRequest
): Promise<{ id: number; name: string }> {
  // Find or create partner
  const partnerId = data.counterparty
    ? await findOrCreatePartner(odoo, data.counterparty, data.invoiceRegNo)
    : null;

  // Build invoice lines
  const invoiceLines = [];

  if (data.lineItems && data.lineItems.length > 0) {
    for (const item of data.lineItems) {
      const productId = await findOrCreateProduct(odoo, item.product_name);
      const accountId = await findExpenseAccount(odoo, item.account_name);

      invoiceLines.push([0, 0, {
        name: item.product_name,
        product_id: productId || undefined,
        account_id: accountId || undefined,
        quantity: item.quantity,
        price_unit: item.unit_price,
        // tax_ids will be auto-calculated based on product/account
      }]);
    }
  } else {
    // Single line with total amount
    const accountId = await findExpenseAccount(odoo);
    const taxExcluded = data.tax ? data.total - data.tax : data.total / (1 + (data.taxRate || 10) / 100);

    invoiceLines.push([0, 0, {
      name: data.description || '仕入',
      account_id: accountId || undefined,
      quantity: 1,
      price_unit: taxExcluded,
    }]);
  }

  // Create invoice
  const invoiceId = await odoo.create('account.move', {
    move_type: 'in_invoice',
    partner_id: partnerId || undefined,
    invoice_date: data.date,
    ref: data.invoiceNumber || undefined,
    invoice_line_ids: invoiceLines,
  });

  // Post if requested
  if (data.postImmediately) {
    await odoo.callKw('account.move', 'action_post', [[invoiceId]]);
  }

  // Get created invoice
  const [invoice] = await odoo.searchRead<{ id: number; name: string }>('account.move', [['id', '=', invoiceId]], {
    fields: ['id', 'name'],
  });

  return { id: invoice.id, name: invoice.name };
}

/**
 * Create customer invoice (out_invoice)
 */
async function createCustomerInvoice(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  data: OcrWriteRequest
): Promise<{ id: number; name: string }> {
  // Find or create partner
  const partnerId = data.counterparty
    ? await findOrCreatePartner(odoo, data.counterparty, data.invoiceRegNo)
    : null;

  // Build invoice lines
  const invoiceLines = [];

  if (data.lineItems && data.lineItems.length > 0) {
    for (const item of data.lineItems) {
      const productId = await findOrCreateProduct(odoo, item.product_name);

      invoiceLines.push([0, 0, {
        name: item.product_name,
        product_id: productId || undefined,
        quantity: item.quantity,
        price_unit: item.unit_price,
      }]);
    }
  } else {
    // Single line with total amount
    const taxExcluded = data.tax ? data.total - data.tax : data.total / (1 + (data.taxRate || 10) / 100);

    invoiceLines.push([0, 0, {
      name: data.description || '売上',
      quantity: 1,
      price_unit: taxExcluded,
    }]);
  }

  // Create invoice
  const invoiceId = await odoo.create('account.move', {
    move_type: 'out_invoice',
    partner_id: partnerId || undefined,
    invoice_date: data.date,
    ref: data.invoiceNumber || undefined,
    invoice_line_ids: invoiceLines,
  });

  // Post if requested
  if (data.postImmediately) {
    await odoo.callKw('account.move', 'action_post', [[invoiceId]]);
  }

  // Get created invoice
  const [invoice] = await odoo.searchRead<{ id: number; name: string }>('account.move', [['id', '=', invoiceId]], {
    fields: ['id', 'name'],
  });

  return { id: invoice.id, name: invoice.name };
}

/**
 * Create expense
 */
async function createExpense(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  data: OcrWriteRequest
): Promise<{ id: number; name: string }> {
  // Get current user's employee
  const employees = await odoo.searchRead<{ id: number; name: string }>('hr.employee', [
    ['user_id', '!=', false],
  ], {
    fields: ['id', 'name'],
    limit: 1,
  });

  const employeeId = employees.length > 0 ? employees[0].id : null;

  // Find product for expense (optional)
  const productId = data.description
    ? await findOrCreateProduct(odoo, data.description)
    : null;

  // Create expense
  const expenseData: Record<string, unknown> = {
    name: data.description || data.counterparty || '経費',
    date: data.date,
    total_amount: data.total,
    employee_id: employeeId || undefined,
    product_id: productId || undefined,
    reference: data.invoiceNumber || undefined,
  };

  // Add partner if available
  if (data.counterparty) {
    const partnerId = await findOrCreatePartner(odoo, data.counterparty);
    expenseData.partner_id = partnerId;
  }

  const expenseId = await odoo.create('hr.expense', expenseData);

  // Get created expense
  const [expense] = await odoo.searchRead<{ id: number; name: string }>('hr.expense', [['id', '=', expenseId]], {
    fields: ['id', 'name'],
  });

  return { id: expense.id, name: expense.name };
}

/**
 * Create purchase order
 */
async function createPurchaseOrder(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  data: OcrWriteRequest
): Promise<{ id: number; name: string }> {
  // Partner is required for PO
  if (!data.counterparty) {
    throw new Error('取引先名が必要です');
  }

  const partnerId = await findOrCreatePartner(odoo, data.counterparty, data.invoiceRegNo);

  // Build order lines
  const orderLines = [];

  if (data.lineItems && data.lineItems.length > 0) {
    for (const item of data.lineItems) {
      let productId = await findOrCreateProduct(odoo, item.product_name);

      // For PO, we need a product - create one if not found
      if (!productId) {
        productId = await odoo.create('product.product', {
          name: item.product_name,
          type: 'consu',
          purchase_ok: true,
        });
      }

      orderLines.push([0, 0, {
        product_id: productId,
        product_qty: item.quantity,
        price_unit: item.unit_price,
      }]);
    }
  } else {
    // Create a misc product
    const productId = await odoo.create('product.product', {
      name: data.description || '商品',
      type: 'consu',
      purchase_ok: true,
    });

    const taxExcluded = data.tax ? data.total - data.tax : data.total / (1 + (data.taxRate || 10) / 100);

    orderLines.push([0, 0, {
      product_id: productId,
      product_qty: 1,
      price_unit: taxExcluded,
    }]);
  }

  // Create purchase order
  const orderId = await odoo.create('purchase.order', {
    partner_id: partnerId,
    date_order: data.date,
    partner_ref: data.invoiceNumber || undefined,
    order_line: orderLines,
  });

  // Get created order
  const [order] = await odoo.searchRead<{ id: number; name: string }>('purchase.order', [['id', '=', orderId]], {
    fields: ['id', 'name'],
  });

  return { id: order.id, name: order.name };
}

/**
 * Create sales order
 */
async function createSalesOrder(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  data: OcrWriteRequest
): Promise<{ id: number; name: string }> {
  // Partner is required for SO
  if (!data.counterparty) {
    throw new Error('取引先名が必要です');
  }

  const partnerId = await findOrCreatePartner(odoo, data.counterparty, data.invoiceRegNo);

  // Build order lines
  const orderLines = [];

  if (data.lineItems && data.lineItems.length > 0) {
    for (const item of data.lineItems) {
      let productId = await findOrCreateProduct(odoo, item.product_name);

      // For SO, we need a product - create one if not found
      if (!productId) {
        productId = await odoo.create('product.product', {
          name: item.product_name,
          type: 'consu',
          sale_ok: true,
        });
      }

      orderLines.push([0, 0, {
        product_id: productId,
        product_uom_qty: item.quantity,
        price_unit: item.unit_price,
      }]);
    }
  } else {
    // Create a misc product
    const productId = await odoo.create('product.product', {
      name: data.description || '商品',
      type: 'consu',
      sale_ok: true,
    });

    const taxExcluded = data.tax ? data.total - data.tax : data.total / (1 + (data.taxRate || 10) / 100);

    orderLines.push([0, 0, {
      product_id: productId,
      product_uom_qty: 1,
      price_unit: taxExcluded,
    }]);
  }

  // Create sales order
  const orderId = await odoo.create('sale.order', {
    partner_id: partnerId,
    order_line: orderLines,
  });

  // Get created order
  const [order] = await odoo.searchRead<{ id: number; name: string }>('sale.order', [['id', '=', orderId]], {
    fields: ['id', 'name'],
  });

  return { id: order.id, name: order.name };
}

// ============================================
// API Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'ログインが必要です',
          },
        },
        { status: 401 }
      );
    }

    // Parse request
    const body = await request.json();
    const parsed = ocrWriteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '無効なリクエストです',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Get Odoo client
    const odoo = await getOdooClientForSession(session);

    // Process based on doc type and create mode
    let result: { id: number; name: string };
    let resultType: string;

    switch (data.docType) {
      case 'purchase':
        if (data.createAs === 'order') {
          result = await createPurchaseOrder(odoo, data);
          resultType = 'purchase_order';
        } else {
          result = await createVendorBill(odoo, data);
          resultType = 'vendor_bill';
        }
        break;

      case 'sale':
        if (data.createAs === 'order') {
          result = await createSalesOrder(odoo, data);
          resultType = 'sales_order';
        } else {
          result = await createCustomerInvoice(odoo, data);
          resultType = 'customer_invoice';
        }
        break;

      case 'expense':
        result = await createExpense(odoo, data);
        resultType = 'expense';
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_DOC_TYPE',
              message: 'サポートされていない書類タイプです',
            },
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        type: resultType,
        message: `${result.name} を作成しました`,
      },
    });
  } catch (error) {
    console.error('[Billing OCR Write Error]', error);

    const errorMessage = error instanceof Error ? error.message : 'データの書き込みに失敗しました';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
