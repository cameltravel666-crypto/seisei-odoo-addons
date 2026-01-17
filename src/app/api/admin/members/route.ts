/**
 * GET /api/admin/members - List tenant members
 *
 * Required role: ORG_ADMIN or higher
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { combinedGuard } from '@/lib/guards';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check role - must be ORG_ADMIN or higher to view members
    const guard = await combinedGuard(session.tenantId, session.userId, {
      minRole: 'ORG_ADMIN',
    });

    if (!guard.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: guard.reason || 'Insufficient permissions' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const search = searchParams.get('search');

    // Build where clause
    const where: {
      tenantId: string;
      OR?: Array<{
        email?: { contains: string; mode: 'insensitive' };
        displayName?: { contains: string; mode: 'insensitive' };
      }>;
    } = { tenantId: session.tenantId };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch members with their memberships
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Math.min(pageSize, 100),
        include: {
          memberships: {
            where: { tenantId: session.tenantId },
            select: {
              role: true,
              storeScope: true,
              status: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Format response
    const members = users.map((user) => {
      const membership = user.memberships[0];
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: membership?.role || 'OPERATOR',
        storeScope: membership?.storeScope || [],
        status: membership?.status || 'ACTIVE',
        lastLoginAt: user.lastLoginAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        members,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('[Members List Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list members' } },
      { status: 500 }
    );
  }
}
