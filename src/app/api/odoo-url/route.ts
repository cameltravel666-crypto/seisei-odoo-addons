import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { odooBaseUrl: true, odooDb: true },
    });

    if (!tenant?.odooBaseUrl) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Odoo URL not configured' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        baseUrl: tenant.odooBaseUrl,
        db: tenant.odooDb,
      },
    });
  } catch (error) {
    console.error('[Odoo URL Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get Odoo URL' } },
      { status: 500 }
    );
  }
}
