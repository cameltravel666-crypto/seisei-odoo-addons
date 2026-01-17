/**
 * POST /api/ops/provisioning/jobs/[id]/retry - Retry a failed provisioning job
 *
 * Ops admin only. Resets the job to PENDING status for retry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { opsAdminGuard, opsApiKeyGuard } from '@/lib/guards';
import { prisma } from '@/lib/db';
import { runProvisioningJob } from '@/lib/provisioning/orchestrator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check authorization
  const apiKey = request.headers.get('x-ops-key');
  let authorized = false;

  if (apiKey) {
    const apiKeyGuard = opsApiKeyGuard(apiKey);
    authorized = apiKeyGuard.allowed;
  }

  if (!authorized) {
    const adminGuard = await opsAdminGuard();
    authorized = adminGuard.allowed;
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Ops admin access required' } },
      { status: 401 }
    );
  }

  try {
    // Find the job
    const job = await prisma.provisioningJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } },
        { status: 404 }
      );
    }

    // Only allow retry for failed jobs
    if (job.status !== 'FAILED') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: `Cannot retry job with status: ${job.status}` } },
        { status: 400 }
      );
    }

    // Parse body for options
    let runImmediately = true;
    try {
      const body = await request.json();
      runImmediately = body.runImmediately !== false;
    } catch {
      // No body - use defaults
    }

    // Reset job for retry
    await prisma.provisioningJob.update({
      where: { id },
      data: {
        status: 'PENDING',
        nextRunAt: new Date(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });

    // Run immediately if requested
    if (runImmediately) {
      // Run in background
      setImmediate(async () => {
        try {
          await runProvisioningJob(id);
        } catch (error) {
          console.error(`[Ops Retry] Job ${id} failed:`, error);
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: runImmediately ? 'Job queued for immediate retry' : 'Job reset for retry',
        jobId: id,
      },
    });
  } catch (error) {
    console.error('[Ops Retry API] Error:', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retry job' } },
      { status: 500 }
    );
  }
}
