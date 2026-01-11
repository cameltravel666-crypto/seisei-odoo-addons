import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// GET - List categories
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const includeInactive = searchParams.get('include_inactive') === 'true';

    const offset = (page - 1) * limit;

    // Build domain filter - pos.category model in Odoo 18
    const domain: unknown[] = [];

    if (!includeInactive) {
      // Only show active categories by default
    }

    if (search) {
      domain.push(['name', 'ilike', search]);
    }

    const odoo = await getOdooClientForSession(session);

    // Get total count
    const totalCount = await odoo.searchCount('pos.category', domain);

    // Get categories with parent info
    const categories = await odoo.searchRead('pos.category', domain, {
      fields: ['name', 'parent_id', 'sequence', 'image_128'],
      limit,
      offset,
      order: 'sequence asc, name asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: categories,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('[POS Categories Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch categories' } },
      { status: 500 }
    );
  }
}

// POST - Create category
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
    const { name, parent_id, sequence, image_1920 } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Create category
    const categoryData: Record<string, unknown> = {
      name,
      parent_id: parent_id || false,
      sequence: sequence || 10,
    };

    if (image_1920) {
      categoryData.image_1920 = image_1920;
    }

    const categoryId = await odoo.create('pos.category', categoryData);

    // Read back the created category
    const [category] = await odoo.searchRead('pos.category', [['id', '=', categoryId]], {
      fields: ['name', 'parent_id', 'sequence', 'image_128'],
    });

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('[POS Create Category Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create category' } },
      { status: 500 }
    );
  }
}
