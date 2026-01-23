/**
 * Provisioning Step Runners
 * Each function implements one step of the provisioning process
 */

import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/auth';
import {
  ProvisioningStep,
  ProvisioningContext,
  StepResult,
  PROVISIONING_CONFIG,
  getTemplateForIndustry,
} from './types';
import { createStepLogger, sanitizeError } from './logger';

// Fetch with timeout helper
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = PROVISIONING_CONFIG.fetchTimeoutMs
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Step 1: Copy database from template
 */
export async function step1CopyDatabase(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_1_COPY_DB);
  logger.start('Copying database from template');

  // Check if already done (idempotency)
  if (ctx.progressData.odoo18DbCreated && ctx.progressData.odoo18DbName) {
    logger.success('Database already created, skipping');
    return { success: true, data: { odoo18DbCreated: true } };
  }

  const templateDb = getTemplateForIndustry(ctx.progressData.industry);
  const targetDb = ctx.tenantCode.toLowerCase().replace(/-/g, '_'); // e.g., "ten_00000001"

  const dbCopyUrl = process.env.DB_COPY_SERVICE_URL || 'http://host.docker.internal:23001';
  const dbCopyKey = process.env.DB_COPY_API_KEY || 'seisei-db-copy-secret-2026';

  try {
    const response = await fetchWithTimeout(`${dbCopyUrl}/copy-database`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': dbCopyKey,
      },
      body: JSON.stringify({
        source_db: templateDb,
        target_db: targetDb,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Check if error is "database already exists" - that's OK for idempotency
      if (data.error?.includes('already exists')) {
        logger.success('Database already exists, continuing');
        return {
          success: true,
          data: { odoo18DbName: targetDb, odoo18DbCreated: true, templateDb },
        };
      }
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    logger.success(`Database ${targetDb} created from ${templateDb}`);
    return {
      success: true,
      data: { odoo18DbName: targetDb, odoo18DbCreated: true, templateDb },
    };
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Step 2: Authenticate with Odoo 18
 */
export async function step2Odoo18Auth(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_2_ODOO18_AUTH);
  logger.start('Authenticating with Odoo 18');

  // Build dynamic URL based on tenant code (due to Odoo's dbfilter configuration)
  // TEN-MKQVB5AL -> mkqvb5al.erp.seisei.tokyo -> ten_mkqvb5al database
  const tenantNumber = ctx.tenantCode.replace('TEN-', '').toLowerCase();
  const odooBaseUrl = process.env.ODOO18_AUTH_URL || `https://${tenantNumber}.erp.seisei.tokyo`;
  const dbName = ctx.progressData.odoo18DbName || `ten_${tenantNumber}`;

  try {
    const response = await fetchWithTimeout(`${odooBaseUrl}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          db: dbName,
          login: process.env.ODOO_TEMPLATE_ADMIN_LOGIN || 'admin',
          password: process.env.ODOO_TEMPLATE_ADMIN_PASSWORD || 'admin123',
        },
        id: Date.now(),
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.data?.message || data.error.message || 'Odoo RPC error');
    }

    const result = data.result as Record<string, unknown>;
    if (!result.uid || result.uid === false) {
      throw new Error('Authentication failed: invalid credentials');
    }

    // Extract session from cookie
    const setCookie = response.headers.get('set-cookie');
    let sessionId: string | undefined;
    if (setCookie) {
      const match = setCookie.match(/session_id=([^;]+)/);
      if (match) sessionId = match[1];
    }

    if (!sessionId) {
      sessionId = result.session_id as string;
    }

    logger.success('Authenticated with Odoo 18');
    return {
      success: true,
      data: { odoo18SessionId: sessionId },
    };
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Step 3: Update Odoo 18 admin user
 */
export async function step3Odoo18UpdateAdmin(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_3_ODOO18_UPDATE_ADMIN);
  logger.start('Updating Odoo 18 admin user');

  if (ctx.progressData.odoo18AdminUpdated) {
    logger.success('Admin already updated, skipping');
    return { success: true };
  }

  // Build dynamic URL based on tenant code (due to Odoo's dbfilter configuration)
  const tenantNumber = ctx.tenantCode.replace('TEN-', '').toLowerCase();
  const odooBaseUrl = process.env.ODOO18_AUTH_URL || `https://${tenantNumber}.erp.seisei.tokyo`;
  const sessionId = ctx.progressData.odoo18SessionId;

  if (!sessionId) {
    return { success: false, error: 'No Odoo session available' };
  }

  // Generate secure password
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let generatedPassword = '';
  for (let i = 0; i < 16; i++) {
    generatedPassword += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const ownerEmail = ctx.progressData.ownerEmail;
  const ownerName = ctx.progressData.ownerName;

  if (!ownerEmail) {
    return { success: false, error: 'Owner email not available' };
  }

  try {
    // Update user login and password
    await fetchWithTimeout(`${odooBaseUrl}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.users',
          method: 'write',
          args: [[2], { login: ownerEmail, password: generatedPassword }],
          kwargs: {},
        },
        id: Date.now(),
      }),
    });

    // Get partner ID for admin user
    const userResponse = await fetchWithTimeout(`${odooBaseUrl}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.users',
          method: 'read',
          args: [[2], ['partner_id']],
          kwargs: {},
        },
        id: Date.now(),
      }),
    });

    const userData = await userResponse.json();
    const users = userData.result as Array<{ partner_id: [number, string] }>;

    if (users?.[0]?.partner_id) {
      const partnerId = users[0].partner_id[0];

      // Update partner name and email
      await fetchWithTimeout(`${odooBaseUrl}/web/dataset/call_kw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `session_id=${sessionId}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'res.partner',
            method: 'write',
            args: [[partnerId], { name: ownerName, email: ownerEmail }],
            kwargs: {},
          },
          id: Date.now(),
        }),
      });
    }

    // Store the generated password encrypted in tenant record for OAuth login
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        opsPasswordEncrypted: encrypt(generatedPassword),
        opsPasswordUpdatedAt: new Date(),
      },
    });

    logger.success('Admin user updated and password stored');
    return {
      success: true,
      data: { odoo18AdminUpdated: true, generatedPassword },
    };
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Step 4: Upsert tenant in Odoo 19
 */
