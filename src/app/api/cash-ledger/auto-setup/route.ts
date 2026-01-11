import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOdooClientForSession } from '@/lib/odoo';
import { ALL_CASH_CATEGORIES } from '@/lib/cash-ledger';

/**
 * Cash Ledger Auto-Setup API
 * POST - Automatically configure cash ledger settings based on Odoo data
 *
 * Error codes:
 * - UNAUTHORIZED: Not authenticated
 * - ODOO_SESSION_EXPIRED: Odoo session has expired
 * - ODOO_FETCH_FAILED: Failed to fetch data from Odoo
 * - CASH_JOURNAL_NOT_FOUND: No cash journals found in Odoo
 * - CASH_ACCOUNT_NOT_FOUND: No suitable cash account found
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

// Category code to Japanese account name mapping for auto-initialization
const CATEGORY_ACCOUNT_MAPPING: Record<string, string[]> = {
  // IN Categories
  CASH_SALES: ['売上高', '売上', 'sales', '营业收入', '销售收入'],
  MISC_INCOME: ['雑収入', '雑益', 'miscellaneous income', '其他收入', '杂项收入'],
  AR_COLLECTION: ['売掛金', 'accounts receivable', 'receivable', '应收账款'],
  OWNER_LOAN_IN: ['事業主借', 'owner loan', '股东借款'],
  // OUT Categories
  CASH_PURCHASE: ['仕入高', '仕入', 'purchase', 'cost of goods', '采购', '进货'],
  TAXES_DUTIES: ['租税公課', '税金', 'taxes', '税费'],
  PACKING_FREIGHT: ['荷造運賃', '運賃', 'freight', 'shipping', '运费'],
  UTILITIES: ['水道光熱費', '光熱費', 'utilities', '水电费'],
  TRAVEL: ['旅費交通費', '交通費', 'travel', '差旅费'],
  COMMUNICATION: ['通信費', 'communication', '通讯费'],
  ENTERTAINMENT: ['接待交際費', '交際費', 'entertainment', '招待费'],
  CONSUMABLES: ['消耗品費', '消耗品', 'consumables', 'supplies', '消耗品'],
  WAGES: ['給料賃金', '給与', '人件費', 'wages', 'salaries', '工资'],
  RENT: ['地代家賃', '家賃', 'rent', '房租'],
  MISCELLANEOUS: ['雑費', '雑損', 'miscellaneous', '杂费'],
  AP_PAYMENT: ['買掛金', 'accounts payable', 'payable', '应付账款'],
  OWNER_DRAWING: ['事業主貸', 'owner drawing', '股东取款'],
};

// Error response helper
function errorResponse(code: string, message: string, status: number = 500, suggestion?: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(suggestion && { suggestion }) }
    },
    { status }
  );
}

// Find account ID by matching name keywords
function findAccountByName(accounts: OdooAccount[], keywords: string[]): number | null {
  for (const keyword of keywords) {
    const found = accounts.find(a =>
      a.name.toLowerCase().includes(keyword.toLowerCase())
    );
    if (found) return found.id;
  }
  return null;
}

// Find bank account by type keyword
function findBankAccount(accounts: OdooAccount[], type: 'toza' | 'futsu'): number | null {
  const keywords = type === 'toza'
    ? ['当座', '当座預金', 'current account']
    : ['普通', '普通預金', 'savings'];

  for (const keyword of keywords) {
    const found = accounts.find(a =>
      a.name.toLowerCase().includes(keyword.toLowerCase()) &&
      (a.account_type === 'asset_cash' || a.account_type === 'liability_current')
    );
    if (found) return found.id;
  }
  return null;
}

export async function POST() {
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
      if (message.includes('Session') || message.includes('expired') || message.includes('not found')) {
        return errorResponse(
          'ODOO_SESSION_EXPIRED',
          'Odoo session expired. Please re-login.',
          401,
          'ログアウトして再度ログインしてください'
        );
      }
      return errorResponse('ODOO_CONNECTION_FAILED', `Failed to connect to Odoo: ${message}`, 502);
    }

    // Fetch journals and accounts from Odoo
    let journals: OdooJournal[] = [];
    let accounts: OdooAccount[] = [];

    try {
      console.log('[AutoSetup] Fetching journals from Odoo...');
      journals = await odoo.searchRead<OdooJournal>('account.journal', [], {
        fields: ['name', 'type', 'code', 'default_account_id'],
        order: 'type, name',
      });
      console.log('[AutoSetup] Journals fetched:', journals.length, journals.map(j => `${j.name}(${j.type})`));

      console.log('[AutoSetup] Fetching accounts from Odoo...');
      accounts = await odoo.searchRead<OdooAccount>('account.account', [], {
        fields: ['code', 'name', 'account_type'],
        order: 'code',
      });
      console.log('[AutoSetup] Accounts fetched:', accounts.length);
    } catch (e: any) {
      const message = e?.message || String(e);
      console.error('[AutoSetup] Odoo fetch error:', message);

      if (message.includes('Session') && message.includes('Expired')) {
        return errorResponse(
          'ODOO_SESSION_EXPIRED',
          'Odoo session expired. Please re-login.',
          401,
          'ログアウトして再度ログインしてください'
        );
      }
      return errorResponse('ODOO_FETCH_FAILED', `Failed to fetch Odoo data: ${message}`, 502);
    }

    // Find cash journals
    const cashJournals = journals.filter(j => j.type === 'cash');
    const bankJournals = journals.filter(j => j.type === 'bank');

    console.log('[AutoSetup] Cash journals:', cashJournals.map(j => j.name));
    console.log('[AutoSetup] Bank journals:', bankJournals.map(j => j.name));

    // Check if cash journals exist
    if (cashJournals.length === 0) {
      return errorResponse(
        'CASH_JOURNAL_NOT_FOUND',
        'No cash journals found in Odoo.',
        400,
        'Odoo で現金タイプの仕訳帳を作成してください: 会計 → 設定 → 仕訳帳 → 新規 → タイプ: 現金'
      );
    }

    // Select first cash journal
    const selectedJournal = cashJournals[0];

    // Get cash account from journal's default account, or find one
    let cashAccountId = Array.isArray(selectedJournal.default_account_id)
      ? selectedJournal.default_account_id[0]
      : null;

    if (!cashAccountId) {
      // Try to find a cash asset account
      const cashAccount = accounts.find(a =>
        a.account_type === 'asset_cash' ||
        a.name.includes('現金') ||
        a.name.toLowerCase().includes('cash')
      );
      if (cashAccount) {
        cashAccountId = cashAccount.id;
      }
    }

    if (!cashAccountId) {
      return errorResponse(
        'CASH_ACCOUNT_NOT_FOUND',
        'No suitable cash account found.',
        400,
        'Odoo で現金科目を作成するか、現金仕訳帳にデフォルト勘定科目を設定してください'
      );
    }

    // Find bank accounts
    const firstBankJournal = bankJournals[0];
    const bankAccountIdToza = firstBankJournal
      ? (Array.isArray(firstBankJournal.default_account_id)
          ? firstBankJournal.default_account_id[0]
          : findBankAccount(accounts, 'toza') || 0)
      : 0;
    const bankAccountIdFutsu = findBankAccount(accounts, 'futsu') || bankAccountIdToza;

    // Build account mappings
    const accountMappings: Record<string, number> = {};
    const normalCategories = ALL_CASH_CATEGORIES.filter(c => c.type === 'NORMAL');

    for (const cat of normalCategories) {
      const keywords = CATEGORY_ACCOUNT_MAPPING[cat.code];
      if (keywords) {
        const accountId = findAccountByName(accounts, keywords);
        if (accountId) {
          accountMappings[cat.code] = accountId;
        } else {
          // Fallback: use a generic expense/income account
          const fallbackAccount = cat.direction === 'IN'
            ? accounts.find(a => a.account_type === 'income' || a.account_type === 'income_other')
            : accounts.find(a => a.account_type === 'expense' || a.account_type === 'expense_direct_cost');
          if (fallbackAccount) {
            accountMappings[cat.code] = fallbackAccount.id;
          }
        }
      }
    }

    console.log('[AutoSetup] Account mappings created:', Object.keys(accountMappings).length);

    // Save settings to database
    const settings = await prisma.cashLedgerSettings.upsert({
      where: { tenantId: session.tenantId },
      update: {
        cashJournalId: selectedJournal.id,
        cashAccountId: cashAccountId,
        bankJournalIdToza: firstBankJournal?.id || 0,
        bankAccountIdToza: bankAccountIdToza,
        bankJournalIdFutsu: firstBankJournal?.id || 0,
        bankAccountIdFutsu: bankAccountIdFutsu,
        accountMappings: accountMappings,
      },
      create: {
        tenantId: session.tenantId,
        cashJournalId: selectedJournal.id,
        cashAccountId: cashAccountId,
        bankJournalIdToza: firstBankJournal?.id || 0,
        bankAccountIdToza: bankAccountIdToza,
        bankJournalIdFutsu: firstBankJournal?.id || 0,
        bankAccountIdFutsu: bankAccountIdFutsu,
        accountMappings: accountMappings,
      },
    });

    console.log('[AutoSetup] Settings saved successfully:', {
      cashJournalId: settings.cashJournalId,
      cashAccountId: settings.cashAccountId,
      mappings: Object.keys(accountMappings).length,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Auto-setup completed successfully',
        settings: {
          cashJournalId: settings.cashJournalId,
          cashAccountId: settings.cashAccountId,
          cashJournalName: selectedJournal.name,
          bankJournalIdToza: settings.bankJournalIdToza,
          bankAccountIdToza: settings.bankAccountIdToza,
          bankJournalIdFutsu: settings.bankJournalIdFutsu,
          bankAccountIdFutsu: settings.bankAccountIdFutsu,
          accountMappingsCount: Object.keys(accountMappings).length,
        },
      },
    });
  } catch (error: any) {
    console.error('[AutoSetup Error]', error);
    return errorResponse('INTERNAL_ERROR', `Auto-setup failed: ${error?.message || String(error)}`);
  }
}
