import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface StockPicking {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  scheduled_date: string;
  date_done: string | false;
  origin: string | false;
  state: string;
  picking_type_id: [number, string] | false;
  picking_type_code: string;
  location_id: [number, string] | false;
  location_dest_id: [number, string] | false;
  note: string | false;
  move_ids_without_package: number[];
}

interface StockMove {
  id: number;
  product_id: [number, string] | false;
  product_uom_qty: number;
  quantity: number;  // Odoo 18 uses 'quantity' instead of 'quantity_done'
  product_uom: [number, string] | false;
  state: string;
  name: string;
}

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

    const hasAccess = await isModuleAccessible('INVENTORY', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Inventory module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const pickingId = parseInt(id);
    if (isNaN(pickingId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid picking ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Fetch picking details
    const [picking] = await odoo.searchRead<StockPicking>('stock.picking', [['id', '=', pickingId]], {
      fields: [
        'name', 'partner_id', 'scheduled_date', 'date_done', 'origin',
        'state', 'picking_type_id', 'picking_type_code',
        'location_id', 'location_dest_id', 'note', 'move_ids_without_package'
      ],
    });

    if (!picking) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Picking not found' } },
        { status: 404 }
      );
    }

    // Fetch stock moves
    const moves = await odoo.searchRead<StockMove>('stock.move', [['picking_id', '=', pickingId]], {
      fields: ['product_id', 'product_uom_qty', 'quantity', 'product_uom', 'state', 'name'],
      order: 'id asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        id: picking.id,
        name: picking.name,
        partnerId: Array.isArray(picking.partner_id) ? picking.partner_id[0] : null,
        partnerName: Array.isArray(picking.partner_id) ? picking.partner_id[1] : null,
        scheduledDate: picking.scheduled_date,
        dateDone: picking.date_done || null,
        origin: picking.origin || null,
        state: picking.state,
        pickingTypeId: Array.isArray(picking.picking_type_id) ? picking.picking_type_id[0] : null,
        pickingTypeName: Array.isArray(picking.picking_type_id) ? picking.picking_type_id[1] : null,
        pickingTypeCode: picking.picking_type_code,
        locationId: Array.isArray(picking.location_id) ? picking.location_id[0] : null,
        locationName: Array.isArray(picking.location_id) ? picking.location_id[1] : null,
        locationDestId: Array.isArray(picking.location_dest_id) ? picking.location_dest_id[0] : null,
        locationDestName: Array.isArray(picking.location_dest_id) ? picking.location_dest_id[1] : null,
        note: picking.note || null,
        moves: moves.map((m) => ({
          id: m.id,
          productId: Array.isArray(m.product_id) ? m.product_id[0] : null,
          productName: Array.isArray(m.product_id) ? m.product_id[1] : m.name,
          demandQty: m.product_uom_qty,
          doneQty: m.quantity || 0,
          uom: Array.isArray(m.product_uom) ? m.product_uom[1] : '',
          state: m.state,
        })),
      },
    });
  } catch (error) {
    console.error('[Picking Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch picking' } },
      { status: 500 }
    );
  }
}