export async function step4Odoo19UpsertTenant(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_4_ODOO19_UPSERT_TENANT);
  logger.start('Upserting tenant in Odoo 19');

  // Check if already done
  if (ctx.progressData.odoo19TenantId) {
    logger.success('Tenant already exists in Odoo 19, skipping create');
    return { success: true };
  }

  try {
    const { getOdoo19Client } = await import('@/lib/odoo19');
    const odoo19 = getOdoo19Client();

    const tenantNumber = ctx.tenantCode.replace('TEN-', '');
    const odooBaseUrl = `https://${tenantNumber}.erp.seisei.tokyo`;

    // Check if tenant already exists (idempotency)
    const existingIds = await odoo19.search('vendor.ops.tenant', [['code', '=', ctx.tenantCode]]);

    let odoo19TenantId: number;

    if (existingIds.length > 0) {
      // Update existing
      odoo19TenantId = existingIds[0];
      await odoo19.write('vendor.ops.tenant', [odoo19TenantId], {
        business_base_url: odooBaseUrl,
        bridge_sync_status: 'pending',
      });
      logger.success(`Updated existing Odoo 19 tenant ID: ${odoo19TenantId}`);
    } else {
      // Create new
      const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
      });

      odoo19TenantId = await odoo19.create('vendor.ops.tenant', {
        name: tenant?.name || ctx.tenantCode,
        code: ctx.tenantCode,
        subdomain: tenantNumber,
        plan: 'starter',
        bridge_sync_status: 'pending',
        business_base_url: odooBaseUrl,
        notes: `Owner: ${ctx.progressData.ownerEmail}, Industry: ${ctx.progressData.industry || 'service'}`,
      });
      logger.success(`Created Odoo 19 tenant ID: ${odoo19TenantId}`);
    }

    return {
      success: true,
      data: { odoo19TenantId },
    };
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Step 5: Upsert user in Odoo 19
 */
