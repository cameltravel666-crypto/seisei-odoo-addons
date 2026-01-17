/**
 * POST /api/provisioning/worker - Run provisioning worker
 * GET /api/provisioning/worker - Get worker status
 *
 * This endpoint is intended to be called by:
 * 1. Cron job (e.g., every 30 seconds)
 * 2. Internal health monitoring
 *
 * Authentication: API key (for cron) or OPS_ADMIN session
 */

import { NextRequest, NextResponse } from 'next/server';
import { runProvisioningWorker, getWorkerStatus } from '@/lib/provisioning/worker';

// Simple API key auth for cron jobs
const CRON_API_KEY = process.env.CRON_API_KEY || process.env.PROVISIONING_WORKER_KEY;

function validateCronAuth(request: NextRequest): boolean {
  // Check for cron API key in header
  const apiKey = request.headers.get('x-cron-key') || request.headers.get('authorization')?.replace('Bearer ', '');

  if (apiKey && CRON_API_KEY && apiKey === CRON_API_KEY) {
    return true;
  }

  // Also allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    const host = request.headers.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return true;
    }
  }

  return false;
}

/**
 * GET - Get worker status
 */
export async function GET(request: NextRequest) {
  // Allow status check with less strict auth
  if (!validateCronAuth(request) && process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
      { status: 401 }
    );
  }

  try {
    const status = await getWorkerStatus();

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[Provisioning Worker API] Status error:', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get worker status' } },
      { status: 500 }
    );
  }
}

/**
 * POST - Run worker
 */
export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
      { status: 401 }
    );
  }

  try {
    // Parse optional config from body
    let config = {};
    try {
      const body = await request.json();
      config = {
        batchSize: body.batchSize,
        maxDurationMs: body.maxDurationMs,
        stopOnError: body.stopOnError,
      };
    } catch {
      // No body or invalid JSON - use defaults
    }

    console.log('[Provisioning Worker API] Starting worker run', config);

    const result = await runProvisioningWorker(config);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Provisioning Worker API] Worker error:', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Worker execution failed' } },
      { status: 500 }
    );
  }
}
