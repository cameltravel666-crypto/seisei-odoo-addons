import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Expense {
  id: number;
  name: string;
  employee_id: [number, string] | false;
  total_amount: number;
  date: string;
  state: string;
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

    const hasAccess = await isModuleAccessible('EXPENSES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Expenses module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const state = searchParams.get('state');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    const domain: unknown[] = [];
    if (state) {
      domain.push(['state', '=', state]);
    }
    if (dateFrom) {
      domain.push(['date', '>=', dateFrom]);
    }
    if (dateTo) {
      domain.push(['date', '<=', dateTo]);
    }

    const totalCount = await odoo.searchCount('hr.expense', domain);
    const items = await odoo.searchRead<Expense>('hr.expense', domain, {
      fields: ['name', 'employee_id', 'total_amount', 'date', 'state'],
      limit,
      offset,
      order: 'date desc',
    });

    // Build base domain for summary (without state filter)
    const baseDomain: unknown[] = [];
    if (dateFrom) {
      baseDomain.push(['date', '>=', dateFrom]);
    }
    if (dateTo) {
      baseDomain.push(['date', '<=', dateTo]);
    }

    // Get summary by state
    const summaryByState = await odoo.readGroup(
      'hr.expense',
      baseDomain,
      ['state', 'total_amount:sum'],
      ['state']
    ) as Array<{ state: string; state_count: number; total_amount: number }>;

    let totalOrders = 0;
    let totalAmount = 0;
    let refusedCount = 0;

    summaryByState.forEach((group) => {
      totalOrders += group.state_count;
      totalAmount += group.total_amount || 0;
      if (group.state === 'refused') {
        refusedCount = group.state_count;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          employeeId: Array.isArray(item.employee_id) ? item.employee_id[0] : null,
          employeeName: Array.isArray(item.employee_id) ? item.employee_id[1] : '-',
          amount: item.total_amount,
          date: item.date,
          state: item.state,
        })),
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
        summary: {
          totalOrders,
          totalAmount,
          avgAmount: totalOrders > 0 ? totalAmount / totalOrders : 0,
          cancelledCount: refusedCount,
        },
      },
    });
  } catch (error) {
    console.error('[Expenses Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch expenses' } },
      { status: 500 }
    );
  }
}
