/**
 * Export Entitlement Check API
 * GET: 检查当前用户的导出权限
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { ExportTarget, ExportEntitlement } from '@/types/export';

// 所有可用的导出目标
const ALL_TARGETS: ExportTarget[] = ['freee', 'moneyforward', 'yayoi'];

// TODO: 从 Odoo 19 中央服务获取权限
async function getExportEntitlement(
  userId: string | undefined,
  tenantId: string | undefined
): Promise<ExportEntitlement> {
  // 未登录用户
  if (!userId || !tenantId) {
    return {
      canPreview: true,  // 允许预览
      canDownload: false, // 不允许下载
      availableTargets: ALL_TARGETS, // 所有目标都可预览
      reason: 'not_logged_in',
    };
  }

  // TODO: 调用 Odoo 19 检查订阅
  // const subscription = await odoo19Client.getSubscription(tenantId);

  // 临时逻辑：登录用户默认有权限
  // 实际应该根据订阅计划判断

  return {
    canPreview: true,
    canDownload: true,
    availableTargets: ALL_TARGETS,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    const entitlement = await getExportEntitlement(
      session?.odooUserId?.toString(),
      session?.tenantId
    );

    return NextResponse.json({
      success: true,
      data: {
        ...entitlement,
        isAuthenticated: !!session,
        user: session
          ? {
              id: session.odooUserId,
              tenant: session.tenantId,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[Export Entitlement API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'エラーが発生しました',
        },
      },
      { status: 500 }
    );
  }
}
