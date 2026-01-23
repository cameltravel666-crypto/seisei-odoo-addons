import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Cashier Summary API
 * Provides today's and month's cash flow summary
 */

interface Payment {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  payment_type: string;
  amount: number;
  date: string | null;
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

    // Check module access - allow both CASHIER and ACCOUNTING for backward compatibility
    const accessCheck = await isModuleAccessible('ACCOUNTING', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Module not accessible' } },
        { status: 403 }
      );
    }

    const odoo = await getOdooClientForSession(session);
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Fetch today's payments
    let todayPayments: Payment[] = [];
    try {
      todayPayments = await odoo.searchRead<Payment>('account.payment', [
        ['date', '=', today],
        ['state', 'in', ['posted', 'reconciled']]
      ], {
        fields: ['name', 'partner_id', 'payment_type', 'amount', 'date', 'state'],
      });
    } catch (e) {
      console.log('[Cashier] Could not fetch today payments:', e);
    }

    // Fetch month payments
    let monthPayments: Payment[] = [];
    try {
      monthPayments = await odoo.searchRead<Payment>('account.payment', [
        ['date', '>=', monthStart],
        ['date', '<=', today],
        ['state', 'in', ['posted', 'reconciled']]
      ], {
        fields: ['name', 'partner_id', 'payment_type', 'amount', 'date', 'state'],
      });
    } catch (e) {
      console.log('[Cashier] Could not fetch month payments:', e);
    }

    // Fetch recent payments (last 10)
    let recentPayments: Payment[] = [];
    try {
      recentPayments = await odoo.searchRead<Payment>('account.payment', [
        ['state', 'in', ['draft', 'posted', 'reconciled']]
      ], {
        fields: ['name', 'partner_id', 'payment_type', 'amount', 'date', 'state'],
        order: 'date desc, id desc',
        limit: 10,
      });
    } catch (e) {
      console.log('[Cashier] Could not fetch recent payments:', e);
    }

    // Calculate summaries
    const todayInbound = todayPayments
      .filter(p => p.payment_type === 'inbound')
      .reduce((sum, p) => sum + p.amount, 0);
    const todayOutbound = todayPayments
      .filter(p => p.payment_type === 'outbound')
      .reduce((sum, p) => sum + p.amount, 0);

    const monthInbound = monthPayments
      .filter(p => p.payment_type === 'inbound')
      .reduce((sum, p) => sum + p.amount, 0);
    const monthOutbound = monthPayments
      .filter(p => p.payment_type === 'outbound')
      .reduce((sum, p) => sum + p.amount, 0);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          todayInbound,
          todayOutbound,
          todayNet: todayInbound - todayOutbound,
          monthInbound,
          monthOutbound,
          monthNet: monthInbound - monthOutbound,
        },
        recentPayments: recentPayments.map(p => ({
          id: p.id,
          name: p.name,
          partnerName: Array.isArray(p.partner_id) ? p.partner_id[1] : '',
          paymentType: p.payment_type as 'inbound' | 'outbound',
          amount: p.amount,
          date: p.date,
          state: p.state,
        })),
      },
    });
  } catch (error) {
    console.error('[Cashier Summary Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch cashier summary' } },
      { status: 500 }
    );
  }
}
