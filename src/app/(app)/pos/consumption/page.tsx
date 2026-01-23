'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Utensils,
  Package,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  AlertTriangle
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { DateRangeFilter, type PeriodType } from '@/components/ui/date-range-filter';
import type { ApiResponse, ConsumptionData } from '@/types';

// Map PeriodType to API range
const periodToApiRange: Record<PeriodType, string> = {
  today: 'today',
  week: 'week',
  month: 'month',
  custom: 'custom',
};

export default function ConsumptionPage() {
  const t = useTranslations('pos');
  const tSearch = useTranslations('search');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [expandedDish, setExpandedDish] = useState<number | null>(null);

  const apiRange = periodToApiRange[period];

  const { data, isLoading, error } = useQuery({
    queryKey: ['pos-consumption', apiRange, period === 'custom' ? customFrom : '', period === 'custom' ? customTo : ''],
    queryFn: async () => {
      let url = `/api/pos/consumption?range=${apiRange}`;
      if (period === 'custom') {
        url += `&from=${customFrom}&to=${customTo}`;
      }
      const res = await fetch(url);
      const json: ApiResponse<ConsumptionData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch consumption data');
      return json.data!;
    },
  });

  const isLowStock = (remaining: number, minStock: number) => remaining <= minStock;

  if (isLoading) {
    return <Loading text={t('loading') || '読み込み中...'} />;
  }

  if (error) {
    return (
      <div className="card p-6 text-center text-red-600">
        {(error as Error).message}
      </div>
    );
  }

  const consumptionData = data || { summary: { totalDishes: 0, totalIngredients: 0, lowStockItems: 0 }, byDish: [] };

  return (
    <div className="space-y-4">
      {/* Page Title */}
      <Link href="/pos" className="page-title flex items-center gap-1 hover:text-[var(--color-primary)] transition-colors">
        <ChevronLeft className="w-5 h-5" />
        {t('consumption')}
      </Link>

      {/* Date Range Filter */}
      <DateRangeFilter
        value={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Utensils className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('soldDishes')}</p>
              <p className="text-title tabular-nums">{consumptionData.summary.totalDishes} {t('portions')}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('consumedIngredients')}</p>
              <p className="text-title tabular-nums">{consumptionData.summary.totalIngredients} {t('types')}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('stockAlert')}</p>
              <p className="text-title tabular-nums text-red-600">{consumptionData.summary.lowStockItems} {t('items')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Consumption by Dish */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">{t('viewByDish')}</h2>
        </div>

        {consumptionData.byDish.length === 0 ? (
          <EmptyState
            icon="chart"
            title={t('noData') || '暂无数据'}
            description={t('noConsumptionData') || '该时间段内没有消耗数据'}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {consumptionData.byDish.map((dish) => (
              <div key={dish.id}>
                {/* Dish Row */}
                <button
                  onClick={() => setExpandedDish(expandedDish === dish.id ? null : dish.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Utensils className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{dish.name}</p>
                      <p className="text-sm text-gray-500">
                        {t('sold')} <span className="text-blue-600 font-medium">{dish.soldCount}</span> {t('portions')} · {t('consumed')} <span className="text-orange-600 font-medium">{dish.ingredients.length}</span> {t('ingredientTypes')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {dish.ingredients.some(ing => isLowStock(ing.remaining, ing.minStock)) && (
                      <span className="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-full">
                        {t('hasStockAlert')}
                      </span>
                    )}
                    {expandedDish === dish.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Ingredients Detail */}
                {expandedDish === dish.id && (
                  <div className="px-4 pb-4">
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100 text-gray-600">
                            <th className="text-left py-2 px-3 font-medium">{t('ingredient')}</th>
                            <th className="text-right py-2 px-3 font-medium">{t('consumedQty')}</th>
                            <th className="text-right py-2 px-3 font-medium">{t('remainingStock')}</th>
                            <th className="text-right py-2 px-3 font-medium">{t('minStock')}</th>
                            <th className="text-center py-2 px-3 font-medium">{t('status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {dish.ingredients.map((ing, idx) => (
                            <tr key={idx} className={isLowStock(ing.remaining, ing.minStock) ? 'bg-red-50' : ''}>
                              <td className="py-2 px-3 text-gray-900">{ing.name}</td>
                              <td className="py-2 px-3 text-right text-orange-600 font-medium">
                                -{ing.consumed} {ing.unit}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span className={isLowStock(ing.remaining, ing.minStock) ? 'text-red-600 font-medium' : ''}>
                                  {ing.remaining} {ing.unit}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right text-gray-500">
                                {ing.minStock} {ing.unit}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {isLowStock(ing.remaining, ing.minStock) ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('needReplenish')}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-600 text-xs rounded-full">
                                    {t('normal')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
