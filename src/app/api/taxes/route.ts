import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

interface AccountTax {
  id: number;
  name: string;
  amount: number;
  amount_type: string;
  type_tax_use: string;
  active: boolean;
}

/**
 * GET /api/taxes - Get available taxes
 * Query params:
 *   - type: 'purchase' | 'sale' | 'all' (default: 'all')
 */
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
    const taxType = searchParams.get('type') || 'all';

    const odoo = await getOdooClientForSession(session);

    // Build domain filter
    const domain: Array<[string, string, unknown]> = [['active', '=', true]];

    if (taxType === 'purchase') {
      domain.push(['type_tax_use', '=', 'purchase']);
    } else if (taxType === 'sale') {
      domain.push(['type_tax_use', '=', 'sale']);
    } else {
      // For 'all', get both purchase and sale taxes
      domain.push(['type_tax_use', 'in', ['purchase', 'sale']]);
    }

    const taxes = await odoo.searchRead<AccountTax>('account.tax', domain, {
      fields: ['name', 'amount', 'amount_type', 'type_tax_use'],
      order: 'sequence, name',
    });

    return NextResponse.json({
      success: true,
      data: taxes.map((tax) => ({
        id: tax.id,
        name: tax.name,
        amount: tax.amount,
        amountType: tax.amount_type, // 'percent', 'fixed', etc.
        taxType: tax.type_tax_use, // 'purchase', 'sale'
        // Format display name with percentage
        displayName: tax.amount_type === 'percent'
          ? `${tax.name} (${tax.amount}%)`
          : tax.name,
      })),
    });
  } catch (error) {
    console.error('[Taxes Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch taxes' } },
      { status: 500 }
    );
  }
}
