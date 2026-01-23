/**
 * Provisioning Orchestrator
 * Manages the execution of provisioning jobs
 */

import {
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningContext,
  STEP_ORDER,
  StepResult,
} from './types';
import {
  getJobById,
  getJobByTenantCode,
  tryAcquireLock,
  releaseLock,
  updateJobProgress,
  markJobFailed,
  markJobSucceeded,
  JobRecord,
} from './job-repository';
import {
  step1CopyDatabase,
  step2Odoo18Auth,
  step3Odoo18UpdateAdmin,
  step3bOdoo18SetupApiKey,
  step4Odoo19UpsertTenant,
  step4bSeiseiBillingTenant,
  step5Odoo19UpsertUser,
  step6BridgeMetadata,
  step7Finalize,
} from './steps';
import { logProvisioning, sanitizeError } from './logger';

// Map steps to their runner functions
const STEP_RUNNERS: Record<ProvisioningStep, (ctx: ProvisioningContext) => Promise<StepResult>> = {
  [ProvisioningStep.STEP_0_INIT]: async () => ({ success: true }),
  [ProvisioningStep.STEP_1_COPY_DB]: step1CopyDatabase,
  [ProvisioningStep.STEP_2_ODOO18_AUTH]: step2Odoo18Auth,
  [ProvisioningStep.STEP_3_ODOO18_UPDATE_ADMIN]: step3Odoo18UpdateAdmin,
  [ProvisioningStep.STEP_3B_ODOO18_SETUP_APIKEY]: step3bOdoo18SetupApiKey,
  [ProvisioningStep.STEP_4_ODOO19_UPSERT_TENANT]: step4Odoo19UpsertTenant,
  [ProvisioningStep.STEP_4B_SEISEI_BILLING_TENANT]: step4bSeiseiBillingTenant,
  [ProvisioningStep.STEP_5_ODOO19_UPSERT_USER]: step5Odoo19UpsertUser,
  [ProvisioningStep.STEP_6_BRIDGE_METADATA]: step6BridgeMetadata,
  [ProvisioningStep.STEP_7_FINALIZE]: step7Finalize,
};

/**
 * Generate a unique worker ID for locking
 */
function getWorkerId(): string {
  return `worker-${process.pid}-${Date.now()}`;
}

/**
 * Get the next step to execute based on current step
 */
function getNextStep(currentStep: ProvisioningStep): ProvisioningStep | null {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex >= STEP_ORDER.length - 1) {
    return null;
  }
  return STEP_ORDER[currentIndex + 1];
}

/**
 * Run a single provisioning job
 */
export async function runProvisioningJob(jobId: string): Promise<boolean> {
  const workerId = getWorkerId();

  // Try to acquire lock
  const locked = await tryAcquireLock(jobId, workerId);
  if (!locked) {
    console.log(`[Provisioning] Job ${jobId} is locked by another worker`);
    return false;
  }

  let job: JobRecord | null = null;

  try {
    job = await getJobById(jobId);
    if (!job) {
      console.error(`[Provisioning] Job not found: ${jobId}`);
      return false;
    }

    // Mark as running
    await updateJobProgress(jobId, {
      status: ProvisioningStatus.RUNNING,
      startedAt: job.startedAt || new Date(),
    });

    // Build context
    const ctx: ProvisioningContext = {
      jobId: job.id,
      tenantId: job.tenantId,
      tenantCode: job.tenantCode,
      userId: job.userId || undefined,
      progressData: job.progressData || {},
    };

    // Determine starting step
    let currentStep = job.currentStep;

    // If we're retrying from a failed step, start from there
    if (job.status === ProvisioningStatus.FAILED && job.failedStep) {
      currentStep = job.failedStep;
    }

    // Execute steps
    let stepIndex = STEP_ORDER.indexOf(currentStep);

    // If we're at STEP_0_INIT, move to first real step
    if (currentStep === ProvisioningStep.STEP_0_INIT) {
      stepIndex = 0;
      currentStep = STEP_ORDER[1]; // STEP_1_COPY_DB
    }

    while (stepIndex < STEP_ORDER.length) {
      const step = STEP_ORDER[stepIndex];
      if (step === ProvisioningStep.STEP_0_INIT) {
        stepIndex++;
        continue;
      }

      logProvisioning({
        jobId: job.id,
        tenantCode: job.tenantCode,
        step,
        status: 'start',
        message: `Executing step ${stepIndex}/${STEP_ORDER.length - 1}`,
      });

      // Update current step
      await updateJobProgress(jobId, { currentStep: step });

      // Execute step
      const runner = STEP_RUNNERS[step];
      const result = await runner(ctx);

      if (!result.success) {
        // Step failed
        await markJobFailed(jobId, result.error || 'Unknown error', step);

        logProvisioning({
          jobId: job.id,
          tenantCode: job.tenantCode,
          step,
          status: 'error',
          error: result.error,
        });

        return false;
      }

      // Step succeeded - merge progress data
      if (result.data) {
        ctx.progressData = { ...ctx.progressData, ...result.data };
        await updateJobProgress(jobId, { progressData: ctx.progressData });
      }

      logProvisioning({
        jobId: job.id,
        tenantCode: job.tenantCode,
        step,
        status: 'success',
      });

      stepIndex++;
    }

    // All steps completed
    await markJobSucceeded(jobId);

    console.log(`[Provisioning] Job ${jobId} completed successfully for ${job.tenantCode}`);
    return true;

  } catch (error) {
    console.error(`[Provisioning] Unexpected error in job ${jobId}:`, error);

    if (job) {
      await markJobFailed(
        jobId,
        sanitizeError(error),
        job.currentStep || ProvisioningStep.STEP_0_INIT
      );
    }

    return false;

  } finally {
    // Always release lock
    await releaseLock(jobId);
  }
}

/**
 * Run provisioning by tenant code (convenience method)
 */
export async function runProvisioningByTenantCode(tenantCode: string): Promise<boolean> {
  const job = await getJobByTenantCode(tenantCode);
  if (!job) {
    console.error(`[Provisioning] No job found for tenant: ${tenantCode}`);
    return false;
  }

  return runProvisioningJob(job.id);
}

/**
 * Trigger provisioning asynchronously (fire-and-forget but with job persistence)
 * This is the main entry point from the registration flow
 */
export function triggerProvisioningAsync(jobId: string): void {
  // Run in background - don't await
  setImmediate(async () => {
    try {
      await runProvisioningJob(jobId);
    } catch (error) {
      console.error(`[Provisioning] Background job error:`, error);
    }
  });
}
