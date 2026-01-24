/**
 * Membership Service
 *
 * Manages user memberships within tenants:
 * - Role assignment
 * - Store scope management
 * - User invitation/activation
 */

import { prisma } from './db';
import { Role, MembershipStatus, Prisma } from '@prisma/client';
import { auditService } from './audit-service';
import { entitlementsService } from './entitlements-service';

// ============================================
// Types
// ============================================

export interface MembershipData {
  id: string;
  userId: string;
  tenantId: string;
  role: Role;
  storeScope: string[];
  status: MembershipStatus;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    odooLogin: string;
    lastLoginAt: Date | null;
  };
}

export interface InviteUserInput {
  email: string;
  displayName: string;
  role: Role;
  storeScope?: string[];
  odooUserId: number;
  odooLogin: string;
}

export interface UpdateMembershipInput {
  role?: Role;
  storeScope?: string[];
  status?: MembershipStatus;
}

// ============================================
// Membership Service
// ============================================

export const membershipService = {
  /**
   * Get membership by user and tenant
   */
  async get(userId: string, tenantId: string) {
    return prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId, tenantId }
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            odooLogin: true,
            lastLoginAt: true
          }
        }
      }
    });
  },

  /**
   * Get all memberships for a tenant
   */
  async listByTenant(tenantId: string, options?: {
    status?: MembershipStatus;
    role?: Role;
    limit?: number;
    offset?: number;
  }): Promise<{ memberships: MembershipData[]; total: number }> {
    const where: Prisma.MembershipWhereInput = { tenantId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.role) {
      where.role = options.role;
    }

    const [memberships, total] = await Promise.all([
      prisma.membership.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              odooLogin: true,
              lastLoginAt: true
            }
          }
        },
        orderBy: [
          { role: 'asc' },
          { createdAt: 'asc' }
        ],
        take: options?.limit || 50,
        skip: options?.offset || 0
      }),
      prisma.membership.count({ where })
    ]);

    return { memberships: memberships as MembershipData[], total };
  },

  /**
   * Create membership for new user (internal)
   */
  async create(params: {
    userId: string;
    tenantId: string;
    role: Role;
    storeScope?: string[];
    invitedBy?: string;
  }) {
    const membership = await prisma.membership.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        role: params.role,
        storeScope: params.storeScope || [],
        status: 'ACTIVE',
        invitedBy: params.invitedBy,
        invitedAt: params.invitedBy ? new Date() : null,
        activatedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            odooLogin: true,
            lastLoginAt: true
          }
        }
      }
    });

    return membership;
  },

  /**
   * Invite a new user to the tenant
   * Creates User + Membership records
   */
  async inviteUser(
    tenantId: string,
    input: InviteUserInput,
    invitedBy: string
  ): Promise<MembershipData> {
    // Check user limits
    const limits = await entitlementsService.checkLimits(tenantId);
    if (limits.users.exceeded) {
      throw new Error(`User limit reached (${limits.users.max}). Please upgrade your plan.`);
    }

    // Check if user already exists with this odooUserId
    let user = await prisma.user.findUnique({
      where: {
        tenantId_odooUserId: {
          tenantId,
          odooUserId: input.odooUserId
        }
      }
    });

    // Create user if not exists
    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId,
          odooUserId: input.odooUserId,
          odooLogin: input.odooLogin,
          displayName: input.displayName,
          email: input.email,
          isAdmin: input.role === 'ORG_ADMIN' || input.role === 'BILLING_ADMIN'
        }
      });
    }

    // Check if membership already exists
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId: user.id, tenantId }
      }
    });

    if (existingMembership) {
      throw new Error('User already has a membership in this tenant');
    }

    // Create membership
    const membership = await this.create({
      userId: user.id,
      tenantId,
      role: input.role,
      storeScope: input.storeScope,
      invitedBy
    });

    // Log the invitation
    await auditService.logUserInvited({
      tenantId,
      actorId: invitedBy,
      targetUserId: user.id,
      role: input.role,
      storeScope: input.storeScope || [],
      email: input.email
    });

    return membership as MembershipData;
  },

  /**
   * Update a user's membership
   */
  async update(
    userId: string,
    tenantId: string,
    input: UpdateMembershipInput,
    actorId: string
  ): Promise<MembershipData> {
    const current = await this.get(userId, tenantId);
    if (!current) {
      throw new Error('Membership not found');
    }

    // Prevent self-demotion of last admin
    if (input.role && input.role !== current.role) {
      if (current.role === 'BILLING_ADMIN' || current.role === 'ORG_ADMIN') {
        const adminCount = await prisma.membership.count({
          where: {
            tenantId,
            role: { in: ['BILLING_ADMIN', 'ORG_ADMIN'] },
            status: 'ACTIVE'
          }
        });

        if (adminCount <= 1 && (input.role === 'MANAGER' || input.role === 'OPERATOR')) {
          throw new Error('Cannot demote the last admin');
        }
      }
    }

    const updateData: Prisma.MembershipUpdateInput = {};

    if (input.role !== undefined) {
      updateData.role = input.role;
    }

    if (input.storeScope !== undefined) {
      updateData.storeScope = input.storeScope;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    const updated = await prisma.membership.update({
      where: {
        userId_tenantId: { userId, tenantId }
      },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            odooLogin: true,
            lastLoginAt: true
          }
        }
      }
    });

    // Also update User.isAdmin to stay in sync
    if (input.role !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isAdmin: input.role === 'ORG_ADMIN' || input.role === 'BILLING_ADMIN'
        }
      });
    }

    // Log changes
    if (input.role !== undefined && input.role !== current.role) {
      await auditService.logRoleChanged({
        tenantId,
        actorId,
        targetUserId: userId,
        oldRole: current.role,
        newRole: input.role
      });
    }

    if (input.storeScope !== undefined) {
      const scopeChanged = JSON.stringify(input.storeScope.sort()) !==
        JSON.stringify(current.storeScope.sort());
      if (scopeChanged) {
        await auditService.logStoreScopeChanged({
          tenantId,
          actorId,
          targetUserId: userId,
          oldScope: current.storeScope,
          newScope: input.storeScope
        });
      }
    }

    if (input.status === 'SUSPENDED' && current.status !== 'SUSPENDED') {
      await auditService.logUserSuspended({
        tenantId,
        actorId,
        targetUserId: userId
      });
    }

    if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') {
      await auditService.logUserActivated({
        tenantId,
        actorId,
        targetUserId: userId
      });
    }

    return updated as MembershipData;
  },

  /**
   * Suspend a user
   */
  async suspend(userId: string, tenantId: string, actorId: string, reason?: string) {
    const current = await this.get(userId, tenantId);
    if (!current) {
      throw new Error('Membership not found');
    }

    // Prevent suspending the last admin
    if (current.role === 'BILLING_ADMIN' || current.role === 'ORG_ADMIN') {
      const adminCount = await prisma.membership.count({
        where: {
          tenantId,
          role: { in: ['BILLING_ADMIN', 'ORG_ADMIN'] },
          status: 'ACTIVE'
        }
      });

      if (adminCount <= 1) {
        throw new Error('Cannot suspend the last admin');
      }
    }

    const updated = await prisma.membership.update({
      where: {
        userId_tenantId: { userId, tenantId }
      },
      data: { status: 'SUSPENDED' },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            odooLogin: true,
            lastLoginAt: true
          }
        }
      }
    });

    await auditService.logUserSuspended({
      tenantId,
      actorId,
      targetUserId: userId,
      reason
    });

    return updated as MembershipData;
  },

  /**
   * Activate a suspended user
   */
  async activate(userId: string, tenantId: string, actorId: string) {
    const updated = await prisma.membership.update({
      where: {
        userId_tenantId: { userId, tenantId }
      },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            odooLogin: true,
            lastLoginAt: true
          }
        }
      }
    });

    await auditService.logUserActivated({
      tenantId,
      actorId,
      targetUserId: userId
    });

    return updated as MembershipData;
  },

  /**
   * Remove a user from the tenant
   */
  async remove(userId: string, tenantId: string, actorId: string) {
    const current = await this.get(userId, tenantId);
    if (!current) {
      throw new Error('Membership not found');
    }

    // Prevent removing the last admin
    if (current.role === 'BILLING_ADMIN' || current.role === 'ORG_ADMIN') {
      const adminCount = await prisma.membership.count({
        where: {
          tenantId,
          role: { in: ['BILLING_ADMIN', 'ORG_ADMIN'] },
          status: 'ACTIVE'
        }
      });

      if (adminCount <= 1) {
        throw new Error('Cannot remove the last admin');
      }
    }

    // Delete membership (cascades to delete sessions)
    await prisma.membership.delete({
      where: {
        userId_tenantId: { userId, tenantId }
      }
    });

    // Log the removal
    await auditService.log({
      tenantId,
      userId: actorId,
      targetUserId: userId,
      action: 'USER_REMOVED',
      resource: 'membership',
      resourceId: userId,
      changes: {
        old: {
          role: current.role,
          storeScope: current.storeScope
        }
      }
    });
  },

  /**
   * Get or create membership for a user (used during login)
   * If user.isAdmin is true but membership role is not admin, upgrade the role
   */
  async ensureMembership(userId: string, tenantId: string, isAdmin: boolean): Promise<MembershipData | null> {
    let membership = await this.get(userId, tenantId);

    if (!membership) {
      // Create membership based on isAdmin flag
      membership = await this.create({
        userId,
        tenantId,
        role: isAdmin ? 'ORG_ADMIN' : 'OPERATOR'
      });
    } else if (isAdmin && membership.role !== 'ORG_ADMIN' && membership.role !== 'BILLING_ADMIN') {
      // User is admin but membership doesn't reflect it - upgrade to ORG_ADMIN
      await prisma.membership.update({
        where: {
          userId_tenantId: { userId, tenantId }
        },
        data: { role: 'ORG_ADMIN' }
      });
      // Re-fetch to get consistent type
      membership = await this.get(userId, tenantId);
    }

    return membership;
  }
};

export default membershipService;
