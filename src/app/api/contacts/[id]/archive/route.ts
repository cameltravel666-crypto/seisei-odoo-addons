import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

// Archive/Unarchive contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const accessResult = await isModuleAccessible('CONTACTS', session.userId, session.tenantId);
    if (!accessResult.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: accessResult.reason || 'Contacts module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contactId = parseInt(id);
    if (isNaN(contactId)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid contact ID' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { active } = body;

    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'active must be a boolean' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);
    await odoo.write('res.partner', [contactId], { active });

    return NextResponse.json({
      success: true,
      data: { id: contactId, active },
    });
  } catch (error) {
    console.error('[Contact Archive Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to archive contact' } },
      { status: 500 }
    );
  }
}
