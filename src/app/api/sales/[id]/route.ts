import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  commitment_date: string | false;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  state: string;
  note: string | false;
  user_id: [number, string] | false;
  currency_id: [number, string] | false;
  delivery_status: string | false;
  invoice_status: string | false;
}

interface SaleOrderLine {
  id: number;
  product_id: [number, string] | false;
  name: string;
  product_uom_qty: number;
  qty_delivered: number;
  qty_invoiced: number;
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

    const hasAccess = await isModuleAccessible('SALES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sales module not accessible' } },
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
    const [order] = await odoo.searchRead<SaleOrder>('sale.order', [['id', '=', orderId]], {
      fields: [
        'name', 'partner_id', 'date_order', 'commitment_date',
        'amount_total', 'amount_untaxed', 'amount_tax',
        'state', 'note', 'user_id', 'currency_id',
        'delivery_status', 'invoice_status'
      ],
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Fetch order lines
    const lines = await odoo.searchRead<SaleOrderLine>('sale.order.line', [['order_id', '=', orderId]], {
      fields: ['product_id', 'name', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'price_subtotal', 'product_uom'],
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
        commitmentDate: order.commitment_date || null,
        amountTotal: order.amount_total,
        amountUntaxed: order.amount_untaxed,
        amountTax: order.amount_tax,
        state: order.state,
        notes: order.note || null,
        userId: Array.isArray(order.user_id) ? order.user_id[0] : null,
        userName: Array.isArray(order.user_id) ? order.user_id[1] : '-',
        currency: Array.isArray(order.currency_id) ? order.currency_id[1] : 'JPY',
        deliveryStatus: order.delivery_status || null,
        invoiceStatus: order.invoice_status || null,
        lines: lines.map((line) => ({
          id: line.id,
          productId: Array.isArray(line.product_id) ? line.product_id[0] : null,
          productName: Array.isArray(line.product_id) ? line.product_id[1] : line.name,
          description: line.name,
          quantity: line.product_uom_qty,
          qtyDelivered: line.qty_delivered,
          qtyInvoiced: line.qty_invoiced,
          priceUnit: line.price_unit,
          subtotal: line.price_subtotal,
          uom: Array.isArray(line.product_uom) ? line.product_uom[1] : '',
        })),
      },
    });
  } catch (error) {
    console.error('[Sales Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sales order' } },
      { status: 500 }
    );
  }
}
