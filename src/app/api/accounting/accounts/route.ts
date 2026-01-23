import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Chart of Accounts API - Compatible with Odoo 18
 * Syncs with account.account model
 */

interface AccountAccount {
  id: number;
  name: string;
  code: string;
  account_type: string;
  reconcile: boolean;
  deprecated: boolean;
  currency_id: [number, string] | false;
  group_id: [number, string] | false;
  current_balance: number;
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
    const accountType = searchParams.get('type');
    const search = searchParams.get('search');
    const includeDeprecated = searchParams.get('include_deprecated') === 'true';

    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [];

    if (!includeDeprecated) {
      domain.push(['deprecated', '=', false]);
    }

    if (accountType) {
      domain.push(['account_type', '=', accountType]);
    }

    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['code', 'ilike', search]);
    }

    // Fetch accounts
    let items: AccountAccount[] = [];
    try {
      items = await odoo.searchRead<AccountAccount>('account.account', domain, {
        fields: [
          'name', 'code', 'account_type', 'reconcile', 'deprecated',
          'currency_id', 'group_id', 'current_balance'
        ],
        order: 'code',
      });
    } catch (e) {
      console.log('[Accounts] Could not fetch from account.account:', e);
    }

    // Group accounts by type
    const accountTypes = new Set(items.map(a => a.account_type));
    const grouped: Record<string, typeof items> = {};
    accountTypes.forEach(type => {
      grouped[type] = items.filter(a => a.account_type === type);
    });

    // Account type labels mapping
    const typeLabels: Record<string, string> = {
      'asset_receivable': 'Receivable',
      'asset_cash': 'Bank and Cash',
      'asset_current': 'Current Assets',
      'asset_non_current': 'Non-current Assets',
      'asset_prepayments': 'Prepayments',
      'asset_fixed': 'Fixed Assets',
      'liability_payable': 'Payable',
      'liability_credit_card': 'Credit Card',
      'liability_current': 'Current Liabilities',
      'liability_non_current': 'Non-current Liabilities',
      'equity': 'Equity',
      'equity_unaffected': 'Current Year Earnings',
      'income': 'Income',
      'income_other': 'Other Income',
      'expense': 'Expenses',
      'expense_depreciation': 'Depreciation',
      'expense_direct_cost': 'Cost of Revenue',
      'off_balance': 'Off-Balance Sheet',
    };

    return NextResponse.json({
      success: true,
      data: {
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          code: item.code,
          accountType: item.account_type,
          accountTypeLabel: typeLabels[item.account_type] || item.account_type,
          reconcile: item.reconcile,
          deprecated: item.deprecated,
          currency: Array.isArray(item.currency_id) ? item.currency_id[1] : null,
          groupName: Array.isArray(item.group_id) ? item.group_id[1] : null,
          balance: item.current_balance || 0,
        })),
        grouped,
        typeLabels,
        total: items.length,
      },
    });
  } catch (error) {
    console.error('[Accounts Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch accounts' } },
      { status: 500 }
    );
  }
}
