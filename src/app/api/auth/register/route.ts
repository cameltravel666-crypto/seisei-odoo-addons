import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { initializeTenantFeatures } from '@/lib/features';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  companyName: z.string().min(1, 'Company name is required'),
  contactName: z.string().min(1, 'Contact name is required'),
  phone: z.string().optional(),
  industry: z.string().optional(),
  emailToken: z.string().optional(), // Token from email verification
});

/**
 * POST /api/auth/register
 * Completes registration after OAuth authentication
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    let verifiedEmail: string;
    let authProvider = 'email'; // Default to email
    let authProviderId = ''; // No provider ID for email

    // Check if email token is provided (email verification flow)
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

        // Verify email matches
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
      // OAuth flow - verify pending registration exists
      const pendingReg = await prisma.pendingRegistration.findUnique({
        where: { email: data.email },
      });

      if (!pendingReg) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Registration session expired. Please try again.' } },
          { status: 400 }
        );
      }

      // Check if registration is expired
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

    // Check if email is already registered
    const existingUser = await prisma.user.findFirst({
      where: { email: verifiedEmail.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_EXISTS', message: 'This email is already registered' } },
        { status: 400 }
      );
    }

    // Generate tenant code (TEN-XXXXXXXX)
    const tenantCode = await generateTenantCode();

    // Create tenant
    // For now, use a placeholder Odoo URL/DB - will be provisioned by Bridge later
    const tenant = await prisma.tenant.create({
      data: {
        tenantCode,
        name: data.companyName,
        odooBaseUrl: 'https://pending.seisei.tokyo', // Placeholder
        odooDb: 'pending', // Placeholder
        planCode: 'starter',
        isActive: true,
        ownerEmail: verifiedEmail,
        ownerName: data.contactName,
        ownerPhone: data.phone,
        oauthProvider: authProvider,
        oauthId: authProviderId,
        billingEmail: verifiedEmail,
        provisionStatus: 'pending',
      },
    });

    // Initialize all features as enabled (free trial / demo)
    await initializeTenantFeatures(tenant.id, 'starter');

    // Enable all modules for demo (as requested)
    await enableAllModulesForTenant(tenant.id);

    // Create initial user record
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        odooUserId: 0, // Will be set when Odoo is provisioned
        odooLogin: verifiedEmail,
        displayName: data.contactName,
        email: verifiedEmail,
        isAdmin: true,
      },
    });

    // Clean up pending registration (only for OAuth flow)
    if (!data.emailToken) {
      await prisma.pendingRegistration.delete({ where: { email: verifiedEmail } });
    }

    // Create session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        odooSessionId: 'oauth_session', // Placeholder for OAuth-based login
        expiresAt,
      },
    });

    // Create JWT token
    const token = await createToken({
      userId: user.id,
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      odooUserId: user.odooUserId,
      isAdmin: user.isAdmin,
      sessionId: session.id,
    });

    // Set auth cookie
    await setAuthCookie(token);

    // Trigger async provisioning with industry-specific template
    // This runs in background and doesn't block registration
    triggerProvisioningAsync(tenant.id, tenantCode, data.companyName, verifiedEmail, data.industry);

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
 */
async function generateTenantCode(): Promise<string> {
  // Get the highest existing tenant number
  const lastTenant = await prisma.tenant.findFirst({
    where: {
      tenantCode: { startsWith: 'TEN-' },
    },
    orderBy: { createdAt: 'desc' },
  });

  let nextNumber = 1;
  if (lastTenant) {
    const match = lastTenant.tenantCode.match(/TEN-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  // Format with leading zeros (8 digits)
  return `TEN-${nextNumber.toString().padStart(8, '0')}`;
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
          moduleCode: moduleCode as any,
        },
      },
      update: {
        isAllowed: true,
        isVisible: true,
      },
      create: {
        tenantId,
        moduleCode: moduleCode as any,
        isAllowed: true,
        isVisible: true,
      },
    });
  }
}

/**
 * Map industry to template database name
 */
function getTemplateForIndustry(industry?: string): string {
  const templateMap: Record<string, string> = {
    restaurant: 'tpl_restaurant',
    retail: 'tpl_retail',
    service: 'tpl_service',
    consulting: 'tpl_consulting',
    realestate: 'tpl_realestate',
  };
  return templateMap[industry || ''] || 'tpl_service'; // Default to service template
}

