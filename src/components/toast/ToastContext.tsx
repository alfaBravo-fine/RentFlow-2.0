import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from '../icons';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  onUndo?: () => void;
  undoLabel?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (item: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const duration = item.duration ?? (item.type === 'error' ? 8000 : 4000);

    setToasts((prev) => {
      const next = [...prev, { ...item, id }];
      return next.slice(-3); // Stack of 3 max
    });

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast viewport bottom-right */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-[8px] bg-[var(--surface-raised)] border border-[var(--border)] modal-shadow flex items-start gap-3 transition-all ${
              toast.type === 'success'
                ? 'border-l-4 border-l-[var(--status-success-fg)]'
                : toast.type === 'error'
                ? 'border-l-4 border-l-[var(--status-danger-fg)]'
                : 'border-l-4 border-l-[var(--accent)]'
            }`}
          >
            {toast.type === 'success' && (
              <CheckCircle className="w-4 h-4 text-[var(--status-success-fg)] shrink-0 mt-0.5" />
            )}
            {toast.type === 'error' && (
              <AlertCircle className="w-4 h-4 text-[var(--status-danger-fg)] shrink-0 mt-0.5" />
            )}
            {toast.type === 'info' && (
              <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
            )}

            <div className="flex-1 text-xs text-[var(--text)] font-medium leading-relaxed">
              {toast.message}
            </div>

            {toast.onUndo && (
              <button
                onClick={() => {
                  toast.onUndo?.();
                  removeToast(toast.id);
                }}
                className="text-xs font-bold text-[var(--accent)] hover:underline shrink-0 ml-1 cursor-pointer"
              >
                {toast.undoLabel || 'Undo'}
              </button>
            )}

            <button
              onClick={() => removeToast(toast.id)}
              className="text-[var(--text-subtle)] hover:text-[var(--text)] shrink-0 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
