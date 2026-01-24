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

    // Generate clean, human-readable email content
    // (Skip Odoo templates as they contain QWeb syntax that needs server-side rendering)
    const companyName = order.company_id[1] || 'Our Company';
    const currencySymbol = order.currency_id[1] || 'JPY';
    const formattedAmount = order.amount_total.toLocaleString('ja-JP');
    const orderDate = new Date(order.date_order).toLocaleDateString('ja-JP');

    const templateSubject = `${order.name} - 采购订单 / Purchase Order`;

    const templateBody = `
<p>${partnerName} 様</p>

<p>いつもお世話になっております。</p>

<p>添付にて発注書 <strong>${order.name}</strong> をお送りいたします。</p>

<p><strong>発注内容:</strong></p>
<ul>
  <li>発注番号: ${order.name}</li>
  <li>発注日: ${orderDate}</li>
  <li>合計金額: ${currencySymbol} ${formattedAmount}</li>
</ul>

<p>ご確認の上、ご対応のほどよろしくお願いいたします。</p>

<p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>

<p>よろしくお願いいたします。</p>

<p>${companyName}</p>
    `.trim();

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
