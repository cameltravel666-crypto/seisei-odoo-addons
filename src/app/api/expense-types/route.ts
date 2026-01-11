import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Expense Types API
 * Returns all active expense types with localized names
 */

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const expenseTypes = await prisma.expenseType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        items: expenseTypes.map(type => ({
          id: type.id,
          code: type.code,
          nameEn: type.nameEn,
          nameZh: type.nameZh,
          nameJa: type.nameJa,
          sortOrder: type.sortOrder,
        })),
      },
    });
  } catch (error) {
    console.error('[ExpenseTypes Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch expense types' } },
      { status: 500 }
    );
  }
}
