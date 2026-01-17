/**
 * Invitation Service
 *
 * Handles employee invitations with one-time set-password links.
 *
 * Security requirements:
 * - Tokens are hashed before storage (SHA-256)
 * - Short expiry (24-48 hours)
 * - Single use (marked as used immediately)
 * - Can be revoked by admin
 *
 * Flow:
 * 1. Owner/Admin creates invitation with role and store_scope
 * 2. System generates secure token and sends email
 * 3. Employee clicks link, sets password
 * 4. User account is created/updated and membership activated
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';
import {
  Role,
  InvitationStatus,
  InvitationType,
  MembershipStatus,
  type Invitation,
  type User,
  type Membership,
} from '@prisma/client';
import { logAuditAction } from '@/lib/audit-service';

// Token expiry: 48 hours
const TOKEN_EXPIRY_HOURS = 48;
const TOKEN_LENGTH = 32; // 256 bits

export interface CreateInvitationParams {
  tenantId: string;
  email: string;
  role: Role;
  storeScope: string[];
  invitedById: string;
  type?: InvitationType;
}

export interface AcceptInvitationParams {
  token: string;
  password: string;
  displayName?: string;
}

export interface InvitationResult {
  invitation: Invitation;
  token: string; // Original unhashed token (only returned on creation)
}

/**
 * Hash a token using SHA-256
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('base64url');
}

/**
 * Create a new invitation
 */
export async function createInvitation(
  params: CreateInvitationParams
): Promise<InvitationResult> {
  const { tenantId, email, role, storeScope, invitedById, type = InvitationType.NEW_USER } = params;

  // Check if there's already a pending invitation for this email
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      tenantId,
      email: email.toLowerCase(),
      status: InvitationStatus.PENDING,
    },
  });

  if (existingInvitation) {
    // Revoke old invitation and create new one
    await prisma.invitation.update({
      where: { id: existingInvitation.id },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
        revokedBy: invitedById,
      },
    });
  }

  // For password reset, check user exists
  if (type === InvitationType.PASSWORD_RESET) {
    const existingUser = await prisma.user.findFirst({
      where: {
        tenantId,
        email: email.toLowerCase(),
      },
    });

    if (!existingUser) {
      throw new Error('User not found for password reset');
    }
  }

  // Generate token
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Create invitation
  const invitation = await prisma.invitation.create({
    data: {
      tenantId,
      tokenHash,
      type,
      email: email.toLowerCase(),
      role,
      storeScope,
      status: InvitationStatus.PENDING,
      expiresAt,
      invitedBy: invitedById,
    },
  });

  // Audit log
  await logAuditAction({
    tenantId,
    userId: invitedById,
    action: 'INVITATION_SENT',
    resource: 'invitation',
    resourceId: invitation.id,
    changes: {
      new: {
        email,
        role,
        storeScope,
        type,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return { invitation, token };
}

/**
 * Accept an invitation and set password
 */
export async function acceptInvitation(
  params: AcceptInvitationParams
): Promise<{ user: User; membership: Membership }> {
  const { token, password, displayName } = params;
  const tokenHash = hashToken(token);

  // Find invitation
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { tenant: true },
  });

  if (!invitation) {
    throw new Error('Invalid invitation token');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new Error(`Invitation is ${invitation.status.toLowerCase()}`);
  }

  if (invitation.expiresAt < new Date()) {
    // Mark as expired
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.EXPIRED },
    });
    throw new Error('Invitation has expired');
  }

  // Validate password (basic validation, should be enhanced)
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Start transaction
  const result = await prisma.$transaction(async (tx) => {
    let user: User;
    let membership: Membership;

    if (invitation.type === InvitationType.PASSWORD_RESET) {
      // Update existing user
      const existingUser = await tx.user.findFirst({
        where: {
          tenantId: invitation.tenantId,
          email: invitation.email,
        },
      });

      if (!existingUser) {
        throw new Error('User not found');
      }

      // Update password in Odoo (this should be implemented via Odoo API)
      // For now, we just update the local password tracking
      user = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          mustChangePassword: false,
          lastPasswordSetAt: new Date(),
          passwordSetMethod: 'reset',
        },
      });

      // Get membership
      const existingMembership = await tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: user.id,
            tenantId: invitation.tenantId,
          },
        },
      });

      if (!existingMembership) {
        throw new Error('Membership not found');
      }

      membership = existingMembership;
    } else {
      // Create new user
      // First, create user in Odoo and get odooUserId
      // For now, we'll use a placeholder - this needs to be integrated with Odoo
      const odooUserId = Date.now(); // Placeholder - should be from Odoo API

      user = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          odooUserId,
          odooLogin: invitation.email,
          displayName: displayName || invitation.email.split('@')[0],
          email: invitation.email,
          isAdmin: invitation.role === Role.BILLING_ADMIN || invitation.role === Role.ORG_ADMIN,
          mustChangePassword: false,
          lastPasswordSetAt: new Date(),
          passwordSetMethod: 'invitation',
        },
      });

      // Create membership
      membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
          storeScope: invitation.storeScope,
          status: MembershipStatus.ACTIVE,
          invitedBy: invitation.invitedBy,
          invitedAt: invitation.createdAt,
          activatedAt: new Date(),
        },
      });
    }

    // Mark invitation as accepted
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        usedAt: new Date(),
        resultUserId: user.id,
      },
    });

    return { user, membership };
  });

  // Audit log
  await logAuditAction({
    tenantId: invitation.tenantId,
    userId: result.user.id,
    action: 'INVITATION_ACCEPTED',
    resource: 'invitation',
    resourceId: invitation.id,
    changes: {
      old: { status: InvitationStatus.PENDING },
      new: {
        status: InvitationStatus.ACCEPTED,
        userId: result.user.id,
        acceptedAt: new Date().toISOString(),
      },
    },
  });

  await logAuditAction({
    tenantId: invitation.tenantId,
    userId: result.user.id,
    action: 'USER_PASSWORD_SET',
    resource: 'user',
    resourceId: result.user.id,
    changes: {
      new: {
        method: invitation.type === InvitationType.PASSWORD_RESET ? 'reset' : 'invitation',
      },
    },
  });

  return result;
}

