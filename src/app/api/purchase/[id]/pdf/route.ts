import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';
import { prisma } from '@/lib/db';

interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  date_approve: string | false;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  state: string;
  notes: string | false;
}

interface PurchaseOrderLine {
  id: number;
  product_id: [number, string] | false;
  name: string;
  product_qty: number;
  price_unit: number;
  price_subtotal: number;
  product_uom: [number, string] | false;
}

interface Partner {
  id: number;
  name: string;
  street: string | false;
  city: string | false;
  phone: string | false;
  email: string | false;
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

    // Fetch order details
    const [order] = await odoo.searchRead<PurchaseOrder>('purchase.order', [['id', '=', orderId]], {
      fields: ['name', 'partner_id', 'date_order', 'date_approve', 'amount_total', 'amount_untaxed', 'amount_tax', 'state', 'notes'],
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Fetch supplier details
    let partner: Partner | null = null;
    if (Array.isArray(order.partner_id)) {
      const [p] = await odoo.searchRead<Partner>('res.partner', [['id', '=', order.partner_id[0]]], {
        fields: ['name', 'street', 'city', 'phone', 'email'],
      });
      partner = p || null;
    }

    // Fetch order lines
    const lines = await odoo.searchRead<PurchaseOrderLine>('purchase.order.line', [['order_id', '=', orderId]], {
      fields: ['product_id', 'name', 'product_qty', 'price_unit', 'price_subtotal', 'product_uom'],
      order: 'id asc',
    });

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });

    const formatJPY = (value: number) => `¥ ${value.toLocaleString('ja-JP')}`;
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

    const stateLabels: Record<string, string> = {
      draft: '下書き',
      sent: '送信済み',
      'to approve': '承認待ち',
      purchase: '確定済み',
      done: '完了',
      cancel: 'キャンセル',
    };

    // Generate HTML for PDF (will be converted client-side using html2pdf.js or similar)
    const pdfHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>発注書 - ${order.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      background: white;
    }
    .document { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #4F46E5; }
    .title { font-size: 28px; font-weight: bold; color: #4F46E5; }
    .order-number { font-size: 14px; color: #666; margin-top: 5px; }
    .company-info { text-align: right; font-size: 11px; color: #666; }

    .parties { display: flex; gap: 40px; margin-bottom: 30px; }
    .party { flex: 1; }
    .party-label { font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 5px; }
    .party-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
    .party-details { font-size: 11px; color: #666; }

    .meta { display: flex; gap: 30px; margin-bottom: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; }
    .meta-item { }
    .meta-label { font-size: 10px; color: #888; }
    .meta-value { font-size: 14px; font-weight: 600; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    thead { background: #f1f5f9; }
    th { padding: 12px 10px; text-align: left; font-weight: 600; font-size: 11px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }

    .totals { display: flex; justify-content: flex-end; }
    .totals-table { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .totals-row.grand { font-size: 16px; font-weight: bold; border-bottom: 2px solid #4F46E5; color: #4F46E5; }

    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #888; text-align: center; }

    .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .status-draft { background: #f3f4f6; color: #374151; }
    .status-purchase { background: #dcfce7; color: #166534; }
    .status-done { background: #dcfce7; color: #166534; }
    .status-cancel { background: #fee2e2; color: #991b1b; }

    @media print {
      body { padding: 20px; }
      .document { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="document">
    <div class="header">
      <div>
        <div class="title">発注書</div>
        <div class="order-number">${order.name}</div>
      </div>
      <div class="company-info">
        <div style="font-weight: bold; font-size: 14px; color: #333;">${tenant?.name || 'Seisei BizNexus'}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">発注先 / Supplier</div>
        <div class="party-name">${partner?.name || (Array.isArray(order.partner_id) ? order.partner_id[1] : '-')}</div>
        <div class="party-details">
          ${partner?.street ? `<div>${partner.street}</div>` : ''}
          ${partner?.city ? `<div>${partner.city}</div>` : ''}
          ${partner?.phone ? `<div>TEL: ${partner.phone}</div>` : ''}
          ${partner?.email ? `<div>Email: ${partner.email}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">発注日</div>
        <div class="meta-value">${formatDate(order.date_order)}</div>
      </div>
      ${order.date_approve ? `
      <div class="meta-item">
        <div class="meta-label">承認日</div>
        <div class="meta-value">${formatDate(order.date_approve)}</div>
      </div>
      ` : ''}
      <div class="meta-item">
        <div class="meta-label">ステータス</div>
        <div class="meta-value">
          <span class="status status-${order.state}">${stateLabels[order.state] || order.state}</span>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>商品名</th>
          <th class="text-center" style="width: 80px;">数量</th>
          <th class="text-right" style="width: 100px;">単価</th>
          <th class="text-right" style="width: 120px;">小計</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((line, idx) => `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td>
              <div style="font-weight: 500;">${Array.isArray(line.product_id) ? line.product_id[1] : '-'}</div>
              ${line.name !== (Array.isArray(line.product_id) ? line.product_id[1] : '') ? `<div style="font-size: 10px; color: #666;">${line.name}</div>` : ''}
            </td>
            <td class="text-center">${line.product_qty} ${Array.isArray(line.product_uom) ? line.product_uom[1] : ''}</td>
            <td class="text-right">${formatJPY(line.price_unit)}</td>
            <td class="text-right">${formatJPY(line.price_subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row">
          <span>小計</span>
          <span>${formatJPY(order.amount_untaxed)}</span>
        </div>
        <div class="totals-row">
          <span>消費税</span>
          <span>${formatJPY(order.amount_tax)}</span>
        </div>
        <div class="totals-row grand">
          <span>合計</span>
          <span>${formatJPY(order.amount_total)}</span>
        </div>
      </div>
    </div>

    ${order.notes ? `
    <div style="margin-top: 30px; padding: 15px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b;">
      <div style="font-size: 10px; color: #92400e; margin-bottom: 5px;">備考</div>
      <div style="white-space: pre-wrap;">${order.notes}</div>
    </div>
    ` : ''}

    <div class="footer">
      <p>このドキュメントは ${tenant?.name || 'Seisei BizNexus'} により生成されました</p>
      <p>Generated on ${new Date().toLocaleDateString('ja-JP')} ${new Date().toLocaleTimeString('ja-JP')}</p>
    </div>
  </div>
</body>
</html>
    `;

    return NextResponse.json({
      success: true,
      data: {
        html: pdfHtml,
        filename: `PO_${order.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        order: {
          name: order.name,
          partnerName: Array.isArray(order.partner_id) ? order.partner_id[1] : '-',
          amountTotal: order.amount_total,
          state: order.state,
        },
      },
    });
  } catch (error) {
    console.error('[Purchase PDF Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate PDF' } },
      { status: 500 }
    );
  }
}
