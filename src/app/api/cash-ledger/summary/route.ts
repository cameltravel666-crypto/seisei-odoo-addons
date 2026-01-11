import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import {
  CASH_LEDGER_REF_PREFIX,
  parseMoveRef,
  getCategoryByCode,
  IN_CATEGORIES,
  OUT_CATEGORIES,
} from '@/lib/cash-ledger';

/**
 * Cash Ledger Summary API
 * Returns aggregated statistics for dashboard display
 *
 * New metrics for boss dashboard:
 * - totalIn: Total inflows this month
 * - totalOut: Total outflows this month
 * - latestClosingBalance: Closing balance of the most recent entry day
 * - todaySubmitted: Whether today has any entries
 * - draftCount: Number of draft entries (for reconciliation)
 * - draftMoveIds: IDs of draft moves (for viewing)
 */

interface AccountMove {
  id: number;
  ref: string;
  date: string;
  state: string;
  amount_total: number;
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

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const stateFilter = searchParams.get('state') || 'all';

    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [['ref', 'ilike', CASH_LEDGER_REF_PREFIX]];

    if (dateFrom) {
      domain.push(['date', '>=', dateFrom]);
    }
    if (dateTo) {
      domain.push(['date', '<=', dateTo]);
    }
    if (stateFilter === 'draft') {
      domain.push(['state', '=', 'draft']);
    } else if (stateFilter === 'posted') {
      domain.push(['state', '=', 'posted']);
    } else {
      domain.push(['state', 'in', ['draft', 'posted']]);
    }

    // Fetch all matching moves
    const moves = await odoo.searchRead<AccountMove>('account.move', domain, {
      fields: ['ref', 'date', 'state', 'amount_total'],
      limit: 10000,
    });

    // Aggregate by category
    const inCategoryTotals: Record<string, { amount: number; count: number; categoryName: string }> = {};
    const outCategoryTotals: Record<string, { amount: number; count: number; categoryName: string }> = {};

    let totalIn = 0;
    let totalOut = 0;
    let draftCount = 0;
    let postedCount = 0;

    // Initialize all categories
    for (const cat of IN_CATEGORIES) {
      inCategoryTotals[cat.code] = { amount: 0, count: 0, categoryName: cat.nameJa };
    }
    for (const cat of OUT_CATEGORIES) {
      outCategoryTotals[cat.code] = { amount: 0, count: 0, categoryName: cat.nameJa };
    }

    // Get today's date in JST
    const today = new Date().toISOString().split('T')[0];

    // Track daily totals for closing balance calculation
    const dailyTotals: Record<string, { inTotal: number; outTotal: number }> = {};
    const draftMoveIds: number[] = [];

    // Process moves
    for (const move of moves) {
      const parsed = parseMoveRef(move.ref);
      if (!parsed) continue;

      const category = getCategoryByCode(parsed.categoryCode);
      if (!category) continue;

      if (move.state === 'draft') {
        draftCount++;
        draftMoveIds.push(move.id);
      } else if (move.state === 'posted') {
        postedCount++;
      }

      // Track daily totals
      if (!dailyTotals[move.date]) {
        dailyTotals[move.date] = { inTotal: 0, outTotal: 0 };
      }

      if (parsed.direction === 'IN') {
        totalIn += move.amount_total;
        dailyTotals[move.date].inTotal += move.amount_total;
        if (inCategoryTotals[parsed.categoryCode]) {
          inCategoryTotals[parsed.categoryCode].amount += move.amount_total;
          inCategoryTotals[parsed.categoryCode].count += 1;
        }
      } else if (parsed.direction === 'OUT') {
        totalOut += move.amount_total;
        dailyTotals[move.date].outTotal += move.amount_total;
        if (outCategoryTotals[parsed.categoryCode]) {
          outCategoryTotals[parsed.categoryCode].amount += move.amount_total;
          outCategoryTotals[parsed.categoryCode].count += 1;
        }
      }
    }

    // Calculate latest closing balance (cumulative from oldest to newest)
    const sortedDates = Object.keys(dailyTotals).sort();
    let runningBalance = 0;
    for (const date of sortedDates) {
      runningBalance += dailyTotals[date].inTotal - dailyTotals[date].outTotal;
    }
    const latestClosingBalance = runningBalance;
    const latestDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

    // Check if today has submissions
    const todaySubmitted = dailyTotals[today] !== undefined;
    const todayCount = todaySubmitted
      ? moves.filter(m => m.date === today).length
      : 0;

    // Top categories
    const topInCategories = Object.entries(inCategoryTotals)
      .filter(([, data]) => data.amount > 0)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 5)
      .map(([code, data]) => ({ code, ...data }));

    const topOutCategories = Object.entries(outCategoryTotals)
      .filter(([, data]) => data.amount > 0)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 5)
      .map(([code, data]) => ({ code, ...data }));

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          totalIn,
          totalOut,
          netAmount: totalIn - totalOut,
          latestClosingBalance,
          latestDate,
          entryCount: moves.length,
          draftCount,
          postedCount,
          todaySubmitted,
          todayCount,
        },
        draftMoveIds,
        inCategories: inCategoryTotals,
        outCategories: outCategoryTotals,
        topInCategories,
        topOutCategories,
      },
    });
  } catch (error) {
    console.error('[CashLedger Summary Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch summary' } },
      { status: 500 }
    );
  }
}
