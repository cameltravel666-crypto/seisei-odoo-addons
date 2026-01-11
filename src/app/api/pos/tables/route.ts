import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';
import { prisma } from '@/lib/db';

interface Floor {
  id: number;
  name: string;
  sequence: number;
  background_color: string | false;
}

interface Table {
  id: number;
  table_number?: string;
  name?: string;
  floor_id: [number, string] | false;
  seats: number;
  position_h: number;
  position_v: number;
  width: number;
  height: number;
  shape: string;
  color: string | false;
  active: boolean;
}

interface OrderInfo {
  id: number;
  table_id: [number, string] | false;
  state: string;
  amount_total: number;
  partner_id: [number, string] | false;
  create_date: string;
}

// GET - List floors and tables with status
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
    const floorId = searchParams.get('floor_id');

    const odoo = await getOdooClientForSession(session);

    // Try to get floors - if restaurant module not installed, return empty
    let floors: Floor[] = [];
    let tables: Table[] = [];

    try {
      // Get all floors
      floors = await odoo.searchRead<Floor>('restaurant.floor', [], {
        fields: ['name', 'sequence', 'background_color'],
        order: 'sequence asc, name asc',
      });
    } catch (error) {
      console.log('[Tables] restaurant.floor not available, module may not be installed');
      // Return empty state if restaurant module not installed
      return NextResponse.json({
        success: true,
        data: {
          floors: [],
          stats: { total: 0, occupied: 0, available: 0 },
          moduleNotInstalled: true,
        },
      });
    }

    try {
      // Build table domain
      const tableDomain: unknown[] = [['active', '=', true]];
      if (floorId) {
        tableDomain.push(['floor_id', '=', parseInt(floorId)]);
      }

      // Get all tables - Odoo 18 uses table_number instead of name
      tables = await odoo.searchRead<Table>('restaurant.table', tableDomain, {
        fields: ['table_number', 'floor_id', 'seats', 'position_h', 'position_v', 'width', 'height', 'shape', 'color', 'active'],
        order: 'floor_id asc, table_number asc',
      });
    } catch (error) {
      console.log('[Tables] Failed to fetch tables:', error);
      tables = [];
    }

    // Get active orders (draft state) to determine which tables are occupied
    const tableIds = tables.map(t => t.id);
    let activeOrders: OrderInfo[] = [];

    if (tableIds.length > 0) {
      try {
        activeOrders = await odoo.searchRead<OrderInfo>('pos.order', [
          ['table_id', 'in', tableIds],
          ['state', '=', 'draft'],
        ], {
          fields: ['table_id', 'state', 'amount_total', 'partner_id', 'create_date'],
          order: 'create_date desc',
        });
      } catch (error) {
        console.log('[Tables] Failed to fetch orders:', error);
      }
    }

    // Build a map of table_id to active order
    const tableOrderMap = new Map<number, OrderInfo>();
    for (const order of activeOrders) {
      if (order.table_id && !tableOrderMap.has(order.table_id[0])) {
        tableOrderMap.set(order.table_id[0], order);
      }
    }

    // Enrich tables with status
    const enrichedTables = tables.map(table => {
      const activeOrder = tableOrderMap.get(table.id);
      return {
        ...table,
        name: table.table_number || table.name || `Table ${table.id}`,
        isOccupied: !!activeOrder,
        activeOrder: activeOrder ? {
          id: activeOrder.id,
          state: activeOrder.state,
          amount_total: activeOrder.amount_total,
          partner_id: activeOrder.partner_id,
          create_date: activeOrder.create_date,
        } : null,
      };
    });

    // Group tables by floor
    const floorMap = new Map<number, typeof enrichedTables>();
    for (const table of enrichedTables) {
      const fid = table.floor_id ? table.floor_id[0] : 0;
      if (!floorMap.has(fid)) {
        floorMap.set(fid, []);
      }
      floorMap.get(fid)!.push(table);
    }

    // Build response with floors containing their tables
    const floorsWithTables = floors.map(floor => ({
      ...floor,
      tables: floorMap.get(floor.id) || [],
      stats: {
        total: (floorMap.get(floor.id) || []).length,
        occupied: (floorMap.get(floor.id) || []).filter(t => t.isOccupied).length,
        available: (floorMap.get(floor.id) || []).filter(t => !t.isOccupied).length,
      },
    }));

    // Calculate overall stats
    const totalTables = enrichedTables.length;
    const occupiedTables = enrichedTables.filter(t => t.isOccupied).length;

    // Get tenant info for Odoo base URL
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { odooBaseUrl: true },
    });

    // Get active POS session for config_id
    let posConfigId: number | null = null;
    try {
      const sessions = await odoo.searchRead<{ id: number; config_id: [number, string] }>('pos.session', [
        ['state', '=', 'opened'],
      ], {
        fields: ['id', 'config_id'],
        limit: 1,
      });
      if (sessions.length > 0 && sessions[0].config_id) {
        posConfigId = sessions[0].config_id[0];
      }
    } catch {
      // POS session lookup failed, ignore
    }

    return NextResponse.json({
      success: true,
      data: {
        floors: floorsWithTables,
        stats: {
          total: totalTables,
          occupied: occupiedTables,
          available: totalTables - occupiedTables,
        },
        posUrl: tenant?.odooBaseUrl ? {
          baseUrl: tenant.odooBaseUrl,
          configId: posConfigId,
        } : null,
      },
    });
  } catch (error) {
    console.error('[POS Tables Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tables' } },
      { status: 500 }
    );
  }
}

