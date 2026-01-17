/**
 * GET /api/ops/tenants - List all tenants (ops admin only)
 *
 * Returns list of all tenants with their provisioning status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { opsAdminGuard, opsApiKeyGuard } from '@/lib/guards';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Check authorization
  const apiKey = request.headers.get('x-ops-key');
  let authorized = false;

  if (apiKey) {
    const apiKeyGuard = opsApiKeyGuard(apiKey);
    authorized = apiKeyGuard.allowed;
  }

  if (!authorized) {
    const adminGuard = await opsAdminGuard();
    authorized = adminGuard.allowed;
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Ops admin access required' } },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const search = searchParams.get('search');
    const status = searchParams.get('status'); // provisioning status

    // Build where clause
    const where: {
      OR?: Array<{
        tenantCode?: { contains: string; mode: 'insensitive' };
        name?: { contains: string; mode: 'insensitive' };
      }>;
      provisionStatus?: string;
    } = {};

    if (search) {
      where.OR = [
        { tenantCode: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.provisionStatus = status;
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Math.min(pageSize, 100),
        select: {
          id: true,
          tenantCode: true,
          name: true,
          isActive: true,
          provisionStatus: true,
          failureStep: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              users: true,
              memberships: true,
            },
          },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tenants: tenants.map((t) => ({
          id: t.id,
          tenantCode: t.tenantCode,
          name: t.name,
          isActive: t.isActive,
          provisionStatus: t.provisionStatus,
          failureStep: t.failureStep,
          failureReason: t.failureReason,
          userCount: t._count.users,
          membershipCount: t._count.memberships,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('[Ops Tenants API] Error:', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list tenants' } },
      { status: 500 }
    );
  }
}
