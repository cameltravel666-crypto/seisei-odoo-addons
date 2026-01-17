/**
 * POST /api/files/upload - Get presigned upload URL
 *
 * Returns a presigned S3 URL for direct file upload.
 * RBAC: Any authenticated user can upload files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createUploadUrl, isS3Configured } from '@/lib/s3-service';
import { z } from 'zod';

const uploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
  category: z.enum(['ATTACHMENT', 'DOCUMENT', 'IMAGE', 'REPORT']).optional(),
  visibility: z.enum(['TENANT', 'PRIVATE', 'PUBLIC']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = uploadRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { filename, mimeType, size, category, visibility } = parsed.data;

    // Check if S3 is configured
    if (!isS3Configured()) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_CONFIGURED', message: 'File storage is not configured' } },
        { status: 503 }
      );
    }

    const result = await createUploadUrl({
      tenantId: session.tenantId,
      uploaderId: session.userId,
      filename,
      mimeType,
      size,
      category: category as 'ATTACHMENT' | 'DOCUMENT' | 'IMAGE' | 'REPORT',
      visibility: visibility as 'TENANT' | 'PRIVATE' | 'PUBLIC',
    });

    return NextResponse.json({
      success: true,
      data: {
        fileId: result.fileId,
        uploadUrl: result.uploadUrl,
        key: result.key,
        expiresAt: result.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[File Upload URL Error]', error);

    const message = error instanceof Error ? error.message : 'Failed to create upload URL';

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
