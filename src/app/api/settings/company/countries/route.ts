import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

interface OdooCountry {
  id: number;
  name: string;
  code: string;
}

interface OdooState {
  id: number;
  name: string;
  code: string;
  country_id: [number, string];
}

/**
 * GET /api/settings/company/countries
 * Fetch countries and optionally states for a country
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
    const countryId = searchParams.get('countryId');

    const odoo = await getOdooClientForSession(session);

    // If countryId is provided, fetch states for that country
    if (countryId) {
      const states = await odoo.searchRead<OdooState>('res.country.state',
        [['country_id', '=', parseInt(countryId)]],
        {
          fields: ['name', 'code', 'country_id'],
          order: 'name asc',
        }
      );

      return NextResponse.json({
        success: true,
        data: states.map(s => ({
          id: s.id,
          name: s.name,
          code: s.code,
        })),
      });
    }

    // Fetch all countries
    const countries = await odoo.searchRead<OdooCountry>('res.country', [], {
      fields: ['name', 'code'],
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: countries.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
      })),
    });
  } catch (error) {
    console.error('[Countries API Error]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch countries';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
