import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

const actionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  model: z.string(),
  reason: z.string().optional(),
});

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

    // Check module access
    const hasAccess = await isModuleAccessible('APPROVALS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Approvals module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const recordId = parseInt(id);
    if (isNaN(recordId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ID', message: 'Invalid record ID' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, model } = actionSchema.parse(body);

    const odoo = await getOdooClientForSession(session);

    // Handle different model types
    let result = false;

    if (model === 'hr.expense.sheet') {
      if (action === 'approve') {
        result = await odoo.callKw<boolean>('hr.expense.sheet', 'approve_expense_sheets', [[recordId]]);
      } else {
        result = await odoo.callKw<boolean>('hr.expense.sheet', 'refuse_sheet', [[recordId]]);
      }
    } else if (model === 'purchase.order') {
      if (action === 'approve') {
        result = await odoo.callKw<boolean>('purchase.order', 'button_approve', [[recordId]]);
      } else {
        result = await odoo.callKw<boolean>('purchase.order', 'button_cancel', [[recordId]]);
      }
    } else {
      return NextResponse.json(
        { success: false, error: { code: 'UNSUPPORTED_MODEL', message: 'Model not supported for approvals' } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { result },
    });
  } catch (error) {
    console.error('[Approval Action Error]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process approval' } },
      { status: 500 }
    );
  }
}
