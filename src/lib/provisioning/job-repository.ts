/**
 * Provisioning Job Repository
 * Handles database operations for provisioning jobs
 */

import { prisma } from '@/lib/db';
import {
  ProvisioningStatus,
  ProvisioningStep,
  ProgressData,
  PROVISIONING_CONFIG,
} from './types';

export interface CreateJobParams {
  tenantId: string;
  tenantCode: string;
  userId?: string;
  progressData?: ProgressData;
}

export interface JobRecord {
  id: string;
  tenantId: string;
  tenantCode: string;
  userId: string | null;
  status: ProvisioningStatus;
  currentStep: ProvisioningStep;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date | null;
  lastError: string | null;
  failedStep: ProvisioningStep | null;
  progressData: ProgressData | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new provisioning job
 */
export async function createJob(params: CreateJobParams): Promise<JobRecord> {
  const job = await prisma.provisioningJob.create({
    data: {
      tenantId: params.tenantId,
      tenantCode: params.tenantCode,
      userId: params.userId,
      status: ProvisioningStatus.PENDING,
      currentStep: ProvisioningStep.STEP_0_INIT,
      progressData: (params.progressData || {}) as object,
      nextRunAt: new Date(), // Ready to run immediately
    },
  });

  return mapToJobRecord(job);
}

/**
 * Get job by tenant code
 */
export async function getJobByTenantCode(tenantCode: string): Promise<JobRecord | null> {
  const job = await prisma.provisioningJob.findUnique({
    where: { tenantCode },
  });

  return job ? mapToJobRecord(job) : null;
}

/**
 * Get job by ID
 */
export async function getJobById(jobId: string): Promise<JobRecord | null> {
  const job = await prisma.provisioningJob.findUnique({
    where: { id: jobId },
  });

  return job ? mapToJobRecord(job) : null;
}

/**
 * Try to acquire lock on a job
 * Returns true if lock acquired, false if already locked
 */
export async function tryAcquireLock(jobId: string, lockerId: string): Promise<boolean> {
  const lockExpiry = new Date(Date.now() - PROVISIONING_CONFIG.lockTimeoutMs);

  try {
    // Use optimistic locking - only update if not locked or lock expired
    const result = await prisma.provisioningJob.updateMany({
      where: {
        id: jobId,
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: lockExpiry } },
        ],
      },
      data: {
        lockedAt: new Date(),
        lockedBy: lockerId,
      },
    });

    return result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Release lock on a job
 */
export async function releaseLock(jobId: string): Promise<void> {
  await prisma.provisioningJob.update({
    where: { id: jobId },
    data: {
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * Update job status and step
 */
export async function updateJobProgress(
  jobId: string,
  data: {
    status?: ProvisioningStatus;
    currentStep?: ProvisioningStep;
    progressData?: ProgressData;
    lastError?: string | null;
    failedStep?: ProvisioningStep | null;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<JobRecord> {
  const updateData: Record<string, unknown> = { ...data };

  // Merge progress data if provided
  if (data.progressData) {
    const existing = await prisma.provisioningJob.findUnique({
      where: { id: jobId },
      select: { progressData: true },
    });

    updateData.progressData = {
      ...(existing?.progressData as ProgressData || {}),
      ...data.progressData,
    };
  }

  const job = await prisma.provisioningJob.update({
    where: { id: jobId },
    data: updateData,
  });

  return mapToJobRecord(job);
}

/**
 * Mark job as failed and schedule retry
 */
export async function markJobFailed(
  jobId: string,
  error: string,
  failedStep: ProvisioningStep
): Promise<JobRecord> {
  const job = await prisma.provisioningJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const newAttempts = job.attempts + 1;
  const canRetry = newAttempts < job.maxAttempts;

  // Calculate next retry time with exponential backoff
  let nextRunAt: Date | null = null;
  if (canRetry) {
    const delayIndex = Math.min(newAttempts - 1, PROVISIONING_CONFIG.retryDelays.length - 1);
    const delayMs = PROVISIONING_CONFIG.retryDelays[delayIndex];
    nextRunAt = new Date(Date.now() + delayMs);
  }

  const updated = await prisma.provisioningJob.update({
    where: { id: jobId },
    data: {
      status: ProvisioningStatus.FAILED,
      attempts: newAttempts,
      lastError: error.substring(0, 10000), // Limit error length
      failedStep: failedStep,
      nextRunAt: canRetry ? nextRunAt : null,
      lockedAt: null,
      lockedBy: null,
    },
  });

  // Also update tenant status
  await prisma.tenant.update({
    where: { id: job.tenantId },
    data: {
      provisionStatus: 'failed',
      failureStep: failedStep,
      failureReason: error.substring(0, 1000),
    },
  });

  return mapToJobRecord(updated);
}

/**
 * Mark job as succeeded
 */
export async function markJobSucceeded(jobId: string): Promise<JobRecord> {
  const job = await prisma.provisioningJob.update({
    where: { id: jobId },
    data: {
      status: ProvisioningStatus.SUCCEEDED,
      currentStep: ProvisioningStep.STEP_7_FINALIZE,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });

  return mapToJobRecord(job);
}

/**
 * Get pending jobs ready to run
 */
export async function getPendingJobs(limit: number = 10): Promise<JobRecord[]> {
  const now = new Date();
  const lockExpiry = new Date(Date.now() - PROVISIONING_CONFIG.lockTimeoutMs);

  const jobs = await prisma.provisioningJob.findMany({
    where: {
      AND: [
        {
          OR: [
            { status: ProvisioningStatus.PENDING },
            {
              status: ProvisioningStatus.FAILED,
              nextRunAt: { lte: now },
            },
          ],
        },
        // Not locked or lock expired
        {
          OR: [
            { lockedAt: null },
            { lockedAt: { lt: lockExpiry } },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return jobs.map(mapToJobRecord);
}

// Helper to map Prisma result to typed JobRecord
function mapToJobRecord(job: {
  id: string;
  tenantId: string;
  tenantCode: string;
  userId: string | null;
  status: string;
  currentStep: string;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date | null;
  lastError: string | null;
  failedStep: string | null;
  progressData: unknown;
  lockedAt: Date | null;
  lockedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): JobRecord {
  return {
    ...job,
    status: job.status as ProvisioningStatus,
    currentStep: job.currentStep as ProvisioningStep,
    failedStep: job.failedStep as ProvisioningStep | null,
    progressData: job.progressData as ProgressData | null,
  };
}
