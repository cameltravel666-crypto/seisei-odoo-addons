import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Attachment {
  id: number;
  name: string;
  mimetype: string;
  file_size: number;
  create_date: string;
  create_uid: [number, string];
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('DOCUMENTS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Documents module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    const domain: unknown[] = [['res_model', '=', false]]; // Only standalone documents
    if (search) {
      domain.push(['name', 'ilike', search]);
    }

    const totalCount = await odoo.searchCount('ir.attachment', domain);
    const items = await odoo.searchRead<Attachment>('ir.attachment', domain, {
      fields: ['name', 'mimetype', 'file_size', 'create_date', 'create_uid'],
      limit,
      offset,
      order: 'create_date desc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          mimeType: item.mimetype,
          fileSize: item.file_size,
          createdAt: item.create_date,
          createdBy: item.create_uid[1],
        })),
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error) {
    console.error('[Documents Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch documents' } },
      { status: 500 }
    );
  }
}
