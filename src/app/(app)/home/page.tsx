'use client';

import { useTranslations } from 'next-intl';
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
} from 'lucide-react';

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
};

export default function HomePage() {
  const t = useTranslations();
  const { user, visibleModules } = useAuthStore();

  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome Header - Fixed Height */}
      <div className="mb-8">
        <h1 className="text-display text-gray-900">
          {t('auth.welcomeBack')}, {user?.displayName || user?.tenant.name}
        </h1>
        <p className="text-body-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('ja-JP', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Dashboard - Module Grid with Thumbnails */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visibleModules.map((module) => {
          const Icon = iconMap[module.icon] || Package;
          // Color mapping for each module
          const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
            dashboard: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
            pos: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-200' },
            inventory: { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-200' },
            purchase: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
            sales: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200' },
            crm: { bg: 'bg-pink-50', icon: 'text-pink-600', border: 'border-pink-200' },
            expenses: { bg: 'bg-yellow-50', icon: 'text-yellow-600', border: 'border-yellow-200' },
            accounting: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
            approvals: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-200' },
            hr: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
            maintenance: { bg: 'bg-slate-50', icon: 'text-slate-600', border: 'border-slate-200' },
            documents: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
          };
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
      </div>
    </div>
  );
}
