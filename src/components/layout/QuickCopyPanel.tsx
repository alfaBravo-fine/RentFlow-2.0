import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../db/client';
import { Property, Tenant } from '../../db/schema';
import { Copy, Check, Building2, Users, MapPin, Phone, X } from '../icons';

export interface QuickCopyPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickCopyPanel: React.FC<QuickCopyPanelProps> = ({ isOpen, onClose }) => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return createPortal(
    <>
      {/* Full-Viewport Frosted Blur Backdrop */}
      <div
        className="menu-backdrop-blur z-[90] no-print animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Solid Opaque Slide-Over Utility Drawer */}
      <aside
        role="dialog"
        aria-label="Quick-Copy Utility"
        className="fixed inset-y-0 right-0 z-[100] w-80 max-w-[92vw] solid-menu-surface bg-[var(--bg-surface)] border-l border-[var(--border-strong)] p-4 flex flex-col justify-between overflow-y-auto no-print animate-in slide-in-from-right duration-200"
      >
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-4">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Quick-Copy Utility</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer"
              title="Close Quick-Copy Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {copiedText && (
            <div className="mb-4 p-2.5 rounded-lg bg-[var(--status-success-bg)] border border-[var(--status-success-fg)]/30 text-xs text-[var(--status-success-fg)] flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 shrink-0" />
              <span>Copied {copiedText} to clipboard!</span>
            </div>
          )}

          {/* Properties Copy List */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Properties &amp; Addresses</span>
              </h3>
              <div className="space-y-2">
                {properties.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] py-2">No properties recorded yet.</p>
                ) : (
                  properties.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-[var(--text-primary)] gap-2">
                        <span className="truncate">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(p.name, p.name)}
                          className="p-1 rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer shrink-0"
                          title="Copy property name"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] gap-2">
                        <span className="truncate">{p.address_line1 || p.address || '—'}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(p.address_line1 || p.address || '', 'Address')}
                          className="p-1 rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer shrink-0"
                          title="Copy full address"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Tenants Contact Copy List */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Tenant Phone &amp; Email</span>
              </h3>
              <div className="space-y-2">
                {tenants.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] py-2">No tenants recorded yet.</p>
                ) : (
                  tenants.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-[var(--text-primary)] gap-2">
                        <span className="truncate">{t.name}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(t.name, t.name)}
                          className="p-1 rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer shrink-0"
                          title="Copy tenant name"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] gap-2">
                        <span className="truncate">{t.phone}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(t.phone, `${t.name}'s phone`)}
                          className="p-1 rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer shrink-0"
                          title="Copy phone number"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3 mt-4 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] text-center">
          RentFlow Utility Drawer &bull; 1-Click Clipboard
        </div>
      </aside>
    </>,
    document.body
  );
};
