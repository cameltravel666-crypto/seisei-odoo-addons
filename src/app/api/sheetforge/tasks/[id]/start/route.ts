import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { entitlementsService } from '@/lib/entitlements-service';

/**
 * Sheet Forge Task Start API
 * Start OCR processing for a task
 *
 * Metered Usage (Table Engine):
 * - Free quota: 5 pages/month
 * - Overage: ¥50/page
 */

// POST: Start OCR processing
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

    const { id } = await params;
    const taskId = parseInt(id);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } },
        { status: 400 }
      );
    }

    // Check metered usage - Table Engine feature
    const usageCheck = await entitlementsService.canUseFeature(session.tenantId, 'table');
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USAGE_LIMIT_EXCEEDED',
            message: usageCheck.reason === 'PAYMENT_REQUIRED'
              ? 'Table Engine free quota exceeded. Please add a payment method to continue.'
              : 'Table Engine quota exceeded',
          }
        },
        { status: 402 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Call the action_start_ocr method on the task
    await odoo.callKw('ocr.file.task', 'action_start_ocr', [[taskId]]);

    // Fetch updated task state
    const [task] = await odoo.searchRead<{ id: number; state: string }>('ocr.file.task',
      [['id', '=', taskId]],
      { fields: ['state'] }
    );

    // Record Table Engine usage
    await entitlementsService.recordUsage({
      tenantId: session.tenantId,
      featureKey: 'table',
      idempotencyKey: `table_${session.tenantId}_task_${taskId}`,
      status: 'SUCCEEDED',
      meta: {
        taskId,
        action: 'start_ocr',
      },
    });
    console.log(`[SheetForge] Recorded Table Engine usage for tenant ${session.tenantId}, task ${taskId}`);

    return NextResponse.json({
      success: true,
      data: {
        id: taskId,
        state: task?.state || 'processing',
      },
    });
  } catch (error) {
    console.error('[SheetForge Start OCR Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to start OCR processing' } },
      { status: 500 }
    );
  }
}
