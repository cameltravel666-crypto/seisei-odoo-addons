/**
 * Send Verification Code API
 * POST /api/auth/send-code
 *
 * Sends a 6-digit verification code to the provided email address
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, verificationCodeEmail } from '@/lib/email';
import { prisma } from '@/lib/db';

// In-memory store for verification codes (use Redis in production)
const verificationCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

// Clean expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (data.expiresAt < now) {
      verificationCodes.delete(email);
    }
  }
}, 5 * 60 * 1000);

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, locale = 'ja' } = body;

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: { message: 'Invalid email address' } },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limiting: check if code was sent recently
    const existing = verificationCodes.get(normalizedEmail);
    if (existing && existing.expiresAt > Date.now() + 9 * 60 * 1000) {
      // Code was sent less than 1 minute ago
      return NextResponse.json(
        { error: { message: locale === 'ja' ? '1分後に再送信してください' : locale === 'zh' ? '请1分钟后再试' : 'Please wait 1 minute before resending' } },
        { status: 429 }
      );
    }

    // Check if email already registered
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: { message: locale === 'ja' ? 'このメールアドレスは既に登録されています' : locale === 'zh' ? '该邮箱已被注册' : 'Email already registered' } },
        { status: 400 }
      );
    }

    // Generate and store code
    const code = generateCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    verificationCodes.set(normalizedEmail, {
      code,
      expiresAt,
      attempts: 0,
    });

    // Send email
    const emailContent = verificationCodeEmail({ code, locale });
    const result = await sendEmail({
      to: normalizedEmail,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    if (!result.success) {
      console.error('[SendCode] Failed to send email:', result.error);
      return NextResponse.json(
        { error: { message: locale === 'ja' ? 'メール送信に失敗しました' : locale === 'zh' ? '邮件发送失败' : 'Failed to send email' } },
        { status: 500 }
      );
    }

    console.log(`[SendCode] Verification code sent to ${normalizedEmail}`);

    return NextResponse.json({
      success: true,
      message: locale === 'ja' ? '認証コードを送信しました' : locale === 'zh' ? '验证码已发送' : 'Verification code sent',
    });
  } catch (error) {
    console.error('[SendCode] Error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

// Export verification code checker for use in verify-code API
export function checkVerificationCode(email: string, code: string): { valid: boolean; error?: string } {
  const normalizedEmail = email.toLowerCase().trim();

  // Test mode: allow code "000000" for automated testing
  if (process.env.ALLOW_TEST_CODE === 'true' && code === '000000') {
    console.log(`[SendCode] Test code accepted for ${normalizedEmail}`);
    verificationCodes.delete(normalizedEmail);
    return { valid: true };
  }

  const stored = verificationCodes.get(normalizedEmail);

  if (!stored) {
    return { valid: false, error: 'no_code' };
  }

  if (stored.expiresAt < Date.now()) {
    verificationCodes.delete(normalizedEmail);
    return { valid: false, error: 'expired' };
  }

  if (stored.attempts >= 5) {
    verificationCodes.delete(normalizedEmail);
    return { valid: false, error: 'too_many_attempts' };
  }

  if (stored.code !== code) {
    stored.attempts++;
    return { valid: false, error: 'invalid_code' };
  }

  // Code is valid - remove it
  verificationCodes.delete(normalizedEmail);
  return { valid: true };
}
