import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { initializeTenantFeatures } from '@/lib/features';
import { jwtVerify } from 'jose';
import { sendEmail, welcomeEmail } from '@/lib/email';
import {
  createJob,
  triggerProvisioningAsync,
  getTemplateForIndustry,
} from '@/lib/provisioning';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  companyName: z.string().min(1, 'Company name is required'),
  contactName: z.string().min(1, 'Contact name is required'),
  phone: z.string().optional(),
  industry: z.string().optional(),
  emailToken: z.string().optional(),
  locale: z.string().optional(),
});

/**
 * POST /api/auth/register
 * Completes registration after OAuth/email verification
 *
 * Flow:
 * 1. Validate email (OAuth token or email verification token)
 * 2. Create Tenant + User + Session in a single transaction
 * 3. Create ProvisioningJob for background processing
 * 4. Trigger async provisioning (non-blocking)
 * 5. Return immediately with tenant_status=provisioning
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    let verifiedEmail: string;
    let authProvider = 'email';
    let authProviderId = '';

    // ========================================
    // Step 1: Validate Email
    // ========================================
    if (data.emailToken) {
      try {
        const { payload } = await jwtVerify(data.emailToken, JWT_SECRET);

        if (payload.type !== 'email_verified') {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid verification token' } },
            { status: 400 }
          );
        }

        verifiedEmail = payload.email as string;

        if (verifiedEmail.toLowerCase() !== data.email.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: { code: 'EMAIL_MISMATCH', message: 'Email does not match verified email' } },
            { status: 400 }
          );
        }

        console.log(`[Register] Email token verified for: ${verifiedEmail}`);
      } catch {
        return NextResponse.json(
          { success: false, error: { code: 'TOKEN_EXPIRED', message: 'Verification token expired. Please verify your email again.' } },
          { status: 400 }
        );
      }
    } else {
      // OAuth flow
      const pendingReg = await prisma.pendingRegistration.findUnique({
        where: { email: data.email },
      });

      if (!pendingReg) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Registration session expired. Please try again.' } },
          { status: 400 }
        );
      }

      if (pendingReg.expiresAt < new Date()) {
        await prisma.pendingRegistration.delete({ where: { email: data.email } });
        return NextResponse.json(
          { success: false, error: { code: 'EXPIRED', message: 'Registration session expired. Please try again.' } },
          { status: 400 }
        );
      }

      verifiedEmail = data.email;
      authProvider = pendingReg.provider.toLowerCase();
      authProviderId = pendingReg.providerId;
    }

    // ========================================
    // Step 2: Check if email is already registered
    // ========================================
    const existingUser = await prisma.user.findFirst({
      where: { email: verifiedEmail.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_EXISTS', message: 'This email is already registered' } },
        { status: 400 }
      );
    }

    // ========================================
    // Step 3: Generate unique tenant code (concurrent-safe)
    // ========================================
    const tenantCode = await generateTenantCode();

    // ========================================
    // Step 4: Create Tenant + User + Session in transaction
    // ========================================
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant with pending status
      const tenant = await tx.tenant.create({
        data: {
          tenantCode,
          name: data.companyName,
          odooBaseUrl: 'https://pending.seisei.tokyo',
          odooDb: 'pending',
          planCode: 'starter',
          isActive: true,
          ownerEmail: verifiedEmail,
          ownerName: data.contactName,
          ownerPhone: data.phone,
          oauthProvider: authProvider,
          oauthId: authProviderId,
          billingEmail: verifiedEmail,
          provisionStatus: 'provisioning',
        },
      });

      // Create user
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          odooUserId: 0, // Will be updated after provisioning
          odooLogin: verifiedEmail,
          displayName: data.contactName,
          email: verifiedEmail,
          isAdmin: true,
        },
      });

      // Create session
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const session = await tx.session.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          odooSessionId: 'pending_provisioning',
          expiresAt,
        },
      });

      return { tenant, user, session };
    });

    const { tenant, user, session } = result;

    // ========================================
    // Step 5: Initialize tenant features based on starter plan
    // ========================================
    await initializeTenantFeatures(tenant.id, 'starter');
    // Note: Do NOT enable all modules - only starter plan modules should be enabled

    // ========================================
    // Step 6: Clean up pending registration (OAuth flow)
    // ========================================
    if (!data.emailToken) {
      await prisma.pendingRegistration.delete({ where: { email: verifiedEmail } }).catch(() => {});
    }

    // ========================================
    // Step 7: Create JWT token and set cookie
    // ========================================
    const token = await createToken({
      userId: user.id,
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      odooUserId: user.odooUserId,
      isAdmin: user.isAdmin,
      sessionId: session.id,
    });

    await setAuthCookie(token);

    // ========================================
    // Step 8: Create provisioning job
    // ========================================
    const job = await createJob({
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      userId: user.id,
      progressData: {
        industry: data.industry,
        ownerEmail: verifiedEmail,
        ownerName: data.contactName,
        templateDb: getTemplateForIndustry(data.industry),
        locale: data.locale || 'ja',
      },
    });

    console.log(`[Register] Created provisioning job ${job.id} for ${tenantCode}`);

    // ========================================
    // Step 9: Trigger async provisioning (non-blocking)
    // ========================================
    triggerProvisioningAsync(job.id);

    // ========================================
    // Step 10: Send welcome email (non-blocking)
    // ========================================
    const welcomeEmailContent = welcomeEmail({
      tenantName: data.companyName,
      contactName: data.contactName,
      tenantCode: tenantCode,
      locale: data.locale || 'ja',
    });

    sendEmail({
      to: verifiedEmail,
      subject: welcomeEmailContent.subject,
      html: welcomeEmailContent.html,
    }).catch((err) => {
      console.error('[Register] Failed to send welcome email:', err);
    });

    // ========================================
    // Return success with tenant status
    // ========================================
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          isAdmin: user.isAdmin,
        },
        tenant: {
          id: tenant.id,
          tenantCode: tenant.tenantCode,
          name: tenant.name,
          status: 'provisioning', // Indicates setup is in progress
        },
      },
    });

  } catch (error) {
    console.error('[Register Error]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } },
      { status: 500 }
    );
  }
}

/**
 * Generate unique tenant code (TEN-XXXXXXXX format)
 * Uses database-level uniqueness to handle concurrency
 */
