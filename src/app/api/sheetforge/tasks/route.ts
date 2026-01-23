import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * Sheet Forge Tasks API
 * Manages OCR file tasks for template-based document extraction
 */

interface OcrFileTask {
  id: number;
  name: string;
  create_date: string;
  write_date: string;
  state: 'draft' | 'processing' | 'done' | 'failed';
  template_filename: string | false;
  source_file_ids: number[];
}

// GET: List tasks
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const state = searchParams.get('state');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const odoo = await getOdooClientForSession(session);

    // Build domain
    const domain: unknown[] = [];
    if (state && state !== 'all') {
      domain.push(['state', '=', state]);
    }

    // Get total count
    const total = await odoo.searchCount('ocr.file.task', domain);

    // Get tasks - only request fields that exist on the model
    const tasks = await odoo.searchRead<OcrFileTask>('ocr.file.task', domain, {
      fields: [
        'name', 'create_date', 'write_date', 'state',
        'template_filename', 'source_file_ids'
      ],
      limit,
      offset,
      order: 'create_date desc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: tasks.map((task) => ({
          id: task.id,
          name: task.name,
          createDate: task.create_date,
          writeDate: task.write_date,
          state: task.state,
          templateFilename: task.template_filename || null,
          sourceCount: task.source_file_ids?.length || 0,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('[SheetForge Tasks Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tasks' } },
      { status: 500 }
    );
  }
}

// POST: Create new task
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const templateFile = formData.get('template') as File | null;

    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Task name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Create task
    const taskData: Record<string, unknown> = {
      name,
    };

    // If template file provided, encode it as base64
    if (templateFile) {
      const buffer = await templateFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      taskData.template_file = base64;
      taskData.template_filename = templateFile.name;
    }

    const taskId = await odoo.create('ocr.file.task', taskData);

    // Fetch created task
    const [task] = await odoo.searchRead<OcrFileTask>('ocr.file.task', [['id', '=', taskId]], {
      fields: ['name', 'create_date', 'state', 'template_filename'],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        name: task.name,
        createDate: task.create_date,
        state: task.state,
        templateFilename: task.template_filename || null,
      },
    });
  } catch (error) {
    console.error('[SheetForge Create Task Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' } },
      { status: 500 }
    );
  }
}
