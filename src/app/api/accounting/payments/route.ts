import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Accounting Payments API - Compatible with Odoo 18
 * Syncs with account.payment model
 */

interface AccountPayment {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  payment_type: 'inbound' | 'outbound';
  partner_type: 'customer' | 'supplier';
  amount: number;
  currency_id: [number, string] | false;
  date: string;
  ref: string | false;
  state: 'draft' | 'posted' | 'sent' | 'reconciled' | 'cancelled';
  payment_method_line_id: [number, string] | false;
  journal_id: [number, string] | false;
  destination_account_id: [number, string] | false;
  reconciled_invoice_ids: number[] | false;
}

type PaymentQueueType = 'draft' | 'posted' | 'reconciled' | 'all';
type PaymentType = 'inbound' | 'outbound' | 'all';

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
      // Fallback to FINANCE module check
      const financeCheck = await isModuleAccessible('FINANCE', session.userId, session.tenantId);
      if (!financeCheck.allowed) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Module not accessible' } },
          { status: 403 }
        );
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const queue = (searchParams.get('queue') || 'all') as PaymentQueueType;
    const paymentType = (searchParams.get('type') || 'all') as PaymentType;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [];

    // Filter by payment type
    if (paymentType !== 'all') {
      domain.push(['payment_type', '=', paymentType]);
    }

    // Filter by state
    switch (queue) {
      case 'draft':
        domain.push(['state', '=', 'draft']);
        break;
      case 'posted':
        domain.push(['state', '=', 'posted']);
        break;
      case 'reconciled':
        domain.push(['state', '=', 'reconciled']);
        break;
    }

    // Date filter
    if (dateFrom) {
      domain.push(['date', '>=', dateFrom]);
    }
    if (dateTo) {
      domain.push(['date', '<=', dateTo]);
    }

    // Search filter
    if (search) {
      domain.push('|', '|');
      domain.push(['name', 'ilike', search]);
      domain.push(['partner_id', 'ilike', search]);
      domain.push(['ref', 'ilike', search]);
    }

    // Fetch payments
    let items: AccountPayment[] = [];
    let totalCount = 0;

    try {
      totalCount = await odoo.searchCount('account.payment', domain);
      items = await odoo.searchRead<AccountPayment>('account.payment', domain, {
        fields: [
          'name', 'partner_id', 'payment_type', 'partner_type', 'amount',
          'currency_id', 'date', 'ref', 'state', 'payment_method_line_id',
          'journal_id', 'destination_account_id', 'reconciled_invoice_ids'
        ],
        limit,
        offset,
        order: 'date desc, id desc',
      });
    } catch (e) {
      console.log('[Payments] Could not fetch from account.payment:', e);
    }

    // Fetch KPIs
    let allPayments: AccountPayment[] = [];
    try {
      allPayments = await odoo.searchRead<AccountPayment>('account.payment', [], {
        fields: ['payment_type', 'amount', 'state', 'date'],
        limit: 5000,
      });
    } catch (e) {
      console.log('[Payments] Could not fetch all payments for KPIs:', e);
    }

    // Calculate KPIs
    let draftCount = 0, draftAmount = 0;
    let postedCount = 0, postedAmount = 0;
    let inboundAmount = 0, outboundAmount = 0;

    allPayments.forEach(p => {
      const amount = p.amount || 0;

      if (p.state === 'draft') {
        draftCount++;
        draftAmount += amount;
      } else if (p.state === 'posted' || p.state === 'reconciled') {
        postedCount++;
        postedAmount += amount;
      }

      if (p.payment_type === 'inbound' && p.state !== 'draft') {
        inboundAmount += amount;
      } else if (p.payment_type === 'outbound' && p.state !== 'draft') {
        outboundAmount += amount;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          draftCount,
          draftAmount,
          postedCount,
          postedAmount,
          inboundAmount,
          outboundAmount,
        },
        items: items.map(item => ({
          id: item.id,
          name: item.name || '',
          partnerId: Array.isArray(item.partner_id) ? item.partner_id[0] : null,
          partnerName: Array.isArray(item.partner_id) ? item.partner_id[1] : '-',
          paymentType: item.payment_type,
          partnerType: item.partner_type,
          amount: item.amount || 0,
          currency: Array.isArray(item.currency_id) ? item.currency_id[1] : 'JPY',
          date: item.date || null,
          ref: item.ref || null,
          state: item.state,
          paymentMethod: Array.isArray(item.payment_method_line_id) ? item.payment_method_line_id[1] : null,
          journalName: Array.isArray(item.journal_id) ? item.journal_id[1] : null,
          hasInvoices: Array.isArray(item.reconciled_invoice_ids) && item.reconciled_invoice_ids.length > 0,
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
    console.error('[Payments Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payments' } },
      { status: 500 }
    );
  }
}

// Create or post payment
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { paymentId, action, data } = body;

    const odoo = await getOdooClientForSession(session);

    if (action === 'post' && paymentId) {
      await odoo.callKw('account.payment', 'action_post', [[paymentId]]);
      return NextResponse.json({ success: true, data: { message: 'Payment posted' } });
    }

    if (action === 'draft' && paymentId) {
      await odoo.callKw('account.payment', 'action_draft', [[paymentId]]);
      return NextResponse.json({ success: true, data: { message: 'Payment reset to draft' } });
    }

    if (action === 'cancel' && paymentId) {
      await odoo.callKw('account.payment', 'action_cancel', [[paymentId]]);
      return NextResponse.json({ success: true, data: { message: 'Payment cancelled' } });
    }

    // Create new payment
    if (data) {
      const newPaymentId = await odoo.create('account.payment', data);
      return NextResponse.json({ success: true, data: { id: newPaymentId } });
    }

    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Payments Action Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process payment';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}
