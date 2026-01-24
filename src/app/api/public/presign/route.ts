/**
 * Public Presign API
 * POST: Get presigned upload URL for public (anonymous) users
 * Uses TEN-PUBLIC as the tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createUploadUrl, isS3Configured } from '@/lib/s3-service';
import {
  validateSession,
  checkQuota,
  ANON_SESSION_COOKIE,
  PUBLIC_TENANT_CODE,
} from '@/lib/public-session';

const presignRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1),
  size: z.number().int().positive().max(10 * 1024 * 1024), // 10MB max for public
  docType: z.enum(['receipt', 'vendor_invoice', 'expense']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Get session from cookie
    const sessionId = request.cookies.get(ANON_SESSION_COOKIE)?.value;

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_SESSION',
            message: 'Anonymous session required. Call /api/public/session first.',
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
            message: 'Session expired or invalid. Please refresh the page.',
          },
        },
        { status: 401 }
      );
    }

    // Check quota
    if (!checkQuota(sessionId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Daily quota exceeded (3/day). Create a free account to continue.',
            quotaExceeded: true,
          },
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const parsed = presignRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { fileName, fileType, size, docType } = parsed.data;

    // Check if S3 is configured
    if (!isS3Configured()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message: 'File storage is not configured',
          },
        },
        { status: 503 }
      );
    }

    // Validate file type (only images and PDFs for public OCR)
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];

    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only JPEG, PNG, WebP, and PDF files are supported',
          },
        },
        { status: 400 }
      );
    }

    // Create upload URL using TEN-PUBLIC tenant
    const result = await createUploadUrl({
      tenantId: PUBLIC_TENANT_CODE,
      uploaderId: `anon_${sessionId}`,
      filename: fileName,
      mimeType: fileType,
      size,
      category: 'DOCUMENT',
      visibility: 'PUBLIC',
      metadata: {
        'anon-session-id': sessionId,
        'doc-type': docType || 'receipt',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        presignedUrl: result.uploadUrl,
        s3Key: result.key,
        fileId: result.fileId,
        expiresIn: 15 * 60, // 15 minutes
        expiresAt: result.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Public Presign API] Error:', error);

    const message = error instanceof Error ? error.message : 'Failed to create upload URL';

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
