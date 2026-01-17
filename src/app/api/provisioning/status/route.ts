/**
 * GET /api/provisioning/status
 * Query provisioning status for the current tenant or by tenant_code
 *
 * Returns:
 * - tenant_status: 'provisioning' | 'ready' | 'failed'
 * - current_step: current provisioning step (if in progress)
 * - last_error: sanitized error message (if failed)
 * - odoo_ready: whether the Odoo database is ready
 * - progress: percentage estimate (0-100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ProvisioningStatus, ProvisioningStep, STEP_ORDER } from '@/lib/provisioning';

// Map step to progress percentage
const STEP_PROGRESS: Record<ProvisioningStep, number> = {
  [ProvisioningStep.STEP_0_INIT]: 0,
  [ProvisioningStep.STEP_1_COPY_DB]: 15,
  [ProvisioningStep.STEP_2_ODOO18_AUTH]: 25,
  [ProvisioningStep.STEP_3_ODOO18_UPDATE_ADMIN]: 40,
  [ProvisioningStep.STEP_4_ODOO19_UPSERT_TENANT]: 55,
  [ProvisioningStep.STEP_5_ODOO19_UPSERT_USER]: 70,
  [ProvisioningStep.STEP_6_BRIDGE_METADATA]: 85,
  [ProvisioningStep.STEP_7_FINALIZE]: 100,
};

// User-friendly step descriptions
const STEP_DESCRIPTIONS: Record<ProvisioningStep, { ja: string; en: string }> = {
  [ProvisioningStep.STEP_0_INIT]: { ja: '初期化中...', en: 'Initializing...' },
  [ProvisioningStep.STEP_1_COPY_DB]: { ja: 'データベースを準備中...', en: 'Preparing database...' },
  [ProvisioningStep.STEP_2_ODOO18_AUTH]: { ja: 'システム認証中...', en: 'Authenticating system...' },
  [ProvisioningStep.STEP_3_ODOO18_UPDATE_ADMIN]: { ja: '管理者設定中...', en: 'Configuring admin...' },
  [ProvisioningStep.STEP_4_ODOO19_UPSERT_TENANT]: { ja: 'テナント登録中...', en: 'Registering tenant...' },
  [ProvisioningStep.STEP_5_ODOO19_UPSERT_USER]: { ja: 'ユーザー設定中...', en: 'Setting up user...' },
  [ProvisioningStep.STEP_6_BRIDGE_METADATA]: { ja: '連携設定中...', en: 'Configuring integration...' },
  [ProvisioningStep.STEP_7_FINALIZE]: { ja: '完了処理中...', en: 'Finalizing...' },
};

// Sanitize error messages for user display
function sanitizeErrorForUser(error: string | null): string | null {
  if (!error) return null;

  // Remove sensitive information patterns
  const sanitized = error
    .replace(/password[^\s]*/gi, 'password=***')
    .replace(/token[^\s]*/gi, 'token=***')
    .replace(/api_key[^\s]*/gi, 'api_key=***')
    .replace(/secret[^\s]*/gi, 'secret=***')
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '***') // IP addresses
    .replace(/:[0-9]+/g, ':***'); // Port numbers

  // Truncate long messages
  return sanitized.length > 200 ? sanitized.substring(0, 200) + '...' : sanitized;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantCodeParam = searchParams.get('tenant_code');
    const locale = searchParams.get('locale') || 'ja';

    let tenantCode: string | null = tenantCodeParam;

    // If no tenant_code provided, try to get from auth session
    if (!tenantCode) {
      const session = await getSession();
      if (session?.tenantCode) {
        tenantCode = session.tenantCode;
      }
    }

    if (!tenantCode) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_PARAM', message: 'tenant_code is required' } },
        { status: 400 }
      );
    }

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { tenantCode },
      select: {
        id: true,
        tenantCode: true,
        name: true,
        provisionStatus: true,
        failureStep: true,
        failureReason: true,
        odooDb: true,
        odooBaseUrl: true,
        isActive: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 }
      );
    }

    // Get provisioning job if exists
    const job = await prisma.provisioningJob.findUnique({
      where: { tenantCode },
      select: {
        id: true,
        status: true,
        currentStep: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        failedStep: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    // Determine overall status
    let status: 'provisioning' | 'ready' | 'failed';
    let currentStep: string | null = null;
    let stepDescription: string | null = null;
    let progress = 0;
    let lastError: string | null = null;
    let canRetry = false;

    if (tenant.provisionStatus === 'ready' || tenant.provisionStatus === 'active') {
      status = 'ready';
      progress = 100;
    } else if (tenant.provisionStatus === 'failed') {
      status = 'failed';
      lastError = sanitizeErrorForUser(tenant.failureReason);
      currentStep = tenant.failureStep;

      if (job) {
        canRetry = job.attempts < job.maxAttempts;
        if (job.failedStep) {
          const step = job.failedStep as ProvisioningStep;
          progress = STEP_PROGRESS[step] || 0;
          stepDescription = STEP_DESCRIPTIONS[step]?.[locale as 'ja' | 'en'] || null;
        }
      }
    } else {
      // Still provisioning
      status = 'provisioning';

      if (job) {
        currentStep = job.currentStep;
        const step = job.currentStep as ProvisioningStep;
        progress = STEP_PROGRESS[step] || 0;
        stepDescription = STEP_DESCRIPTIONS[step]?.[locale as 'ja' | 'en'] || null;

        // If job is running, add some extra progress within the step
        if (job.status === ProvisioningStatus.RUNNING && job.startedAt) {
          const elapsed = Date.now() - job.startedAt.getTime();
          // Add up to 10% progress based on time (max 30 seconds)
          const timeBonus = Math.min(10, (elapsed / 30000) * 10);
          progress = Math.min(99, progress + timeBonus);
        }
      }
    }

    // Check if Odoo is ready
    const odooReady =
      tenant.odooDb !== 'pending' &&
      tenant.odooBaseUrl !== 'https://pending.seisei.tokyo' &&
      status === 'ready';

    return NextResponse.json({
      success: true,
      data: {
        tenant_code: tenant.tenantCode,
        tenant_name: tenant.name,
        status,
        current_step: currentStep,
        step_description: stepDescription,
        progress: Math.round(progress),
        last_error: lastError,
        odoo_ready: odooReady,
        can_retry: canRetry,
        job: job
          ? {
              attempts: job.attempts,
              max_attempts: job.maxAttempts,
              started_at: job.startedAt?.toISOString() || null,
              completed_at: job.completedAt?.toISOString() || null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[Provisioning Status Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get status' } },
      { status: 500 }
    );
  }
}