export async function step5Odoo19UpsertUser(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_5_ODOO19_UPSERT_USER);
  logger.start('Upserting user in Odoo 19');

  if (ctx.progressData.odoo19UserId) {
    logger.success('User already exists in Odoo 19');
    return { success: true };
  }

  const odoo19TenantId = ctx.progressData.odoo19TenantId;
  if (!odoo19TenantId) {
    return { success: false, error: 'Odoo 19 tenant ID not available' };
  }

  try {
    const { getOdoo19Client } = await import('@/lib/odoo19');
    const odoo19 = getOdoo19Client();

    const ownerEmail = ctx.progressData.ownerEmail;
    const ownerName = ctx.progressData.ownerName;

    if (!ownerEmail) {
      return { success: false, error: 'Owner email not available' };
    }

    // Check if model exists and has the right fields
    // This step is optional - if vendor.ops.tenant.user doesn't exist, we skip
    try {
      // Try to search for existing user
      const existingIds = await odoo19.search('vendor.ops.tenant.user', [
        ['tenant_id', '=', odoo19TenantId],
        ['email', '=', ownerEmail],
      ]);

      let odoo19UserId: number;

      if (existingIds.length > 0) {
        odoo19UserId = existingIds[0];
        await odoo19.write('vendor.ops.tenant.user', [odoo19UserId], {
          name: ownerName,
          role: 'admin',
          odoo18_user_id: 2,
          odoo18_login: ownerEmail,
        });
        logger.success(`Updated existing Odoo 19 user ID: ${odoo19UserId}`);
      } else {
        odoo19UserId = await odoo19.create('vendor.ops.tenant.user', {
          tenant_id: odoo19TenantId,
          email: ownerEmail,
          name: ownerName,
          role: 'admin',
          odoo18_user_id: 2,
          odoo18_login: ownerEmail,
        });
        logger.success(`Created Odoo 19 user ID: ${odoo19UserId}`);
      }

      return {
        success: true,
        data: { odoo19UserId },
      };
    } catch (modelError) {
      // Model might not exist - log warning but don't fail
      console.warn('[Provisioning] vendor.ops.tenant.user model may not exist:', modelError);
      logger.success('Skipping user creation (model may not exist)');
      return { success: true };
    }
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Step 6: Store metadata in Bridge API
 */
export async function step6BridgeMetadata(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_6_BRIDGE_METADATA);
  logger.start('Storing metadata in Bridge API');

  if (ctx.progressData.bridgeMetadataStored) {
    logger.success('Metadata already stored');
    return { success: true };
  }

  try {
    const { upsertTenantInBridge } = await import('@/lib/bridge');

    const tenantNumber = ctx.tenantCode.replace('TEN-', '');
    const domainPrimary = `${tenantNumber}.erp.seisei.tokyo`;
    const customerDbName = ctx.progressData.odoo18DbName || ctx.tenantCode.toLowerCase().replace(/-/g, '_');

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
    });

    const bridgeResponse = await upsertTenantInBridge(ctx.tenantCode, {
      tenant_code: ctx.tenantCode,
      tenant_name: tenant?.name || ctx.tenantCode,
      subdomain: tenantNumber,
      domain_primary: domainPrimary,
      customer_db_name: customerDbName,
      plan: 'starter',
      active: true,
      note: `Owner: ${ctx.progressData.ownerEmail}, Industry: ${ctx.progressData.industry || 'service'}`,
    });

    if (!bridgeResponse.ok) {
      // Bridge API is optional - warn but don't fail
      console.warn(`[Provisioning] Bridge API warning: ${bridgeResponse.error}`);
    }

    logger.success('Metadata stored in Bridge API');
    return {
      success: true,
      data: { bridgeMetadataStored: true },
    };
  } catch (error) {
    // Bridge API failure is non-fatal
    logger.error(error as Error);
    console.warn('[Provisioning] Bridge API failed but continuing:', sanitizeError(error));
    return {
      success: true,
      data: { bridgeMetadataStored: false },
    };
  }
}

/**
 * Step 7: Finalize - Update BizNexus tenant and user records
 */
