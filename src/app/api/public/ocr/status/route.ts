/**
 * Public OCR Status API
 * GET: Get OCR job status and results
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateSession,
  getJob,
  getQuotaInfo,
  ANON_SESSION_COOKIE,
} from '@/lib/public-session';

export async function GET(request: NextRequest) {
  try {
    // Get session from cookie
    const sessionId = request.cookies.get(ANON_SESSION_COOKIE)?.value;

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_SESSION',
            message: 'Anonymous session required',
          },
        },
        { status: 401 }
      );
    }

    // Validate session exists
    if (!validateSession(sessionId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_SESSION',
            message: 'Session expired or invalid',
          },
        },
        { status: 401 }
      );
    }

    // Get job ID from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_JOB_ID',
            message: 'Job ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Get job
    const job = getJob(sessionId, jobId);

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found',
          },
        },
        { status: 404 }
      );
    }

    // Get quota info
    const quotaInfo = getQuotaInfo(sessionId);

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        docType: job.docType,
        ocrResult: job.ocrResult,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        quota: quotaInfo,
      },
    });
  } catch (error) {
    console.error('[Public OCR Status API] Error:', error);

    const message = error instanceof Error ? error.message : 'Failed to get status';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      },
      { status: 500 }
    );
  }
}
