import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface StockQuant {
  id: number;
  product_id: [number, string];
  location_id: [number, string];
  quantity: number;
  reserved_quantity: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('INVENTORY', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Inventory module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    const domain: unknown[] = [['quantity', '>', 0]];
    if (search) {
      domain.push(['product_id', 'ilike', search]);
    }

    const totalCount = await odoo.searchCount('stock.quant', domain);
    const items = await odoo.searchRead<StockQuant>('stock.quant', domain, {
      fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'],
      limit,
      offset,
      order: 'quantity desc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id[0],
          productName: item.product_id[1],
          locationId: item.location_id[0],
          locationName: item.location_id[1],
          quantity: item.quantity,
          reservedQuantity: item.reserved_quantity,
          availableQuantity: item.quantity - item.reserved_quantity,
        })),
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error) {
    console.error('[Inventory Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch inventory' } },
      { status: 500 }
    );
  }
}
