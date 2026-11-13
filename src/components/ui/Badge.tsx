import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'neutral',
  size = 'md',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center rounded-full font-semibold transition-colors shrink-0';

  const sizeClasses = {
    sm: 'px-2.5 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
  };

  const variantClasses = {
    success: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-transparent',
    warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border border-transparent',
    danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border border-transparent',
    info: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-transparent',
    accent: 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-transparent',
    neutral: 'bg-[var(--bg-surface-sunken)] text-[var(--text-secondary)] border border-[var(--border-subtle)]',
  };

  return (
    <span className={twMerge(clsx(baseClasses, sizeClasses[size], variantClasses[variant], className))} {...props}>
      {children}
    </span>
  );
};
