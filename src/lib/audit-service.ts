/**
 * Audit Log Service
 *
 * Records all authorization and system changes for compliance and debugging.
 * All audit logs are tenant-scoped for data isolation.
 */

import { prisma } from './db';
import { AuditAction, Prisma } from '@prisma/client';
import { headers } from 'next/headers';

// ============================================
// Types
// ============================================

export interface AuditLogInput {
  tenantId: string;
  userId?: string;           // Actor (null for system actions)
  targetUserId?: string;     // Target user (for user management)
  action: AuditAction;
  resource: string;          // Resource type
  resourceId?: string;       // Resource ID
  changes?: {                // What changed
    old?: Record<string, unknown>;
    new?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;  // Additional context
}

export interface AuditLogQuery {
  tenantId: string;
  userId?: string;
  targetUserId?: string;
  actions?: AuditAction[];
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ============================================
// Audit Log Service
// ============================================

export const auditService = {
  /**
   * Create an audit log entry
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      // Get request info from headers (if available)
      let ipAddress: string | undefined;
      let userAgent: string | undefined;

      try {
        const headersList = await headers();
        ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
          || headersList.get('x-real-ip')
          || undefined;
        userAgent = headersList.get('user-agent') || undefined;
      } catch {
        // Headers not available (e.g., in cron jobs)
      }

      await prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          targetUserId: input.targetUserId,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId,
          changes: input.changes as Prisma.InputJsonValue,
          metadata: input.metadata as Prisma.InputJsonValue,
          ipAddress,
          userAgent,
        }
      });
    } catch (error) {
      // Log but don't throw - audit logging should not break the main flow
      console.error('[AuditService] Failed to create audit log:', error);
    }
  },

  /**
   * Query audit logs
   */
  async query(params: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: params.tenantId
    };

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.targetUserId) {
      where.targetUserId = params.targetUserId;
    }

    if (params.actions && params.actions.length > 0) {
      where.action = { in: params.actions };
    }

    if (params.resource) {
      where.resource = params.resource;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = params.startDate;
      }
      if (params.endDate) {
        where.createdAt.lte = params.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
        include: {
          user: {
            select: { id: true, displayName: true, email: true }
          },
          targetUser: {
            select: { id: true, displayName: true, email: true }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    return { logs, total };
  },

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Log user invited event
   */
  async logUserInvited(params: {
    tenantId: string;
    actorId: string;
    targetUserId: string;
    role: string;
    storeScope: string[];
    email?: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      targetUserId: params.targetUserId,
      action: 'USER_INVITED',
      resource: 'membership',
      resourceId: params.targetUserId,
      changes: {
        new: {
          role: params.role,
          storeScope: params.storeScope,
          email: params.email
        }
      }
    });
  },

  /**
   * Log role change event
   */
  async logRoleChanged(params: {
    tenantId: string;
    actorId: string;
    targetUserId: string;
    oldRole: string;
    newRole: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      targetUserId: params.targetUserId,
      action: 'USER_ROLE_CHANGED',
      resource: 'membership',
      resourceId: params.targetUserId,
      changes: {
        old: { role: params.oldRole },
        new: { role: params.newRole }
      }
    });
  },

  /**
   * Log store scope change event
   */
  async logStoreScopeChanged(params: {
    tenantId: string;
    actorId: string;
    targetUserId: string;
    oldScope: string[];
    newScope: string[];
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      targetUserId: params.targetUserId,
      action: 'USER_STORE_SCOPE_CHANGED',
      resource: 'membership',
      resourceId: params.targetUserId,
      changes: {
        old: { storeScope: params.oldScope },
        new: { storeScope: params.newScope }
      }
    });
  },

  /**
   * Log user suspended event
   */
  async logUserSuspended(params: {
    tenantId: string;
    actorId: string;
    targetUserId: string;
    reason?: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      targetUserId: params.targetUserId,
      action: 'USER_SUSPENDED',
      resource: 'membership',
      resourceId: params.targetUserId,
      metadata: params.reason ? { reason: params.reason } : undefined
    });
  },

  /**
   * Log user activated event
   */
  async logUserActivated(params: {
    tenantId: string;
    actorId: string;
    targetUserId: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      targetUserId: params.targetUserId,
      action: 'USER_ACTIVATED',
      resource: 'membership',
      resourceId: params.targetUserId
    });
  },

  /**
   * Log subscription event
   */
  async logSubscriptionEvent(params: {
    tenantId: string;
    action: 'SUBSCRIPTION_CREATED' | 'SUBSCRIPTION_UPDATED' | 'SUBSCRIPTION_CANCELLED' | 'SUBSCRIPTION_RENEWED' | 'SUBSCRIPTION_PAYMENT_FAILED';
    subscriptionId: string;
    changes?: {
      old?: Record<string, unknown>;
      new?: Record<string, unknown>;
    };
    metadata?: Record<string, unknown>;
  }) {
    await this.log({
      tenantId: params.tenantId,
      action: params.action,
      resource: 'subscription',
      resourceId: params.subscriptionId,
      changes: params.changes,
      metadata: params.metadata
    });
  },

  /**
   * Log entitlements update event
   */
  async logEntitlementsUpdated(params: {
    tenantId: string;
    oldEntitlements: {
      modules: string[];
      maxUsers: number;
      status: string;
    };
    newEntitlements: {
      modules: string[];
      maxUsers: number;
      status: string;
    };
    source: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      action: 'ENTITLEMENTS_UPDATED',
      resource: 'entitlements',
      resourceId: params.tenantId,
      changes: {
        old: params.oldEntitlements,
        new: params.newEntitlements
      },
      metadata: { source: params.source }
    });
  },

  /**
   * Log module enabled/disabled event
   */
  async logModuleChange(params: {
    tenantId: string;
    actorId?: string;
    moduleCode: string;
    enabled: boolean;
    source: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.actorId,
      action: params.enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
      resource: 'entitlements',
      resourceId: params.tenantId,
      changes: {
        new: { moduleCode: params.moduleCode, enabled: params.enabled }
      },
      metadata: { source: params.source }
    });
  },

  /**
   * Log login event
   */
  async logLogin(params: {
    tenantId: string;
    userId: string;
    success: boolean;
    reason?: string;
    method?: string; // 'password', 'oauth_google', 'oauth_microsoft', 'email_code'
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      resource: 'session',
      metadata: {
        ...(params.reason && { reason: params.reason }),
        ...(params.method && { method: params.method }),
      }
    });
  },

  /**
   * Log logout event
   */
  async logLogout(params: {
    tenantId: string;
    userId: string;
  }) {
    await this.log({
      tenantId: params.tenantId,
      userId: params.userId,
      action: 'LOGOUT',
      resource: 'session'
    });
  }
};

export default auditService;

/**
 * Convenience function for logging audit actions
 * (simpler API than auditService.log)
 */
export async function logAuditAction(params: {
  tenantId: string;
  userId?: string;
  targetUserId?: string;
  action: AuditAction | string;
  resource: string;
  resourceId?: string;
  changes?: {
    old?: Record<string, unknown>;
    new?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await auditService.log({
    ...params,
    action: params.action as AuditAction,
  });
}
