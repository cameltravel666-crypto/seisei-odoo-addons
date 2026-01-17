/**
 * GET /api/files - List files for tenant
 *
 * RBAC: Any authenticated user can list tenant files.
 * Private files are only visible to their uploader.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listFiles, FileCategory } from '@/lib/s3-service';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as FileCategory | null;
    const mine = searchParams.get('mine') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const result = await listFiles(session.tenantId, {
      category: category || undefined,
      uploaderId: mine ? session.userId : undefined,
      page,
      pageSize: Math.min(pageSize, 100),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[File List Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list files' } },
      { status: 500 }
    );
  }
}
