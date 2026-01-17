/**
 * POST /api/provisioning/retry
 * Retry a failed provisioning job
 *
 * Request body:
 * - tenant_code: string (optional if authenticated)
 *
 * Only allows retry if:
 * - Job exists and is in FAILED status
 * - Retry attempts haven't been exhausted
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ProvisioningStatus, triggerProvisioningAsync } from '@/lib/provisioning';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let tenantCode: string | null = body.tenant_code || null;

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

    // Get provisioning job
    const job = await prisma.provisioningJob.findUnique({
      where: { tenantCode },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'No provisioning job found for this tenant' } },
        { status: 404 }
      );
    }

    // Check if job can be retried
    if (job.status === ProvisioningStatus.SUCCEEDED) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_COMPLETE', message: 'Provisioning already completed successfully' } },
        { status: 400 }
      );
    }

    if (job.status === ProvisioningStatus.RUNNING) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_RUNNING', message: 'Provisioning is already in progress' } },
        { status: 400 }
      );
    }

    if (job.status !== ProvisioningStatus.FAILED && job.status !== ProvisioningStatus.PENDING) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Job is not in a retryable state' } },
        { status: 400 }
      );
    }

    if (job.attempts >= job.maxAttempts) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MAX_RETRIES',
            message: `Maximum retry attempts (${job.maxAttempts}) reached. Please contact support.`,
          },
        },
        { status: 400 }
      );
    }

    // Reset job for retry
    await prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: ProvisioningStatus.PENDING,
        nextRunAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });

    // Update tenant status
    await prisma.tenant.update({
      where: { tenantCode },
      data: {
        provisionStatus: 'provisioning',
        failureReason: null,
      },
    });

    // Trigger async provisioning
    triggerProvisioningAsync(job.id);

    console.log(`[Provisioning] Retry triggered for job ${job.id} (attempt ${job.attempts + 1}/${job.maxAttempts})`);

    return NextResponse.json({
      success: true,
      data: {
        job_id: job.id,
        tenant_code: tenantCode,
        attempt: job.attempts + 1,
        max_attempts: job.maxAttempts,
        message: 'Provisioning retry initiated',
      },
    });
  } catch (error) {
    console.error('[Provisioning Retry Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retry provisioning' } },
      { status: 500 }
    );
  }
}
