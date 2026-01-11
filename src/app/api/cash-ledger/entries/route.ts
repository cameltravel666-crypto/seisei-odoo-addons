import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOdooClientForSession } from '@/lib/odoo';
import {
  buildMoveRef,
  getCategoryByCode,
  CASH_LEDGER_REF_PREFIX,
  parseMoveRef,
  type CashEntrySubmission,
} from '@/lib/cash-ledger';

/**
 * Cash Ledger Entries API
 * GET - Fetch entries from Odoo account.move
 * POST - Create draft entries in Odoo
 */

interface AccountMoveLine {
  account_id: number;
  name: string;
  debit: number;
  credit: number;
}

interface AccountMove {
  id: number;
  name: string;
  ref: string;
  date: string;
  state: string;
  amount_total: number;
  line_ids: number[];
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
    const stateFilter = searchParams.get('state') || 'all'; // all, draft, posted
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const offset = (page - 1) * limit;
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

    // Fetch entries
    const totalCount = await odoo.searchCount('account.move', domain);
    const moves = await odoo.searchRead<AccountMove>('account.move', domain, {
      fields: ['name', 'ref', 'date', 'state', 'amount_total', 'line_ids'],
      limit,
      offset,
      order: 'date desc, id desc',
    });

    // Parse entries and categorize
    const entries = moves.map(move => {
      const parsed = parseMoveRef(move.ref);
      const category = parsed ? getCategoryByCode(parsed.categoryCode) : null;

      return {
        id: move.id,
        name: move.name,
        ref: move.ref,
        date: move.date,
        state: move.state,
        amount: move.amount_total,
        categoryCode: parsed?.categoryCode || null,
        categoryName: category ? category.nameJa : null,
        direction: parsed?.direction || null,
      };
    });

    // Calculate summary
    let totalIn = 0;
    let totalOut = 0;
    const categoryTotals: Record<string, { amount: number; count: number }> = {};

    for (const entry of entries) {
      if (entry.direction === 'IN') {
        totalIn += entry.amount;
      } else if (entry.direction === 'OUT') {
        totalOut += entry.amount;
      }

      if (entry.categoryCode) {
        if (!categoryTotals[entry.categoryCode]) {
          categoryTotals[entry.categoryCode] = { amount: 0, count: 0 };
        }
        categoryTotals[entry.categoryCode].amount += entry.amount;
        categoryTotals[entry.categoryCode].count += 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        items: entries,
        summary: {
          totalIn,
          totalOut,
          netAmount: totalIn - totalOut,
          categoryTotals,
        },
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('[CashLedger Entries Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch entries' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Get settings
    const settings = await prisma.cashLedgerSettings.findUnique({
      where: { tenantId: session.tenantId },
    });

    if (!settings) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_CONFIGURED', message: 'Cash ledger settings not configured' } },
        { status: 400 }
      );
    }

    const body: CashEntrySubmission = await request.json();
    const { date, inEntries, outEntries } = body;

    if (!date) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Date is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);
    const accountMappings = settings.accountMappings as Record<string, number>;

    const createdMoves: number[] = [];
    const errors: string[] = [];

    // Process all entries
    const allEntries = [
      ...inEntries.filter(e => e.amount > 0).map(e => ({ ...e, direction: 'IN' as const })),
      ...outEntries.filter(e => e.amount > 0).map(e => ({ ...e, direction: 'OUT' as const })),
    ];

    for (const entry of allEntries) {
      const category = getCategoryByCode(entry.categoryCode);
      if (!category) {
        errors.push(`Unknown category: ${entry.categoryCode}`);
        continue;
      }

      try {
        // Build move lines based on category type and direction
        const lines: AccountMoveLine[] = [];
        const ref = buildMoveRef(date, entry.categoryCode, entry.direction);

        if (category.type === 'NORMAL') {
          const counterAccountId = accountMappings[entry.categoryCode];
          if (!counterAccountId) {
            errors.push(`No account mapping for: ${entry.categoryCode}`);
            continue;
          }

          if (entry.direction === 'IN') {
            // IN (Normal): Debit Cash, Credit Counter
            lines.push({
              account_id: settings.cashAccountId,
              name: category.nameJa,
              debit: entry.amount,
              credit: 0,
            });
            lines.push({
              account_id: counterAccountId,
              name: category.nameJa,
              debit: 0,
              credit: entry.amount,
            });
          } else {
            // OUT (Normal): Debit Counter, Credit Cash
            lines.push({
              account_id: counterAccountId,
              name: category.nameJa,
              debit: entry.amount,
              credit: 0,
            });
            lines.push({
              account_id: settings.cashAccountId,
              name: category.nameJa,
              debit: 0,
              credit: entry.amount,
            });
          }
        } else if (category.type === 'TRANSFER') {
          // Determine bank account
          let bankAccountId: number | null = null;
          if (entry.categoryCode.includes('TOZA')) {
            bankAccountId = settings.bankAccountIdToza;
          } else if (entry.categoryCode.includes('FUTSU')) {
            bankAccountId = settings.bankAccountIdFutsu;
          }

          if (!bankAccountId) {
            errors.push(`No bank account configured for: ${entry.categoryCode}`);
            continue;
          }

          if (entry.direction === 'IN') {
            // TRANSFER IN (Bank -> Cash): Debit Cash, Credit Bank
            lines.push({
              account_id: settings.cashAccountId,
              name: category.nameJa,
              debit: entry.amount,
              credit: 0,
            });
            lines.push({
              account_id: bankAccountId,
              name: category.nameJa,
              debit: 0,
              credit: entry.amount,
            });
          } else {
            // TRANSFER OUT (Cash -> Bank): Debit Bank, Credit Cash
            lines.push({
              account_id: bankAccountId,
              name: category.nameJa,
              debit: entry.amount,
              credit: 0,
            });
            lines.push({
              account_id: settings.cashAccountId,
              name: category.nameJa,
              debit: 0,
              credit: entry.amount,
            });
          }
        }

        // Create account.move (draft)
        const moveId = await odoo.create('account.move', {
          move_type: 'entry',
          date,
          journal_id: settings.cashJournalId,
          ref,
          line_ids: lines.map(line => [0, 0, line]),
        });

        createdMoves.push(moveId);

        // Handle attachments
        if (entry.attachments && entry.attachments.length > 0) {
          for (const attachment of entry.attachments) {
            await odoo.create('ir.attachment', {
              name: `${entry.categoryCode}_${date}_${attachment.name}`,
              res_model: 'account.move',
              res_id: moveId,
              datas: attachment.data,
              mimetype: attachment.mimetype,
            });
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        errors.push(`Failed to create entry for ${entry.categoryCode}: ${errorMsg}`);
      }
    }

    // If any errors, we should ideally rollback, but Odoo doesn't support transactions
    // So we report partial success
    if (errors.length > 0 && createdMoves.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'CREATE_FAILED', message: errors.join('; ') } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        createdCount: createdMoves.length,
        createdMoveIds: createdMoves,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('[CashLedger Create Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create entries' } },
      { status: 500 }
    );
  }
}
