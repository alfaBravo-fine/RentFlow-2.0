import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Building2,
  Users,
  Receipt,
  FileText,
  Wrench,
  HardHat,
  Calendar,
  Map,
  X,
  ArrowRight,
  Plus,
} from '../icons';
import { db } from '../../db/client';
import { Property, Unit, Tenant, Invoice, Lease, MaintenanceRequest } from '../../db/schema';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResultItem {
  id: string;
  category: 'Pages' | 'Properties' | 'Units' | 'Tenants' | 'Invoices' | 'Maintenance';
  title: string;
  subtitle?: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global Esc key listener
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

  if (!isOpen) return null;

  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at);
  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at);
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at);

  const q = query.trim().toLowerCase();

  const allItems: SearchResultItem[] = [];

  // Default Quick Links when query is empty
  if (!q) {
    allItems.push(
      { id: 'page-dash', category: 'Pages', title: 'Dashboard', subtitle: 'Portfolio overview & real-time metrics', path: '/', icon: Building2 },
      { id: 'page-cal', category: 'Pages', title: 'Calendar & Tasks', subtitle: 'Expirations, due dates & to-do list', path: '/calendar', icon: Calendar },
      { id: 'page-props', category: 'Pages', title: 'Properties & Units', subtitle: 'Asset portfolio & inventory', path: '/properties', icon: Building2 },
      { id: 'page-map', category: 'Pages', title: 'Interactive Map', subtitle: 'Geographic property pins & spatial overview', path: '/map', icon: Map },
      { id: 'page-tenants', category: 'Pages', title: 'Tenants Directory', subtitle: 'Resident roster & communications', path: '/tenants', icon: Users },
      { id: 'page-invoices', category: 'Pages', title: 'Invoices & Rent Roll', subtitle: 'Billing, collections & balances', path: '/invoices', icon: Receipt },
      { id: 'page-maint', category: 'Pages', title: 'Maintenance Board', subtitle: 'Work orders & dispatch tickets', path: '/maintenance', icon: Wrench }
    );
  } else {
    // Search Properties
    properties
      .filter((p) => p.name.toLowerCase().includes(q) || (p.address_line1 || p.address || '').toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((p) => {
        allItems.push({
          id: `prop-${p.id}`,
          category: 'Properties',
          title: p.name,
          subtitle: p.address_line1 || p.address || 'Property asset',
          path: '/properties',
          icon: Building2,
        });
      });

    // Search Units
    units
      .filter((u) => u.name.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((u) => {
        const parent = properties.find((p) => p.id === u.property_id);
        allItems.push({
          id: `unit-${u.id}`,
          category: 'Units',
          title: `Unit ${u.name}`,
          subtitle: parent ? `${parent.name} • Status: ${u.status}` : `Status: ${u.status}`,
          path: '/properties',
          icon: Building2,
        });
      });

    // Search Tenants
    tenants
      .filter((t) => t.name.toLowerCase().includes(q) || t.phone.toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((t) => {
        allItems.push({
          id: `tenant-${t.id}`,
          category: 'Tenants',
          title: t.name,
          subtitle: `${t.phone} ${t.email ? `• ${t.email}` : ''}`,
          path: '/tenants',
          icon: Users,
        });
      });

    // Search Invoices
    invoices
      .filter((i) => i.id.toLowerCase().includes(q) || (i.due_date && i.due_date.includes(q)) || (i.status && i.status.includes(q)))
      .slice(0, 4)
      .forEach((i) => {
        allItems.push({
          id: `inv-${i.id}`,
          category: 'Invoices',
          title: `Invoice #${i.id.slice(0, 8)}`,
          subtitle: `Due: ${i.due_date} • Status: ${i.status.toUpperCase()}`,
          path: '/invoices',
          icon: Receipt,
        });
      });

    // Search Maintenance
    maintenance
      .filter((m) => (m.description && m.description.toLowerCase().includes(q)) || (m.category && m.category.includes(q)))
      .slice(0, 4)
      .forEach((m) => {
        allItems.push({
          id: `maint-${m.id}`,
          category: 'Maintenance',
          title: m.description,
          subtitle: `Urgency: ${m.urgency.toUpperCase()} • Status: ${m.status}`,
          path: '/maintenance',
          icon: Wrench,
        });
      });
  }

  const handleSelect = (item: SearchResultItem) => {
    navigate(item.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length > 0 ? (prev + 1) % allItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length > 0 ? (prev - 1 + allItems.length) % allItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        handleSelect(allItems[selectedIndex]);
      }
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] modal-shadow overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-[var(--border-subtle)] gap-3 bg-[var(--bg-surface)]">
          <Search className="w-5 h-5 text-[var(--accent)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search properties, tenants, units, invoices..."
            className="w-full h-14 bg-transparent text-sm font-medium text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-[var(--text-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline px-2 py-0.5 rounded-md bg-[var(--bg-surface-sunken)] border border-[var(--border-strong)] text-[10px] font-mono text-[var(--text-secondary)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 divide-y divide-[var(--border-subtle)]">
          {allItems.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--text-secondary)]">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30 text-[var(--accent)]" />
              <p className="font-semibold text-sm text-[var(--text-primary)]">No matching results found</p>
              <p className="mt-1">Try searching for property names, tenant phone numbers, or unit IDs.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {allItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent)] text-white shadow-xs'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--bg-surface-sunken)] text-[var(--accent)]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs tracking-tight truncate">
                            {item.title}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-[var(--bg-base)] text-[var(--text-subtle)]'
                            }`}
                          >
                            {item.category}
                          </span>
                        </div>
                        {item.subtitle && (
                          <p
                            className={`text-[11px] truncate mt-0.5 ${
                              isSelected ? 'text-white/80' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    <ArrowRight
                      className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                        isSelected ? 'translate-x-0.5 text-white' : 'text-[var(--text-subtle)]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-strong)] mr-1">
                ↑
              </kbd>
              <kbd className="font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-strong)] mr-1">
                ↓
              </kbd>
              to navigate
            </span>
            <span>
              <kbd className="font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-strong)] mr-1">
                ↵
              </kbd>
              to select
            </span>
          </div>
          <span>RentFlow Command Palette</span>
        </div>
      </div>
    </div>
  );
};
