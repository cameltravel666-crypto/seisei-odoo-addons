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
  move_ids_without_package: number[];
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
    const pickingType = searchParams.get('type'); // incoming, outgoing, internal
    const state = searchParams.get('state'); // draft, waiting, confirmed, assigned, done, cancel
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [];

    // Filter by picking type code
    if (pickingType) {
      domain.push(['picking_type_code', '=', pickingType]);
    }

    // Filter by state
    if (state) {
      domain.push(['state', '=', state]);
    }

    // Search by name or origin
    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['origin', 'ilike', search]);
    }

    const totalCount = await odoo.searchCount('stock.picking', domain);
    const pickings = await odoo.searchRead<StockPicking>('stock.picking', domain, {
      fields: [
        'name', 'partner_id', 'scheduled_date', 'date_done', 'origin',
        'state', 'picking_type_id', 'picking_type_code',
        'location_id', 'location_dest_id', 'move_ids_without_package'
      ],
      limit,
      offset,
      order: 'scheduled_date desc, id desc',
    });

    // Get summary counts by state for the current type filter
    const summaryDomain: unknown[] = pickingType ? [['picking_type_code', '=', pickingType]] : [];
    const summaryByState = await odoo.readGroup(
      'stock.picking',
      summaryDomain,
      ['state'],
      ['state']
    ) as Array<{ state: string; state_count: number }>;

    const summary = {
      draft: 0,
      waiting: 0,
      confirmed: 0,
      assigned: 0, // Ready
      done: 0,
      cancel: 0,
    };

    summaryByState.forEach((group) => {
      if (group.state in summary) {
        summary[group.state as keyof typeof summary] = group.state_count;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        items: pickings.map((p) => ({
          id: p.id,
          name: p.name,
          partnerId: Array.isArray(p.partner_id) ? p.partner_id[0] : null,
          partnerName: Array.isArray(p.partner_id) ? p.partner_id[1] : null,
          scheduledDate: p.scheduled_date,
          dateDone: p.date_done || null,
          origin: p.origin || null,
          state: p.state,
          pickingTypeId: Array.isArray(p.picking_type_id) ? p.picking_type_id[0] : null,
          pickingTypeName: Array.isArray(p.picking_type_id) ? p.picking_type_id[1] : null,
          pickingTypeCode: p.picking_type_code,
          locationId: Array.isArray(p.location_id) ? p.location_id[0] : null,
          locationName: Array.isArray(p.location_id) ? p.location_id[1] : null,
          locationDestId: Array.isArray(p.location_dest_id) ? p.location_dest_id[0] : null,
          locationDestName: Array.isArray(p.location_dest_id) ? p.location_dest_id[1] : null,
          moveCount: p.move_ids_without_package?.length || 0,
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        summary,
      },
    });
  } catch (error) {
    console.error('[Pickings Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pickings' } },
      { status: 500 }
    );
  }
}
