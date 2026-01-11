import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createToken, setAuthCookie, encrypt } from '@/lib/auth';
import { createOdooClient } from '@/lib/odoo';
import { initializeTenantFeatures } from '@/lib/features';

const loginSchema = z.object({
  tenantCode: z.string().min(1, 'Tenant code is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantCode, username, password } = loginSchema.parse(body);

    // Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { tenantCode },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } },
        { status: 404 }
      );
    }

    if (!tenant.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'TENANT_INACTIVE', message: 'Tenant is inactive' } },
        { status: 403 }
      );
    }

    // Authenticate with Odoo
    const odooClient = createOdooClient({
      baseUrl: tenant.odooBaseUrl,
      db: tenant.odooDb,
    });

    let odooSession;
    try {
      odooSession = await odooClient.authenticate(username, password);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_FAILED', message: 'Invalid credentials' } },
        { status: 401 }
      );
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: {
        tenantId_odooUserId: {
          tenantId: tenant.id,
          odooUserId: odooSession.uid,
        },
      },
      update: {
        odooLogin: username,
        displayName: odooSession.name,
        lastLoginAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        odooUserId: odooSession.uid,
        odooLogin: username,
        displayName: odooSession.name,
        isAdmin: false, // Could be determined from Odoo groups
      },
    });

    // Create app session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        odooSessionId: odooSession.sessionId, // Already encrypted
        expiresAt,
      },
    });

    // Ensure tenant has features initialized
    const featureCount = await prisma.tenantFeature.count({
      where: { tenantId: tenant.id },
    });
    if (featureCount === 0) {
      await initializeTenantFeatures(tenant.id, tenant.planCode);
    }

    // Create JWT
    const token = await createToken({
      userId: user.id,
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      odooUserId: user.odooUserId,
      isAdmin: user.isAdmin,
      sessionId: session.id,
    });

    // Set cookie
    await setAuthCookie(token);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          isAdmin: user.isAdmin,
        },
        tenant: {
          id: tenant.id,
          tenantCode: tenant.tenantCode,
          name: tenant.name,
        },
      },
    });
  } catch (error) {
    console.error('[Login Error]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } },
      { status: 500 }
    );
  }
}
