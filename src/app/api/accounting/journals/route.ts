import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Accounting Journals API - Compatible with Odoo 18
 * Syncs with account.journal model
 */

interface AccountJournal {
  id: number;
  name: string;
  code: string;
  type: 'sale' | 'purchase' | 'cash' | 'bank' | 'general';
  company_id: [number, string] | false;
  default_account_id: [number, string] | false;
  currency_id: [number, string] | false;
  active: boolean;
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
    const journalType = searchParams.get('type');

    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [['active', '=', true]];
    if (journalType) {
      domain.push(['type', '=', journalType]);
    }

    // Fetch journals
    let items: AccountJournal[] = [];
    try {
      items = await odoo.searchRead<AccountJournal>('account.journal', domain, {
        fields: ['name', 'code', 'type', 'company_id', 'default_account_id', 'currency_id', 'active'],
        order: 'type, name',
      });
    } catch (e) {
      console.log('[Journals] Could not fetch from account.journal:', e);
    }

    // Group by type
    const grouped: Record<string, typeof items> = {
      sale: [],
      purchase: [],
      cash: [],
      bank: [],
      general: [],
    };

    items.forEach(item => {
      if (grouped[item.type]) {
        grouped[item.type].push(item);
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          code: item.code,
          type: item.type,
          defaultAccount: Array.isArray(item.default_account_id) ? item.default_account_id[1] : null,
          currency: Array.isArray(item.currency_id) ? item.currency_id[1] : 'JPY',
        })),
        grouped,
        total: items.length,
      },
    });
  } catch (error) {
    console.error('[Journals Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch journals' } },
      { status: 500 }
    );
  }
}
