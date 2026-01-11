import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface MaintenanceRequest {
  id: number;
  name: string;
  equipment_id: [number, string] | false;
  request_date: string;
  schedule_date: string | false;
  stage_id: [number, string];
  priority: string;
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

    const hasAccess = await isModuleAccessible('MAINTENANCE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Maintenance module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    const domain: unknown[] = [];

    const totalCount = await odoo.searchCount('maintenance.request', domain);
    const items = await odoo.searchRead<MaintenanceRequest>('maintenance.request', domain, {
      fields: ['name', 'equipment_id', 'request_date', 'schedule_date', 'stage_id', 'priority'],
      limit,
      offset,
      order: 'request_date desc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          equipmentName: Array.isArray(item.equipment_id) ? item.equipment_id[1] : '-',
          requestDate: item.request_date,
          scheduleDate: item.schedule_date || null,
          stageName: item.stage_id[1],
          priority: item.priority,
        })),
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error) {
    console.error('[Maintenance Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch maintenance requests' } },
      { status: 500 }
    );
  }
}
