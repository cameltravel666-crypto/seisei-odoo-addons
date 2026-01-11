import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Product {
  id: number;
  name: string | false;
  display_name: string | false;
  default_code: string | false;
  list_price: number;
  uom_id: [number, string] | false;
  taxes_id: number[];
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

    const hasAccess = await isModuleAccessible('SALES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sales module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    const odoo = await getOdooClientForSession(session);

    // Search for saleable products
    const domain: unknown[] = [
      ['sale_ok', '=', true],
    ];

    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['default_code', 'ilike', search]);
    }

    const products = await odoo.searchRead<Product>('product.product', domain, {
      fields: ['name', 'display_name', 'default_code', 'list_price', 'uom_id', 'taxes_id'],
      limit,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: products.map((p) => ({
        id: p.id,
        name: p.display_name || p.name || `Product #${p.id}`,
        code: p.default_code || null,
        price: p.list_price || 0,
        uom: Array.isArray(p.uom_id) ? p.uom_id[1] : 'Unit',
      })),
    });
  } catch (error) {
    console.error('[Sales Products Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch products' } },
      { status: 500 }
    );
  }
}
