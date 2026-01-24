/**
 * GET /api/ocr/usage/[tenantId]
 *
 * Returns OCR usage data for a tenant.
 * Used by Odoo 19 to sync OCR billing information.
 *
 * Query params:
 * - year_month: Optional, format "YYYY-MM". Defaults to current month.
 *
 * Returns:
 * {
 *   images_used: number,
 *   free_remaining: number,
 *   billable: number,
 *   total_cost: number
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OCR_FREE_QUOTA, OCR_OVERAGE_JPY } from '@/lib/entitlements-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const yearMonth = searchParams.get('year_month');

  try {
    // Parse year_month or use current month
    let startDate: Date;
    let endDate: Date;

    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [year, month] = yearMonth.split('-').map(Number);
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Find tenant by ID (UUID)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Count OCR usage events for this tenant in the period
    const ocrCount = await prisma.tenantUsageEvent.count({
      where: {
        tenantId,
        featureKey: 'ocr',
        status: 'SUCCEEDED',
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    // Calculate billing
    const freeRemaining = Math.max(0, OCR_FREE_QUOTA - ocrCount);
    const billable = Math.max(0, ocrCount - OCR_FREE_QUOTA);
    const totalCost = billable * OCR_OVERAGE_JPY;

    return NextResponse.json({
      images_used: ocrCount,
      free_remaining: freeRemaining,
      billable: billable,
      total_cost: totalCost,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });
  } catch (error) {
    console.error('[OCR Usage API Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch OCR usage' },
      { status: 500 }
    );
  }
}
