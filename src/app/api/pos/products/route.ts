import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// GET - List products
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
    const search = searchParams.get('search') || '';
    const categoryId = searchParams.get('category_id');
    const available = searchParams.get('available'); // 'true', 'false', or null for all

    const offset = (page - 1) * limit;

    // Build domain filter - show all POS products (both available and sold out)
    const domain: unknown[] = [
      ['active', '=', true],
      ['sale_ok', '=', true],
    ];

    // Filter by availability if specified
    if (available === 'true') {
      domain.push(['available_in_pos', '=', true]);
    } else if (available === 'false') {
      domain.push(['available_in_pos', '=', false]);
    }

    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['default_code', 'ilike', search]);
    }

    if (categoryId) {
      domain.push(['pos_categ_ids', 'in', [parseInt(categoryId)]]);
    }

    const odoo = await getOdooClientForSession(session);

    // Get total count
    const totalCount = await odoo.searchCount('product.template', domain);

    // Get products
    const products = await odoo.searchRead('product.template', domain, {
      fields: ['name', 'default_code', 'list_price', 'pos_categ_ids', 'available_in_pos', 'active', 'sale_ok', 'image_128', 'is_favorite'],
      limit,
      offset,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: products,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('[POS Products Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch products' } },
      { status: 500 }
    );
  }
}

// POST - Create new product
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, default_code, list_price, pos_categ_ids, available_in_pos = true, image_1920 } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Create product
    const productData: Record<string, unknown> = {
      name,
      default_code: default_code || false,
      list_price: list_price || 0,
      pos_categ_ids: pos_categ_ids ? [[6, 0, pos_categ_ids]] : false,
      available_in_pos,
      sale_ok: true,
      active: true,
      type: 'consu', // Consumable product for POS
    };

    // Add image if provided (base64 encoded)
    if (image_1920) {
      productData.image_1920 = image_1920;
    }

    const productId = await odoo.create('product.template', productData);

    // Read back the created product
    const [product] = await odoo.searchRead('product.template', [['id', '=', productId]], {
      fields: ['name', 'default_code', 'list_price', 'pos_categ_ids', 'available_in_pos', 'active', 'sale_ok', 'image_128', 'is_favorite'],
    });

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error('[POS Create Product Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create product' } },
      { status: 500 }
    );
  }
}

// PATCH - Update product (full edit or status changes)
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { id, name, default_code, list_price, pos_categ_ids, available_in_pos, is_favorite, image_1920 } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Product ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Prepare update values
    const values: Record<string, unknown> = {};
    if (name !== undefined) values.name = name;
    if (default_code !== undefined) values.default_code = default_code || false;
    if (list_price !== undefined) values.list_price = list_price;
    if (pos_categ_ids !== undefined) values.pos_categ_ids = pos_categ_ids ? [[6, 0, pos_categ_ids]] : [[5, 0, 0]];
    if (available_in_pos !== undefined) values.available_in_pos = available_in_pos;
    if (is_favorite !== undefined) values.is_favorite = is_favorite;
    if (image_1920 !== undefined) values.image_1920 = image_1920 || false;

    // Update product
    await odoo.write('product.template', [id], values);

    // Read back the updated product
    const [product] = await odoo.searchRead('product.template', [['id', '=', id]], {
      fields: ['name', 'default_code', 'list_price', 'pos_categ_ids', 'available_in_pos', 'active', 'sale_ok', 'image_128', 'is_favorite'],
    });

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error('[POS Update Product Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update product' } },
      { status: 500 }
    );
  }
}
