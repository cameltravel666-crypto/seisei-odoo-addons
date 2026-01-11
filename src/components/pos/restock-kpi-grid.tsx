'use client';

import { AlertTriangle, Clock, ShoppingCart, TrendingUp } from 'lucide-react';

interface KpiItem {
  icon: React.ElementType;
  label: string;
  value: number;
  unit: string;
  color: 'red' | 'orange' | 'blue' | 'green';
}

interface RestockKpiGridProps {
  criticalItems: number;
  warningItems: number;
  pendingOrders: number;
  totalSuggested: number;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

const colorClasses = {
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    value: 'text-red-600',
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'text-orange-500',
    value: 'text-orange-500',
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    value: 'text-blue-600',
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    value: 'text-green-600',
  },
};

export function RestockKpiGrid({
  criticalItems,
  warningItems,
  pendingOrders,
  totalSuggested,
  t,
}: RestockKpiGridProps) {
  const kpis: KpiItem[] = [
    {
      icon: AlertTriangle,
      label: t('criticalItems'),
      value: criticalItems,
      unit: t('items'),
      color: 'red',
    },
    {
      icon: Clock,
      label: t('warningItems'),
      value: warningItems,
      unit: t('items'),
      color: 'orange',
    },
    {
      icon: ShoppingCart,
      label: t('pendingOrders'),
      value: pendingOrders,
      unit: '',
      color: 'blue',
    },
    {
      icon: TrendingUp,
      label: t('suggestedPurchase'),
      value: totalSuggested,
      unit: t('types'),
      color: 'green',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        const colors = colorClasses[kpi.color];

        return (
          <div
            key={kpi.label}
            className={`flex items-center gap-3 p-3 rounded-xl ${colors.bg}`}
            style={{ maxHeight: '72px' }}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 ${colors.icon}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 truncate">{kpi.label}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`text-xl font-bold ${colors.value}`}>
                {kpi.value}
              </span>
              {kpi.unit && (
                <span className={`text-xs ml-1 ${colors.value}`}>{kpi.unit}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
