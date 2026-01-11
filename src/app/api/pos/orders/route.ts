import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check module access
    const hasAccess = await isModuleAccessible('POS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'POS module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const state = searchParams.get('state');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');
    const orderType = searchParams.get('order_type'); // dine_in, takeaway, delivery

    const offset = (page - 1) * limit;

    // Build domain filter
    const domain: unknown[] = [];

    if (state) {
      domain.push(['state', '=', state]);
    }

    if (dateFrom) {
      domain.push(['date_order', '>=', dateFrom]);
    }

    if (dateTo) {
      domain.push(['date_order', '<=', `${dateTo} 23:59:59`]);
    }

    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['partner_id', 'ilike', search]);
    }

    // Order type filter (if Odoo has this field)
    if (orderType) {
      domain.push(['order_type', '=', orderType]);
    }

    const odoo = await getOdooClientForSession(session);

    // Get total count
    const totalCount = await odoo.searchCount('pos.order', domain);

    // Get orders with more fields
    const orders = await odoo.searchRead('pos.order', domain, {
      fields: [
        'name', 'date_order', 'partner_id', 'amount_total', 'amount_tax',
        'amount_paid', 'state', 'pos_reference', 'table_id',
        'session_id', 'user_id', 'lines'
      ],
      limit,
      offset,
      order: 'date_order desc',
    });

    // Build base domain (without state filter) for summary statistics
    const baseDomain: unknown[] = [];
    if (dateFrom) {
      baseDomain.push(['date_order', '>=', dateFrom]);
    }
    if (dateTo) {
      baseDomain.push(['date_order', '<=', `${dateTo} 23:59:59`]);
    }
    if (search) {
      baseDomain.push('|');
      baseDomain.push(['name', 'ilike', search]);
      baseDomain.push(['partner_id', 'ilike', search]);
    }

    // Get aggregated statistics using read_group
    const summaryByState = await odoo.readGroup(
      'pos.order',
      baseDomain,
      ['state', 'amount_total:sum'],
      ['state']
    ) as Array<{ state: string; state_count: number; amount_total: number }>;

    // Calculate summary from grouped data
    let totalAmount = 0;
    let totalOrders = 0;
    let cancelledCount = 0;

    summaryByState.forEach((group) => {
      totalOrders += group.state_count;
      totalAmount += group.amount_total || 0;
      if (group.state === 'cancel') {
        cancelledCount = group.state_count;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        items: orders,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        summary: {
          totalOrders,
          totalAmount,
          avgAmount: totalOrders > 0 ? totalAmount / totalOrders : 0,
          cancelledCount,
        },
      },
    });
  } catch (error) {
    console.error('[POS Orders Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch orders' } },
      { status: 500 }
    );
  }
}
