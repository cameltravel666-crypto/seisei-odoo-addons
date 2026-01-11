import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Products API - product.template management
 */

interface ProductTemplate {
  id: number;
  name: string;
  default_code: string | false;
  barcode: string | false;
  list_price: number;
  standard_price: number;
  categ_id: [number, string] | false;
  type: string;
  uom_id: [number, string] | false;
  uom_po_id: [number, string] | false;
  active: boolean;
  sale_ok: boolean;
  purchase_ok: boolean;
  image_128: string | false;
  qty_available: number;
  virtual_available: number;
  description: string | false;
  description_sale: string | false;
}

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

    const hasAccess = await isModuleAccessible('PRODUCTS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Products module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const categoryId = searchParams.get('category_id');
    const type = searchParams.get('type'); // 'consu', 'service', 'product'
    const active = searchParams.get('active');

    const offset = (page - 1) * limit;

    // Build domain filter
    const domain: unknown[] = [];

    if (active !== null) {
      domain.push(['active', '=', active !== 'false']);
    }

    if (search) {
      domain.push('|', '|');
      domain.push(['name', 'ilike', search]);
      domain.push(['default_code', 'ilike', search]);
      domain.push(['barcode', 'ilike', search]);
    }

    if (categoryId) {
      domain.push(['categ_id', '=', parseInt(categoryId)]);
    }

    if (type) {
      domain.push(['type', '=', type]);
    }

    const odoo = await getOdooClientForSession(session);

    // Get total count
    const totalCount = await odoo.searchCount('product.template', domain);

    // Get products
    const products = await odoo.searchRead<ProductTemplate>('product.template', domain, {
      fields: [
        'name', 'default_code', 'barcode', 'list_price', 'standard_price',
        'categ_id', 'type', 'uom_id', 'uom_po_id', 'active',
        'sale_ok', 'purchase_ok', 'image_128', 'qty_available', 'virtual_available',
      ],
      limit,
      offset,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: products.map(p => ({
          id: p.id,
          name: p.name,
          code: p.default_code || null,
          barcode: p.barcode || null,
          listPrice: p.list_price,
          costPrice: p.standard_price,
          categoryId: Array.isArray(p.categ_id) ? p.categ_id[0] : null,
          categoryName: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
          type: p.type,
          uomId: Array.isArray(p.uom_id) ? p.uom_id[0] : null,
          uomName: Array.isArray(p.uom_id) ? p.uom_id[1] : null,
          active: p.active,
          saleOk: p.sale_ok,
          purchaseOk: p.purchase_ok,
          image: p.image_128 || null,
          qtyAvailable: p.qty_available || 0,
          virtualAvailable: p.virtual_available || 0,
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('[Products Error]', error);
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

    const hasAccess = await isModuleAccessible('PRODUCTS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Products module not accessible' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      code,
      barcode,
      listPrice,
      costPrice,
      categoryId,
      type = 'consu',
      saleOk = true,
      purchaseOk = true,
      image,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const productData: Record<string, unknown> = {
      name,
      default_code: code || false,
      barcode: barcode || false,
      list_price: listPrice || 0,
      standard_price: costPrice || 0,
      categ_id: categoryId || false,
      type,
      sale_ok: saleOk,
      purchase_ok: purchaseOk,
      active: true,
    };

    if (image) {
      productData.image_1920 = image;
    }

    const productId = await odoo.create('product.template', productData);

    return NextResponse.json({
      success: true,
      data: { id: productId },
    });
  } catch (error) {
    console.error('[Products Create Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create product' } },
      { status: 500 }
    );
  }
}

// PATCH - Update product
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('PRODUCTS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Products module not accessible' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, name, code, barcode, listPrice, costPrice, categoryId, type, saleOk, purchaseOk, active, image } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Product ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const values: Record<string, unknown> = {};
    if (name !== undefined) values.name = name;
    if (code !== undefined) values.default_code = code || false;
    if (barcode !== undefined) values.barcode = barcode || false;
    if (listPrice !== undefined) values.list_price = listPrice;
    if (costPrice !== undefined) values.standard_price = costPrice;
    if (categoryId !== undefined) values.categ_id = categoryId || false;
    if (type !== undefined) values.type = type;
    if (saleOk !== undefined) values.sale_ok = saleOk;
    if (purchaseOk !== undefined) values.purchase_ok = purchaseOk;
    if (active !== undefined) values.active = active;
    if (image !== undefined) values.image_1920 = image || false;

    await odoo.write('product.template', [id], values);

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('[Products Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update product' } },
      { status: 500 }
    );
  }
}
