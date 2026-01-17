/**
 * Provisioning Step Runners
 * Each function implements one step of the provisioning process
 */

import { prisma } from '@/lib/db';
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
  const targetDb = ctx.tenantCode.toLowerCase(); // e.g., "ten-00000001"

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

  const tenantNumber = ctx.tenantCode.replace('TEN-', '');
  const odooBaseUrl = `https://${tenantNumber}.erp.seisei.tokyo`;
  const dbName = ctx.progressData.odoo18DbName || ctx.tenantCode.toLowerCase();

  try {
    const response = await fetchWithTimeout(`${odooBaseUrl}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          db: dbName,
          login: 'admin',
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

  const tenantNumber = ctx.tenantCode.replace('TEN-', '');
  const odooBaseUrl = `https://${tenantNumber}.erp.seisei.tokyo`;
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

    logger.success('Admin user updated');
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
    const customerDbName = ctx.progressData.odoo18DbName || ctx.tenantCode.toLowerCase();

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
    const odooDb = ctx.progressData.odoo18DbName || ctx.tenantCode.toLowerCase();

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

    logger.success('Provisioning completed');
    return { success: true };
  } catch (error) {
    logger.error(error as Error);
    return { success: false, error: sanitizeError(error) };
  }
}
