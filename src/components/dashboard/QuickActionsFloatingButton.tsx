import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  X,
  Building2,
  Receipt,
  FileText,
  Wrench,
  Zap,
} from '../icons';

export const QuickActionsFloatingButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Click Outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape Key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleAction = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-7 right-7 z-40 no-print flex flex-col items-end"
    >
      {/* Speed Dial Menu Popover */}
      {isOpen && (
        <div className="mb-3.5 w-64 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] modal-shadow p-2 space-y-1 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[var(--accent)]" />
              Quick Actions
            </span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              ESC
            </kbd>
          </div>

          <button
            onClick={() => handleAction('/properties')}
            className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-[var(--bg-base)] transition-colors flex items-center gap-3 group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                Add Property
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                Create building or single-family unit
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAction('/invoices')}
            className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-[var(--bg-base)] transition-colors flex items-center gap-3 group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-emerald-600 transition-colors">
                Record Rent Payment
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                Settle rent invoice & log receipt
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAction('/leases')}
            className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-[var(--bg-base)] transition-colors flex items-center gap-3 group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-amber-600 transition-colors">
                Create Lease
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                Draft statutory tenancy agreement
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAction('/maintenance')}
            className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-[var(--bg-base)] transition-colors flex items-center gap-3 group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-rose-600 transition-colors">
                Log Maintenance
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                Dispatch repair work order
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Main Circular Floating Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 cursor-pointer active:scale-95 focus-ring ${
          isOpen
            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rotate-90 scale-105'
            : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] hover:scale-105 shadow-[0_8px_25px_rgba(79,70,229,0.4)]'
        }`}
        title="Quick Actions (Add Property, Record Payment, Create Lease)"
        aria-label="Quick Actions Menu"
      >
        {isOpen ? (
          <X className="w-6 h-6 transition-transform duration-200" />
        ) : (
          <Plus className="w-6 h-6 transition-transform duration-200" />
        )}
      </button>
    </div>
  );
};
