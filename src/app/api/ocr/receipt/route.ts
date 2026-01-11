import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  calculateImageHash,
  callOcrService,
  OCR_CONFIG,
  getJstMonthKey,
  type OcrResult,
  type OcrUsage,
} from '@/lib/ocr';
import type { Prisma } from '@prisma/client';

/**
 * OCR Receipt API
 * GET  /api/ocr/receipt - Get current usage status
 * POST /api/ocr/receipt - Process receipt image with OCR
 *
 * - Auth: Requires valid session
 * - Size: Max 100KB
 * - Cache: 24h by image hash
 * - Rate limit: Per tenant/user
 * - Billing: 30 free/month, ¥10/image after
 */

/**
 * Build usage object from monthly usage record
 */
function buildUsage(
  monthKey: string,
  usedCount: number,
  freeQuota: number,
  unitPriceJpy: number,
  firstOverageAt: Date | null,
  isNewOverage: boolean
): OcrUsage {
  const remainingFree = Math.max(0, freeQuota - usedCount);
  const billableCount = Math.max(0, usedCount - freeQuota);
  const isBillable = usedCount > freeQuota;

  return {
    month_key: monthKey,
    free_quota: freeQuota,
    used_count: usedCount,
    remaining_free: remainingFree,
    is_billable: isBillable,
    unit_price_jpy: unitPriceJpy,
    billable_count: billableCount,
    billable_amount_jpy: billableCount * unitPriceJpy,
    is_first_overage_this_month: isNewOverage,
  };
}

