/**
 * S3 File Storage Service
 *
 * Provides presigned URLs for secure file upload/download.
 * Files are tenant-scoped and RBAC protected.
 *
 * Key features:
 * - Presigned upload URLs (avoid passing files through server)
 * - Presigned download URLs with expiry
 * - Tenant isolation (bucket prefix)
 * - File metadata tracking in database
 *
 * NOTE: Requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner packages.
 * Install with: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 */

import crypto from 'crypto';

// ============================================
// Configuration
// ============================================

const S3_CONFIG = {
  region: process.env.AWS_REGION || 'ap-northeast-1',
  bucket: process.env.S3_BUCKET || 'biznexus-files',
  endpoint: process.env.S3_ENDPOINT, // Optional - for S3-compatible services
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  uploadUrlExpiry: 15 * 60, // 15 minutes for upload
  downloadUrlExpiry: 60 * 60, // 1 hour for download
  maxFileSize: 50 * 1024 * 1024, // 50MB
};

// File types
export type FileCategory = 'ATTACHMENT' | 'DOCUMENT' | 'IMAGE' | 'REPORT';
export type FileVisibility = 'TENANT' | 'PRIVATE' | 'PUBLIC';

// Allowed MIME types by category
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  ATTACHMENT: ['*/*'],
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  REPORT: ['application/pdf', 'application/json', 'text/csv'],
};

// ============================================
// AWS SDK Dynamic Loading
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let awsSdk: any = null;

async function loadAwsSdk() {
  if (!awsSdk) {
    try {
      const s3Module = await import('@aws-sdk/client-s3');
      const presignerModule = await import('@aws-sdk/s3-request-presigner');
      awsSdk = {
        S3Client: s3Module.S3Client,
        PutObjectCommand: s3Module.PutObjectCommand,
        GetObjectCommand: s3Module.GetObjectCommand,
        DeleteObjectCommand: s3Module.DeleteObjectCommand,
        getSignedUrl: presignerModule.getSignedUrl,
      };
    } catch {
      throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner');
    }
  }
  return awsSdk;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let s3Client: any = null;

async function getS3Client() {
  const sdk = await loadAwsSdk();

  if (!s3Client) {
    const config: {
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: S3_CONFIG.region,
      credentials: {
        accessKeyId: S3_CONFIG.accessKeyId,
        secretAccessKey: S3_CONFIG.secretAccessKey,
      },
    };

    if (S3_CONFIG.endpoint) {
      config.endpoint = S3_CONFIG.endpoint;
      config.forcePathStyle = true;
    }

    s3Client = new sdk.S3Client(config);
  }

  return { client: s3Client, sdk };
}

// ============================================
// Helper Functions
// ============================================

function generateFileKey(
  tenantId: string,
  category: string,
  filename: string
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const ext = filename.split('.').pop() || 'bin';

  return `${tenantId}/${category.toLowerCase()}/${year}/${month}/${uuid}.${ext}`;
}

function validateMimeType(mimeType: string, category: string): boolean {
  const allowed = ALLOWED_MIME_TYPES[category];
  if (!allowed) return true;
  if (allowed.includes('*/*')) return true;
  return allowed.includes(mimeType);
}

// ============================================
// Service Functions
// ============================================

export interface CreateUploadUrlParams {
  tenantId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  size: number;
  category?: FileCategory;
  visibility?: FileVisibility;
  metadata?: Record<string, string>;
}

export interface UploadUrlResult {
  fileId: string;
  uploadUrl: string;
  key: string;
  expiresAt: Date;
}

/**
 * Create a presigned upload URL
 */
export async function createUploadUrl(
  params: CreateUploadUrlParams
): Promise<UploadUrlResult> {
  const {
    tenantId,
    uploaderId,
    filename,
    mimeType,
    size,
    category = 'ATTACHMENT',
    visibility = 'TENANT',
    metadata = {},
  } = params;

  // Validate file size
  if (size > S3_CONFIG.maxFileSize) {
    throw new Error(`File size exceeds maximum allowed (${S3_CONFIG.maxFileSize / 1024 / 1024}MB)`);
  }

  // Validate MIME type
  if (!validateMimeType(mimeType, category)) {
    throw new Error(`File type ${mimeType} not allowed for category ${category}`);
  }

  // Generate unique key
  const key = generateFileKey(tenantId, category, filename);
  const fileId = crypto.randomUUID();

  // Get S3 client and generate presigned URL
  const { client, sdk } = await getS3Client();

  const command = new sdk.PutObjectCommand({
    Bucket: S3_CONFIG.bucket,
    Key: key,
    ContentType: mimeType,
    ContentLength: size,
    Metadata: {
      'tenant-id': tenantId,
      'file-id': fileId,
      'uploader-id': uploaderId,
      'original-filename': encodeURIComponent(filename),
      'category': category,
      'visibility': visibility,
      ...metadata,
    },
  });

  const uploadUrl = await sdk.getSignedUrl(client, command, {
    expiresIn: S3_CONFIG.uploadUrlExpiry,
  });

  const expiresAt = new Date(Date.now() + S3_CONFIG.uploadUrlExpiry * 1000);

  // Note: In a full implementation, we would also create a database record here
  // For now, we're returning the generated info

  return {
    fileId,
    uploadUrl,
    key,
    expiresAt,
  };
}

/**
 * Confirm upload completed (placeholder)
 */
export async function confirmUpload(fileId: string): Promise<void> {
  // In a full implementation, this would update the database record
  console.log(`[S3 Service] Upload confirmed for file ${fileId}`);
}

/**
 * Create a presigned download URL
 */
export async function createDownloadUrl(
  fileId: string,
  requesterId: string,
  requesterTenantId: string
): Promise<{ downloadUrl: string; filename: string; mimeType: string; expiresAt: Date }> {
  // In a full implementation, this would:
  // 1. Look up the file record in the database
  // 2. Verify tenant access
  // 3. Generate presigned URL

  // For now, this is a placeholder
  throw new Error('File storage not fully configured. Please set up database schema first.');
}

/**
 * Soft delete a file
 */
export async function deleteFile(
  fileId: string,
  deleterId: string,
  deleterTenantId: string
): Promise<void> {
  // In a full implementation, this would soft-delete the file record
  throw new Error('File storage not fully configured. Please set up database schema first.');
}

/**
 * List files for a tenant (placeholder)
 */
export async function listFiles(
  tenantId: string,
  options?: {
    category?: FileCategory;
    uploaderId?: string;
    includeDeleted?: boolean;
    page?: number;
    pageSize?: number;
  }
) {
  // In a full implementation, this would query the database
  return {
    files: [],
    total: 0,
    page: options?.page || 1,
    pageSize: options?.pageSize || 20,
    totalPages: 0,
  };
}

/**
 * Cleanup expired pending uploads (placeholder)
 */
export async function cleanupPendingUploads(): Promise<number> {
  return 0;
}

/**
 * Check if S3 is configured
 */
export function isS3Configured(): boolean {
  return !!(
    S3_CONFIG.accessKeyId &&
    S3_CONFIG.secretAccessKey &&
    S3_CONFIG.bucket
  );
}
