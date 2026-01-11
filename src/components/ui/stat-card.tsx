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
 *
 * Types:
 * - neutral: Gray text for counts (default)
 * - amount: Green text for money/positive values
 * - negative: Red text for cancelled/warning values
 * - highlight: Blue text for primary metrics
 */
export function StatCard({ value, label, type = 'neutral', onClick, active }: StatCardProps) {
  const colorMap = {
    neutral: 'text-gray-900',
    amount: 'text-green-600',
    negative: 'text-red-500',
    highlight: 'text-blue-600',
  };

  const activeRingMap = {
    neutral: 'ring-gray-400 bg-gray-50',
    amount: 'ring-green-400 bg-green-50',
    negative: 'ring-red-400 bg-red-50',
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
