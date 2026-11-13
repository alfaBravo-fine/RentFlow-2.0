import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Tenant, Lease, Unit } from '../../db/schema';
import { Copy, Check, Building2, Users, MapPin, Phone, Mail, X } from '../icons';

export interface QuickCopyPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickCopyPanel: React.FC<QuickCopyPanelProps> = ({ isOpen, onClose }) => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  if (!isOpen) return null;

  const properties = db.getTable<Property>('properties');
  const tenants = db.getTable<Tenant>('tenants');
  const leases = db.getTable<Lease>('leases');
  const units = db.getTable<Unit>('units');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-[var(--surface-raised)] border-l border-[var(--border-strong)] modal-shadow p-4 flex flex-col justify-between overflow-y-auto">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--text)]">Quick-Copy Utility</h2>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text-subtle)] hover:text-[var(--text)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {copiedText && (
          <div className="mb-4 p-2.5 rounded-[6px] bg-[var(--status-success-bg)] border border-[var(--status-success-fg)] text-xs text-[var(--status-success-fg)] flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>Copied {copiedText} to clipboard!</span>
          </div>
        )}

        {/* Properties Copy List */}
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>Properties & Addresses</span>
            </h3>
            <div className="space-y-2">
              {properties.map((p) => (
                <div key={p.id} className="p-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-[var(--text)]">
                    <span className="truncate">{p.name}</span>
                    <button
                      onClick={() => handleCopy(p.name, p.name)}
                      className="p-1 rounded hover:bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                      title="Copy property name"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="truncate">{p.address_line1 || p.address || '—'}</span>
                    <button
                      onClick={() => handleCopy(p.address_line1 || p.address || '', 'Address')}
                      className="p-1 rounded hover:bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                      title="Copy full address"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tenants Contact Copy List */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>Tenant Phone & Email</span>
            </h3>
            <div className="space-y-2">
              {tenants.map((t) => (
                <div key={t.id} className="p-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-[var(--text)]">
                    <span>{t.name}</span>
                    <button
                      onClick={() => handleCopy(t.name, t.name)}
                      className="p-1 rounded hover:bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span>{t.phone}</span>
                    <button
                      onClick={() => handleCopy(t.phone, `${t.name}'s phone`)}
                      className="p-1 rounded hover:bg-[var(--surface-raised)] text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-[var(--border)] text-[11px] text-[var(--text-subtle)] text-center">
        RentFlow Utility Drawer &bull; 1-Click Clipboard
      </div>
    </div>
  );
};
