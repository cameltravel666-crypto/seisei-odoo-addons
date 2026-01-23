import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ALL_MODULES } from '@/lib/features';

// Debug endpoint to check feature configuration
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get all tenant features for this tenant
    const allTenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId: session.tenantId },
    });

    // Get allowed and visible features
    const allowedFeatures = await prisma.tenantFeature.findMany({
      where: {
        tenantId: session.tenantId,
        isAllowed: true,
        isVisible: true,
      },
    });

    // Check if CONTACTS specifically exists
    const contactsFeature = await prisma.tenantFeature.findUnique({
      where: {
        tenantId_moduleCode: {
          tenantId: session.tenantId,
          moduleCode: 'CONTACTS',
        },
      },
    });

    return NextResponse.json({
      success: true,
      debug: {
        session: {
          userId: session.userId,
          tenantId: session.tenantId,
          tenantCode: session.tenantCode,
        },
        allModulesInCode: ALL_MODULES.map(m => m.code),
        allTenantFeatures: allTenantFeatures.map(f => ({
          moduleCode: f.moduleCode,
          isAllowed: f.isAllowed,
          isVisible: f.isVisible,
        })),
        allowedAndVisibleFeatures: allowedFeatures.map(f => f.moduleCode),
        contactsFeature: contactsFeature ? {
          moduleCode: contactsFeature.moduleCode,
          isAllowed: contactsFeature.isAllowed,
          isVisible: contactsFeature.isVisible,
        } : null,
        contactsExistsInAllModules: ALL_MODULES.some(m => m.code === 'CONTACTS'),
      },
    });
  } catch (error) {
    console.error('[Debug Features Error]', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