async function generateTenantCode(): Promise<string> {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Get the current max number
    const lastTenant = await prisma.tenant.findFirst({
      where: {
        tenantCode: { startsWith: 'TEN-' },
        NOT: { tenantCode: 'TEN-DEMO01' }, // Exclude demo tenant
      },
      orderBy: { tenantCode: 'desc' },
      select: { tenantCode: true },
    });

    let nextNumber = 1;
    if (lastTenant) {
      const match = lastTenant.tenantCode.match(/TEN-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const tenantCode = `TEN-${nextNumber.toString().padStart(8, '0')}`;

    // Check if this code already exists (concurrent safety)
    const exists = await prisma.tenant.findUnique({
      where: { tenantCode },
      select: { id: true },
    });

    if (!exists) {
      return tenantCode;
    }

    // Code exists, retry with next number
    console.log(`[Register] Tenant code ${tenantCode} already exists, retrying...`);
  }

  // Fallback: use timestamp-based code
  const timestamp = Date.now().toString(36).toUpperCase();
  return `TEN-${timestamp.padStart(8, '0').slice(-8)}`;
}

/**
 * Enable all modules for a tenant (for demo/trial)
 */
async function enableAllModulesForTenant(tenantId: string): Promise<void> {
  const allModules = [
    'POS', 'INVENTORY', 'PURCHASE', 'SALES', 'CRM', 'EXPENSES',
    'ACCOUNTING', 'FINANCE', 'APPROVALS', 'HR', 'MAINTENANCE',
    'DOCUMENTS', 'DASHBOARD', 'PRODUCTS', 'CONTACTS', 'ANALYTICS', 'QR_ORDERING'
  ];

  for (const moduleCode of allModules) {
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_moduleCode: {
          tenantId,
          moduleCode: moduleCode as never,
        },
      },
      update: {
        isAllowed: true,
        isVisible: true,
      },
      create: {
        tenantId,
        moduleCode: moduleCode as never,
        isAllowed: true,
        isVisible: true,
      },
    });
  }
}
