import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        tenant: {
          select: {
            id: true,
            tenantCode: true,
            name: true,
            planCode: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        tenantId: user.tenantId,
        odooUserId: user.odooUserId,
        odooLogin: user.odooLogin,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
        tenant: user.tenant,
      },
    });
  } catch (error) {
    console.error('[Me Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get user info' } },
      { status: 500 }
    );
  }
}
