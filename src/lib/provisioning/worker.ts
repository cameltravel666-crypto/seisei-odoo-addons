/**
 * Provisioning Worker
 *
 * A persistent worker that polls for pending provisioning jobs and processes them.
 * Can be triggered via:
 * 1. API endpoint (for cron jobs)
 * 2. Internal call after registration
 *
 * Key features:
 * - Idempotent: Safe to run multiple times
 * - Locking: Uses database locks to prevent concurrent processing of same job
 * - Retry: Exponential backoff for failed jobs
 * - Batched: Processes multiple jobs per invocation
 */

import { getPendingJobs } from './job-repository';
import { runProvisioningJob } from './orchestrator';

export interface WorkerConfig {
  batchSize?: number;
  maxDurationMs?: number;
  stopOnError?: boolean;
}

export interface WorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
  jobs: Array<{
    id: string;
    tenantCode: string;
    success: boolean;
    error?: string;
  }>;
}

const DEFAULT_CONFIG: Required<WorkerConfig> = {
  batchSize: 10,
  maxDurationMs: 4 * 60 * 1000, // 4 minutes (leave buffer for serverless timeout)
  stopOnError: false,
};

/**
 * Run the provisioning worker
 *
 * This is the main entry point for processing pending jobs.
 * Safe to call from cron, API, or background process.
 */
export async function runProvisioningWorker(
  config: WorkerConfig = {}
): Promise<WorkerResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  const result: WorkerResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    jobs: [],
  };

  console.log('[Provisioning Worker] Starting worker run', {
    batchSize: cfg.batchSize,
    maxDurationMs: cfg.maxDurationMs,
  });

  try {
    // Get pending jobs
    const pendingJobs = await getPendingJobs(cfg.batchSize);

    if (pendingJobs.length === 0) {
      console.log('[Provisioning Worker] No pending jobs found');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    console.log(`[Provisioning Worker] Found ${pendingJobs.length} pending jobs`);

    // Process each job
    for (const job of pendingJobs) {
      // Check if we've exceeded max duration
      if (Date.now() - startTime > cfg.maxDurationMs) {
        console.log('[Provisioning Worker] Max duration reached, stopping');
        break;
      }

      const jobResult = {
        id: job.id,
        tenantCode: job.tenantCode,
        success: false,
        error: undefined as string | undefined,
      };

      try {
        console.log(`[Provisioning Worker] Processing job ${job.id} for ${job.tenantCode}`);

        const success = await runProvisioningJob(job.id);

        jobResult.success = success;
        result.processed++;

        if (success) {
          result.succeeded++;
          console.log(`[Provisioning Worker] Job ${job.id} succeeded`);
        } else {
          result.failed++;
          console.log(`[Provisioning Worker] Job ${job.id} failed or was skipped`);
        }
      } catch (error) {
        result.processed++;
        result.failed++;
        jobResult.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Provisioning Worker] Job ${job.id} threw error:`, error);

        if (cfg.stopOnError) {
          result.jobs.push(jobResult);
          break;
        }
      }

      result.jobs.push(jobResult);
    }
  } catch (error) {
    console.error('[Provisioning Worker] Worker error:', error);
    throw error;
  }

  result.durationMs = Date.now() - startTime;

  console.log('[Provisioning Worker] Worker run completed', {
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    durationMs: result.durationMs,
  });

  return result;
}

/**
 * Run worker continuously (for long-running processes)
 *
 * This can be used in a separate worker process that runs indefinitely.
 */
export async function runWorkerLoop(
  pollIntervalMs: number = 5000,
  signal?: AbortSignal
): Promise<void> {
  console.log('[Provisioning Worker] Starting continuous worker loop', {
    pollIntervalMs,
  });

  while (!signal?.aborted) {
    try {
      const result = await runProvisioningWorker({
        batchSize: 5,
        maxDurationMs: 60000, // 1 minute per iteration
      });

      // If we processed jobs, continue immediately
      // Otherwise wait for poll interval
      if (result.processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    } catch (error) {
      console.error('[Provisioning Worker] Loop error:', error);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs * 2));
    }
  }

  console.log('[Provisioning Worker] Worker loop stopped');
}

/**
 * Check worker health - returns info about pending jobs
 */
export async function getWorkerStatus(): Promise<{
  healthy: boolean;
  pendingJobs: number;
  oldestPendingJob?: {
    id: string;
    tenantCode: string;
    createdAt: Date;
    attempts: number;
  };
}> {
  try {
    const pendingJobs = await getPendingJobs(100);

    const oldest = pendingJobs.length > 0 ? pendingJobs[0] : undefined;

    return {
      healthy: true,
      pendingJobs: pendingJobs.length,
      oldestPendingJob: oldest
        ? {
            id: oldest.id,
            tenantCode: oldest.tenantCode,
            createdAt: oldest.createdAt,
            attempts: oldest.attempts,
          }
        : undefined,
    };
  } catch (error) {
    console.error('[Provisioning Worker] Health check failed:', error);
    return {
      healthy: false,
      pendingJobs: 0,
    };
  }
}
