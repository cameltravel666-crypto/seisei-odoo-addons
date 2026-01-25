/**
 * Debug API to check tenant Odoo configuration
 * GET: Returns tenant's Odoo connection info
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        id: true,
        tenantCode: true,
        name: true,
        odooBaseUrl: true,
        odooDb: true,
        provisionStatus: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantCode: tenant.tenantCode,
        tenantName: tenant.name,
        odooBaseUrl: tenant.odooBaseUrl,
        odooDb: tenant.odooDb,
        provisionStatus: tenant.provisionStatus,
      },
    });
  } catch (error) {
    console.error('[Debug Tenant API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}
