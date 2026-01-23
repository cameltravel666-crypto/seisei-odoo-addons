import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * Sheet Forge Task Download API
 * Download the output file for a completed task
 */

interface OcrFileTask {
  id: number;
  output_file: string | false;
  output_filename: string | false;
  state: string;
}

// GET: Download output file
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

    // Get task with output file
    const [task] = await odoo.searchRead<OcrFileTask>('ocr.file.task',
      [['id', '=', taskId]],
      { fields: ['output_file', 'output_filename', 'state'] }
    );

    if (!task) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } },
        { status: 404 }
      );
    }

    if (task.state !== 'done') {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_READY', message: 'Task is not completed yet' } },
        { status: 400 }
      );
    }

    if (!task.output_file) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_OUTPUT', message: 'No output file available' } },
        { status: 404 }
      );
    }

    // Decode base64 file
    const fileBuffer = Buffer.from(task.output_file, 'base64');
    const filename = task.output_filename || `output_${taskId}.xlsx`;

    // Determine content type
    let contentType = 'application/octet-stream';
    if (filename.endsWith('.xlsx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (filename.endsWith('.xls')) {
      contentType = 'application/vnd.ms-excel';
    }

    // Return file as download
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[SheetForge Download Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to download file' } },
      { status: 500 }
    );
  }
}
