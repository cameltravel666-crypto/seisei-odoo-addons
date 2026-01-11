import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface ExpenseSheet {
  id: number;
  name: string;
  employee_id: [number, string] | false;
  total_amount: number;
  create_date: string;
  state: string;
}

interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  amount_total: number;
  date_order: string;
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

    // Check module access
    const hasAccess = await isModuleAccessible('APPROVALS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Approvals module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all'; // expense, purchase, leave
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    const approvals: Array<{
      id: number;
      type: string;
      name: string;
      requester: string;
      amount: number | null;
      date: string;
      state: string;
      model: string;
    }> = [];

    // Fetch expense reports pending approval
    if (type === 'all' || type === 'expense') {
      try {
        const expenses = await odoo.searchRead<ExpenseSheet>('hr.expense.sheet', [
          ['state', '=', 'submit'],
        ], {
          fields: ['name', 'employee_id', 'total_amount', 'create_date', 'state'],
          limit: type === 'expense' ? limit : 10,
          offset: type === 'expense' ? offset : 0,
        });

        for (const exp of expenses) {
          approvals.push({
            id: exp.id,
            type: 'expense',
            name: exp.name,
            requester: Array.isArray(exp.employee_id) ? exp.employee_id[1] : 'Unknown',
            amount: exp.total_amount,
            date: exp.create_date,
            state: exp.state,
            model: 'hr.expense.sheet',
          });
        }
      } catch {
        // Module might not be installed
      }
    }

    // Fetch purchase orders pending approval
    if (type === 'all' || type === 'purchase') {
      try {
        const purchases = await odoo.searchRead<PurchaseOrder>('purchase.order', [
          ['state', '=', 'to approve'],
        ], {
          fields: ['name', 'partner_id', 'amount_total', 'date_order', 'state'],
          limit: type === 'purchase' ? limit : 10,
          offset: type === 'purchase' ? offset : 0,
        });

        for (const po of purchases) {
          approvals.push({
            id: po.id,
            type: 'purchase',
            name: po.name,
            requester: Array.isArray(po.partner_id) ? po.partner_id[1] : 'Unknown',
            amount: po.amount_total,
            date: po.date_order,
            state: po.state,
            model: 'purchase.order',
          });
        }
      } catch {
        // Module might not be installed
      }
    }

    // Sort by date desc
    approvals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      success: true,
      data: {
        items: approvals.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total: approvals.length,
          totalPages: Math.ceil(approvals.length / limit),
        },
      },
    });
  } catch (error) {
    console.error('[Approvals Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch approvals' } },
      { status: 500 }
    );
  }
}
