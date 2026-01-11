'use client';

import { LucideIcon } from 'lucide-react';

export interface BottomAction {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'primary' | 'danger';
}

interface BottomActionBarProps {
  actions: BottomAction[];
  className?: string;
}

/**
 * BottomActionBar - Fixed bottom toolbar with 4 action buttons
 * - Height: 64px (excluding safe area)
 * - Each button: icon (24px) + label (12px)
 * - Touch area: min 44px
 * - Supports safe-area-inset-bottom for iPhone
 */
export function BottomActionBar({ actions, className = '' }: BottomActionBarProps) {
  const variantStyles = {
    default: {
      base: 'text-gray-600',
      active: 'text-blue-600 bg-blue-50',
    },
    primary: {
      base: 'text-green-600',
      active: 'text-green-700 bg-green-50',
    },
    danger: {
      base: 'text-red-600',
      active: 'text-red-700 bg-red-50',
    },
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 ${className}`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        className="flex items-center justify-around"
        style={{ height: '64px' }}
      >
        {actions.slice(0, 4).map((action) => {
          const Icon = action.icon;
          const variant = action.variant || 'default';
          const styles = variantStyles[variant];

          return (
            <button
              key={action.key}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 transition-colors rounded-lg mx-1 ${
                action.active ? styles.active : styles.base
              } ${action.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 active:bg-gray-100'}`}
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <Icon className="w-6 h-6 flex-shrink-0" />
              <span className="text-xs font-medium truncate max-w-full px-1">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hook to add bottom padding for BottomActionBar
 * Use this on the page container to prevent content from being obscured
 */
export function useBottomActionBarPadding() {
  // 64px bar height + safe area
  return 'pb-[calc(64px+env(safe-area-inset-bottom,0px))]';
}