// PATCH - Update table (toggle status, etc.)
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
    const { table_id, action } = body;

    if (!table_id || !action) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'table_id and action are required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    if (action === 'close') {
      // Close table: Find and remove draft orders for this table
      const draftOrders = await odoo.searchRead<{ id: number; lines: number[] }>('pos.order', [
        ['table_id', '=', table_id],
        ['state', '=', 'draft'],
      ], {
        fields: ['id', 'lines'],
      });

      // Delete or cancel draft orders (delete if empty, cancel if has lines)
      let closedCount = 0;
      for (const order of draftOrders) {
        try {
          if (!order.lines || order.lines.length === 0) {
            // Empty order - can delete
            await odoo.unlink('pos.order', [order.id]);
          } else {
            // Has lines - cancel instead
            await odoo.write('pos.order', [order.id], { state: 'cancel' });
          }
          closedCount++;
        } catch (error) {
          console.error(`Failed to close order ${order.id}:`, error);
          // Try alternative: just clear table_id
          try {
            await odoo.write('pos.order', [order.id], { table_id: false });
            closedCount++;
          } catch (e2) {
            console.error(`Failed to clear table from order ${order.id}:`, e2);
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: { message: 'Table closed', closedOrders: closedCount },
      });
    }

    if (action === 'open') {
      // Open table: Create a draft POS order for this table
      console.log('[Table Open] Starting for table_id:', table_id);

      // First, find an active POS session
      let sessions: { id: number; config_id: [number, string] }[] = [];
      try {
        sessions = await odoo.searchRead<{ id: number; config_id: [number, string] }>('pos.session', [
          ['state', '=', 'opened'],
        ], {
          fields: ['id', 'config_id'],
          limit: 1,
        });
        console.log('[Table Open] Found sessions:', sessions.length);
      } catch (sessionError) {
        console.error('[Table Open] Failed to fetch sessions:', sessionError);
        return NextResponse.json({
          success: false,
          error: { code: 'SESSION_ERROR', message: `Session lookup failed: ${(sessionError as Error).message}` },
        }, { status: 500 });
      }

      if (sessions.length === 0) {
        return NextResponse.json({
          success: false,
          error: { code: 'NO_SESSION', message: 'No active POS session. Please open a POS session first.' },
        }, { status: 400 });
      }

      const sessionId = sessions[0].id;
      console.log('[Table Open] Using session:', sessionId);

      // Check if table already has a draft order
      const existingOrders = await odoo.searchRead<{ id: number }>('pos.order', [
        ['table_id', '=', table_id],
        ['state', '=', 'draft'],
      ], {
        fields: ['id'],
        limit: 1,
      });

      if (existingOrders.length > 0) {
        console.log('[Table Open] Table already has order:', existingOrders[0].id);
        return NextResponse.json({
          success: true,
          data: { message: 'Table already has an active order', orderId: existingOrders[0].id },
        });
      }

      // Create a new draft order for this table
      try {
        console.log('[Table Open] Creating order with session_id:', sessionId, 'table_id:', table_id);
        const newOrderId = await odoo.create('pos.order', {
          session_id: sessionId,
          table_id: table_id,
          state: 'draft',
          lines: [],
          amount_total: 0,
          amount_tax: 0,
          amount_paid: 0,
          amount_return: 0,
        });
        console.log('[Table Open] Created order:', newOrderId);

        return NextResponse.json({
          success: true,
          data: { message: 'Table opened', orderId: newOrderId },
        });
      } catch (createError) {
        console.error('[Table Open] Failed to create POS order:', createError);
        const errMsg = (createError as Error).message || 'Unknown error';
        return NextResponse.json({
          success: false,
          error: { code: 'CREATE_FAILED', message: `Failed to create order: ${errMsg}` },
        }, { status: 500 });
      }
    }

    return NextResponse.json(
      { success: false, error: { code: 'INVALID_ACTION', message: 'Invalid action' } },
      { status: 400 }
    );
  } catch (error) {
    console.error('[POS Table Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update table' } },
      { status: 500 }
    );
  }
}
