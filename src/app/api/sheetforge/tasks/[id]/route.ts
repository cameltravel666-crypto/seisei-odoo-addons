import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * Sheet Forge Task Detail API
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

interface OcrFileSource {
  id: number;
  name: string;
  source_filename: string | false;
  state: 'pending' | 'processing' | 'done' | 'failed';
  create_date: string;
}

// GET: Get task detail with sources
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

    const { id } = await params;
    const taskId = parseInt(id);
    if (isNaN(taskId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Get task - only request fields that exist on the model
    const [task] = await odoo.searchRead<OcrFileTask>('ocr.file.task', [['id', '=', taskId]], {
      fields: [
        'name', 'create_date', 'write_date', 'state',
        'template_filename', 'source_file_ids'
      ],
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } },
        { status: 404 }
      );
    }

    // Get source files if any
    let sources: OcrFileSource[] = [];
    if (task.source_file_ids && task.source_file_ids.length > 0) {
      sources = await odoo.searchRead<OcrFileSource>('ocr.file.source',
        [['id', 'in', task.source_file_ids]],
        {
          fields: ['name', 'source_filename', 'state', 'create_date'],
        }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        name: task.name,
        createDate: task.create_date,
        writeDate: task.write_date,
        state: task.state,
        templateFilename: task.template_filename || null,
        sourceCount: task.source_file_ids?.length || 0,
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
          filename: s.source_filename || null,
          state: s.state,
          createDate: s.create_date,
        })),
      },
    });
  } catch (error) {
    console.error('[SheetForge Task Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch task' } },
      { status: 500 }
    );
  }
}

// PUT: Update task (name, template)
export async function PUT(
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

    const formData = await request.formData();
    const name = formData.get('name') as string | null;
    const templateFile = formData.get('template') as File | null;

    const odoo = await getOdooClientForSession(session);

    const updateData: Record<string, unknown> = {};
    if (name) {
      updateData.name = name;
    }
    if (templateFile) {
      const buffer = await templateFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      updateData.template_file = base64;
      updateData.template_filename = templateFile.name;
    }

    if (Object.keys(updateData).length > 0) {
      await odoo.write('ocr.file.task', [taskId], updateData);
    }

    return NextResponse.json({
      success: true,
      data: { id: taskId },
    });
  } catch (error) {
    console.error('[SheetForge Update Task Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update task' } },
      { status: 500 }
    );
  }
}

// DELETE: Delete task
export async function DELETE(
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

    const odoo = await getOdooClientForSession(session);
    await odoo.unlink('ocr.file.task', [taskId]);

    return NextResponse.json({
      success: true,
      data: { id: taskId },
    });
  } catch (error) {
    console.error('[SheetForge Delete Task Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete task' } },
      { status: 500 }
    );
  }
}
