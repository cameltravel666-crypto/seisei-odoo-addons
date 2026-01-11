import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface MailTemplate {
  id: number;
  name: string;
}

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

    const hasAccess = await isModuleAccessible('SALES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sales module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const orderId = parseInt(id);
    if (isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid order ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Try using mail template for sale.order
    try {
      const templates = await odoo.searchRead<MailTemplate>(
        'mail.template',
        [['model', '=', 'sale.order']],
        { fields: ['id', 'name'], limit: 1 }
      );

      if (templates.length > 0) {
        // Create mail compose message with the template
        const composerId = await odoo.callKw<number>(
          'mail.compose.message',
          'create',
          [{
            model: 'sale.order',
            res_ids: [orderId],
            template_id: templates[0].id,
            composition_mode: 'comment',
            auto_delete_message: false,
          }]
        );

        // Send the email
        await odoo.callKw(
          'mail.compose.message',
          'action_send_mail',
          [[composerId]]
        );

        return NextResponse.json({
          success: true,
          data: {
            sent: true,
            message: 'Email sent via Odoo',
            templateUsed: templates[0].name,
          },
        });
      }
    } catch (templateError) {
      console.log('[Sales Email] Template method failed:', templateError);
    }

    // Fallback: Mark order as sent if draft
    try {
      // Check current state
      const [order] = await odoo.searchRead<{ state: string }>(
        'sale.order',
        [['id', '=', orderId]],
        { fields: ['state'] }
      );

      if (order && order.state === 'draft') {
        await odoo.callKw('sale.order', 'write', [[orderId], { state: 'sent' }]);
      }

      return NextResponse.json({
        success: true,
        data: {
          sent: true,
          message: 'Order marked as sent',
        },
      });
    } catch (writeError) {
      throw writeError;
    }
  } catch (error) {
    console.error('[Sales Email Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to send email'
        }
      },
      { status: 500 }
    );
  }
}
