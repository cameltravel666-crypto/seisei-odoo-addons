import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Journal Entry Lines API - Compatible with Odoo 18
 * Syncs with account.move.line model (日记账分录)
 * This is the main accounting ledger view
 */

interface AccountMoveLine {
  id: number;
  move_id: [number, string] | false;
  move_name: string;
  date: string;
  account_id: [number, string] | false;
  partner_id: [number, string] | false;
  name: string;
  ref: string | false;
  debit: number;
  credit: number;
  balance: number;
  amount_currency: number;
  currency_id: [number, string] | false;
  reconciled: boolean;
  full_reconcile_id: [number, string] | false;
  matching_number: string | false;
  journal_id: [number, string] | false;
  analytic_distribution: Record<string, number> | false;
  parent_state: string;
}

type LineQueueType = 'all' | 'posted' | 'unreconciled';

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
    const limit = parseInt(searchParams.get('limit') || '50');
    const queue = (searchParams.get('queue') || 'posted') as LineQueueType;
    const journalId = searchParams.get('journal_id');
    const accountId = searchParams.get('account_id');
    const partnerId = searchParams.get('partner_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [];

    // Filter by state (parent_state refers to the move's state)
    if (queue === 'posted') {
      domain.push(['parent_state', '=', 'posted']);
    } else if (queue === 'unreconciled') {
      domain.push(['parent_state', '=', 'posted']);
      domain.push(['reconciled', '=', false]);
      domain.push(['account_id.reconcile', '=', true]);
    }

    // Filter by journal
    if (journalId) {
      domain.push(['journal_id', '=', parseInt(journalId)]);
    }

    // Filter by account
    if (accountId) {
      domain.push(['account_id', '=', parseInt(accountId)]);
    }

    // Filter by partner
    if (partnerId) {
      domain.push(['partner_id', '=', parseInt(partnerId)]);
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
      domain.push('|', '|', '|',
        ['move_name', 'ilike', search],
        ['name', 'ilike', search],
        ['ref', 'ilike', search],
        ['partner_id', 'ilike', search]
      );
    }

    // Fetch move lines
    let items: AccountMoveLine[] = [];
    let totalCount = 0;

    try {
      totalCount = await odoo.searchCount('account.move.line', domain);
      items = await odoo.searchRead<AccountMoveLine>('account.move.line', domain, {
        fields: [
          'move_id', 'move_name', 'date', 'account_id', 'partner_id',
          'name', 'ref', 'debit', 'credit', 'balance', 'amount_currency',
          'currency_id', 'reconciled', 'full_reconcile_id', 'matching_number',
          'journal_id', 'parent_state'
        ],
        limit,
        offset,
        order: 'date desc, move_name desc, id desc',
      });
    } catch (e) {
      console.log('[MoveLines] Could not fetch from account.move.line:', e);
    }

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;

    // Get totals from all matching records (not just current page)
    try {
      const totals = await odoo.readGroup('account.move.line', domain, ['debit:sum', 'credit:sum'], []) as Array<{ debit?: number; credit?: number }>;
      if (totals && totals.length > 0) {
        totalDebit = totals[0].debit || 0;
        totalCredit = totals[0].credit || 0;
      }
    } catch (e) {
      console.log('[MoveLines] Could not calculate totals:', e);
      // Fallback: calculate from current page
      items.forEach(item => {
        totalDebit += item.debit || 0;
        totalCredit += item.credit || 0;
      });
    }

    // Fetch KPIs
    let postedCount = 0, unreconciledCount = 0;
    try {
      postedCount = await odoo.searchCount('account.move.line', [['parent_state', '=', 'posted']]);
      unreconciledCount = await odoo.searchCount('account.move.line', [
        ['parent_state', '=', 'posted'],
        ['reconciled', '=', false],
        ['account_id.reconcile', '=', true]
      ]);
    } catch (e) {
      console.log('[MoveLines] Could not fetch line counts:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          postedCount,
          unreconciledCount,
          totalDebit,
          totalCredit,
        },
        items: items.map(item => ({
          id: item.id,
          moveId: Array.isArray(item.move_id) ? item.move_id[0] : null,
          moveName: item.move_name || (Array.isArray(item.move_id) ? item.move_id[1] : '-'),
          date: item.date || null,
          accountId: Array.isArray(item.account_id) ? item.account_id[0] : null,
          accountName: Array.isArray(item.account_id) ? item.account_id[1] : '-',
          partnerId: Array.isArray(item.partner_id) ? item.partner_id[0] : null,
          partnerName: Array.isArray(item.partner_id) ? item.partner_id[1] : null,
          label: item.name || '',
          ref: item.ref || null,
          debit: item.debit || 0,
          credit: item.credit || 0,
          balance: item.balance || 0,
          amountCurrency: item.amount_currency || 0,
          currency: Array.isArray(item.currency_id) ? item.currency_id[1] : 'JPY',
          reconciled: item.reconciled || false,
          matchingNumber: item.matching_number || null,
          journalId: Array.isArray(item.journal_id) ? item.journal_id[0] : null,
          journalName: Array.isArray(item.journal_id) ? item.journal_id[1] : '-',
          state: item.parent_state || 'draft',
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          balance: totalDebit - totalCredit,
        },
      },
    });
  } catch (error) {
    console.error('[MoveLines Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch move lines' } },
      { status: 500 }
    );
  }
}
