'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useAuthStore } from '@/stores/auth';
import Link from 'next/link';
import {
  BarChart3,
  ShoppingCart,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
  Receipt,
  Calculator,
  CheckCircle,
  UserCog,
  Wrench,
  FileText,
  Contact,
  Lock,
  LineChart,
  Wallet,
  FileSpreadsheet,
  ScanLine,
} from 'lucide-react';
import { ALL_MODULES, PREMIUM_MODULES } from '@/lib/modules';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3,
  ShoppingCart,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
  Receipt,
  Calculator,
  CheckCircle,
  UserCog,
  Wrench,
  FileText,
  Contact,
  LineChart,
  Wallet,
  FileSpreadsheet,
  ScanLine,
};

// Standalone features (not part of subscription modules but shown on home)
const STANDALONE_FEATURES = [
  { code: 'OCR', name: 'Document OCR', nameZh: '文档识别', nameJa: 'ドキュメントOCR', icon: 'ScanLine', path: '/ocr' },
  { code: 'SHEETFORGE', name: 'Sheet Forge', nameZh: '表格引擎', nameJa: 'シートフォージ', icon: 'FileSpreadsheet', path: '/sheetforge' },
];

// Modules that should not appear as standalone buttons on home page
// (they are sub-features accessed through parent module menus)
const HIDDEN_FROM_HOME = ['QR_ORDERING'];

// Business professional color mapping for each module
const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
  dashboard: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
  pos: { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-200' },
  inventory: { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-200' },
  purchase: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
  sales: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
  contacts: { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-200' },
  accounting: { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
  // Premium modules with gradient backgrounds
  analytics: { bg: 'bg-gradient-to-br from-indigo-50 to-purple-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
  crm: { bg: 'bg-gradient-to-br from-sky-50 to-blue-50', icon: 'text-sky-600', border: 'border-sky-200' },
  finance: { bg: 'bg-gradient-to-br from-emerald-50 to-teal-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
  hr: { bg: 'bg-gradient-to-br from-purple-50 to-pink-50', icon: 'text-purple-600', border: 'border-purple-200' },
  // Standalone features
  ocr: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
  sheetforge: { bg: 'bg-lime-50', icon: 'text-lime-600', border: 'border-lime-200' },
};

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user, visibleModules } = useAuthStore();

  // Get set of subscribed module codes for quick lookup
  const subscribedModuleCodes = new Set(visibleModules.map(m => m.code));

  // Get core modules that user has access to
  const coreModules = visibleModules.filter(m => {
    const moduleInfo = ALL_MODULES.find(am => am.code === m.code);
    return moduleInfo && !moduleInfo.isPremium;
  });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-display text-gray-900">
          {t('auth.welcomeBack')}, {user?.displayName || user?.tenant.name}
        </h1>
        <p className="text-body-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Core Modules Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {coreModules.map((module) => {
          const Icon = iconMap[module.icon] || Package;
          const colors = colorMap[module.code.toLowerCase()] || { bg: 'bg-gray-50', icon: 'text-gray-600', border: 'border-gray-200' };

          return (
            <Link
              key={module.code}
              href={module.path}
              className={`bg-white rounded-xl p-4 shadow-sm border ${colors.border} hover:shadow-md hover:scale-[1.02] transition-all flex flex-col items-center justify-center text-center min-h-[100px]`}
            >
              <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-5 h-5 ${colors.icon}`} />
              </div>
              <span className="text-sm font-medium text-gray-900">{t(`nav.${module.code.toLowerCase()}`)}</span>
            </Link>
          );
        })}

        {/* Premium Modules - Always visible with lock state (exclude sub-features like QR_ORDERING) */}
        {PREMIUM_MODULES
          .filter(m => !HIDDEN_FROM_HOME.includes(m.code))
          .map((module) => {
            const isSubscribed = subscribedModuleCodes.has(module.code);
            const Icon = iconMap[module.icon] || Package;
            const colors = colorMap[module.code.toLowerCase()] || { bg: 'bg-gray-50', icon: 'text-gray-600', border: 'border-gray-200' };

            return (
              <Link
                key={module.code}
                href={module.path}
                className={`relative bg-white rounded-xl p-4 shadow-sm border ${colors.border} hover:shadow-md hover:scale-[1.02] transition-all flex flex-col items-center justify-center text-center min-h-[100px] overflow-hidden`}
              >
                {/* Premium/Lock badge */}
                <div className="absolute top-2 right-2">
                  {isSubscribed ? (
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-medium rounded">
                      PRO
                    </span>
                  ) : (
                    <span className="p-1 bg-slate-100 rounded-full">
                      <Lock className="w-3 h-3 text-slate-400" />
                    </span>
                  )}
                </div>

                <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-5 h-5 ${colors.icon}`} />
                </div>
                <span className={`text-sm font-medium ${isSubscribed ? 'text-gray-900' : 'text-gray-500'}`}>
                  {t(`nav.${module.code.toLowerCase()}`)}
                </span>

                {/* Subtle overlay for locked state */}
                {!isSubscribed && (
                  <div className="absolute inset-0 bg-white/40 rounded-xl pointer-events-none" />
                )}
              </Link>
            );
          })}

        {/* Standalone Features (OCR, SheetForge) - Always accessible */}
        {STANDALONE_FEATURES.map((feature) => {
          const Icon = iconMap[feature.icon] || Package;
          const colors = colorMap[feature.code.toLowerCase()] || { bg: 'bg-gray-50', icon: 'text-gray-600', border: 'border-gray-200' };

          return (
            <Link
              key={feature.code}
              href={feature.path}
              className={`bg-white rounded-xl p-4 shadow-sm border ${colors.border} hover:shadow-md hover:scale-[1.02] transition-all flex flex-col items-center justify-center text-center min-h-[100px]`}
            >
              <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-5 h-5 ${colors.icon}`} />
              </div>
              <span className="text-sm font-medium text-gray-900">
                {t(`nav.${feature.code.toLowerCase()}`)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
