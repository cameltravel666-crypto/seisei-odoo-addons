import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * BOM (Bill of Materials) API - mrp.bom management
 */

interface MrpBom {
  id: number;
  product_tmpl_id: [number, string];
  product_id: [number, string] | false;
  product_qty: number;
  product_uom_id: [number, string];
  code: string | false;
  type: string;
  active: boolean;
  bom_line_ids: number[];
}

interface MrpBomLine {
  id: number;
  bom_id: [number, string];
  product_id: [number, string];
  product_qty: number;
  product_uom_id: [number, string];
  sequence: number;
}

// GET - List BOMs
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
    const productId = searchParams.get('product_id');

    const offset = (page - 1) * limit;

    // Build domain filter
    const domain: unknown[] = [['active', '=', true]];

    if (search) {
      domain.push('|');
      domain.push(['product_tmpl_id', 'ilike', search]);
      domain.push(['code', 'ilike', search]);
    }

    if (productId) {
      domain.push(['product_tmpl_id', '=', parseInt(productId)]);
    }

    const odoo = await getOdooClientForSession(session);

    // Get total count
    const totalCount = await odoo.searchCount('mrp.bom', domain);

    // Get BOMs
    const boms = await odoo.searchRead<MrpBom>('mrp.bom', domain, {
      fields: [
        'product_tmpl_id', 'product_id', 'product_qty', 'product_uom_id',
        'code', 'type', 'active', 'bom_line_ids',
      ],
      limit,
      offset,
      order: 'product_tmpl_id asc',
    });

    // Fetch BOM lines for all BOMs
    const allLineIds = boms.flatMap(b => b.bom_line_ids || []);
    let bomLines: MrpBomLine[] = [];
    if (allLineIds.length > 0) {
      bomLines = await odoo.searchRead<MrpBomLine>('mrp.bom.line', [['id', 'in', allLineIds]], {
        fields: ['bom_id', 'product_id', 'product_qty', 'product_uom_id', 'sequence'],
        order: 'sequence asc',
      });
    }

    // Group lines by BOM
    const linesByBom = new Map<number, MrpBomLine[]>();
    bomLines.forEach(line => {
      const bomId = Array.isArray(line.bom_id) ? line.bom_id[0] : 0;
      if (!linesByBom.has(bomId)) {
        linesByBom.set(bomId, []);
      }
      linesByBom.get(bomId)!.push(line);
    });

    return NextResponse.json({
      success: true,
      data: {
        items: boms.map(b => ({
          id: b.id,
          productTemplateId: b.product_tmpl_id[0],
          productTemplateName: b.product_tmpl_id[1],
          productId: Array.isArray(b.product_id) ? b.product_id[0] : null,
          productName: Array.isArray(b.product_id) ? b.product_id[1] : null,
          quantity: b.product_qty,
          uomId: b.product_uom_id[0],
          uomName: b.product_uom_id[1],
          code: b.code || null,
          type: b.type,
          active: b.active,
          lines: (linesByBom.get(b.id) || []).map(l => ({
            id: l.id,
            productId: l.product_id[0],
            productName: l.product_id[1],
            quantity: l.product_qty,
            uomId: l.product_uom_id[0],
            uomName: l.product_uom_id[1],
            sequence: l.sequence,
          })),
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
    console.error('[BOM Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch BOMs' } },
      { status: 500 }
    );
  }
}

// POST - Create new BOM
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
      productTemplateId,
      productId,
      quantity = 1,
      code,
      type = 'normal',
      lines = [],
    } = body;

    if (!productTemplateId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Product is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Create BOM with lines
    const bomData: Record<string, unknown> = {
      product_tmpl_id: productTemplateId,
      product_id: productId || false,
      product_qty: quantity,
      code: code || false,
      type,
      active: true,
      bom_line_ids: lines.map((line: { productId: number; quantity: number; sequence?: number }) => [
        0,
        0,
        {
          product_id: line.productId,
          product_qty: line.quantity,
          sequence: line.sequence || 10,
        },
      ]),
    };

    const bomId = await odoo.create('mrp.bom', bomData);

    return NextResponse.json({
      success: true,
      data: { id: bomId },
    });
  } catch (error) {
    console.error('[BOM Create Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create BOM' } },
      { status: 500 }
    );
  }
}

// PATCH - Update BOM
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
    const { id, quantity, code, type, active, lines } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'BOM ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const values: Record<string, unknown> = {};
    if (quantity !== undefined) values.product_qty = quantity;
    if (code !== undefined) values.code = code || false;
    if (type !== undefined) values.type = type;
    if (active !== undefined) values.active = active;

    // Update lines if provided
    if (lines !== undefined) {
      // Get existing lines
      const [bom] = await odoo.read<MrpBom>('mrp.bom', [id], ['bom_line_ids']);
      const existingLineIds = bom.bom_line_ids || [];

      // Delete existing lines and create new ones
      const lineCommands: unknown[] = [];

      // Delete all existing lines
      existingLineIds.forEach((lineId: number) => {
        lineCommands.push([2, lineId, 0]);
      });

      // Create new lines
      lines.forEach((line: { productId: number; quantity: number; sequence?: number }) => {
        lineCommands.push([
          0,
          0,
          {
            product_id: line.productId,
            product_qty: line.quantity,
            sequence: line.sequence || 10,
          },
        ]);
      });

      values.bom_line_ids = lineCommands;
    }

    await odoo.write('mrp.bom', [id], values);

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('[BOM Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update BOM' } },
      { status: 500 }
    );
  }
}

// DELETE - Delete BOM
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
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'BOM ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);
    await odoo.unlink('mrp.bom', [id]);

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('[BOM Delete Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete BOM' } },
      { status: 500 }
    );
  }
}
