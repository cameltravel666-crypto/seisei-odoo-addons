import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// GET - Get single category
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
    const categoryId = parseInt(id);

    const odoo = await getOdooClientForSession(session);

    const [category] = await odoo.searchRead('pos.category', [['id', '=', categoryId]], {
      fields: ['name', 'parent_id', 'sequence', 'image_128'],
    });

    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('[POS Get Category Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch category' } },
      { status: 500 }
    );
  }
}

// PUT - Update category
export async function PUT(
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
    const categoryId = parseInt(id);
    const body = await request.json();
    const { name, parent_id, sequence, image_1920 } = body;

    const odoo = await getOdooClientForSession(session);

    // Prepare update values
    const values: Record<string, unknown> = {};
    if (name !== undefined) values.name = name;
    if (parent_id !== undefined) values.parent_id = parent_id || false;
    if (sequence !== undefined) values.sequence = sequence;
    if (image_1920 !== undefined) values.image_1920 = image_1920 || false;

    // Update category
    await odoo.write('pos.category', [categoryId], values);

    // Read back the updated category
    const [category] = await odoo.searchRead('pos.category', [['id', '=', categoryId]], {
      fields: ['name', 'parent_id', 'sequence', 'image_128'],
    });

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('[POS Update Category Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update category' } },
      { status: 500 }
    );
  }
}

// DELETE - Delete category
export async function DELETE(
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
    const categoryId = parseInt(id);

    const odoo = await getOdooClientForSession(session);

    // Check if category has children
    const childCount = await odoo.searchCount('pos.category', [['parent_id', '=', categoryId]]);
    if (childCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_CHILDREN', message: 'Cannot delete category with children' } },
        { status: 400 }
      );
    }

    // Check if category has products
    const productCount = await odoo.searchCount('product.template', [['pos_categ_ids', 'in', [categoryId]]]);
    if (productCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_PRODUCTS', message: 'Cannot delete category with products' } },
        { status: 400 }
      );
    }

    // Delete category
    await odoo.unlink('pos.category', [categoryId]);

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('[POS Delete Category Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete category' } },
      { status: 500 }
    );
  }
}