export async function step7Finalize(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_7_FINALIZE);
  logger.start('Finalizing provisioning');

  try {
    const tenantNumber = ctx.tenantCode.replace('TEN-', '');
    const odooBaseUrl = `https://${tenantNumber}.erp.seisei.tokyo`;
    const odooDb = ctx.progressData.odoo18DbName || ctx.tenantCode.toLowerCase().replace(/-/g, '_');

    // Update tenant
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        odooBaseUrl,
        odooDb,
        provisionStatus: 'active',
        bridgeTenantId: ctx.progressData.odoo19TenantId?.toString(),
        odoo19UserId: ctx.progressData.odoo19UserId,
        failureStep: null,
        failureReason: null,
      },
    });

    // Update user with Odoo mapping
    if (ctx.userId) {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          odooUserId: 2, // Admin user ID
          odooLogin: ctx.progressData.ownerEmail,
        },
      });
    } else {
      // Find user by email
      const user = await prisma.user.findFirst({
        where: {
          tenantId: ctx.tenantId,
          email: ctx.progressData.ownerEmail,
        },
      });

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            odooUserId: 2,
            odooLogin: ctx.progressData.ownerEmail,
          },
        });
      }
    }

    // Update pending sessions with real Odoo session
    // This fixes the bug where sessions created during registration have placeholder odooSessionId
    if (ctx.progressData.generatedPassword && ctx.progressData.ownerEmail) {
      try {
        const { createOdooClient } = await import('@/lib/odoo');

        // Authenticate with Odoo to get a real session
        const odooClient = createOdooClient({
          baseUrl: odooBaseUrl,
          db: odooDb,
        });

        const odooSession = await odooClient.authenticate(
          ctx.progressData.ownerEmail,
          ctx.progressData.generatedPassword
        );

        // Update all pending sessions for this tenant
        const updatedSessions = await prisma.session.updateMany({
          where: {
            tenantId: ctx.tenantId,
            odooSessionId: 'pending_provisioning',
          },
          data: {
            odooSessionId: odooSession.sessionId,
          },
        });

        if (updatedSessions.count > 0) {
          logger.success(`Updated ${updatedSessions.count} pending session(s) with Odoo session`);
        }
      } catch (sessionError) {
        console.warn('[Provisioning] Failed to update pending sessions:', sessionError);
        // Don't fail provisioning for session update failure
        // User can log in again to get a fresh session
      }
    }

    // Update Odoo 19 sync status
    if (ctx.progressData.odoo19TenantId) {
      try {
        const { getOdoo19Client } = await import('@/lib/odoo19');
        const odoo19 = getOdoo19Client();

        await odoo19.write('vendor.ops.tenant', [ctx.progressData.odoo19TenantId], {
          bridge_sync_status: 'ok',
          business_base_url: odooBaseUrl,
        });
      } catch (e) {
        console.warn('[Provisioning] Failed to update Odoo 19 sync status:', e);
      }
    }

    // Send credentials email if we have the generated password
    if (ctx.progressData.generatedPassword && ctx.progressData.ownerEmail) {
      try {
        const { sendEmail, credentialsEmail } = await import('@/lib/email');
        const tenant = await prisma.tenant.findUnique({
          where: { id: ctx.tenantId },
        });

        const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.seisei.tokyo';

        const email = credentialsEmail({
          tenantName: tenant?.name || ctx.tenantCode,
          contactName: ctx.progressData.ownerName || 'User',
          tenantCode: ctx.tenantCode,
          email: ctx.progressData.ownerEmail,
          password: ctx.progressData.generatedPassword,
          loginUrl: `${loginUrl}/login`,
          locale: ctx.progressData.locale || 'ja',
        });

        await sendEmail({
          to: ctx.progressData.ownerEmail,
          subject: email.subject,
          html: email.html,
        });

        logger.success('Credentials email sent');
      } catch (emailError) {
        console.error('[Provisioning] Failed to send credentials email:', emailError);
        // Don't fail provisioning for email failure
      }
    }

    logger.success('Provisioning completed');
    return { success: true };
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Step 3B: Setup API Key in Odoo 18 tenant database
 * This creates an API key in the tenant's database for Seisei Billing integration
 */
