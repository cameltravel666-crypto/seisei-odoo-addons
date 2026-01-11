import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Finance Invoices API - Compatible with Odoo 18
 * Syncs with account.move model (invoices and bills)
 */

interface AccountMove {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  amount_untaxed: number;
  amount_tax: number;
  state: string;
  payment_state: string;
  move_type: string;
  invoice_origin: string | false;
  ref: string | false;
  currency_id: [number, string] | false;
}

// Invoice types
type InvoiceType = 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund';
type QueueType = 'draft' | 'posted' | 'unpaid' | 'paid' | 'all';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const accessCheck = await isModuleAccessible('FINANCE', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Finance module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const queue = (searchParams.get('queue') || 'all') as QueueType;
    const invoiceType = searchParams.get('type') as InvoiceType | 'all' || 'all';
    const sortBy = searchParams.get('sort') || 'date';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);
    const today = new Date().toISOString().split('T')[0];

    // Build domain
    const domain: unknown[] = [];

    // Filter by invoice type
    if (invoiceType !== 'all') {
      domain.push(['move_type', '=', invoiceType]);
    } else {
      // Only invoice types (exclude journal entries)
      domain.push(['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']]);
    }

    // Filter by queue/state
    switch (queue) {
      case 'draft':
        domain.push(['state', '=', 'draft']);
        break;
      case 'posted':
        domain.push(['state', '=', 'posted']);
        break;
      case 'unpaid':
        domain.push(['state', '=', 'posted']);
        domain.push(['payment_state', 'in', ['not_paid', 'partial']]);
        break;
      case 'paid':
        domain.push(['state', '=', 'posted']);
        domain.push(['payment_state', '=', 'paid']);
        break;
    }

    // Date filter
    if (dateFrom) {
      domain.push(['invoice_date', '>=', dateFrom]);
    }
    if (dateTo) {
      domain.push(['invoice_date', '<=', dateTo]);
    }

    // Search filter
    if (search) {
      domain.push('|', '|');
      domain.push(['name', 'ilike', search]);
      domain.push(['partner_id', 'ilike', search]);
      domain.push(['ref', 'ilike', search]);
    }

    // Sort order
    let orderStr = 'invoice_date desc, id desc';
    if (sortBy === 'amount') orderStr = 'amount_total desc';
    if (sortBy === 'due') orderStr = 'invoice_date_due asc';

    // Fetch invoices
    let items: AccountMove[] = [];
    let totalCount = 0;

    try {
      totalCount = await odoo.searchCount('account.move', domain);
      items = await odoo.searchRead<AccountMove>('account.move', domain, {
        fields: [
          'name', 'partner_id', 'invoice_date', 'invoice_date_due',
          'amount_total', 'amount_residual', 'amount_untaxed', 'amount_tax',
          'state', 'payment_state', 'move_type', 'invoice_origin', 'ref',
          'currency_id'
        ],
        limit,
        offset,
        order: orderStr,
      });
    } catch (e) {
      console.log('[Finance] Could not fetch from account.move:', e);
    }

    // Fetch KPIs (all invoice types for summary)
    let allInvoices: AccountMove[] = [];
    try {
      allInvoices = await odoo.searchRead<AccountMove>('account.move', [
        ['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']]
      ], {
        fields: ['state', 'payment_state', 'amount_total', 'amount_residual', 'move_type', 'invoice_date', 'invoice_date_due'],
        limit: 5000,
      });
    } catch (e) {
      console.log('[Finance] Could not fetch all invoices for KPIs:', e);
    }

    // Calculate KPIs
    let draftCount = 0, draftAmount = 0;
    let unpaidCount = 0, unpaidAmount = 0;
    let overdueCount = 0, overdueAmount = 0;
    let paidCount = 0, paidAmount = 0;
    let arAmount = 0, apAmount = 0;

    allInvoices.forEach(inv => {
      const amount = inv.amount_total || 0;
      const residual = inv.amount_residual || 0;
      const isCustomerInvoice = ['out_invoice', 'out_refund'].includes(inv.move_type);
      const isVendorBill = ['in_invoice', 'in_refund'].includes(inv.move_type);

      if (inv.state === 'draft') {
        draftCount++;
        draftAmount += amount;
      } else if (inv.state === 'posted') {
        if (inv.payment_state === 'paid') {
          paidCount++;
          paidAmount += amount;
        } else {
          unpaidCount++;
          unpaidAmount += residual;

          // Check for overdue
          if (inv.invoice_date_due && inv.invoice_date_due < today) {
            overdueCount++;
            overdueAmount += residual;
          }

          // AR/AP
          if (isCustomerInvoice) {
            arAmount += residual;
          } else if (isVendorBill) {
            apAmount += residual;
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          draftCount,
          draftAmount,
          unpaidCount,
          unpaidAmount,
          overdueCount,
          overdueAmount,
          paidCount,
          paidAmount,
          arAmount,
          apAmount,
        },
        items: items.map(item => {
          const dueDate = item.invoice_date_due || null;
          const isOverdue = dueDate && item.state === 'posted' &&
            item.payment_state !== 'paid' && dueDate < today;
          const overdueDays = isOverdue && dueDate
            ? Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          return {
            id: item.id,
            name: item.name || '',
            partnerId: Array.isArray(item.partner_id) ? item.partner_id[0] : null,
            partnerName: Array.isArray(item.partner_id) ? item.partner_id[1] : '-',
            invoiceDate: item.invoice_date || null,
            invoiceDateDue: item.invoice_date_due || null,
            amountTotal: item.amount_total || 0,
            amountResidual: item.amount_residual || 0,
            amountUntaxed: item.amount_untaxed || 0,
            amountTax: item.amount_tax || 0,
            state: item.state,
            paymentState: item.payment_state,
            moveType: item.move_type,
            invoiceOrigin: item.invoice_origin || null,
            ref: item.ref || null,
            currency: Array.isArray(item.currency_id) ? item.currency_id[1] : 'JPY',
            isOverdue,
            overdueDays,
          };
        }),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('[Finance Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch invoices' } },
      { status: 500 }
    );
  }
}

// Post invoice (action_post)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const accessCheck = await isModuleAccessible('FINANCE', session.userId, session.tenantId);
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Finance module not accessible' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { invoiceId, action } = body;

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invoice ID required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    if (action === 'post') {
      await odoo.callKw('account.move', 'action_post', [[invoiceId]]);
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Invoice updated' },
    });
  } catch (error) {
    console.error('[Finance Action Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update invoice';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}
