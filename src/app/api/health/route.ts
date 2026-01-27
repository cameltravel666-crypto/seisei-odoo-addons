/**
 * Health Check API
 * Returns 200 OK for load balancer and smoke tests
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
