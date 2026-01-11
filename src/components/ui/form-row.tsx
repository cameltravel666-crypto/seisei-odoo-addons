'use client';

import type { ReactNode } from 'react';

export interface FormRowProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/**
 * FormRow - Unified form field layout
 * Label (12/16 500) -> gap 6px -> Control -> Hint/Error
 */
export function FormRow({
  label,
  required,
  hint,
  error,
  children,
  className = '',
}: FormRowProps) {
  return (
    <div className={`form-row ${className}`}>
      <label className={`form-label ${required ? 'form-label-required' : ''}`}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="form-error">{error}</span>
      ) : hint ? (
        <span className="form-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export interface FormGroupProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * FormGroup - Group of form fields with title and optional action
 */
export function FormGroup({
  title,
  action,
  children,
  className = '',
}: FormGroupProps) {
  return (
    <div className={`form-group ${className}`}>
      <div className="form-group-header">
        <span className="form-group-title">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}