/**
 * GET /api/ocr/receipt - Get current usage status
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

    const monthKey = getJstMonthKey();

    // Get or create monthly usage record
    const usage = await prisma.ocrMonthlyUsage.upsert({
      where: {
        tenantId_monthKey: {
          tenantId: session.tenantId,
          monthKey,
        },
      },
      update: {},
      create: {
        tenantId: session.tenantId,
        monthKey,
        usedCount: 0,
        freeQuota: OCR_CONFIG.FREE_QUOTA_PER_MONTH,
        unitPriceJpy: OCR_CONFIG.UNIT_PRICE_JPY,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        usage: buildUsage(
          usage.monthKey,
          usage.usedCount,
          usage.freeQuota,
          usage.unitPriceJpy,
          usage.firstOverageAt,
          false // No new overage on GET
        ),
      },
    });
  } catch (error) {
    console.error('[OCR Usage Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get usage' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ocr/receipt - Process receipt image
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // 2. Parse multipart form data
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_IMAGE', message: 'Image file is required' } },
        { status: 400 }
      );
    }

    // 3. Validate file size (≤100KB)
    if (imageFile.size > OCR_CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `Image must be ≤${OCR_CONFIG.MAX_FILE_SIZE / 1024}KB. Got ${Math.round(imageFile.size / 1024)}KB`,
          },
        },
        { status: 400 }
      );
    }

    // 4. Rate limiting (per-second throttle)
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const rateLimit = await prisma.ocrRateLimit.upsert({
      where: {
        tenantId_userId_date: {
          tenantId: session.tenantId,
          userId: session.userId,
          date: today,
        },
      },
      update: {},
      create: {
        tenantId: session.tenantId,
        userId: session.userId,
        date: today,
        requestCount: 0,
      },
    });

    // Check daily limit
    if (rateLimit.requestCount >= OCR_CONFIG.RATE_LIMIT_PER_DAY) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_DAILY',
            message: `Daily OCR limit (${OCR_CONFIG.RATE_LIMIT_PER_DAY}) exceeded`,
          },
        },
        { status: 429 }
      );
    }

    // Check per-second limit
    const timeSinceLastRequest = now.getTime() - rateLimit.lastRequest.getTime();
    if (timeSinceLastRequest < 1000 / OCR_CONFIG.RATE_LIMIT_PER_SECOND) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_THROTTLE',
            message: 'Too many requests. Please wait a moment.',
          },
        },
        { status: 429 }
      );
    }

    // 5. Calculate image hash for caching
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const imageHash = calculateImageHash(imageBuffer);

    // 6. Check cache
    const cached = await prisma.ocrCache.findUnique({
      where: { hash: imageHash },
    });

    const monthKey = getJstMonthKey();

    // Get current monthly usage (before incrementing)
    let monthlyUsage = await prisma.ocrMonthlyUsage.upsert({
      where: {
        tenantId_monthKey: {
          tenantId: session.tenantId,
          monthKey,
        },
      },
      update: {},
      create: {
        tenantId: session.tenantId,
        monthKey,
        usedCount: 0,
        freeQuota: OCR_CONFIG.FREE_QUOTA_PER_MONTH,
        unitPriceJpy: OCR_CONFIG.UNIT_PRICE_JPY,
      },
    });

    // Check if this will be the first overage
    const willBeFirstOverage =
      monthlyUsage.usedCount === monthlyUsage.freeQuota && monthlyUsage.firstOverageAt === null;

    if (cached && cached.expiresAt > now) {
      // Cache hit - update rate limit but NOT monthly usage (no billing for cached)
      await prisma.ocrRateLimit.update({
        where: {
          tenantId_userId_date: {
            tenantId: session.tenantId,
            userId: session.userId,
            date: today,
          },
        },
        data: {
          requestCount: { increment: 1 },
          lastRequest: now,
        },
      });

      // Return cached result with current usage (not incremented)
      return NextResponse.json({
        success: true,
        data: {
          ...(cached.result as unknown as OcrResult),
          cached: true,
          usage: buildUsage(
            monthlyUsage.monthKey,
            monthlyUsage.usedCount,
            monthlyUsage.freeQuota,
            monthlyUsage.unitPriceJpy,
            monthlyUsage.firstOverageAt,
            false // No new usage for cached
          ),
        },
      });
    }

    // 7. Update rate limit
    await prisma.ocrRateLimit.update({
      where: {
        tenantId_userId_date: {
          tenantId: session.tenantId,
          userId: session.userId,
          date: today,
        },
      },
      data: {
        requestCount: { increment: 1 },
        lastRequest: now,
      },
    });

    // 8. Call OCR service
    let result: OcrResult;
    try {
      result = await callOcrService(imageBuffer);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'OCR service error';

      if (errorMsg.includes('unavailable') || errorMsg.includes('unhealthy')) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'OCR_UNAVAILABLE', message: 'OCR service is temporarily unavailable' },
            // Return current usage even on failure
            usage: buildUsage(
              monthlyUsage.monthKey,
              monthlyUsage.usedCount,
              monthlyUsage.freeQuota,
              monthlyUsage.unitPriceJpy,
              monthlyUsage.firstOverageAt,
              false
            ),
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: { code: 'OCR_FAILED', message: errorMsg },
          usage: buildUsage(
            monthlyUsage.monthKey,
            monthlyUsage.usedCount,
            monthlyUsage.freeQuota,
            monthlyUsage.unitPriceJpy,
            monthlyUsage.firstOverageAt,
            false
          ),
        },
        { status: 500 }
      );
    }

    // 9. OCR succeeded - update monthly usage count
    const updateData: Prisma.OcrMonthlyUsageUpdateInput = {
      usedCount: { increment: 1 },
    };

    // Mark first overage timestamp if applicable
    if (willBeFirstOverage) {
      updateData.firstOverageAt = now;
    }

    monthlyUsage = await prisma.ocrMonthlyUsage.update({
      where: {
        tenantId_monthKey: {
          tenantId: session.tenantId,
          monthKey,
        },
      },
      data: updateData,
    });

    // 10. Cache the result
    const expiresAt = new Date(now.getTime() + OCR_CONFIG.CACHE_TTL_HOURS * 60 * 60 * 1000);

    await prisma.ocrCache.upsert({
      where: { hash: imageHash },
      update: {
        result: result as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
      create: {
        hash: imageHash,
        result: result as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    // 11. Return result with usage
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        cached: false,
        usage: buildUsage(
          monthlyUsage.monthKey,
          monthlyUsage.usedCount,
          monthlyUsage.freeQuota,
          monthlyUsage.unitPriceJpy,
          monthlyUsage.firstOverageAt,
          willBeFirstOverage
        ),
      },
    });
  } catch (error) {
    console.error('[OCR Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'OCR processing failed' } },
      { status: 500 }
    );
  }
}