export async function step3bOdoo18SetupApiKey(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_3B_ODOO18_SETUP_APIKEY);
  logger.start('Setting up API key in Odoo 18 tenant database');

  if (ctx.progressData.odoo18ApiKeyConfigured) {
    logger.success('API key already configured, skipping');
    return { success: true };
  }

  // Build dynamic URL based on tenant code (due to Odoo's dbfilter configuration)
  const tenantNumber = ctx.tenantCode.replace('TEN-', '').toLowerCase();
  const odooBaseUrl = process.env.ODOO18_AUTH_URL || `https://${tenantNumber}.erp.seisei.tokyo`;
  const dbName = ctx.progressData.odoo18DbName || `ten_${tenantNumber}`;

  // Step 3 changes the admin password, so we need to re-authenticate with the new credentials
  const ownerEmail = ctx.progressData.ownerEmail;
  const generatedPassword = ctx.progressData.generatedPassword;

  if (!ownerEmail || !generatedPassword) {
    // Skip this step if we don't have the new credentials - it's optional
    logger.success('Skipping API key setup (no credentials available)');
    return { success: true };
  }

  try {
    // Re-authenticate with the new admin credentials (set in Step 3)
    const authResponse = await fetchWithTimeout(`${odooBaseUrl}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          db: dbName,
          login: ownerEmail,
          password: generatedPassword,
        },
        id: Date.now(),
      }),
    });

    const authData = await authResponse.json();

    if (authData.error) {
      throw new Error(authData.error.data?.message || authData.error.message || 'Re-authentication failed');
    }

    const authResult = authData.result as Record<string, unknown>;
    if (!authResult.uid || authResult.uid === false) {
      throw new Error('Re-authentication failed: invalid credentials');
    }

    // Extract session from cookie
    const setCookie = authResponse.headers.get('set-cookie');
    let sessionId: string | undefined;
    if (setCookie) {
      const match = setCookie.match(/session_id=([^;]+)/);
      if (match) sessionId = match[1];
    }
    if (!sessionId) {
      sessionId = authResult.session_id as string;
    }

    if (!sessionId) {
      throw new Error('No session ID returned from re-authentication');
    }
    // Generate a secure API key
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('base64').replace(/[/+=]/g, '').substring(0, 43);
    const keyPrefix = apiKey.substring(0, 8);
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Create API key record via Odoo RPC
    const response = await fetchWithTimeout(`${odooBaseUrl}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'seisei.api.key',
          method: 'create',
          args: [{
            name: `Seisei Billing ${ctx.tenantCode}`,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            active: true,
          }],
          kwargs: { context: { db: dbName } },
        },
        id: Date.now(),
      }),
    });

    const data = await response.json();

    if (data.error) {
      const errorMsg = data.error.data?.message || data.error.message || '';
      // Check if the seisei.api.key model doesn't exist - this is expected if addon not installed
      if (errorMsg.includes('seisei.api.key') || errorMsg.includes('does not exist') || errorMsg.includes('Model not found')) {
        logger.success('Skipping API key setup (seisei.api.key model not installed)');
        return { success: true };
      }
      throw new Error(errorMsg || 'Failed to create API key');
    }

    logger.success(`API key created with prefix: ${keyPrefix}`);
    return {
      success: true,
      data: {
        odoo18ApiKeyConfigured: true,
        odoo18ApiKey: apiKey,
      },
    };
  } catch (error) {
    const errorMsg = sanitizeError(error);
    // Handle model not found errors gracefully - this means the addon is not installed
    if (errorMsg.includes('seisei.api.key') || errorMsg.includes('does not exist') || errorMsg.includes('Model not found') || errorMsg.includes('object has no attribute')) {
      logger.success('Skipping API key setup (seisei.api.key model not installed)');
      return { success: true };
    }
    logger.error(error as Error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Step 4B: Create tenant in Seisei Billing (seisei.tenant in Odoo 19)
 * This creates the tenant record that enables Push Entitlements
 */
export async function step4bSeiseiBillingTenant(ctx: ProvisioningContext): Promise<StepResult> {
  const logger = createStepLogger(ctx.jobId, ctx.tenantCode, ProvisioningStep.STEP_4B_SEISEI_BILLING_TENANT);
  logger.start('Creating tenant in Seisei Billing');

  if (ctx.progressData.seiseiBillingTenantId) {
    logger.success('Seisei Billing tenant already exists, skipping');
    return { success: true };
  }

  const apiKey = ctx.progressData.odoo18ApiKey;
  if (!apiKey) {
    // API key step may have been skipped if seisei.api.key model doesn't exist
    logger.success('Skipping Seisei Billing tenant (no API key available)');
    return { success: true };
  }

  try {
    const { getOdoo19Client } = await import('@/lib/odoo19');
    const odoo19 = getOdoo19Client();

    const tenantNumber = ctx.tenantCode.replace('TEN-', '');
    const businessBaseUrl = `https://${tenantNumber}.erp.seisei.tokyo`;

    // Check if tenant already exists in seisei.tenant
    const existingIds = await odoo19.search('seisei.tenant', [['tenant_code', '=', ctx.tenantCode]]);

    let seiseiBillingTenantId: number;

    if (existingIds.length > 0) {
      // Update existing tenant
      seiseiBillingTenantId = existingIds[0];
      await odoo19.write('seisei.tenant', [seiseiBillingTenantId], {
        business_base_url: businessBaseUrl,
        api_key: apiKey,
        active: true,
      });
      logger.success(`Updated existing Seisei Billing tenant ID: ${seiseiBillingTenantId}`);
    } else {
      // Create new tenant
      const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
      });

      seiseiBillingTenantId = await odoo19.create('seisei.tenant', {
        tenant_code: ctx.tenantCode,
        name: tenant?.name || ctx.tenantCode,
        business_base_url: businessBaseUrl,
        api_key: apiKey,
        active: true,
      });
      logger.success(`Created Seisei Billing tenant ID: ${seiseiBillingTenantId}`);
    }

    return {
      success: true,
      data: {
        seiseiBillingTenantId,
        seiseiBillingApiKey: apiKey,
      },
    };
  } catch (error) {
    const errorMsg = sanitizeError(error);
    // Handle model not found errors gracefully - seisei.tenant module may not be installed in Odoo 19
    if (errorMsg.includes('seisei.tenant') || errorMsg.includes('does not exist') || errorMsg.includes('Model not found') || errorMsg.includes('KeyError') || errorMsg.includes('404')) {
      logger.success('Skipping Seisei Billing tenant (seisei.tenant model not installed in Odoo 19)');
      return { success: true };
    }
    logger.error(error as Error);
    return { success: false, error: errorMsg };
  }
}
