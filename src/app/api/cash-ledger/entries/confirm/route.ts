import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { CASH_LEDGER_REF_PREFIX } from '@/lib/cash-ledger';

/**
 * POST /api/cash-ledger/entries/confirm - Confirm (post) draft entries
 * Body: { entryIds: number[] } - IDs of entries to post
 */
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
    const { entryIds } = body;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'entryIds array is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Verify all entries exist, are drafts, and belong to cash ledger
    const moves = await odoo.searchRead<{ id: number; state: string; ref: string }>(
      'account.move',
      [['id', 'in', entryIds], ['ref', 'ilike', CASH_LEDGER_REF_PREFIX]],
      { fields: ['state', 'ref'] }
    );

    if (moves.length !== entryIds.length) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Some entries not found' } },
        { status: 404 }
      );
    }

    const nonDraftMoves = moves.filter(m => m.state !== 'draft');
    if (nonDraftMoves.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Some entries are not in draft state' } },
        { status: 400 }
      );
    }

    // Post all entries
    await odoo.callKw('account.move', 'action_post', [entryIds], {});

    return NextResponse.json({
      success: true,
      data: {
        postedCount: entryIds.length,
        postedIds: entryIds,
      },
    });
  } catch (error) {
    console.error('[CashLedger Confirm Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to confirm entries' } },
      { status: 500 }
    );
  }
}
