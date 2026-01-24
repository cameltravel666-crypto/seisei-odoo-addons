import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { roleGuard } from '@/lib/guards';

/**
 * Company information from Odoo res.company model
 */
interface OdooCompany {
  id: number;
  name: string;
  street: string | false;
  street2: string | false;
  city: string | false;
  state_id: [number, string] | false;
  zip: string | false;
  country_id: [number, string] | false;
  phone: string | false;
  mobile: string | false;
  email: string | false;
  website: string | false;
  vat: string | false;
  company_registry: string | false;
  currency_id: [number, string] | false;
  logo: string | false;
  primary_color: string | false;
  secondary_color: string | false;
}

/**
 * GET /api/settings/company
 * Fetch current company information from Odoo
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Only admins can view company settings
    const guard = await roleGuard('ORG_ADMIN');
    if (!guard.success) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Get the user's company (usually company_id = 1 for main company)
    const companies = await odoo.searchRead<OdooCompany>('res.company', [], {
      fields: [
        'name', 'street', 'street2', 'city', 'state_id', 'zip', 'country_id',
        'phone', 'mobile', 'email', 'website', 'vat', 'company_registry',
        'currency_id', 'logo', 'primary_color', 'secondary_color'
      ],
      limit: 1,
    });

    if (companies.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    const company = companies[0];

    // Transform to frontend format
    const companyData = {
      id: company.id,
      name: company.name,
      street: company.street || '',
      street2: company.street2 || '',
      city: company.city || '',
      stateId: company.state_id ? company.state_id[0] : null,
      stateName: company.state_id ? company.state_id[1] : '',
      zip: company.zip || '',
      countryId: company.country_id ? company.country_id[0] : null,
      countryName: company.country_id ? company.country_id[1] : '',
      phone: company.phone || '',
      mobile: company.mobile || '',
      email: company.email || '',
      website: company.website || '',
      vat: company.vat || '',
      companyRegistry: company.company_registry || '',
      currencyId: company.currency_id ? company.currency_id[0] : null,
      currencyName: company.currency_id ? company.currency_id[1] : '',
      logo: company.logo || null,
      primaryColor: company.primary_color || '',
      secondaryColor: company.secondary_color || '',
    };

    return NextResponse.json({
      success: true,
      data: companyData,
    });
  } catch (error) {
    console.error('[Company Settings Error]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch company settings';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/company
 * Update company information in Odoo
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Only admins can update company settings
    const guard = await roleGuard('ORG_ADMIN');
    if (!guard.success) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      name,
      street,
      street2,
      city,
      stateId,
      zip,
      countryId,
      phone,
      mobile,
      email,
      website,
      vat,
      companyRegistry,
      logo,
      primaryColor,
      secondaryColor,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Company ID is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Build update values
    const updateValues: Record<string, unknown> = {};

    if (name !== undefined) updateValues.name = name;
    if (street !== undefined) updateValues.street = street || false;
    if (street2 !== undefined) updateValues.street2 = street2 || false;
    if (city !== undefined) updateValues.city = city || false;
    if (stateId !== undefined) updateValues.state_id = stateId || false;
    if (zip !== undefined) updateValues.zip = zip || false;
    if (countryId !== undefined) updateValues.country_id = countryId || false;
    if (phone !== undefined) updateValues.phone = phone || false;
    if (mobile !== undefined) updateValues.mobile = mobile || false;
    if (email !== undefined) updateValues.email = email || false;
    if (website !== undefined) updateValues.website = website || false;
    if (vat !== undefined) updateValues.vat = vat || false;
    if (companyRegistry !== undefined) updateValues.company_registry = companyRegistry || false;
    if (logo !== undefined) updateValues.logo = logo || false;
    if (primaryColor !== undefined) updateValues.primary_color = primaryColor || false;
    if (secondaryColor !== undefined) updateValues.secondary_color = secondaryColor || false;

    // Update company in Odoo
    await odoo.write('res.company', [id], updateValues);

    return NextResponse.json({
      success: true,
      message: 'Company settings updated successfully',
    });
  } catch (error) {
    console.error('[Company Settings Update Error]', error);
    const message = error instanceof Error ? error.message : 'Failed to update company settings';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
