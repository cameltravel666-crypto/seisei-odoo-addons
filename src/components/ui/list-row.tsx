'use client';

import Link from 'next/link';
import { ChevronRight, LucideIcon } from 'lucide-react';

interface Badge {
  label: string;
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

interface ListRowProps {
  /** Optional link href - if provided, renders as Link */
  href?: string;
  /** Optional click handler */
  onClick?: () => void;
  /** Left icon */
  icon?: LucideIcon;
  /** Icon background color */
  iconColor?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  /** Primary title text */
  title: string;
  /** Secondary subtitle text */
  subtitle?: string;
  /** Right-aligned primary value (e.g., amount) */
  rightPrimary?: string;
  /** Right-aligned secondary value (e.g., status) */
  rightSecondary?: string;
  /** Status badges */
  badges?: Badge[];
  /** Whether to show chevron indicator */
  showChevron?: boolean;
  /** Use dense height (64px) instead of normal (72px) */
  dense?: boolean;
  /** Additional class names */
  className?: string;
}

const iconColorStyles = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
  gray: 'bg-gray-100 text-gray-600',
};

const badgeColorStyles = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

/**
 * ListRow - Consistent list item component
 * Supports icon, title/subtitle, right values, badges, and navigation
 * Height is fixed to prevent layout shift
 */
export function ListRow({
  href,
  onClick,
  icon: Icon,
  iconColor = 'gray',
  title,
  subtitle,
  rightPrimary,
  rightSecondary,
  badges = [],
  showChevron = false,
  dense = false,
  className = '',
}: ListRowProps) {
  const height = dense ? 'var(--height-list-item-dense)' : 'var(--height-list-item-normal)';

  const content = (
    <>
      {/* Left: Icon */}
      {Icon && (
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColorStyles[iconColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}

      {/* Middle: Title + Subtitle + Badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-900 text-sm truncate">{title}</h4>
          {badges.length > 0 && (
            <div className="flex gap-1 flex-shrink-0">
              {badges.map((badge, i) => (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 text-xs font-medium rounded ${badgeColorStyles[badge.color || 'default']}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {subtitle && (
          <p className="text-body-sm text-gray-500 truncate mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Right: Values */}
      <div className="flex-shrink-0 text-right">
        {rightPrimary && (
          <p className="font-semibold text-gray-900 tabular-nums">{rightPrimary}</p>
        )}
        {rightSecondary && (
          <p className="text-caption text-gray-500 tabular-nums mt-0.5">{rightSecondary}</p>
        )}
      </div>

      {/* Chevron */}
      {showChevron && (
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      )}
    </>
  );

  const baseClasses = `flex items-center gap-3 px-4 border-b border-gray-100 last:border-b-0 ${
    href || onClick ? 'hover:bg-gray-50 cursor-pointer transition-colors' : ''
  } ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={baseClasses}
        style={{ minHeight: height }}
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${baseClasses} w-full text-left`}
        style={{ minHeight: height }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClasses} style={{ minHeight: height }}>
      {content}
    </div>
  );
}

/**
 * ListRowContainer - Container for list rows
 * Provides consistent styling and border radius
 */
export function ListRowContainer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-lg border border-gray-100 ${className}`}>
      {children}
    </div>
  );
}
