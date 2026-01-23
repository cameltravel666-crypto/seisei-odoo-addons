import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Partner {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
  mobile: string | false;
  is_company: boolean;
  parent_id: [number, string] | false;
  street: string | false;
  city: string | false;
  country_id: [number, string] | false;
  function: string | false;
}

interface CreateContactBody {
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  isCompany?: boolean;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  function?: string;
  website?: string;
  comment?: string;
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

    const accessResult = await isModuleAccessible('CONTACTS', session.userId, session.tenantId);
    if (!accessResult.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: accessResult.reason || 'Contacts module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const filter = searchParams.get('filter') || 'all'; // all, company, person

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [];

    // Filter by company/person
    if (filter === 'company') {
      domain.push(['is_company', '=', true]);
    } else if (filter === 'person') {
      domain.push(['is_company', '=', false]);
    }

    // Search filter
    if (search) {
      domain.push('|', '|', '|');
      domain.push(['name', 'ilike', search]);
      domain.push(['email', 'ilike', search]);
      domain.push(['phone', 'ilike', search]);
      domain.push(['mobile', 'ilike', search]);
    }

    const totalCount = await odoo.searchCount('res.partner', domain);
    const items = await odoo.searchRead<Partner>('res.partner', domain, {
      fields: ['name', 'email', 'phone', 'mobile', 'is_company', 'parent_id', 'street', 'city', 'country_id', 'function'],
      limit,
      offset,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email || null,
          phone: item.phone || null,
          mobile: item.mobile || null,
          isCompany: item.is_company,
          parentName: Array.isArray(item.parent_id) ? item.parent_id[1] : null,
          street: item.street || null,
          city: item.city || null,
          countryName: Array.isArray(item.country_id) ? item.country_id[1] : null,
          function: item.function || null,
        })),
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error) {
    console.error('[Contacts Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch contacts' } },
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

    const accessResult = await isModuleAccessible('CONTACTS', session.userId, session.tenantId);
    if (!accessResult.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: accessResult.reason || 'Contacts module not accessible' } },
        { status: 403 }
      );
    }

    const body: CreateContactBody = await request.json();

    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const values: Record<string, unknown> = {
      name: body.name.trim(),
      is_company: body.isCompany ?? false,
    };

    if (body.email) values.email = body.email;
    if (body.phone) values.phone = body.phone;
    if (body.mobile) values.mobile = body.mobile;
    if (body.street) values.street = body.street;
    if (body.street2) values.street2 = body.street2;
    if (body.city) values.city = body.city;
    if (body.zip) values.zip = body.zip;
    if (body.function) values.function = body.function;
    if (body.website) values.website = body.website;
    if (body.comment) values.comment = body.comment;

    const id = await odoo.create('res.partner', values);

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('[Create Contact Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create contact' } },
      { status: 500 }
    );
  }
}
