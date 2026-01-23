'use client';

interface StatCardProps {
  value: string | number;
  label: string;
  type?: 'neutral' | 'amount' | 'negative' | 'highlight';
  onClick?: () => void;
  active?: boolean;
}

/**
 * Unified stat card component for consistent KPI display across all pages
 * Business Professional Color Scheme - No red/green
 *
 * Types:
 * - neutral: Slate-800 for general counts (default)
 * - amount: Slate-800 for money/values (professional dark)
 * - negative: Slate-600 for secondary values (muted)
 * - highlight: Blue-600 for primary metrics (accent)
 */
export function StatCard({ value, label, type = 'neutral', onClick, active }: StatCardProps) {
  const colorMap = {
    neutral: 'text-slate-800',
    amount: 'text-slate-800',
    negative: 'text-slate-600',
    highlight: 'text-blue-600',
  };

  const activeRingMap = {
    neutral: 'ring-slate-400 bg-slate-50',
    amount: 'ring-slate-400 bg-slate-50',
    negative: 'ring-slate-400 bg-slate-50',
    highlight: 'ring-blue-400 bg-blue-50',
  };

  const baseClasses = 'card p-2 text-center min-w-0';
  const interactiveClasses = onClick
    ? 'cursor-pointer transition hover:shadow-md active:scale-[0.98]'
    : '';
  const activeClasses = active ? `ring-2 ${activeRingMap[type]}` : '';

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`${baseClasses} ${interactiveClasses} ${activeClasses} flex flex-col items-center justify-center`}
      style={{ height: 'var(--height-kpi-card)', minHeight: 'var(--height-kpi-card)' }}
    >
      <p className={`text-xl font-bold whitespace-nowrap tabular-nums ${colorMap[type]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1 truncate">{label}</p>
    </Component>
  );
}
