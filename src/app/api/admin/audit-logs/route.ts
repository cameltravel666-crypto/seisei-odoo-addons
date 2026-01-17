/**
 * GET /api/admin/audit-logs
 *
 * Query audit logs for the tenant (ORG_ADMIN+)
 * Supports filtering by user, action, resource, and date range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { roleGuard, guardErrorResponse } from '@/lib/guards';
import { auditService } from '@/lib/audit-service';
import { AuditAction } from '@prisma/client';

export async function GET(request: NextRequest) {
  // Require ORG_ADMIN role
  const guard = await roleGuard('ORG_ADMIN');
  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { tenantId } = guard.context;

  // Parse query params
  const searchParams = request.nextUrl.searchParams;

  const userId = searchParams.get('userId') || undefined;
  const targetUserId = searchParams.get('targetUserId') || undefined;
  const resource = searchParams.get('resource') || undefined;
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  // Parse actions (comma-separated)
  let actions: AuditAction[] | undefined;
  const actionsParam = searchParams.get('actions');
  if (actionsParam) {
    actions = actionsParam.split(',').filter(a =>
      Object.values(AuditAction).includes(a as AuditAction)
    ) as AuditAction[];
  }

  // Parse dates
  let startDate: Date | undefined;
  let endDate: Date | undefined;
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  if (startDateParam) {
    startDate = new Date(startDateParam);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid startDate format' },
        { status: 400 }
      );
    }
  }

  if (endDateParam) {
    endDate = new Date(endDateParam);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid endDate format' },
        { status: 400 }
      );
    }
  }

  // Query audit logs
  const { logs, total } = await auditService.query({
    tenantId,
    userId,
    targetUserId,
    actions,
    resource,
    startDate,
    endDate,
    limit,
    offset
  });

  return NextResponse.json({
    logs: logs.map(log => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      changes: log.changes,
      metadata: log.metadata,
      actor: log.user ? {
        id: log.user.id,
        displayName: log.user.displayName,
        email: log.user.email
      } : null,
      target: log.targetUser ? {
        id: log.targetUser.id,
        displayName: log.targetUser.displayName,
        email: log.targetUser.email
      } : null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt.toISOString()
    })),
    total,
    limit,
    offset
  });
}
