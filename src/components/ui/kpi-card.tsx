'use client';

import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
}

/**
 * Business Professional Color Scheme - No red/green
 * All tones use slate/blue for professional appearance
 */
const toneStyles = {
  default: {
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    valueColor: 'text-slate-800',
    activeBg: 'bg-slate-50',
    activeRing: 'ring-slate-400',
  },
  success: {
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    valueColor: 'text-slate-800',
    activeBg: 'bg-blue-50',
    activeRing: 'ring-blue-400',
  },
  warning: {
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    valueColor: 'text-slate-800',
    activeBg: 'bg-amber-50',
    activeRing: 'ring-amber-400',
  },
  danger: {
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    valueColor: 'text-slate-600',
    activeBg: 'bg-slate-50',
    activeRing: 'ring-slate-400',
  },
};

/**
 * KpiCard - Fixed height KPI display card
 * Height: 84px (--height-kpi-card)
 * Numbers use tabular-nums for stable width
 */
export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
  onClick,
  isActive = false,
  className = '',
}: KpiCardProps) {
  const styles = toneStyles[tone];
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`card kpi-card transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''
      } ${isActive ? `ring-2 ${styles.activeRing} ${styles.activeBg}` : ''} ${className}`}
    >
      {Icon && (
        <div className={`p-2 rounded-[var(--radius-md)] flex-shrink-0 ${styles.iconBg}`}>
          <Icon className={`w-5 h-5 ${styles.iconColor}`} />
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <p className="kpi-title text-truncate">{title}</p>
        <p className={`kpi-value text-truncate ${styles.valueColor}`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-micro text-truncate">{subtitle}</p>
        )}
      </div>
    </Component>
  );
}

/**
 * KpiCardGrid - Grid container for KPI cards
 * Ensures consistent spacing and responsive layout
 */
export function KpiCardGrid({
  children,
  columns = 3,
  className = '',
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const colsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  };

  return (
    <div className={`grid ${colsClass[columns]} gap-[var(--space-2)] ${className}`}>
      {children}
    </div>
  );
}

/**
 * KpiCardSkeleton - Loading skeleton for KPI cards
 */
export function KpiCardSkeleton() {
  return (
    <div
      className="card kpi-card"
    >
      <div className="skeleton w-9 h-9 rounded-[var(--radius-md)] flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-6 w-12" />
      </div>
    </div>
  );
}
