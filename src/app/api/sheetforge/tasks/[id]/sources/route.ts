import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * Sheet Forge Task Sources API
 * Manage source files for a task
 */

// POST: Add source files to task
export async function POST(
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
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one file is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Create source records for each file
    const createdIds: number[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      const sourceId = await odoo.create('ocr.file.source', {
        task_id: taskId,
        name: file.name,
        source_file: base64,
        source_filename: file.name,
      });
      createdIds.push(sourceId);
    }

    return NextResponse.json({
      success: true,
      data: {
        taskId,
        addedCount: createdIds.length,
        sourceIds: createdIds,
      },
    });
  } catch (error) {
    console.error('[SheetForge Add Sources Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add source files' } },
      { status: 500 }
    );
  }
}

// DELETE: Remove a source file
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

    const searchParams = request.nextUrl.searchParams;
    const sourceId = parseInt(searchParams.get('sourceId') || '');

    if (isNaN(sourceId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid source ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);
    await odoo.unlink('ocr.file.source', [sourceId]);

    return NextResponse.json({
      success: true,
      data: { sourceId },
    });
  } catch (error) {
    console.error('[SheetForge Delete Source Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete source file' } },
      { status: 500 }
    );
  }
}