/**
 * Call local db-copy-service to create database from template
 */
async function copyDatabaseFromTemplate(
  sourceDb: string,
  targetDb: string
): Promise<{ success: boolean; error?: string }> {
  const DB_COPY_URL = 'http://127.0.0.1:23001';
  const DB_COPY_API_KEY = process.env.DB_COPY_API_KEY || 'seisei-db-copy-secret-2026';

  try {
    const response = await fetch(`${DB_COPY_URL}/copy-database`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': DB_COPY_API_KEY,
      },
      body: JSON.stringify({
        source_db: sourceDb,
        target_db: targetDb,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Trigger async provisioning - create tenant database from template and register in Odoo 19
 * This runs in background and doesn't block registration
 */
function triggerProvisioningAsync(
  tenantId: string,
  tenantCode: string,
  companyName: string,
  email: string,
  industry?: string
): void {
  // Fire and forget - don't await
  (async () => {
    try {
      console.log(`[Provisioning] Starting for tenant ${tenantCode}, industry: ${industry || 'default'}`);

      // Update status to provisioning
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { provisionStatus: 'provisioning' },
      });

      // Generate subdomain and database name from tenant code
      const tenantNumber = tenantCode.replace('TEN-', '');
      const domainPrimary = `${tenantNumber}.erp.seisei.tokyo`;
      const customerDbName = `cust_ten_${tenantNumber}`.toLowerCase();

      // Step 1: Copy database from industry template
      const templateDb = getTemplateForIndustry(industry);
      console.log(`[Provisioning] Creating database ${customerDbName} from template ${templateDb}...`);

      const copyResult = await copyDatabaseFromTemplate(templateDb, customerDbName);
      if (!copyResult.success) {
        throw new Error(`Database copy failed: ${copyResult.error}`);
      }

      console.log(`[Provisioning] Database ${customerDbName} created successfully`);

      // Step 2: Create tenant in Odoo 19 Operations Management
      console.log(`[Provisioning] Creating tenant in Odoo 19...`);
      const { getOdoo19Client } = await import('@/lib/odoo19');
      const odoo19 = getOdoo19Client();

      const odooTenantId = await odoo19.create('vendor.ops.tenant', {
        name: companyName,
        code: tenantCode,
        subdomain: tenantNumber,
        plan: 'starter',
        bridge_sync_status: 'pending',
        notes: `Owner: ${email}, Industry: ${industry || 'service'}`,
      });

      console.log(`[Provisioning] Created Odoo 19 tenant ID: ${odooTenantId} for ${tenantCode}`);

      // Step 3: Call Bridge API to store tenant metadata
      console.log(`[Provisioning] Storing tenant metadata in Bridge API...`);
      const { upsertTenantInBridge } = await import('@/lib/bridge');

      const bridgeResponse = await upsertTenantInBridge(tenantCode, {
        tenant_code: tenantCode,
        tenant_name: companyName,
        subdomain: tenantNumber,
        domain_primary: domainPrimary,
        customer_db_name: customerDbName,
        plan: 'starter',
        active: true,
        note: `Owner: ${email}, Industry: ${industry || 'service'}`,
      });

      if (!bridgeResponse.ok) {
        console.warn(`[Provisioning] Bridge API warning: ${bridgeResponse.error}`);
        // Don't fail - database is already created
      }

      // Step 4: Update BizNexus tenant with real Odoo configuration
      const odooBaseUrl = `https://${domainPrimary}`;
      const odooDb = customerDbName;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          odooBaseUrl,
          odooDb,
          provisionStatus: 'completed',
          bridgeTenantId: odooTenantId.toString(),
        },
      });

      // Step 5: Update Odoo 19 with sync status
      try {
        await odoo19.write('vendor.ops.tenant', [odooTenantId], {
          bridge_sync_status: 'ok',
          business_base_url: odooBaseUrl,
        });
      } catch (odoo19Error) {
        console.warn(`[Provisioning] Failed to update Odoo 19 sync status:`, odoo19Error);
      }

      console.log(`[Provisioning] Completed for tenant ${tenantCode}`);
      console.log(`[Provisioning] Odoo URL: ${odooBaseUrl}, DB: ${odooDb}`);

    } catch (error) {
      console.error(`[Provisioning] Error for tenant ${tenantCode}:`, error);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { provisionStatus: 'failed' },
      });
    }
  })();
}
