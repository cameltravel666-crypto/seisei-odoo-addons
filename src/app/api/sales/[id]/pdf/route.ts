import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface SaleOrder {
  id: number;
  name: string;
  state: string;
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

    // Fetch order to get the name and state for filename
    const [order] = await odoo.searchRead<SaleOrder>('sale.order', [['id', '=', orderId]], {
      fields: ['name', 'state'],
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Get PDF from Odoo's native report system
    // For quotes/draft orders: sale.report_saleorder (or sale.action_report_saleorder)
    // This report works for both quotations and confirmed orders
    const pdfBuffer = await odoo.getReportPdf('sale.report_saleorder', [orderId]);

    // Generate safe filename based on state
    const prefix = order.state === 'draft' || order.state === 'sent' ? 'Quote' : 'SO';
    const filename = `${prefix}_${order.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Return PDF directly
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Sales PDF Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate PDF' } },
      { status: 500 }
    );
  }
}
