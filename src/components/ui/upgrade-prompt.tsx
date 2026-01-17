'use client';

import { Sparkles, ArrowRight, Lock, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useIsNative } from '@/hooks/use-native';

interface UpgradePromptProps {
  /**
   * Feature name to display
   */
  feature: string;
  /**
   * Description of what the feature provides
   */
  description?: string;
  /**
   * Target module for upgrade (e.g., 'BI', 'CRM')
   */
  targetModule?: string;
  /**
   * Variant style
   */
  variant?: 'card' | 'inline' | 'banner';
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * UpgradePrompt - Displays a prompt to upgrade subscription for premium features
 */
export function UpgradePrompt({
  feature,
  description,
  targetModule = 'BI',
  variant = 'card',
  className = '',
}: UpgradePromptProps) {
  const t = useTranslations();
  const isNative = useIsNative();

  // For App Store compliance (3.1.1, 3.1.3), hide purchase CTAs in native apps
  // Show a generic "premium feature" message instead
  const upgradeContent = isNative ? (
    <span className="text-sm text-slate-500">Premium</span>
  ) : (
    <Link
      href="/settings/subscription"
      className="text-blue-600 hover:underline inline-flex items-center gap-1"
    >
      {t('subscription.upgrade')}
      <ArrowRight className="w-3 h-3" />
    </Link>
  );

  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Lock className="w-4 h-4" />
        <span>{feature}</span>
        {upgradeContent}
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg flex items-center justify-between ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <span className="text-sm font-medium text-blue-900">{feature}</span>
            {description && (
              <span className="text-sm text-blue-700 ml-2">{description}</span>
            )}
          </div>
        </div>
        {!isNative && (
          <Link
            href="/settings/subscription"
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
          >
            {t('subscription.upgrade')}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    );
  }

  // Default card variant
  return (
    <div className={`card p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-100 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900">{feature}</h4>
          {description && (
            <p className="text-sm text-slate-600 mt-1">{description}</p>
          )}
          {!isNative && (
            <Link
              href="/settings/subscription"
              className="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-flex items-center gap-1 font-medium"
            >
              {t('subscription.upgrade')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * UpgradeFeatureList - Displays a list of premium features to upgrade
 */
export function UpgradeFeatureList({
  features,
  className = '',
}: {
  features: Array<{ name: string; description?: string }>;
  className?: string;
}) {
  const t = useTranslations();
  const isNative = useIsNative();

  return (
    <div className={`card p-5 bg-gradient-to-br from-slate-50 to-blue-50 border-slate-200 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">
            高级数据分析
          </h3>
          <p className="text-sm text-slate-500">
            {isNative ? 'Premium 功能' : '解锁更多分析功能'}
          </p>
        </div>
      </div>

      <ul className="space-y-2 mb-4">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-slate-700">{feature.name}</span>
              {feature.description && (
                <span className="text-slate-500 ml-1">- {feature.description}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Hide purchase CTA in native apps for App Store compliance */}
      {!isNative && (
        <Link
          href="/settings/subscription"
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
        >
          了解高级数据分析
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

/**
 * LockedFeatureOverlay - Overlay for locked features
 */
export function LockedFeatureOverlay({
  feature,
  children,
  className = '',
}: {
  feature: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const isNative = useIsNative();

  return (
    <div className={`relative ${className}`}>
      <div className="opacity-30 pointer-events-none blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-lg">
        <div className="text-center p-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-2">{feature}</p>
          {/* Hide purchase CTA in native apps for App Store compliance */}
          {!isNative && (
            <Link
              href="/settings/subscription"
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              {t('subscription.upgrade')}
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
