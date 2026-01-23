import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// Update request body interface
interface UpdateInvoiceRequest {
  /** User-editable document name (stored in ref field) */
  displayName?: string;
  partnerId?: number;
  invoiceDate?: string;
  invoiceDateDue?: string;
  lines?: Array<{
    id?: number; // existing line id (for update/delete)
    productId?: number;
    accountId: number;
    /** User-editable line name/label */
    name: string;
    quantity: number;
    priceUnit: number;
  }>;
}

interface AccountMove {
  id: number;
  name: string;
  /** User-editable document reference */
  ref: string | false;
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  amount_untaxed: number;
  amount_tax: number;
  state: string;
  payment_state: string;
  move_type: string;
  invoice_origin: string | false;
  narration: string | false;
  user_id: [number, string] | false;
  currency_id: [number, string] | false;
  journal_id: [number, string] | false;
}

interface AccountMoveLine {
  id: number;
  product_id: [number, string] | false;
  account_id: [number, string] | false;
  name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  price_total: number;
  tax_ids: number[];
  product_uom_id: [number, string] | false;
  display_type: string | false;
  exclude_from_invoice_tab: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const accessCheck = await isModuleAccessible('FINANCE', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Finance module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid invoice ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Fetch invoice details
    const [invoice] = await odoo.searchRead<AccountMove>('account.move', [['id', '=', invoiceId]], {
      fields: [
        'name', 'ref', 'partner_id', 'invoice_date', 'invoice_date_due',
        'amount_total', 'amount_residual', 'amount_untaxed', 'amount_tax',
        'state', 'payment_state', 'move_type', 'invoice_origin', 'narration',
        'user_id', 'currency_id', 'journal_id'
      ],
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
        { status: 404 }
      );
    }

    // Fetch invoice lines (only product/service lines, not tax or total lines)
    const lines = await odoo.searchRead<AccountMoveLine>('account.move.line', [
      ['move_id', '=', invoiceId],
      ['display_type', 'in', ['product', false]],
      ['exclude_from_invoice_tab', '=', false]
    ], {
      fields: [
        'product_id', 'account_id', 'name', 'quantity', 'price_unit',
        'price_subtotal', 'price_total', 'tax_ids', 'product_uom_id', 'display_type'
      ],
      order: 'id asc',
    });

    const today = new Date().toISOString().split('T')[0];
    const dueDate = invoice.invoice_date_due || null;
    const isOverdue = dueDate && invoice.state === 'posted' &&
      invoice.payment_state !== 'paid' && dueDate < today;
    const overdueDays = isOverdue && dueDate
      ? Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: invoice.id,
        name: invoice.name,
        /** User-editable display name (stored in ref) */
        displayName: invoice.ref || null,
        partnerId: Array.isArray(invoice.partner_id) ? invoice.partner_id[0] : null,
        partnerName: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : '-',
        invoiceDate: invoice.invoice_date || null,
        invoiceDateDue: invoice.invoice_date_due || null,
        amountTotal: invoice.amount_total,
        amountResidual: invoice.amount_residual,
        amountUntaxed: invoice.amount_untaxed,
        amountTax: invoice.amount_tax,
        state: invoice.state,
        paymentState: invoice.payment_state,
        moveType: invoice.move_type,
        invoiceOrigin: invoice.invoice_origin || null,
        notes: invoice.narration || null,
        userId: Array.isArray(invoice.user_id) ? invoice.user_id[0] : null,
        userName: Array.isArray(invoice.user_id) ? invoice.user_id[1] : '-',
        currency: Array.isArray(invoice.currency_id) ? invoice.currency_id[1] : 'JPY',
        journalId: Array.isArray(invoice.journal_id) ? invoice.journal_id[0] : null,
        journalName: Array.isArray(invoice.journal_id) ? invoice.journal_id[1] : '-',
        isOverdue,
        overdueDays,
        lines: lines.map((line) => ({
          id: line.id,
          productId: Array.isArray(line.product_id) ? line.product_id[0] : null,
          productName: Array.isArray(line.product_id) ? line.product_id[1] : line.name,
          accountId: Array.isArray(line.account_id) ? line.account_id[0] : null,
          accountName: Array.isArray(line.account_id) ? line.account_id[1] : '-',
          /** User-editable line name/description */
          name: line.name,
          quantity: line.quantity,
          priceUnit: line.price_unit,
          subtotal: line.price_subtotal,
          total: line.price_total,
          taxIds: line.tax_ids || [],
          uom: Array.isArray(line.product_uom_id) ? line.product_uom_id[1] : '',
        })),
      },
    });
  } catch (error) {
    console.error('[Invoice Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch invoice' } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/finance/invoices/[id] - Update a draft invoice
 * Only draft invoices can be edited
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const accessCheck = await isModuleAccessible('FINANCE', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Finance module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid invoice ID' } },
        { status: 400 }
      );
    }

    const body: UpdateInvoiceRequest = await request.json();
    const odoo = await getOdooClientForSession(session);

    // Verify invoice exists and is in draft state
    const [invoice] = await odoo.searchRead<{ id: number; state: string }>('account.move', [['id', '=', invoiceId]], {
      fields: ['state'],
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } },
        { status: 404 }
      );
    }

    if (invoice.state !== 'draft') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Only draft invoices can be edited' } },
        { status: 400 }
      );
    }

    // Build update data for invoice header
    const updateData: Record<string, unknown> = {};
    if (body.displayName !== undefined) {
      // Store user-editable name in ref field
      updateData.ref = body.displayName || false;
    }
    if (body.partnerId !== undefined) {
      updateData.partner_id = body.partnerId;
    }
    if (body.invoiceDate !== undefined) {
      updateData.invoice_date = body.invoiceDate;
    }
    if (body.invoiceDateDue !== undefined) {
      updateData.invoice_date_due = body.invoiceDateDue;
    }

    // Update invoice header if any changes
    if (Object.keys(updateData).length > 0) {
      await odoo.write('account.move', [invoiceId], updateData);
    }

    // Update invoice lines if provided
    if (body.lines !== undefined) {
      // Get existing lines (excluding tax/total lines)
      const existingLines = await odoo.searchRead<{ id: number }>('account.move.line', [
        ['move_id', '=', invoiceId],
        ['display_type', 'in', ['product', false]],
        ['exclude_from_invoice_tab', '=', false]
      ], {
        fields: ['id'],
      });
      const existingLineIds = new Set(existingLines.map(l => l.id));
      const newLineIds = new Set(body.lines.filter(l => l.id).map(l => l.id!));

      // Delete lines that are no longer in the list
      const linesToDelete = existingLines.filter(l => !newLineIds.has(l.id));
      if (linesToDelete.length > 0) {
        await odoo.callKw('account.move.line', 'unlink', [linesToDelete.map(l => l.id)], {});
      }

      // Update existing lines and create new ones
      for (const line of body.lines) {
        if (line.id && existingLineIds.has(line.id)) {
          // Update existing line
          const lineData: Record<string, unknown> = {
            quantity: line.quantity,
            price_unit: line.priceUnit,
            name: line.name,
          };
          await odoo.write('account.move.line', [line.id], lineData);
        } else {
          // Create new line
          const lineData: Record<string, unknown> = {
            move_id: invoiceId,
            account_id: line.accountId,
            name: line.name,
            quantity: line.quantity,
            price_unit: line.priceUnit,
          };
          if (line.productId) {
            lineData.product_id = line.productId;
          }
          await odoo.create('account.move.line', lineData);
        }
      }
    }

    // Fetch updated invoice
    const [updatedInvoice] = await odoo.searchRead<AccountMove>('account.move', [['id', '=', invoiceId]], {
      fields: ['name', 'ref', 'partner_id', 'invoice_date', 'amount_total', 'state', 'payment_state'],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: invoiceId,
        name: updatedInvoice.name,
        displayName: updatedInvoice.ref || null,
        partnerId: Array.isArray(updatedInvoice.partner_id) ? updatedInvoice.partner_id[0] : null,
        partnerName: Array.isArray(updatedInvoice.partner_id) ? updatedInvoice.partner_id[1] : '-',
        invoiceDate: updatedInvoice.invoice_date,
        amountTotal: updatedInvoice.amount_total,
        state: updatedInvoice.state,
        paymentState: updatedInvoice.payment_state,
      },
    });
  } catch (error) {
    console.error('[Invoice Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update invoice' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/finance/invoices/[id] - Perform actions on an invoice
 * Actions: post (confirm), reset_to_draft
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const accessCheck = await isModuleAccessible('FINANCE', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Finance module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid invoice ID' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Action required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    switch (action) {
      case 'post':
        await odoo.callKw('account.move', 'action_post', [[invoiceId]], {});
        break;
      case 'reset_to_draft':
        await odoo.callKw('account.move', 'button_draft', [[invoiceId]], {});
        break;
      default:
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Unknown action: ${action}` } },
          { status: 400 }
        );
    }

    // Fetch updated invoice
    const [invoice] = await odoo.searchRead<AccountMove>('account.move', [['id', '=', invoiceId]], {
      fields: ['name', 'state', 'payment_state'],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: invoiceId,
        name: invoice.name,
        state: invoice.state,
        paymentState: invoice.payment_state,
        message: `Invoice ${action === 'post' ? 'posted' : 'reset to draft'}`,
      },
    });
  } catch (error) {
    console.error('[Invoice Action Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to perform action';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}
