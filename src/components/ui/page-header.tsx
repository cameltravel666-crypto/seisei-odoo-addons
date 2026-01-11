'use client';

import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  action?: ReactNode;
  subtitle?: string;
}

/**
 * PageHeader - Unified page header component
 * Fixed height to prevent layout shift
 * Height: 48px (matching design system)
 */
export function PageHeader({ title, action, subtitle }: PageHeaderProps) {
  return (
    <div
      className="flex items-center justify-between gap-[var(--space-3)]"
      style={{ height: 'var(--height-summary-bar)', minHeight: 'var(--height-summary-bar)' }}
    >
      <div className="flex-1 min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && (
          <p className="text-sub text-truncate">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Toolbar - Fixed height toolbar for actions like "Select All", batch operations
 * Height: 40px (--height-segment)
 */
interface ToolbarProps {
  children: ReactNode;
  variant?: 'default' | 'info' | 'warning';
}

export function Toolbar({ children, variant = 'default' }: ToolbarProps) {
  const variantClasses = {
    default: 'bg-[var(--color-bg-muted)] border-[var(--color-border-light)]',
    info: 'bg-[var(--color-primary-bg)] border-[var(--color-primary-bg)]',
    warning: 'bg-[var(--color-warning-bg)] border-[var(--color-warning-bg)]',
  };

  return (
    <div
      className={`flex items-center gap-[var(--space-3)] px-[var(--space-3)] rounded-[var(--radius-md)] border ${variantClasses[variant]}`}
      style={{ height: 'var(--height-segment)', minHeight: 'var(--height-segment)' }}
    >
      {children}
    </div>
  );
}

/**
 * ToolbarCheckbox - Checkbox with label for toolbar
 */
interface ToolbarCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}

export function ToolbarCheckbox({ checked, indeterminate, onChange, label }: ToolbarCheckboxProps) {
  return (
    <label className="flex items-center gap-[var(--space-2)] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate || false;
        }}
        onChange={onChange}
        className="w-4 h-4 rounded border-[var(--color-border-default)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
      />
      <span className="text-sub">{label}</span>
    </label>
  );
}
