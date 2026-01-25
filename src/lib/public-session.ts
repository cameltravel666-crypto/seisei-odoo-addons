/**
 * Public Session Management for Anonymous Users
 * Used for the free OCR trial (3 per day per anon_session)
 */

import { cookies } from 'next/headers';
import crypto from 'crypto';

// Constants
export const PUBLIC_TENANT_CODE = 'TEN-PUBLIC';
export const ANON_SESSION_COOKIE = 'anon_session_id';
export const DAILY_QUOTA = 3;
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

// In-memory store for session data (TODO: Replace with Redis in production)
// Structure: Map<sessionId, { createdAt, quotaByDate: Map<date, count> }>
interface SessionData {
  createdAt: Date;
  ipHash?: string;
  userAgent?: string;
  quotaByDate: Map<string, number>;
  jobs: Map<string, PublicJobData>;
}

export interface PublicJobData {
  id: string;
  s3Key: string;
  docType: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  odooTaskId?: number;
  draftMoveId?: number;
  ocrResult?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const sessionStore = new Map<string, SessionData>();

/**
 * Get or create anonymous session
 * Returns session info and quota remaining
 */
export async function getOrCreateAnonSession(): Promise<{
  sessionId: string;
  quotaRemaining: number;
  quotaUsed: number;
  isNew: boolean;
}> {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(ANON_SESSION_COOKIE)?.value;
  let isNew = false;

  if (!sessionId || !sessionStore.has(sessionId)) {
    // Create new session
    sessionId = crypto.randomUUID();
    isNew = true;

    sessionStore.set(sessionId, {
      createdAt: new Date(),
      quotaByDate: new Map(),
      jobs: new Map(),
    });

    // Set cookie (will be done by the API route)
  }

  // At this point sessionId is guaranteed to be defined
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error('Session not found - this should never happen');
  }
  const today = getTodayString();
  const quotaUsed = session.quotaByDate.get(today) || 0;
  const quotaRemaining = Math.max(0, DAILY_QUOTA - quotaUsed);

  return {
    sessionId,
    quotaRemaining,
    quotaUsed,
    isNew,
  };
}

/**
 * Check if session has quota remaining
 */
export function checkQuota(sessionId: string): boolean {
  const session = sessionStore.get(sessionId);
  if (!session) return false;

  const today = getTodayString();
  const quotaUsed = session.quotaByDate.get(today) || 0;
  return quotaUsed < DAILY_QUOTA;
}

/**
 * Increment quota usage
 */
export function incrementQuota(sessionId: string): boolean {
  const session = sessionStore.get(sessionId);
  if (!session) return false;

  const today = getTodayString();
  const currentUsage = session.quotaByDate.get(today) || 0;

  if (currentUsage >= DAILY_QUOTA) {
    return false;
  }

  session.quotaByDate.set(today, currentUsage + 1);
  return true;
}

/**
 * Get quota info for a session
 */
export function getQuotaInfo(sessionId: string): {
  quotaUsed: number;
  quotaRemaining: number;
  dailyLimit: number;
} {
  const session = sessionStore.get(sessionId);
  const today = getTodayString();
  const quotaUsed = session?.quotaByDate.get(today) || 0;

  return {
    quotaUsed,
    quotaRemaining: Math.max(0, DAILY_QUOTA - quotaUsed),
    dailyLimit: DAILY_QUOTA,
  };
}

/**
 * Store a job for the session
 */
export function storeJob(sessionId: string, job: PublicJobData): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;

  session.jobs.set(job.id, job);
}

/**
 * Get a job by ID
 */
export function getJob(sessionId: string, jobId: string): PublicJobData | undefined {
  const session = sessionStore.get(sessionId);
  if (!session) return undefined;

  return session.jobs.get(jobId);
}

/**
 * Update a job
 */
export function updateJob(sessionId: string, jobId: string, updates: Partial<PublicJobData>): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;

  const job = session.jobs.get(jobId);
  if (!job) return;

  session.jobs.set(jobId, {
    ...job,
    ...updates,
    updatedAt: new Date(),
  });
}

/**
 * Get all jobs for a session
 */
export function getSessionJobs(sessionId: string): PublicJobData[] {
  const session = sessionStore.get(sessionId);
  if (!session) return [];

  return Array.from(session.jobs.values());
}

/**
 * Validate session exists - recreate if missing (e.g., after server restart)
 */
export function validateSession(sessionId: string): boolean {
  if (sessionStore.has(sessionId)) {
    return true;
  }

  // Session doesn't exist (maybe server restarted) - recreate it
  // This allows the user to continue without needing to refresh
  sessionStore.set(sessionId, {
    createdAt: new Date(),
    quotaByDate: new Map(),
    jobs: new Map(),
  });

  console.log(`[Public Session] Recreated missing session: ${sessionId.substring(0, 8)}...`);
  return true;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Clean up old sessions (call periodically)
 */
export function cleanupOldSessions(maxAgeDays: number = 7): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  for (const [sessionId, session] of sessionStore.entries()) {
    if (session.createdAt < cutoff) {
      sessionStore.delete(sessionId);
    }
  }
}
