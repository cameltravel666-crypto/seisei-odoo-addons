import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// Update request body interface
interface UpdatePurchaseOrderRequest {
  /** User-editable document name (stored in partner_ref field) */
  displayName?: string;
  partnerId?: number;
  dateOrder?: string;
  notes?: string;
  lines?: Array<{
    id?: number; // existing line id (for update/delete)
    productId: number;
    /** User-editable line name/label */
    name?: string;
    quantity: number;
    priceUnit: number;
    /** Tax IDs to apply */
    taxIds?: number[];
  }>;
}

interface PurchaseOrder {
  id: number;
  name: string;
  /** User-editable document name/reference (vendor reference) */
  partner_ref: string | false;
  partner_id: [number, string] | false;
  date_order: string;
  date_approve: string | false;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  state: string;
  notes: string | false;
  user_id: [number, string] | false;
  currency_id: [number, string] | false;
}

interface PurchaseOrderLine {
  id: number;
  product_id: [number, string] | false;
  name: string;
  product_qty: number;
  qty_received: number;
  price_unit: number;
  price_subtotal: number;
  product_uom: [number, string] | false;
  taxes_id: number[];
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

    const hasAccess = await isModuleAccessible('PURCHASE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Purchase module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const orderId = parseInt(id);
    if (isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid order ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Fetch order details
    const [order] = await odoo.searchRead<PurchaseOrder>('purchase.order', [['id', '=', orderId]], {
      fields: [
        'name', 'partner_ref', 'partner_id', 'date_order', 'date_approve',
        'amount_total', 'amount_untaxed', 'amount_tax',
        'state', 'notes', 'user_id', 'currency_id'
      ],
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Fetch order lines
    const lines = await odoo.searchRead<PurchaseOrderLine>('purchase.order.line', [['order_id', '=', orderId]], {
      fields: ['product_id', 'name', 'product_qty', 'qty_received', 'price_unit', 'price_subtotal', 'product_uom', 'taxes_id'],
      order: 'id asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        name: order.name,
        /** User-editable display name (stored in partner_ref) */
        displayName: order.partner_ref || null,
        partnerId: Array.isArray(order.partner_id) ? order.partner_id[0] : null,
        partnerName: Array.isArray(order.partner_id) ? order.partner_id[1] : '-',
        dateOrder: order.date_order,
        dateApprove: order.date_approve || null,
        amountTotal: order.amount_total,
        amountUntaxed: order.amount_untaxed,
        amountTax: order.amount_tax,
        state: order.state,
        notes: order.notes || null,
        userId: Array.isArray(order.user_id) ? order.user_id[0] : null,
        userName: Array.isArray(order.user_id) ? order.user_id[1] : '-',
        currency: Array.isArray(order.currency_id) ? order.currency_id[1] : 'JPY',
        lines: lines.map((line) => ({
          id: line.id,
          productId: Array.isArray(line.product_id) ? line.product_id[0] : null,
          productName: Array.isArray(line.product_id) ? line.product_id[1] : line.name,
          /** User-editable line name/description */
          name: line.name,
          quantity: line.product_qty,
          qtyReceived: line.qty_received,
          priceUnit: line.price_unit,
          subtotal: line.price_subtotal,
          uom: Array.isArray(line.product_uom) ? line.product_uom[1] : '',
          /** Tax IDs */
          taxIds: line.taxes_id || [],
        })),
      },
    });
  } catch (error) {
    console.error('[Purchase Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch purchase order' } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/purchase/[id] - Update a draft purchase order
 * Only draft orders can be edited
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

    const hasAccess = await isModuleAccessible('PURCHASE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Purchase module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const orderId = parseInt(id);
    if (isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid order ID' } },
        { status: 400 }
      );
    }

    const body: UpdatePurchaseOrderRequest = await request.json();
    const odoo = await getOdooClientForSession(session);

    // Verify order exists and is in draft state
    const [order] = await odoo.searchRead<{ id: number; state: string }>('purchase.order', [['id', '=', orderId]], {
      fields: ['state'],
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    if (order.state !== 'draft' && order.state !== 'sent') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Only draft orders can be edited' } },
        { status: 400 }
      );
    }

    // Build update data for order header
    const updateData: Record<string, unknown> = {};
    if (body.displayName !== undefined) {
      // Store user-editable name in partner_ref field
      updateData.partner_ref = body.displayName || false;
    }
    if (body.partnerId !== undefined) {
      updateData.partner_id = body.partnerId;
    }
    if (body.dateOrder !== undefined) {
      updateData.date_order = body.dateOrder;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes || false;
    }

    // Update order header if any changes
    if (Object.keys(updateData).length > 0) {
      await odoo.write('purchase.order', [orderId], updateData);
    }

    // Update order lines if provided
    if (body.lines !== undefined) {
      // Get existing lines
      const existingLines = await odoo.searchRead<{ id: number }>('purchase.order.line', [['order_id', '=', orderId]], {
        fields: ['id'],
      });
      const existingLineIds = new Set(existingLines.map(l => l.id));
      const newLineIds = new Set(body.lines.filter(l => l.id).map(l => l.id!));

      // Delete lines that are no longer in the list
      const linesToDelete = existingLines.filter(l => !newLineIds.has(l.id));
      if (linesToDelete.length > 0) {
        await odoo.callKw('purchase.order.line', 'unlink', [linesToDelete.map(l => l.id)], {});
      }

      // Update existing lines and create new ones
      for (const line of body.lines) {
        if (line.id && existingLineIds.has(line.id)) {
          // Update existing line
          const lineData: Record<string, unknown> = {
            product_qty: line.quantity,
            price_unit: line.priceUnit,
          };
          // Include user-editable line name if provided
          if (line.name !== undefined) {
            lineData.name = line.name;
          }
          // Include tax IDs if provided (use Odoo command format: [[6, 0, ids]])
          if (line.taxIds !== undefined) {
            lineData.taxes_id = [[6, 0, line.taxIds]];
          }
          await odoo.write('purchase.order.line', [line.id], lineData);
        } else {
          // Create new line
          const lineData: Record<string, unknown> = {
            order_id: orderId,
            product_id: line.productId,
            product_qty: line.quantity,
            price_unit: line.priceUnit,
          };
          // Include user-editable line name if provided
          if (line.name !== undefined) {
            lineData.name = line.name;
          }
          // Include tax IDs if provided
          if (line.taxIds !== undefined) {
            lineData.taxes_id = [[6, 0, line.taxIds]];
          }
          await odoo.create('purchase.order.line', lineData);
        }
      }
    }

    // Fetch updated order
    const [updatedOrder] = await odoo.searchRead<PurchaseOrder>('purchase.order', [['id', '=', orderId]], {
      fields: ['name', 'partner_ref', 'partner_id', 'date_order', 'amount_total', 'state'],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: orderId,
        name: updatedOrder.name,
        displayName: updatedOrder.partner_ref || null,
        partnerId: Array.isArray(updatedOrder.partner_id) ? updatedOrder.partner_id[0] : null,
        partnerName: Array.isArray(updatedOrder.partner_id) ? updatedOrder.partner_id[1] : '-',
        dateOrder: updatedOrder.date_order,
        amountTotal: updatedOrder.amount_total,
        state: updatedOrder.state,
      },
    });
  } catch (error) {
    console.error('[Purchase Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update purchase order' } },
      { status: 500 }
    );
  }
}