/**
 * Revoke an invitation
 */
export async function revokeInvitation(
  invitationId: string,
  revokedById: string
): Promise<Invitation> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new Error(`Cannot revoke invitation with status: ${invitation.status}`);
  }

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: InvitationStatus.REVOKED,
      revokedAt: new Date(),
      revokedBy: revokedById,
    },
  });

  // Audit log
  await logAuditAction({
    tenantId: invitation.tenantId,
    userId: revokedById,
    action: 'INVITATION_REVOKED',
    resource: 'invitation',
    resourceId: invitation.id,
    changes: {
      old: { status: InvitationStatus.PENDING },
      new: { status: InvitationStatus.REVOKED },
    },
  });

  return updated;
}

/**
 * Resend an invitation (creates new token, updates expiry)
 */
export async function resendInvitation(
  invitationId: string,
  resentById: string
): Promise<InvitationResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new Error(`Cannot resend invitation with status: ${invitation.status}`);
  }

  // Check resend limit (max 5 resends)
  if (invitation.resentCount >= 5) {
    throw new Error('Maximum resend limit reached');
  }

  // Generate new token
  const newToken = generateToken();
  const newTokenHash = hashToken(newToken);
  const newExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
      resentCount: invitation.resentCount + 1,
      lastResentAt: new Date(),
    },
  });

  // Audit log
  await logAuditAction({
    tenantId: invitation.tenantId,
    userId: resentById,
    action: 'INVITATION_RESENT',
    resource: 'invitation',
    resourceId: invitation.id,
    changes: {
      old: {
        expiresAt: invitation.expiresAt.toISOString(),
        resentCount: invitation.resentCount,
      },
      new: {
        expiresAt: newExpiresAt.toISOString(),
        resentCount: invitation.resentCount + 1,
      },
    },
  });

  return { invitation: updated, token: newToken };
}

/**
 * Get invitation by token (for verification before accepting)
 */
export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      tenant: {
        select: {
          id: true,
          tenantCode: true,
          name: true,
        },
      },
    },
  });

  return invitation;
}

/**
 * List invitations for a tenant
 */
export async function listInvitations(
  tenantId: string,
  options?: {
    status?: InvitationStatus;
    email?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ invitations: Invitation[]; total: number }> {
  const { status, email, page = 1, pageSize = 20 } = options || {};

  const where: {
    tenantId: string;
    status?: InvitationStatus;
    email?: { contains: string; mode: 'insensitive' };
  } = { tenantId };

  if (status) {
    where.status = status;
  }

  if (email) {
    where.email = { contains: email, mode: 'insensitive' };
  }

  const [invitations, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    }),
    prisma.invitation.count({ where }),
  ]);

  return { invitations, total };
}

/**
 * Expire old pending invitations (called by cron/worker)
 */
export async function expireOldInvitations(): Promise<number> {
  const result = await prisma.invitation.updateMany({
    where: {
      status: InvitationStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: InvitationStatus.EXPIRED,
    },
  });

  return result.count;
}

/**
 * Create password reset invitation for existing user
 */
export async function createPasswordResetInvitation(
  tenantId: string,
  email: string,
  requestedById?: string
): Promise<InvitationResult> {
  // Find the user
  const user = await prisma.user.findFirst({
    where: {
      tenantId,
      email: email.toLowerCase(),
    },
    include: {
      memberships: {
        where: { tenantId },
        select: { role: true, storeScope: true },
      },
    },
  });

  if (!user) {
    // Don't reveal if user exists - silently return generic message
    throw new Error('If this email exists, a reset link will be sent');
  }

  const membership = user.memberships[0];

  return createInvitation({
    tenantId,
    email,
    role: membership?.role || Role.OPERATOR,
    storeScope: membership?.storeScope || [],
    invitedById: requestedById || user.id,
    type: InvitationType.PASSWORD_RESET,
  });
}
