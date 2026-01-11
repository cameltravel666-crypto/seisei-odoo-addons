import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createOdooClient } from '@/lib/odoo';

interface Table {
  id: number;
  table_number?: string;
  name?: string;
}

interface OrderInfo {
  id: number;
  table_id: [number, string] | false;
  state: string;
}

// Public API - no authentication required (for QR code scanning)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tableId = searchParams.get('table_id');
    const tenantCode = searchParams.get('tenant') || 'default';

    if (!tableId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'table_id is required' } },
        { status: 400 }
      );
    }

    // Get tenant info - for now use default tenant or from query param
    const tenant = await prisma.tenant.findFirst({
      where: tenantCode === 'default' ? { isActive: true } : { tenantCode, isActive: true },
      select: { id: true, odooBaseUrl: true, odooDb: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 }
      );
    }

    // Get any active session for this tenant to make Odoo calls
    const session = await prisma.session.findFirst({
      where: {
        tenantId: tenant.id,
        expiresAt: { gt: new Date() },
      },
      select: { odooSessionId: true },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_SESSION', message: 'No active session' } },
        { status: 503 }
      );
    }

    // Create Odoo client
    const odoo = createOdooClient({
      baseUrl: tenant.odooBaseUrl,
      db: tenant.odooDb,
    });
    odoo.setSession(session.odooSessionId);

    // Get table info
    let table: Table | null = null;
    try {
      const tables = await odoo.searchRead<Table>('restaurant.table', [
        ['id', '=', parseInt(tableId)],
        ['active', '=', true],
      ], {
        fields: ['table_number', 'name'],
        limit: 1,
      });
      table = tables[0] || null;
    } catch (error) {
      console.log('[Table Status] Failed to fetch table:', error);
    }

    if (!table) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Table not found' } },
        { status: 404 }
      );
    }

    const tableName = table.table_number || table.name || `Table ${tableId}`;

    // Check if table is disabled (has draft order = disabled for QR ordering)
    // Default: no order = QR ordering enabled
    let isOpen = true; // Default: open for QR ordering
    try {
      const orders = await odoo.searchRead<OrderInfo>('pos.order', [
        ['table_id', '=', parseInt(tableId)],
        ['state', '=', 'draft'],
      ], {
        fields: ['id', 'state'],
        limit: 1,
      });
      // If has draft order, table is CLOSED for QR ordering
      isOpen = orders.length === 0;
    } catch (error) {
      console.log('[Table Status] Failed to check orders:', error);
      // On error, default to open
      isOpen = true;
    }

    // Get POS URL for ordering (if table is open)
    let posUrl: string | null = null;
    if (isOpen) {
      try {
        const sessions = await odoo.searchRead<{ id: number; config_id: [number, string] }>('pos.session', [
          ['state', '=', 'opened'],
        ], {
          fields: ['id', 'config_id'],
          limit: 1,
        });

        if (sessions.length > 0 && sessions[0].config_id) {
          const configId = sessions[0].config_id[0];
          // Use Odoo's self-ordering URL or custom ordering page
          posUrl = `${tenant.odooBaseUrl}/pos/ui?config_id=${configId}`;
        }
      } catch (error) {
        console.log('[Table Status] Failed to get POS session:', error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        tableId: parseInt(tableId),
        tableName,
        isOpen,
        posUrl,
      },
    });
  } catch (error) {
    console.error('[Table Status Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to check table status' } },
      { status: 500 }
    );
  }
}
