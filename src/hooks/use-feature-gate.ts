'use client';

import { useMemo } from 'react';
import { useSubscription } from './use-subscription';

/**
 * Feature gate hook for controlling access to premium features.
 *
 * Features controlled:
 * - Dashboard: Basic analytics, limited to 30 days / 3 months history
 * - BI (高级数据分析): Full analytics, unlimited history, advanced features
 */
export function useFeatureGate() {
  const { data: subscriptionData, isLoading } = useSubscription();

  const enabledModules = subscriptionData?.enabledModules || [];

  return useMemo(() => {
    // Check if BI module is enabled (Advanced Analytics)
    const hasBI = enabledModules.includes('BI') || enabledModules.includes('ANALYTICS');

    return {
      // Loading state
      isLoading,

      // Module checks
      hasBI,
      enabledModules,

      // === Time Range Limits ===
      // Basic: max 30 days custom range, 3 months history
      // BI: unlimited
      maxCustomDateRangeDays: hasBI ? Infinity : 30,
      maxHistoryMonths: hasBI ? Infinity : 3,

      // === Dimension Access ===
      // Basic: time, product (top 10), payment method
      // BI: +category, employee, store, customer
      canAnalyzeByCategory: hasBI,
      canAnalyzeByEmployee: hasBI,
      canAnalyzeByStore: hasBI,
      canAnalyzeByCustomer: hasBI,
      maxProductRankingCount: hasBI ? Infinity : 10,

      // === Comparison Features ===
      // Basic: simple period-over-period
      // BI: +year-over-year, custom comparison periods
      canCompareYearOverYear: hasBI,
      canCompareCustomPeriods: hasBI,

      // === Chart Types ===
      // Basic: line, bar, pie
      // BI: +heatmap, funnel, data screen
      canUseHeatmap: hasBI,
      canUseFunnel: hasBI,
      canCustomizeLayout: hasBI,
      canUseDataScreen: hasBI,

      // === Advanced Analytics ===
      canUseABCAnalysis: hasBI,
      canUseProductAssociation: hasBI,
      canUseSalesPrediction: hasBI,
      canUseAnomalyAlerts: hasBI,
      canUseGoalTracking: hasBI,

      // === Export Features ===
      // Basic: none (browser screenshot only)
      // BI: Excel, PDF, scheduled reports, API
      canExportExcel: hasBI,
      canExportPDF: hasBI,
      canScheduleReports: hasBI,
      canUseDataAPI: hasBI,

      // === Helper Methods ===

      /**
       * Check if a custom date range is within allowed limits
       */
      isDateRangeAllowed: (fromDate: string, toDate: string): boolean => {
        if (hasBI) return true;

        const from = new Date(fromDate);
        const to = new Date(toDate);
        const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

        return diffDays <= 30;
      },

      /**
       * Check if a historical date is within allowed limits
       */
      isHistoryDateAllowed: (date: string): boolean => {
        if (hasBI) return true;

        const targetDate = new Date(date);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        return targetDate >= threeMonthsAgo;
      },

      /**
       * Get earliest allowed date for history queries
       */
      getEarliestAllowedDate: (): Date => {
        if (hasBI) {
          // Return a date far in the past for BI users
          return new Date('2020-01-01');
        }

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return threeMonthsAgo;
      },

      /**
       * Clamp a date range to allowed limits
       */
      clampDateRange: (fromDate: string, toDate: string): { from: string; to: string; wasClamped: boolean } => {
        if (hasBI) {
          return { from: fromDate, to: toDate, wasClamped: false };
        }

        const from = new Date(fromDate);
        const to = new Date(toDate);
        const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          return { from: fromDate, to: toDate, wasClamped: false };
        }

        // Clamp to 30 days from the end date
        const clampedFrom = new Date(to);
        clampedFrom.setDate(clampedFrom.getDate() - 30);

        return {
          from: clampedFrom.toISOString().split('T')[0],
          to: toDate,
          wasClamped: true,
        };
      },
    };
  }, [enabledModules, isLoading, subscriptionData]);
}

/**
 * Feature names for display in upgrade prompts
 */
export const FEATURE_NAMES = {
  dateRange: {
    zh: '自定义日期范围',
    ja: 'カスタム期間',
    en: 'Custom Date Range',
  },
  history: {
    zh: '历史数据查询',
    ja: '過去データ',
    en: 'Historical Data',
  },
  yoyComparison: {
    zh: '同比分析',
    ja: '前年比分析',
    en: 'Year-over-Year Comparison',
  },
  categoryAnalysis: {
    zh: '类目分析',
    ja: 'カテゴリ分析',
    en: 'Category Analysis',
  },
  employeeAnalysis: {
    zh: '员工分析',
    ja: '従業員分析',
    en: 'Employee Analysis',
  },
  heatmap: {
    zh: '热力图',
    ja: 'ヒートマップ',
    en: 'Heatmap',
  },
  abcAnalysis: {
    zh: 'ABC商品分析',
    ja: 'ABC分析',
    en: 'ABC Analysis',
  },
  prediction: {
    zh: '销售预测',
    ja: '販売予測',
    en: 'Sales Prediction',
  },
  excelExport: {
    zh: 'Excel导出',
    ja: 'Excelエクスポート',
    en: 'Excel Export',
  },
  pdfExport: {
    zh: 'PDF报表',
    ja: 'PDFレポート',
    en: 'PDF Report',
  },
  dataScreen: {
    zh: '数据大屏',
    ja: 'データスクリーン',
    en: 'Data Screen',
  },
};
