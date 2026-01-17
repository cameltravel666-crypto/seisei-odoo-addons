/**
 * GET /api/ops/audit-logs - View audit logs across all tenants (ops admin only)
 *
 * Returns audit logs with optional filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { opsAdminGuard, opsApiKeyGuard } from '@/lib/guards';
import { prisma } from '@/lib/db';
import { AuditAction, Prisma } from '@prisma/client';

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
    const tenantId = searchParams.get('tenantId');
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action as AuditAction;
    }

    if (resource) {
      where.resource = resource;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Math.min(pageSize, 100),
        include: {
          tenant: {
            select: {
              tenantCode: true,
              name: true,
            },
          },
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
          targetUser: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          tenantId: log.tenantId,
          tenantCode: log.tenant?.tenantCode,
          tenantName: log.tenant?.name,
          userId: log.userId,
          userName: log.user?.displayName || log.user?.email,
          targetUserId: log.targetUserId,
          targetUserName: log.targetUser?.displayName || log.targetUser?.email,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          changes: log.changes,
          metadata: log.metadata,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          createdAt: log.createdAt.toISOString(),
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
    console.error('[Ops Audit API] Error:', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list audit logs' } },
      { status: 500 }
    );
  }
}
