'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { Loading } from '@/components/ui/loading';
import {
  TrendingUp,
  BarChart3,
  PieChart,
  LineChart,
  Sparkles,
  ArrowRight,
  Lock,
  Calendar,
  Users,
  Package,
  Layers,
  FileSpreadsheet,
  Bell,
  Target,
  Zap,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { useIsIOSAppStoreBuild, FEATURE_RESTRICTED_MESSAGE } from '@/lib/appChannel';

// Feature list for the analytics module
const ANALYTICS_FEATURES = [
  {
    icon: Calendar,
    titleZh: '无限时间范围',
    titleJa: '無制限期間',
    titleEn: 'Unlimited Time Range',
    descZh: '自定义任意日期范围，查看完整历史数据',
    descJa: 'カスタム期間設定、過去データを無制限に閲覧',
    descEn: 'Custom date ranges with full historical data access',
  },
  {
    icon: Users,
    titleZh: '多维度分析',
    titleJa: '多次元分析',
    titleEn: 'Multi-dimensional Analysis',
    descZh: '按员工、类目、门店、客户等维度深度分析',
    descJa: '従業員、カテゴリ、店舗、顧客別の詳細分析',
    descEn: 'Analyze by employee, category, store, customer',
  },
  {
    icon: TrendingUp,
    titleZh: '同比/环比分析',
    titleJa: '前年比/前月比分析',
    titleEn: 'YoY/MoM Comparison',
    descZh: '同比去年、环比上月，洞察业务趋势',
    descJa: '前年比・前月比で業績トレンドを把握',
    descEn: 'Year-over-year and month-over-month insights',
  },
  {
    icon: Layers,
    titleZh: 'ABC商品分析',
    titleJa: 'ABC分析',
    titleEn: 'ABC Product Analysis',
    descZh: '按销售贡献度对商品分类，优化库存决策',
    descJa: '売上貢献度で商品を分類、在庫最適化',
    descEn: 'Classify products by sales contribution',
  },
  {
    icon: Zap,
    titleZh: '销售预测',
    titleJa: '販売予測',
    titleEn: 'Sales Forecasting',
    descZh: '基于历史数据的智能销售预测',
    descJa: '過去データに基づく売上予測',
    descEn: 'AI-powered sales predictions',
  },
  {
    icon: Bell,
    titleZh: '异常预警',
    titleJa: '異常アラート',
    titleEn: 'Anomaly Alerts',
    descZh: '自动检测销售异常，及时预警',
    descJa: '売上異常を自動検知してアラート',
    descEn: 'Automatic detection of sales anomalies',
  },
  {
    icon: Target,
    titleZh: '目标追踪',
    titleJa: '目標追跡',
    titleEn: 'Goal Tracking',
    descZh: '设置销售目标，实时追踪完成进度',
    descJa: '売上目標を設定、達成度をリアルタイム追跡',
    descEn: 'Set sales goals and track progress',
  },
  {
    icon: FileSpreadsheet,
    titleZh: '报表导出',
    titleJa: 'レポートエクスポート',
    titleEn: 'Report Export',
    descZh: 'Excel、PDF报表导出，定时发送',
    descJa: 'Excel、PDFエクスポート、定期配信',
    descEn: 'Excel, PDF export with scheduling',
  },
];

export default function AnalyticsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { hasBI, isLoading } = useFeatureGate();
  const isIOSAppStore = useIsIOSAppStoreBuild();

  // Neutral message for iOS App Store builds
  const neutralMessage = FEATURE_RESTRICTED_MESSAGE[locale as keyof typeof FEATURE_RESTRICTED_MESSAGE] || FEATURE_RESTRICTED_MESSAGE.en;

  if (isLoading) {
    return <Loading />;
  }

  // If user has BI subscription, show the analytics dashboard
  if (hasBI) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-display">{t('nav.analytics')}</h1>
            <p className="text-body-sm text-slate-500">高级数据分析功能</p>
          </div>
        </div>

        {/* Coming Soon Placeholder */}
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">功能开发中</h2>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            高级数据分析功能正在紧张开发中，即将上线。目前您可以在数据看板中体验基础分析功能。
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            前往数据看板
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Feature Preview */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">即将推出的功能</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ANALYTICS_FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="card p-4 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h4 className="font-medium text-slate-900 mb-1">{feature.titleZh}</h4>
                  <p className="text-sm text-slate-500">{feature.descZh}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // If user doesn't have BI subscription, show upgrade prompt (or neutral message for iOS App Store)
  // iOS App Store builds: Show neutral message without pricing/subscription CTAs
  if (isIOSAppStore) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-8 md:p-12 mb-8">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              高级数据分析
            </h1>
            <p className="text-lg text-indigo-100 mb-4 max-w-2xl">
              深入洞察业务趋势，做出数据驱动的决策。
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-8 md:p-12 mb-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-white text-sm font-medium">
              Premium
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            高级数据分析
          </h1>
          <p className="text-lg text-indigo-100 mb-8 max-w-2xl">
            解锁全部数据分析能力，深入洞察业务趋势，做出数据驱动的决策。
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
          {ANALYTICS_FEATURES.map((feature, index) => {
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
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">功能对比</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">功能</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">数据看板 (免费)</th>
                <th className="text-center py-3 px-4 font-medium text-indigo-600 bg-indigo-50 rounded-t-lg">高级数据分析</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 text-slate-700">自定义日期范围</td>
                <td className="py-3 px-4 text-center text-slate-500">最多30天</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50 font-medium">无限制</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-700">历史数据</td>
                <td className="py-3 px-4 text-center text-slate-500">最近3个月</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50 font-medium">全部历史</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-700">商品排行</td>
                <td className="py-3 px-4 text-center text-slate-500">Top 10</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50 font-medium">无限制</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-700">多维度分析</td>
                <td className="py-3 px-4 text-center text-slate-400">-</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50">
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 rounded-full">✓</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-700">同比/环比分析</td>
                <td className="py-3 px-4 text-center text-slate-400">-</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50">
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 rounded-full">✓</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-700">销售预测</td>
                <td className="py-3 px-4 text-center text-slate-400">-</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50">
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 rounded-full">✓</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-700">报表导出</td>
                <td className="py-3 px-4 text-center text-slate-400">-</td>
                <td className="py-3 px-4 text-center text-indigo-600 bg-indigo-50/50">
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 rounded-full">✓</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">¥12,800<span className="text-sm font-normal text-slate-500">/月</span></div>
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
    </div>
  );
}
