import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Journal Entries API - Compatible with Odoo 18
 * Syncs with account.move model (move_type = 'entry')
 */

interface AccountMove {
  id: number;
  name: string;
  date: string;
  ref: string | false;
  journal_id: [number, string] | false;
  state: string;
  amount_total: number;
  currency_id: [number, string] | false;
  partner_id: [number, string] | false;
  move_type: string;
  line_ids: number[];
}

interface AccountMoveLine {
  id: number;
  move_id: [number, string];
  account_id: [number, string];
  name: string;
  debit: number;
  credit: number;
  balance: number;
  partner_id: [number, string] | false;
  currency_id: [number, string] | false;
  amount_currency: number;
}

type EntryQueueType = 'draft' | 'posted' | 'all';

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
    const limit = parseInt(searchParams.get('limit') || '20');
    const queue = (searchParams.get('queue') || 'all') as EntryQueueType;
    const journalId = searchParams.get('journal_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Build domain - only journal entries (not invoices/bills)
    const domain: unknown[] = [['move_type', '=', 'entry']];

    // Filter by state
    if (queue === 'draft') {
      domain.push(['state', '=', 'draft']);
    } else if (queue === 'posted') {
      domain.push(['state', '=', 'posted']);
    }

    // Filter by journal
    if (journalId) {
      domain.push(['journal_id', '=', parseInt(journalId)]);
    }

    // Date filter
    if (dateFrom) {
      domain.push(['date', '>=', dateFrom]);
    }
    if (dateTo) {
      domain.push(['date', '<=', dateTo]);
    }

    // Fetch entries
    let items: AccountMove[] = [];
    let totalCount = 0;

    try {
      totalCount = await odoo.searchCount('account.move', domain);
      items = await odoo.searchRead<AccountMove>('account.move', domain, {
        fields: [
          'name', 'date', 'ref', 'journal_id', 'state',
          'amount_total', 'currency_id', 'partner_id', 'move_type', 'line_ids'
        ],
        limit,
        offset,
        order: 'date desc, id desc',
      });
    } catch (e) {
      console.log('[Entries] Could not fetch from account.move:', e);
    }

    // Fetch KPIs
    let draftCount = 0, postedCount = 0;
    try {
      draftCount = await odoo.searchCount('account.move', [['move_type', '=', 'entry'], ['state', '=', 'draft']]);
      postedCount = await odoo.searchCount('account.move', [['move_type', '=', 'entry'], ['state', '=', 'posted']]);
    } catch (e) {
      console.log('[Entries] Could not fetch entry counts:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          draftCount,
          postedCount,
          totalCount: draftCount + postedCount,
        },
        items: items.map(item => ({
          id: item.id,
          name: item.name || '',
          date: item.date || null,
          ref: item.ref || null,
          journalId: Array.isArray(item.journal_id) ? item.journal_id[0] : null,
          journalName: Array.isArray(item.journal_id) ? item.journal_id[1] : '-',
          state: item.state,
          amount: item.amount_total || 0,
          currency: Array.isArray(item.currency_id) ? item.currency_id[1] : 'JPY',
          partnerName: Array.isArray(item.partner_id) ? item.partner_id[1] : null,
          lineCount: Array.isArray(item.line_ids) ? item.line_ids.length : 0,
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
    console.error('[Entries Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch entries' } },
      { status: 500 }
    );
  }
}

// Post entry
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
    const { entryId, action } = body;

    const odoo = await getOdooClientForSession(session);

    if (action === 'post' && entryId) {
      await odoo.callKw('account.move', 'action_post', [[entryId]]);
      return NextResponse.json({ success: true, data: { message: 'Entry posted' } });
    }

    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Entries Action Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process entry';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}
