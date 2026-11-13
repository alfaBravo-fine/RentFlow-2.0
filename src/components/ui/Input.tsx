import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={twMerge(
            clsx(
              'w-full h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus-ring transition-colors disabled:opacity-50 disabled:bg-[var(--bg-base)]',
              error && 'border-[var(--status-danger-fg)] ring-1 ring-[var(--status-danger-fg)]/20',
              className
            )
          )}
          {...props}
        />
        {error && <p className="text-xs text-[var(--status-danger-fg)]">{error}</p>}
        {!error && helperText && <p className="text-xs text-[var(--text-subtle)]">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, className, children, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={twMerge(
              clsx(
                'w-full h-[42px] appearance-none rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 pr-9 text-sm text-[var(--text-primary)] focus-ring transition-colors cursor-pointer disabled:opacity-50 disabled:bg-[var(--bg-base)]',
                error && 'border-[var(--status-danger-fg)] ring-1 ring-[var(--status-danger-fg)]/20',
                className
              )
            )}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-subtle)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && <p className="text-xs text-[var(--status-danger-fg)]">{error}</p>}
        {!error && helperText && <p className="text-xs text-[var(--text-subtle)]">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
