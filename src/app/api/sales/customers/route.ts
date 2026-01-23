import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Partner {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
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

    const hasAccess = await isModuleAccessible('SALES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sales module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    const odoo = await getOdooClientForSession(session);

    // Search for all partners (customers and contacts)
    // Include both companies and individuals, excluding internal users
    const domain: unknown[] = [];

    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['email', 'ilike', search]);
    }

    const customers = await odoo.searchRead<Partner>('res.partner', domain, {
      fields: ['name', 'email', 'phone'],
      limit,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
      })),
    });
  } catch (error) {
    console.error('[Sales Customers Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customers' } },
      { status: 500 }
    );
  }
}
