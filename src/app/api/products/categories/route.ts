import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Product Categories API - product.category management
 */

interface ProductCategory {
  id: number;
  name: string;
  complete_name: string;
  parent_id: [number, string] | false;
  child_id: number[];
  product_count: number;
}

// GET - List product categories
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
    const limit = parseInt(searchParams.get('limit') || '100');
    const search = searchParams.get('search') || '';
    const parentId = searchParams.get('parent_id');

    const offset = (page - 1) * limit;

    // Build domain filter
    const domain: unknown[] = [];

    if (search) {
      domain.push(['name', 'ilike', search]);
    }

    if (parentId === 'root') {
      domain.push(['parent_id', '=', false]);
    } else if (parentId) {
      domain.push(['parent_id', '=', parseInt(parentId)]);
    }

    const odoo = await getOdooClientForSession(session);

    // Get total count
    const totalCount = await odoo.searchCount('product.category', domain);

    // Get categories
    const categories = await odoo.searchRead<ProductCategory>('product.category', domain, {
      fields: ['name', 'complete_name', 'parent_id', 'child_id', 'product_count'],
      limit,
      offset,
      order: 'complete_name asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: categories.map(c => ({
          id: c.id,
          name: c.name,
          fullName: c.complete_name,
          parentId: Array.isArray(c.parent_id) ? c.parent_id[0] : null,
          parentName: Array.isArray(c.parent_id) ? c.parent_id[1] : null,
          childIds: c.child_id || [],
          productCount: c.product_count || 0,
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
    console.error('[Product Categories Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch categories' } },
      { status: 500 }
    );
  }
}

// POST - Create new category
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
    const { name, parentId } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const categoryData: Record<string, unknown> = {
      name,
      parent_id: parentId || false,
    };

    const categoryId = await odoo.create('product.category', categoryData);

    return NextResponse.json({
      success: true,
      data: { id: categoryId },
    });
  } catch (error) {
    console.error('[Product Categories Create Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create category' } },
      { status: 500 }
    );
  }
}

// PATCH - Update category
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
    const { id, name, parentId } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Category ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const values: Record<string, unknown> = {};
    if (name !== undefined) values.name = name;
    if (parentId !== undefined) values.parent_id = parentId || false;

    await odoo.write('product.category', [id], values);

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('[Product Categories Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update category' } },
      { status: 500 }
    );
  }
}

// DELETE - Delete category
export async function DELETE(request: NextRequest) {
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
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Category ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Check if category has products
    const productCount = await odoo.searchCount('product.template', [['categ_id', '=', id]]);
    if (productCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_PRODUCTS', message: 'Cannot delete category with products' } },
        { status: 400 }
      );
    }

    // Check if category has children
    const childCount = await odoo.searchCount('product.category', [['parent_id', '=', id]]);
    if (childCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_CHILDREN', message: 'Cannot delete category with children' } },
        { status: 400 }
      );
    }

    await odoo.unlink('product.category', [id]);

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('[Product Categories Delete Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete category' } },
      { status: 500 }
    );
  }
}
