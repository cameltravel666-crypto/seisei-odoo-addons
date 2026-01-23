'use client';

/**
 * Frontend Entitlements Hook
 *
 * Provides unified access control for all modules via the entitlements API.
 * Use this instead of manually checking visibleModules or isIOSAppStore.
 */

import { useQuery } from '@tanstack/react-query';
import type { EffectiveEntitlements, UsageData } from '@/lib/entitlements-service';

export interface EntitlementsApiResponse {
  entitlements: EffectiveEntitlements;
  usage: UsageData;
}

interface UseEntitlementsReturn {
  /** Whether the entitlements data is loading */
  isLoading: boolean;
  /** Error if failed to fetch */
  error: Error | null;
  /** Full entitlements data */
  entitlements: EffectiveEntitlements | null;
  /** Usage data for metered features */
  usage: UsageData | null;
  /** Check if user can access a module */
  canAccess: (moduleKey: string) => boolean;
  /** Get access reason for a module */
  getAccessReason: (moduleKey: string) => 'trial' | 'subscribed' | 'expired' | 'admin_override' | null;
  /** Whether user is in trial period */
  isTrialing: boolean;
  /** Days remaining in trial (null if not trialing) */
  trialDaysRemaining: number | null;
  /** Trial end date (null if not trialing) */
  trialEndAt: string | null;
  /** Gating mode: 'lock' shows locked UI, 'hide' completely hides */
  gatingMode: 'lock' | 'hide';
  /** Refetch entitlements */
  refetch: () => void;
}

/**
 * Hook for accessing entitlements and checking module access
 *
 * @example
 * ```tsx
 * const { canAccess, isTrialing, trialDaysRemaining } = useEntitlements();
 *
 * if (!canAccess('FINANCE')) {
 *   return <UpgradePrompt module="FINANCE" />;
 * }
 *
 * return <FinanceModule />;
 * ```
 */
export function useEntitlements(): UseEntitlementsReturn {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<EntitlementsApiResponse>({
    queryKey: ['entitlements'],
    queryFn: async () => {
      const res = await fetch('/api/me/entitlements');
      if (!res.ok) {
        throw new Error('Failed to fetch entitlements');
      }
      return res.json();
    },
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const entitlements = data?.entitlements ?? null;
  const usage = data?.usage ?? null;

  const canAccess = (moduleKey: string): boolean => {
    if (!entitlements) return false;
    const module = entitlements.modules.find(m => m.key === moduleKey);
    return module?.enabled ?? false;
  };

  const getAccessReason = (moduleKey: string) => {
    if (!entitlements) return null;
    const module = entitlements.modules.find(m => m.key === moduleKey);
    return module?.reason ?? null;
  };

  return {
    isLoading,
    error: error as Error | null,
    entitlements,
    usage,
    canAccess,
    getAccessReason,
    isTrialing: entitlements?.isTrialing ?? false,
    trialDaysRemaining: entitlements?.trialDaysRemaining ?? null,
    trialEndAt: entitlements?.trialEndAt ?? null,
    gatingMode: entitlements?.gatingMode ?? 'lock',
    refetch,
  };
}

/**
 * Check if a metered feature can be used (OCR / Table Engine)
 *
 * @example
 * ```tsx
 * const { canUseOcr, ocrRemaining } = useMeteredUsage();
 *
 * if (!canUseOcr) {
 *   return <AddPaymentMethodPrompt />;
 * }
 * ```
 */
export function useMeteredUsage() {
  const { usage, isLoading, error } = useEntitlements();

  return {
    isLoading,
    error,
    // OCR usage
    canUseOcr: !usage?.locked,
    ocrUsed: usage?.ocr.used ?? 0,
    ocrFree: usage?.ocr.free ?? 30,
    ocrRemaining: usage?.ocr.remaining ?? 30,
    ocrBillable: usage?.ocr.billable ?? 0,
    ocrOverageCost: usage?.ocr.overageCost ?? 0,
    // Table Engine usage
    canUseTable: !usage?.locked,
    tableUsed: usage?.table.used ?? 0,
    tableFree: usage?.table.free ?? 5,
    tableRemaining: usage?.table.remaining ?? 5,
    tableBillable: usage?.table.billable ?? 0,
    tableOverageCost: usage?.table.overageCost ?? 0,
    // Period info
    periodStart: usage?.periodStart ?? null,
    periodEnd: usage?.periodEnd ?? null,
    // Payment info
    hasPaymentMethod: usage?.hasPaymentMethod ?? false,
    isLocked: usage?.locked ?? false,
    lockReason: usage?.lockReason ?? null,
  };
}

export default useEntitlements;
