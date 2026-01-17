/**
 * GET /api/ops/provisioning/jobs - List provisioning jobs (ops admin only)
 *
 * Returns list of all provisioning jobs with their status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { opsAdminGuard, opsApiKeyGuard } from '@/lib/guards';
import { prisma } from '@/lib/db';
import { ProvisioningStatus, Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const status = searchParams.get('status');
    const tenantCode = searchParams.get('tenantCode');

    // Build where clause
    const where: Prisma.ProvisioningJobWhereInput = {};

    if (status) {
      where.status = status as ProvisioningStatus;
    }

    if (tenantCode) {
      where.tenantCode = { contains: tenantCode, mode: 'insensitive' };
    }

    const [jobs, total] = await Promise.all([
      prisma.provisioningJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Math.min(pageSize, 100),
      }),
      prisma.provisioningJob.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        jobs: jobs.map((j) => ({
          id: j.id,
          tenantId: j.tenantId,
          tenantCode: j.tenantCode,
          status: j.status,
          currentStep: j.currentStep,
          failedStep: j.failedStep,
          lastError: j.lastError,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          nextRunAt: j.nextRunAt?.toISOString(),
          startedAt: j.startedAt?.toISOString(),
          completedAt: j.completedAt?.toISOString(),
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('[Ops Jobs API] Error:', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list jobs' } },
      { status: 500 }
    );
  }
}
