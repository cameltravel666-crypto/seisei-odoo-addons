import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface PurchaseOrder {
  id: number;
  name: string;
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
        'name', 'partner_id', 'date_order', 'date_approve',
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
      fields: ['product_id', 'name', 'product_qty', 'qty_received', 'price_unit', 'price_subtotal', 'product_uom'],
      order: 'id asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        name: order.name,
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
          description: line.name,
          quantity: line.product_qty,
          qtyReceived: line.qty_received,
          priceUnit: line.price_unit,
          subtotal: line.price_subtotal,
          uom: Array.isArray(line.product_uom) ? line.product_uom[1] : '',
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
