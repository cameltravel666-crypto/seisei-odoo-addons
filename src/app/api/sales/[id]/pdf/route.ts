import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface SaleOrder {
  id: number;
  name: string;
  state: string;
}

// Supported languages for PDF reports
const SUPPORTED_LANGS: Record<string, string> = {
  'zh': 'zh_CN',
  'zh_CN': 'zh_CN',
  'ja': 'ja_JP',
  'ja_JP': 'ja_JP',
  'en': 'en_US',
  'en_US': 'en_US',
};

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

    // Get language from query parameter, default to Japanese
    const searchParams = request.nextUrl.searchParams;
    const langParam = searchParams.get('lang') || 'ja';
    const lang = SUPPORTED_LANGS[langParam] || 'ja_JP';

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

    // Get PDF from Odoo's native report system with language context
    // Odoo 18 report: sale.report_saleorder
    const pdfBuffer = await odoo.getReportPdf('sale.report_saleorder', [orderId], lang);

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
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
