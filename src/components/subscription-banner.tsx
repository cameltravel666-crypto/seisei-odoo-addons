'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, CreditCard, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useIsIOSAppStoreBuild } from '@/lib/appChannel';

interface SubscriptionHealth {
  status: 'healthy' | 'warning' | 'critical' | 'none';
  message: string;
  subscription: {
    status: string;
    daysUntilExpiry?: number;
    isInTrial: boolean;
    hasPaymentMethod: boolean;
  } | null;
}

export function SubscriptionBanner() {
  const [dismissed, setDismissed] = useState(false);
  const isIOSAppStore = useIsIOSAppStoreBuild();

  const { data: health } = useQuery<SubscriptionHealth>({
    queryKey: ['subscription-health'],
    queryFn: async () => {
      const res = await fetch('/api/subscription/sync');
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);
      return data.data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 60 * 1000, // Consider data stale after 1 minute
  });

  // Don't show banner if dismissed, healthy, no subscription, or in iOS App Store build
  // App Store compliance (3.1.1, 3.1.3): Hide subscription CTAs in iOS App Store builds
  if (dismissed || !health || health.status === 'healthy' || health.status === 'none' || isIOSAppStore) {
    return null;
  }

  const bgColor = health.status === 'critical' ? 'bg-red-50' : 'bg-yellow-50';
  const borderColor = health.status === 'critical' ? 'border-red-200' : 'border-yellow-200';
  const textColor = health.status === 'critical' ? 'text-red-800' : 'text-yellow-800';
  const iconColor = health.status === 'critical' ? 'text-red-500' : 'text-yellow-500';

  const Icon = health.subscription?.isInTrial ? Clock : AlertTriangle;

  return (
    <div className={`${bgColor} ${borderColor} border-b px-4 py-2`}>
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
          <p className={`text-sm ${textColor}`}>{health.message}</p>
        </div>

        <div className="flex items-center gap-2">
          {!health.subscription?.hasPaymentMethod && (
            <Link
              href="/settings/subscription"
              className="flex items-center gap-1 px-3 py-1 bg-white rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-200"
            >
              <CreditCard className="w-4 h-4" />
              添加支付方式
            </Link>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-white/50 rounded"
            aria-label="关闭提醒"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
