import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  date_order: string;
  amount_total: number;
  currency_id: [number, string];
  user_id: [number, string] | false;
  company_id: [number, string];
}

interface Partner {
  id: number;
  name: string;
  email: string | false;
}

interface MailTemplate {
  id: number;
  name: string;
  subject: string;
  body_html: string | false;
}

interface Attachment {
  id: number;
  name: string;
  mimetype: string;
  file_size: number;
}

export async function GET(
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

    const hasAccess = await isModuleAccessible('PURCHASE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Purchase module not accessible' } },
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

    // Fetch purchase order details
    const orders = await odoo.searchRead<PurchaseOrder>(
      'purchase.order',
      [['id', '=', orderId]],
      {
        fields: ['id', 'name', 'partner_id', 'date_order', 'amount_total', 'currency_id', 'user_id', 'company_id'],
        limit: 1,
      }
    );

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } },
        { status: 404 }
      );
    }

    const order = orders[0];
    const partnerId = order.partner_id[0];
    const partnerName = order.partner_id[1];

    // Fetch partner email
    let partnerEmail = '';
    try {
      const partners = await odoo.searchRead<Partner>(
        'res.partner',
        [['id', '=', partnerId]],
        { fields: ['id', 'name', 'email'], limit: 1 }
      );
      if (partners.length > 0 && partners[0].email) {
        partnerEmail = partners[0].email;
      }
    } catch (e) {
      console.log('[Email Template] Failed to fetch partner email:', e);
    }

    // Try to find purchase order email template
    let templateSubject = `${order.name} - Purchase Order`;
    let templateBody = '';

    try {
      const templates = await odoo.searchRead<MailTemplate>(
        'mail.template',
        [['model', '=', 'purchase.order']],
        { fields: ['id', 'name', 'subject', 'body_html'], limit: 1 }
      );

      if (templates.length > 0) {
        const template = templates[0];
        // Use template subject if available, replacing placeholders with order info
        if (template.subject) {
          templateSubject = template.subject
            .replace(/\$\{object\.name\}/g, order.name)
            .replace(/\{\{object\.name\}\}/g, order.name)
            .replace(/%\(name\)s/g, order.name);
        }
        // Use template body if available
        if (template.body_html) {
          templateBody = template.body_html
            .replace(/\$\{object\.name\}/g, order.name)
            .replace(/\{\{object\.name\}\}/g, order.name)
            .replace(/%\(name\)s/g, order.name)
            .replace(/\$\{object\.partner_id\.name\}/g, partnerName)
            .replace(/\{\{object\.partner_id\.name\}\}/g, partnerName);
        }
      }
    } catch (e) {
      console.log('[Email Template] Failed to fetch template:', e);
    }

    // If no template body, create a default one
    if (!templateBody) {
      const currencySymbol = order.currency_id[1] || 'JPY';
      const formattedAmount = order.amount_total.toLocaleString('ja-JP');
      const orderDate = new Date(order.date_order).toLocaleDateString('ja-JP');

      templateBody = `
<p>Dear ${partnerName},</p>

<p>Please find attached the purchase order <strong>${order.name}</strong>.</p>

<p><strong>Order Details:</strong></p>
<ul>
  <li>Order Number: ${order.name}</li>
  <li>Order Date: ${orderDate}</li>
  <li>Total Amount: ${currencySymbol} ${formattedAmount}</li>
</ul>

<p>Please confirm receipt of this order and let us know if you have any questions.</p>

<p>Best regards,</p>
      `.trim();
    }

    // Try to get existing attachments for the order
    const attachments: Attachment[] = [];
    try {
      const orderAttachments = await odoo.searchRead<Attachment>(
        'ir.attachment',
        [
          ['res_model', '=', 'purchase.order'],
          ['res_id', '=', orderId],
        ],
        { fields: ['id', 'name', 'mimetype', 'file_size'], limit: 10 }
      );
      attachments.push(...orderAttachments);
    } catch (e) {
      console.log('[Email Template] Failed to fetch attachments:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        recipient: partnerEmail,
        subject: templateSubject,
        body: templateBody,
        attachments: attachments.map(a => ({
          id: a.id,
          name: a.name,
          mimetype: a.mimetype,
          fileSize: a.file_size,
        })),
      },
    });
  } catch (error) {
    console.error('[Email Template Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch email template',
        },
      },
      { status: 500 }
    );
  }
}
