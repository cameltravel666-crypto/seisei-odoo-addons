/**
 * GET /api/files/[id] - Get presigned download URL
 * POST /api/files/[id] - Confirm upload completed
 * DELETE /api/files/[id] - Delete file
 *
 * RBAC: Tenant-scoped file access
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createDownloadUrl, confirmUpload, deleteFile } from '@/lib/s3-service';

/**
 * GET - Get download URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const result = await createDownloadUrl(id, session.userId, session.tenantId);

    return NextResponse.json({
      success: true,
      data: {
        downloadUrl: result.downloadUrl,
        filename: result.filename,
        mimeType: result.mimeType,
        expiresAt: result.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[File Download URL Error]', error);

    const message = error instanceof Error ? error.message : 'Failed to get download URL';
    const status = message.includes('not found') ? 404 : message.includes('denied') ? 403 : 500;

    return NextResponse.json(
      { success: false, error: { code: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', message } },
      { status }
    );
  }
}

/**
 * POST - Confirm upload completed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    await confirmUpload(id);

    return NextResponse.json({
      success: true,
      data: { message: 'Upload confirmed' },
    });
  } catch (error) {
    console.error('[File Confirm Upload Error]', error);

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to confirm upload' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete file
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    await deleteFile(id, session.userId, session.tenantId);

    return NextResponse.json({
      success: true,
      data: { message: 'File deleted' },
    });
  } catch (error) {
    console.error('[File Delete Error]', error);

    const message = error instanceof Error ? error.message : 'Failed to delete file';
    const status = message.includes('not found') ? 404 : message.includes('denied') ? 403 : 500;

    return NextResponse.json(
      { success: false, error: { code: status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', message } },
      { status }
    );
  }
}
