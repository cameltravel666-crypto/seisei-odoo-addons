import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './db';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-key-change-in-production'
);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  tenantCode: string;
  odooUserId: number;
  isAdmin: boolean;
  sessionId: string;
}

// Encrypt sensitive data (like Odoo session ID)
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt sensitive data
export function decrypt(text: string): string {
  const [ivHex, encryptedText] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Create JWT token
export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// Get current session from cookies
export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  // Try new cookie name first, then fall back to legacy
  const token = cookieStore.get('bn_session')?.value || cookieStore.get('auth-token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Get current user with full details
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      tenant: true,
      modulePrefs: true,
    },
  });

  return user;
}

// Cookie configuration for session isolation
// IMPORTANT: BizNexus cookies must be limited to biznexus.seisei.tokyo
// They must NOT use .seisei.tokyo (which would leak to Odoo domains)
const COOKIE_NAME = 'bn_session'; // Different from Odoo's 'session_id' and 'odoo_session'
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined; // biznexus.seisei.tokyo in production

// Set auth cookie
export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
    // IMPORTANT: Do NOT set domain to .seisei.tokyo
    // This ensures cookie isolation from Odoo domains
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });

  // Also set the legacy auth-token for backward compatibility
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

// Clear auth cookie
export async function clearAuthCookie() {
  const cookieStore = await cookies();
  // Clear both new and legacy cookie names
  cookieStore.delete('bn_session');
  cookieStore.delete('auth-token');
}

// Generate tenant code
export function generateTenantCode(): string {
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TEN-${randomPart}`;
}
