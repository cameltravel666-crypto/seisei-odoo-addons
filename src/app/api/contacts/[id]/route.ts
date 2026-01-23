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
  street2: string | false;
  city: string | false;
  zip: string | false;
  country_id: [number, string] | false;
  function: string | false;
  website: string | false;
  comment: string | false;
  active: boolean;
}

// GET single contact
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const contactId = parseInt(id);
    if (isNaN(contactId)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid contact ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const items = await odoo.read<Partner>('res.partner', [contactId], [
      'name', 'email', 'phone', 'mobile', 'is_company', 'parent_id',
      'street', 'street2', 'city', 'zip', 'country_id', 'function', 'website', 'comment', 'active'
    ]);

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } },
        { status: 404 }
      );
    }

    const item = items[0];
    return NextResponse.json({
      success: true,
      data: {
        id: item.id,
        name: item.name,
        email: item.email || null,
        phone: item.phone || null,
        mobile: item.mobile || null,
        isCompany: item.is_company,
        parentName: Array.isArray(item.parent_id) ? item.parent_id[1] : null,
        street: item.street || null,
        street2: item.street2 || null,
        city: item.city || null,
        zip: item.zip || null,
        countryName: Array.isArray(item.country_id) ? item.country_id[1] : null,
        function: item.function || null,
        website: item.website || null,
        comment: item.comment || null,
        active: item.active,
      },
    });
  } catch (error) {
    console.error('[Contact GET Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch contact' } },
      { status: 500 }
    );
  }
}

// UPDATE contact
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const contactId = parseInt(id);
    if (isNaN(contactId)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid contact ID' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const odoo = await getOdooClientForSession(session);

    // Map form fields to Odoo fields
    const values: Record<string, unknown> = {};
    if (body.name !== undefined) values.name = body.name;
    if (body.email !== undefined) values.email = body.email || false;
    if (body.phone !== undefined) values.phone = body.phone || false;
    if (body.mobile !== undefined) values.mobile = body.mobile || false;
    if (body.street !== undefined) values.street = body.street || false;
    if (body.street2 !== undefined) values.street2 = body.street2 || false;
    if (body.city !== undefined) values.city = body.city || false;
    if (body.zip !== undefined) values.zip = body.zip || false;
    if (body.function !== undefined) values.function = body.function || false;
    if (body.website !== undefined) values.website = body.website || false;
    if (body.comment !== undefined) values.comment = body.comment || false;

    await odoo.write('res.partner', [contactId], values);

    return NextResponse.json({
      success: true,
      data: { id: contactId },
    });
  } catch (error) {
    console.error('[Contact PUT Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update contact' } },
      { status: 500 }
    );
  }
}
