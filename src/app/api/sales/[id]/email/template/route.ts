import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface SalesOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  date_order: string;
  amount_total: number;
  currency_id: [number, string];
  user_id: [number, string] | false;
  company_id: [number, string];
  state: string;
}

interface Partner {
  id: number;
  name: string;
  email: string | false;
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

    // Fetch sales order details
    const orders = await odoo.searchRead<SalesOrder>(
      'sale.order',
      [['id', '=', orderId]],
      {
        fields: ['id', 'name', 'partner_id', 'date_order', 'amount_total', 'currency_id', 'user_id', 'company_id', 'state'],
        limit: 1,
      }
    );

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Sales order not found' } },
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
      console.log('[Sales Email Template] Failed to fetch partner email:', e);
    }

    // Generate clean, human-readable email content
    const companyName = order.company_id[1] || 'Our Company';
    const currencySymbol = order.currency_id[1] || 'JPY';
    const formattedAmount = order.amount_total.toLocaleString('ja-JP');
    const orderDate = new Date(order.date_order).toLocaleDateString('ja-JP');

    // Determine document type based on order state
    const isQuotation = order.state === 'draft' || order.state === 'sent';
    const documentType = isQuotation ? '見積書' : '受注確認書';
    const documentTypeEn = isQuotation ? 'Quotation' : 'Sales Order Confirmation';

    const templateSubject = `${order.name} - ${documentType} / ${documentTypeEn}`;

    const templateBody = `
<p>${partnerName} 様</p>

<p>いつもお世話になっております。</p>

<p>添付にて${documentType} <strong>${order.name}</strong> をお送りいたします。</p>

<p><strong>${isQuotation ? 'お見積り内容' : '受注内容'}:</strong></p>
<ul>
  <li>${isQuotation ? '見積番号' : '受注番号'}: ${order.name}</li>
  <li>日付: ${orderDate}</li>
  <li>合計金額: ${currencySymbol} ${formattedAmount}</li>
</ul>

<p>ご確認の上、ご不明な点がございましたらお気軽にお問い合わせください。</p>

<p>今後ともよろしくお願いいたします。</p>

<p>${companyName}</p>
    `.trim();

    // Try to get existing attachments for the order
    const attachments: Attachment[] = [];
    try {
      const orderAttachments = await odoo.searchRead<Attachment>(
        'ir.attachment',
        [
          ['res_model', '=', 'sale.order'],
          ['res_id', '=', orderId],
        ],
        { fields: ['id', 'name', 'mimetype', 'file_size'], limit: 10 }
      );
      attachments.push(...orderAttachments);
    } catch (e) {
      console.log('[Sales Email Template] Failed to fetch attachments:', e);
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
    console.error('[Sales Email Template Error]', error);
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
