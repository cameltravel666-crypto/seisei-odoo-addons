/**
 * Verify Code API
 * POST /api/auth/verify-code
 *
 * Verifies the email code and creates a temporary session token
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkVerificationCode } from '../send-code/route';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, locale = 'ja' } = body;

    // Validate input
    if (!email || !code) {
      return NextResponse.json(
        { error: { message: 'Email and code are required' } },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check verification code
    const result = checkVerificationCode(normalizedEmail, code);

    if (!result.valid) {
      const errorMessages: Record<string, Record<string, string>> = {
        no_code: {
          ja: '認証コードが見つかりません。再送信してください。',
          zh: '验证码不存在，请重新发送。',
          en: 'Verification code not found. Please request a new one.',
        },
        expired: {
          ja: '認証コードの有効期限が切れました。再送信してください。',
          zh: '验证码已过期，请重新发送。',
          en: 'Verification code has expired. Please request a new one.',
        },
        too_many_attempts: {
          ja: '試行回数が上限に達しました。新しいコードを取得してください。',
          zh: '尝试次数过多，请重新获取验证码。',
          en: 'Too many attempts. Please request a new code.',
        },
        invalid_code: {
          ja: '認証コードが正しくありません。',
          zh: '验证码不正确。',
          en: 'Invalid verification code.',
        },
      };

      const messages = errorMessages[result.error || 'invalid_code'];
      const message = messages[locale] || messages.en;

      return NextResponse.json(
        { error: { message } },
        { status: 400 }
      );
    }

    // Generate a temporary token for registration (valid for 30 minutes)
    const verifiedToken = await new SignJWT({
      email: normalizedEmail,
      type: 'email_verified',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30m')
      .setIssuedAt()
      .sign(JWT_SECRET);

    console.log(`[VerifyCode] Email verified: ${normalizedEmail}`);

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      token: verifiedToken,
    });
  } catch (error) {
    console.error('[VerifyCode] Error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
