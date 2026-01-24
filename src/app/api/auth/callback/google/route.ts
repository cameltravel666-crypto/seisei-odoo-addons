import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createToken, setAuthCookie, decrypt } from '@/lib/auth';
import { createOdooClient } from '@/lib/odoo';
import { initializeTenantFeatures } from '@/lib/features';
import { membershipService } from '@/lib/membership-service';
import { entitlementsService } from '@/lib/entitlements-service';
import { auditService } from '@/lib/audit-service';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * GET /api/auth/callback/google
 * Handles Google OAuth callback
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Handle OAuth errors
  if (error) {
    console.error('[Google OAuth] Error:', error);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/login?error=no_code`);
  }

  // Verify state (CSRF protection)
  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('[Google OAuth] State mismatch');
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Google OAuth] Token exchange failed:', errorText);
      return NextResponse.redirect(`${baseUrl}/login?error=token_exchange_failed`);
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error('[Google OAuth] Failed to get user info');
      return NextResponse.redirect(`${baseUrl}/login?error=user_info_failed`);
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();

    console.log('[Google OAuth] User authenticated:', userInfo.email);

    // Check if user already has a tenant (existing user)
    const existingTenant = await prisma.tenant.findFirst({
      where: {
        ownerEmail: userInfo.email,
      },
    });

    if (existingTenant) {
      // Existing user - log them in directly via OAuth
      console.log('[Google OAuth] Existing tenant found:', existingTenant.tenantCode);

      // Check if tenant has stored password for OAuth login
      if (!existingTenant.opsPasswordEncrypted) {
        console.warn('[Google OAuth] No stored password, redirecting to login page');
        const response = NextResponse.redirect(`${baseUrl}/login?tenant=${existingTenant.tenantCode}&email=${userInfo.email}&oauth=google&error=no_password`);
        response.cookies.delete('oauth_state');
        return response;
      }

      // Check if tenant is still provisioning
      if (existingTenant.provisionStatus === 'provisioning' || existingTenant.provisionStatus === 'pending') {
        const response = NextResponse.redirect(`${baseUrl}/home`);
        response.cookies.delete('oauth_state');
        // Set temporary session cookie for provisioning status page
        return response;
      }

      try {
        // Decrypt the stored password
        const password = decrypt(existingTenant.opsPasswordEncrypted);

        // Authenticate with Odoo
        const odooClient = createOdooClient({
          baseUrl: existingTenant.odooBaseUrl,
          db: existingTenant.odooDb,
        });

        const odooSession = await odooClient.authenticate(userInfo.email, password);

        // Upsert user
        const user = await prisma.user.upsert({
          where: {
            tenantId_odooUserId: {
              tenantId: existingTenant.id,
              odooUserId: odooSession.uid,
            },
          },
          update: {
            odooLogin: userInfo.email,
            displayName: odooSession.name || userInfo.name,
            email: userInfo.email,
            lastLoginAt: new Date(),
          },
          create: {
            tenantId: existingTenant.id,
            odooUserId: odooSession.uid,
            odooLogin: userInfo.email,
            displayName: odooSession.name || userInfo.name,
            email: userInfo.email,
            isAdmin: true,
          },
        });

        // Create app session
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const session = await prisma.session.create({
          data: {
            userId: user.id,
            tenantId: existingTenant.id,
            odooSessionId: odooSession.sessionId,
            expiresAt,
          },
        });

        // Ensure tenant has features initialized
        const featureCount = await prisma.tenantFeature.count({
          where: { tenantId: existingTenant.id },
        });
        if (featureCount === 0) {
          await initializeTenantFeatures(existingTenant.id, existingTenant.planCode);
        }

        // Ensure entitlements exist
        const entitlements = await prisma.entitlements.findUnique({
          where: { tenantId: existingTenant.id }
        });
        if (!entitlements) {
          await entitlementsService.initialize(existingTenant.id, existingTenant.planCode);
        }

        // Ensure membership exists
        const membership = await membershipService.ensureMembership(
          user.id,
          existingTenant.id,
          user.isAdmin
        );

        // Determine admin status from membership role
        const isAdmin = membership?.role === 'ORG_ADMIN' || membership?.role === 'BILLING_ADMIN';

        // Create JWT
        const token = await createToken({
          userId: user.id,
          tenantId: existingTenant.id,
          tenantCode: existingTenant.tenantCode,
          odooUserId: user.odooUserId,
          isAdmin,
          sessionId: session.id,
        });

        // Set cookie and redirect
        await setAuthCookie(token);

        // Log successful login
        await auditService.logLogin({
          tenantId: existingTenant.id,
          userId: user.id,
          success: true,
          method: 'oauth_google'
        });

        console.log('[Google OAuth] Direct login successful for:', userInfo.email);

        const response = NextResponse.redirect(`${baseUrl}/home`);
        response.cookies.delete('oauth_state');
        return response;
      } catch (authError) {
        console.error('[Google OAuth] Direct login failed:', authError);
        // Fallback to login page with error
        const response = NextResponse.redirect(`${baseUrl}/login?tenant=${existingTenant.tenantCode}&email=${userInfo.email}&oauth=google&error=auth_failed`);
        response.cookies.delete('oauth_state');
        return response;
      }
    }

    // New user - create pending registration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.pendingRegistration.upsert({
      where: { email: userInfo.email },
      update: {
        name: userInfo.name,
        avatarUrl: userInfo.picture,
        provider: 'GOOGLE',
        providerId: userInfo.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
      create: {
        email: userInfo.email,
        name: userInfo.name,
        avatarUrl: userInfo.picture,
        provider: 'GOOGLE',
        providerId: userInfo.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    });

    // Redirect to registration page to complete company info
    const response = NextResponse.redirect(`${baseUrl}/register?email=${encodeURIComponent(userInfo.email)}&name=${encodeURIComponent(userInfo.name || '')}`);
    response.cookies.delete('oauth_state');

    // Set a temporary auth cookie for the registration process
    response.cookies.set('pending_registration', userInfo.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[Google OAuth] Error:', error);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_error`);
  }
}
