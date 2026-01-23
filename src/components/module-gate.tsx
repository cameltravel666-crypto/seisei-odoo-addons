'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Loading } from '@/components/ui/loading';
import {
  ArrowRight,
  Lock,
  Sparkles,
  Check,
  Info,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import type { ModuleCode } from '@prisma/client';
import { useIsIOSAppStoreBuild, FEATURE_RESTRICTED_MESSAGE } from '@/lib/appChannel';
import { useEntitlements } from '@/hooks/use-entitlements';

interface ModuleFeature {
  icon: React.ComponentType<{ className?: string }>;
  titleZh: string;
  titleJa: string;
  titleEn: string;
  descZh: string;
  descJa: string;
  descEn: string;
}

interface ModuleGateProps {
  /**
   * The module code to check access for
   */
  moduleCode: ModuleCode;
  /**
   * Module display name (Chinese)
   */
  moduleNameZh: string;
  /**
   * Module display name (Japanese)
   */
  moduleNameJa: string;
  /**
   * Module description (Chinese)
   */
  descriptionZh: string;
  /**
   * Module description (Japanese)
   */
  descriptionJa: string;
  /**
   * Monthly price in JPY
   */
  priceMonthly: number;
  /**
   * Features list for the upgrade page
   */
  features: ModuleFeature[];
  /**
   * Comparison table items (what's included vs not)
   */
  comparisonItems?: Array<{
    feature: string;
    basic: string;
    premium: string;
  }>;
  /**
   * Gradient colors for the hero section (from, via, to)
   */
  heroGradient?: string;
  /**
   * Icon for the module
   */
  moduleIcon: React.ComponentType<{ className?: string }>;
  /**
   * Content to show when user has access
   */
  children: React.ReactNode;
}

/**
 * ModuleGate - Wraps module content and shows upgrade page if not subscribed
 */
export function ModuleGate({
  moduleCode,
  moduleNameZh,
  moduleNameJa,
  descriptionZh,
  descriptionJa,
  priceMonthly,
  features,
  comparisonItems,
  heroGradient = 'from-indigo-600 via-purple-600 to-indigo-700',
  moduleIcon: ModuleIcon,
  children,
}: ModuleGateProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { canAccess, isLoading, isTrialing, trialDaysRemaining, getAccessReason, gatingMode } = useEntitlements();
  const isIOSAppStore = useIsIOSAppStoreBuild();

  // Neutral message for iOS App Store builds
  const neutralMessage = FEATURE_RESTRICTED_MESSAGE[locale as keyof typeof FEATURE_RESTRICTED_MESSAGE] || FEATURE_RESTRICTED_MESSAGE.en;

  // Check if user has access to this module
  const hasAccess = canAccess(moduleCode);
  const accessReason = getAccessReason(moduleCode);

  // If loading entitlements, show loading
  if (isLoading) {
    return <Loading />;
  }

  // If user has access, render the module content with optional trial banner
  if (hasAccess) {
    // Show trial banner if in trial
    if (isTrialing && accessReason === 'trial' && trialDaysRemaining !== null) {
      return (
        <>
          {/* Trial Banner */}
          <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-800">
                {locale === 'zh' && `试用期还剩 ${trialDaysRemaining} 天`}
                {locale === 'ja' && `トライアル残り ${trialDaysRemaining} 日`}
                {locale === 'en' && `${trialDaysRemaining} days left in trial`}
              </span>
            </div>
            {!isIOSAppStore && (
              <Link
                href="/settings/subscription"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                {locale === 'zh' ? '订阅以继续使用' : locale === 'ja' ? '購読して継続' : 'Subscribe to continue'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
          {children}
        </>
      );
    }
    return <>{children}</>;
  }

  // Otherwise, show the upgrade page (or neutral message for iOS App Store)
  // iOS App Store builds: Show neutral message without pricing/subscription CTAs
  if (isIOSAppStore) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroGradient} p-8 md:p-12 mb-8`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {moduleNameZh}
            </h1>
            <p className="text-lg text-white/90 mb-4 max-w-2xl">
              {descriptionZh}
            </p>
            <div className="flex items-center gap-2 text-white/80">
              <Info className="w-5 h-5" />
              <span>{neutralMessage}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroGradient} p-8 md:p-12 mb-8`}>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-white text-sm font-medium">
              Premium
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {moduleNameZh}
          </h1>
          <p className="text-lg text-white/90 mb-8 max-w-2xl">
            {descriptionZh}
          </p>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-indigo-50 transition-colors shadow-lg"
          >
            立即解锁
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">包含功能</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="card p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{feature.titleZh}</h3>
                  <p className="text-sm text-slate-500">{feature.descZh}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison Section */}
      {comparisonItems && comparisonItems.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">功能对比</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">功能</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">基础版</th>
                  <th className="text-center py-3 px-4 font-medium text-indigo-600 bg-indigo-50 rounded-t-lg">{moduleNameZh}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonItems.map((item, index) => (
                  <tr key={index}>
                    <td className="py-3 px-4 text-slate-700">{item.feature}</td>
                    <td className="py-3 px-4 text-center text-slate-500">
                      {item.basic === '✓' ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-100 rounded-full">✓</span>
                      ) : item.basic === '-' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        item.basic
                      )}
                    </td>
                    <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50">
                      {item.premium === '✓' ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 rounded-full">✓</span>
                      ) : (
                        <span className="font-medium">{item.premium}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-slate-900">
                ¥{priceMonthly.toLocaleString()}<span className="text-sm font-normal text-slate-500">/月</span>
              </div>
              <p className="text-sm text-slate-500">按年付费享9折优惠</p>
            </div>
            <Link
              href="/settings/subscription"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              查看订阅方案
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
