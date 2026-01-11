import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOdooClientForSession } from '@/lib/odoo';
import { ALL_CASH_CATEGORIES, IN_CATEGORIES, OUT_CATEGORIES } from '@/lib/cash-ledger';

/**
 * Cash Ledger Settings API
 * GET - Fetch current settings and available Odoo accounts/journals
 * PUT - Save settings with validation
 *
 * Error codes:
 * - UNAUTHORIZED: Not authenticated
 * - ODOO_CONNECTION_FAILED: Failed to connect to Odoo
 * - ODOO_SESSION_EXPIRED: Odoo session has expired, need to re-login
 * - ODOO_FETCH_FAILED: Failed to fetch data from Odoo
 * - CASH_JOURNAL_NOT_FOUND: No cash journals found in Odoo
 * - DATABASE_ERROR: Database operation failed
 */

interface OdooJournal {
  id: number;
  name: string;
  type: string;
  code: string;
  default_account_id: [number, string] | false;
}

interface OdooAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

// Error response helper
function errorResponse(code: string, message: string, status: number = 500, details?: Record<string, unknown>) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(details && { details }) }
    },
    { status }
  );
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // Get Odoo client
    let odoo;
    try {
      odoo = await getOdooClientForSession(session);
    } catch (odooErr: any) {
      const message = odooErr?.message || String(odooErr);
      // Check for session expired
      if (message.includes('Session') || message.includes('expired') || message.includes('not found')) {
        return errorResponse('ODOO_SESSION_EXPIRED', 'Odoo session expired. Please re-login.', 401);
      }
      return errorResponse('ODOO_CONNECTION_FAILED', `Failed to connect to Odoo: ${message}`, 502);
    }

    // Fetch journals from Odoo - DO NOT swallow errors
    let journals: OdooJournal[] = [];
    let accounts: OdooAccount[] = [];
    let odooError: string | null = null;

    try {
      journals = await odoo.searchRead<OdooJournal>('account.journal', [], {
        fields: ['name', 'type', 'code', 'default_account_id'],
        order: 'type, name',
      });

      accounts = await odoo.searchRead<OdooAccount>('account.account', [], {
        fields: ['code', 'name', 'account_type'],
        order: 'code',
      });
    } catch (e: any) {
      const message = e?.message || String(e);
      console.error('[CashLedger] Odoo fetch error:', message);

      // Check for session expired error from Odoo
      if (message.includes('Session') && message.includes('Expired')) {
        return errorResponse('ODOO_SESSION_EXPIRED', 'Odoo session expired. Please re-login.', 401);
      }

      // Return error instead of swallowing
      odooError = message;
    }

    // If Odoo fetch failed, return error
    if (odooError) {
      return errorResponse('ODOO_FETCH_FAILED', `Failed to fetch Odoo data: ${odooError}`, 502);
    }

    // Categorize journals
    const cashJournals = journals.filter(j => j.type === 'cash');
    const bankJournals = journals.filter(j => j.type === 'bank');

    // Fetch saved settings from database
    let settings;
    try {
      settings = await prisma.cashLedgerSettings.findUnique({
        where: { tenantId: session.tenantId },
      });
    } catch (dbErr: any) {
      return errorResponse('DATABASE_ERROR', `Database query failed: ${dbErr?.message || String(dbErr)}`);
    }

    // Calculate configuration status
    const isConfigured = !!(settings && settings.cashJournalId > 0);

    return NextResponse.json({
      success: true,
      data: {
        isConfigured,
        settings: settings ? {
          cashJournalId: settings.cashJournalId,
          cashAccountId: settings.cashAccountId,
          bankJournalIdToza: settings.bankJournalIdToza,
          bankAccountIdToza: settings.bankAccountIdToza,
          bankJournalIdFutsu: settings.bankJournalIdFutsu,
          bankAccountIdFutsu: settings.bankAccountIdFutsu,
          accountMappings: settings.accountMappings as Record<string, number>,
        } : null,
        cashJournals: cashJournals.map(j => ({
          id: j.id,
          name: j.name,
          code: j.code,
          defaultAccountId: Array.isArray(j.default_account_id) ? j.default_account_id[0] : null,
          defaultAccountName: Array.isArray(j.default_account_id) ? j.default_account_id[1] : null,
        })),
        bankJournals: bankJournals.map(j => ({
          id: j.id,
          name: j.name,
          code: j.code,
          defaultAccountId: Array.isArray(j.default_account_id) ? j.default_account_id[0] : null,
          defaultAccountName: Array.isArray(j.default_account_id) ? j.default_account_id[1] : null,
        })),
        accounts: accounts.map(a => ({
          id: a.id,
          code: a.code,
          name: a.name,
          displayName: `${a.code} - ${a.name}`,
          accountType: a.account_type,
        })),
        categories: {
          in: IN_CATEGORIES,
          out: OUT_CATEGORIES,
        },
        // Debug info (only in development)
        ...(process.env.NODE_ENV === 'development' && {
          _debug: {
            tenantId: session.tenantId,
            cashJournalsCount: cashJournals.length,
            bankJournalsCount: bankJournals.length,
            accountsCount: accounts.length,
          },
        }),
      },
    });
  } catch (error: any) {
    console.error('[CashLedger Settings Error]', error);
    return errorResponse('INTERNAL_ERROR', `Unexpected error: ${error?.message || String(error)}`);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const body = await request.json();
    const {
      cashJournalId,
      cashAccountId,
      bankJournalIdToza,
      bankAccountIdToza,
      bankJournalIdFutsu,
      bankAccountIdFutsu,
      accountMappings,
    } = body;

    // Validation
    const errors: string[] = [];

    if (!cashJournalId) {
      errors.push('Cash Journal is required');
    }
    if (!cashAccountId) {
      errors.push('Cash Account is required');
    }

    // Validate TRANSFER categories have bank accounts
    const transferCategories = ALL_CASH_CATEGORIES.filter(c => c.type === 'TRANSFER');
    for (const cat of transferCategories) {
      if (cat.code.includes('TOZA') && !bankAccountIdToza) {
        errors.push(`Bank Account (Toza) is required for ${cat.nameEn}`);
        break;
      }
      if (cat.code.includes('FUTSU') && !bankAccountIdFutsu) {
        errors.push(`Bank Account (Futsu) is required for ${cat.nameEn}`);
        break;
      }
    }

    // Validate all NORMAL categories have account mappings
    const normalCategories = ALL_CASH_CATEGORIES.filter(c => c.type === 'NORMAL');
    for (const cat of normalCategories) {
      if (!accountMappings?.[cat.code]) {
        errors.push(`Account mapping required for: ${cat.nameEn}`);
      }
    }

    if (errors.length > 0) {
      return errorResponse('VALIDATION_ERROR', errors.join('; '), 400);
    }

    // Upsert settings
    const settings = await prisma.cashLedgerSettings.upsert({
      where: { tenantId: session.tenantId },
      update: {
        cashJournalId,
        cashAccountId,
        bankJournalIdToza,
        bankAccountIdToza,
        bankJournalIdFutsu,
        bankAccountIdFutsu,
        accountMappings,
      },
      create: {
        tenantId: session.tenantId,
        cashJournalId,
        cashAccountId,
        bankJournalIdToza,
        bankAccountIdToza,
        bankJournalIdFutsu,
        bankAccountIdFutsu,
        accountMappings,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        settings: {
          cashJournalId: settings.cashJournalId,
          cashAccountId: settings.cashAccountId,
          bankJournalIdToza: settings.bankJournalIdToza,
          bankAccountIdToza: settings.bankAccountIdToza,
          bankJournalIdFutsu: settings.bankJournalIdFutsu,
          bankAccountIdFutsu: settings.bankAccountIdFutsu,
          accountMappings: settings.accountMappings,
        }
      },
    });
  } catch (error: any) {
    console.error('[CashLedger Settings Save Error]', error);
    return errorResponse('INTERNAL_ERROR', `Failed to save settings: ${error?.message || String(error)}`);
  }
}
