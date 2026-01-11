import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// GET - Get single order with lines
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

    const hasAccess = await isModuleAccessible('POS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'POS module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const orderId = parseInt(id);

    const odoo = await getOdooClientForSession(session);

    // Get order
    const orders = await odoo.searchRead('pos.order', [['id', '=', orderId]], {
      fields: [
        'name', 'date_order', 'partner_id', 'amount_total', 'amount_tax',
        'amount_paid', 'amount_return', 'state', 'pos_reference',
        'table_id', 'session_id', 'user_id', 'lines', 'fiscal_position_id',
        'pricelist_id', 'company_id'
      ],
    }) as Array<Record<string, unknown>>;

    const order = orders[0];
    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Get order lines
    let lines: unknown[] = [];
    const orderLines = order.lines as number[] | undefined;
    if (orderLines && orderLines.length > 0) {
      lines = await odoo.searchRead('pos.order.line', [['id', 'in', orderLines]], {
        fields: [
          'product_id', 'full_product_name', 'qty', 'price_unit',
          'price_subtotal', 'price_subtotal_incl', 'discount'
        ],
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        order_lines: lines,
      },
    });
  } catch (error) {
    console.error('[POS Order Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch order' } },
      { status: 500 }
    );
  }
}

// PATCH - Update order (cancel, etc.)
export async function PATCH(
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

    const hasAccess = await isModuleAccessible('POS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'POS module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const orderId = parseInt(id);
    const body = await request.json();
    const { action, note } = body;

    const odoo = await getOdooClientForSession(session);

    // Handle different actions
    if (action === 'cancel') {
      // Update state to cancel
      await odoo.write('pos.order', [orderId], { state: 'cancel' });
    }

    // Read back the updated order
    const [order] = await odoo.searchRead('pos.order', [['id', '=', orderId]], {
      fields: [
        'name', 'date_order', 'partner_id', 'amount_total', 'amount_tax',
        'amount_paid', 'state'
      ],
    });

    return NextResponse.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('[POS Update Order Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update order' } },
      { status: 500 }
    );
  }
}
