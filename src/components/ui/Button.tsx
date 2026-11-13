import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-150 focus-ring disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none active:scale-[0.98]';

  const variantClasses = {
    primary:
      'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-xs',
    secondary:
      'bg-transparent border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-base)]',
    outline:
      'border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] text-[var(--text-primary)]',
    danger:
      'bg-[var(--status-danger-fg)] hover:opacity-95 text-white shadow-xs',
    ghost:
      'bg-transparent hover:bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
  };

  const sizeClasses = {
    sm: 'text-xs px-3 h-8 rounded-lg gap-1.5',
    md: 'text-sm px-4 h-10 rounded-xl gap-2',
    lg: 'text-base px-5 h-12 rounded-2xl gap-2.5',
    icon: 'w-9 h-9 p-0 rounded-full shrink-0 flex items-center justify-center',
  };

  return (
    <button
      className={twMerge(clsx(baseClasses, variantClasses[variant], sizeClasses[size], className))}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
