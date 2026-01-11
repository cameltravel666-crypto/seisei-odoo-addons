import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Product {
  id: number;
  name: string | false;
  display_name: string | false;
  default_code: string | false;
  standard_price: number;
  list_price: number;
  uom_id: [number, string] | false;
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

    const hasAccess = await isModuleAccessible('PURCHASE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Purchase module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    const odoo = await getOdooClientForSession(session);

    // Search for active products
    const domain: unknown[] = [];

    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['default_code', 'ilike', search]);
    }

    const products = await odoo.searchRead<Product>('product.product', domain, {
      fields: ['name', 'display_name', 'default_code', 'standard_price', 'list_price', 'uom_id'],
      limit,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: products.map((p) => ({
        id: p.id,
        name: p.display_name || p.name || `Product #${p.id}`,
        code: p.default_code || null,
        price: p.standard_price || p.list_price || 0,
        uom: Array.isArray(p.uom_id) ? p.uom_id[1] : 'Unit',
      })),
    });
  } catch (error) {
    console.error('[Products Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch products' } },
      { status: 500 }
    );
  }
}
