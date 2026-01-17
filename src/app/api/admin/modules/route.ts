import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ModuleCode } from '@prisma/client';

// GET all modules with their status for admin
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check if user is admin
    if (!session.isAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    // Get tenant features
    const features = await prisma.tenantFeature.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { moduleCode: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: features.map((f) => ({
        moduleCode: f.moduleCode,
        isAllowed: f.isAllowed,
        isVisible: f.isVisible,
      })),
    });
  } catch (error) {
    console.error('[Admin Modules GET Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch modules' } },
      { status: 500 }
    );
  }
}

// PUT update module visibility
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check if user is admin
    if (!session.isAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { moduleCode, isVisible } = body;

    if (!moduleCode || typeof isVisible !== 'boolean') {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'moduleCode and isVisible are required' } },
        { status: 400 }
      );
    }

    // Verify module exists and is allowed by subscription
    const feature = await prisma.tenantFeature.findUnique({
      where: {
        tenantId_moduleCode: {
          tenantId: session.tenantId,
          moduleCode: moduleCode as ModuleCode,
        },
      },
    });

    if (!feature) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Module not found' } },
        { status: 404 }
      );
    }

    if (!feature.isAllowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Module not included in subscription' } },
        { status: 403 }
      );
    }

    // Update visibility
    await prisma.tenantFeature.update({
      where: {
        tenantId_moduleCode: {
          tenantId: session.tenantId,
          moduleCode: moduleCode as ModuleCode,
        },
      },
      data: { isVisible },
    });

    return NextResponse.json({
      success: true,
      data: { moduleCode, isVisible },
    });
  } catch (error) {
    console.error('[Admin Modules PUT Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update module' } },
      { status: 500 }
    );
  }
}
