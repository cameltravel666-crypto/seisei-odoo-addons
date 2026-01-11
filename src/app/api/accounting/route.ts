import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Expenses API - Compatible with Odoo 18
 * Syncs with hr.expense model
 */

interface HrExpense {
  id: number;
  name: string;
  employee_id: [number, string] | false;
  product_id: [number, string] | false;
  total_amount: number;
  date: string;
  state: string;
  description: string | false;
  reference: string | false;
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

    const accessCheck = await isModuleAccessible('ACCOUNTING', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Expenses module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const queue = searchParams.get('queue') || 'draft';
    const sortBy = searchParams.get('sort') || 'date';

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Build domain based on queue
    let domain: unknown[] = [];
    switch (queue) {
      case 'draft':
        domain = [['state', '=', 'draft']];
        break;
      case 'submitted':
        domain = [['state', '=', 'reported']];
        break;
      case 'approved':
        domain = [['state', '=', 'approved']];
        break;
      case 'done':
        domain = [['state', '=', 'done']];
        break;
      default:
        domain = [];
    }

    // Sort order
    let orderStr = 'date desc';
    if (sortBy === 'amount') orderStr = 'total_amount desc';

    // Fetch expenses with error handling
    let items: HrExpense[] = [];
    let totalCount = 0;
    let allExpenses: HrExpense[] = [];

    try {
      totalCount = await odoo.searchCount('hr.expense', domain);
      items = await odoo.searchRead<HrExpense>('hr.expense', domain, {
        fields: [
          'name', 'employee_id', 'product_id', 'total_amount',
          'date', 'state', 'description', 'reference'
        ],
        limit,
        offset,
        order: orderStr,
      });

      // Fetch all expenses for KPIs (limit for performance)
      allExpenses = await odoo.searchRead<HrExpense>('hr.expense', [], {
        fields: ['state', 'total_amount', 'date'],
        limit: 1000,
      });
    } catch (e) {
      console.log('[Expenses] Could not fetch from hr.expense:', e);
      // Return empty data if hr.expense is not available
    }

    // Calculate KPIs
    const thisMonth = new Date();
    thisMonth.setDate(1);
    const thisMonthStr = thisMonth.toISOString().split('T')[0];

    let draftCount = 0, draftAmount = 0;
    let submittedCount = 0, submittedAmount = 0;
    let approvedCount = 0, approvedAmount = 0;
    let doneCount = 0, doneAmount = 0;
    let thisMonthAmount = 0;

    allExpenses.forEach(exp => {
      const amount = exp.total_amount || 0;
      switch (exp.state) {
        case 'draft':
          draftCount++;
          draftAmount += amount;
          break;
        case 'reported':
          submittedCount++;
          submittedAmount += amount;
          break;
        case 'approved':
          approvedCount++;
          approvedAmount += amount;
          break;
        case 'done':
          doneCount++;
          doneAmount += amount;
          break;
      }
      if (exp.date && exp.date >= thisMonthStr) {
        thisMonthAmount += amount;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          draftCount,
          draftAmount,
          submittedCount,
          submittedAmount,
          approvedCount,
          approvedAmount,
          doneCount,
          doneAmount,
          thisMonthAmount,
        },
        items: items.map(item => ({
          id: item.id,
          name: item.name || '',
          employeeId: Array.isArray(item.employee_id) ? item.employee_id[0] : null,
          employeeName: Array.isArray(item.employee_id) ? item.employee_id[1] : '-',
          productName: Array.isArray(item.product_id) ? item.product_id[1] : null,
          amount: item.total_amount || 0,
          date: item.date,
          state: item.state,
          description: item.description || null,
          reference: item.reference || null,
          sheetName: null,
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
    console.error('[Expenses Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch expenses' } },
      { status: 500 }
    );
  }
}
