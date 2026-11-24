import React, { useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useTheme } from '../theme/ThemeProvider';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { CommandPalette } from './CommandPalette';
import { QuickCopyPanel } from './QuickCopyPanel';
import { Logo } from '../Logo';
import {
  Home,
  Building2,
  Users,
  FileText,
  Receipt,
  Wrench,
  HardHat,
  Banknote,
  BarChart3,
  Settings,
  RefreshCw,
  Map,
  Calculator,
  Layers,
  Folder,
  UserCheck,
  Calendar,
  Search,
  Sun,
  Moon,
  Plus,
  ChevronDown,
  LayoutGrid,
  Copy,
} from '../icons';

export const TopNavTabs: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const { setUILayout } = useUIStore();
  const appMode = useAuthStore((s) => s.appMode);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isQuickCopyOpen, setIsQuickCopyOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  const navItems: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }>; tourId?: string }> = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/calendar', label: 'Calendar & Tasks', icon: Calendar },
    { to: '/properties', label: 'Properties & Units', icon: Building2, tourId: 'sidebar-properties' },
    { to: '/map', label: 'Interactive Map', icon: Map },
    { to: '/tenants', label: 'Tenants', icon: Users, tourId: 'sidebar-tenants' },
    { to: '/leases', label: 'Leases', icon: FileText, tourId: 'sidebar-leases' },
    { to: '/invoices', label: 'Invoices & Rent', icon: Receipt, tourId: 'sidebar-invoicing' },
    { to: '/maintenance', label: 'Maintenance', icon: Wrench, tourId: 'maintenance-tab' },
    { to: '/expenses', label: 'Expenses & Income', icon: Banknote },
    { to: '/utility-splitter', label: 'Utility Splitter', icon: Calculator },
    { to: '/area-calculator', label: 'Area Calculator', icon: Layers },
    { to: '/vendors', label: 'Vendors', icon: HardHat },
    { to: '/documents', label: 'Documents', icon: Folder },
    { to: '/owners', label: 'Owner Statements', icon: UserCheck },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    ...(appMode === 'cloud'
      ? [{ to: '/sync', label: 'Drive Sync & Backup', icon: RefreshCw }]
      : []),
    { to: '/settings', label: 'Settings', icon: Settings, tourId: 'settings-tab' },
  ];

  return (
    <header className="no-print bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none shadow-xs sticky top-0 z-40">
      {/* Top Bar: Brand, Global Search, Quick Actions & Utility Tools */}
      <div className="flex items-center justify-between px-4 sm:px-8 h-16 border-b border-[var(--border-subtle)] gap-4">
        {/* Brand Header */}
        <div className="flex items-center gap-3 shrink-0">
          <Logo size={32} className="shadow-xs" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight text-[var(--text-primary)]">
              RentFlow
            </span>
            <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[var(--accent-subtle)] text-[var(--accent)]">
              PRO
            </span>
          </div>
        </div>

        {/* Global Search Bar (Cmd+K) */}
        <div className="flex-1 max-w-md hidden md:block">
          <button
            onClick={() => setIsCommandOpen(true)}
            className="flex items-center gap-3 px-3.5 h-10 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all w-full justify-between cursor-pointer focus-ring"
          >
            <div className="flex items-center gap-2.5 truncate">
              <Search className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
              <span className="truncate">Search properties, units, tenants, invoices...</span>
            </div>
            <kbd className="px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[10px] font-mono text-[var(--text-secondary)] shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Quick Create Dropdown */}
          <div className="relative" ref={quickActionsRef}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Create</span>
              <ChevronDown className="w-3 h-3 opacity-80" />
            </motion.button>

            {isQuickActionOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] modal-shadow py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setIsQuickActionOpen(false);
                    navigate('/properties');
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Add Property / Unit</span>
                </button>
                <button
                  onClick={() => {
                    setIsQuickActionOpen(false);
                    navigate('/invoices');
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Record Payment</span>
                </button>
                <button
                  onClick={() => {
                    setIsQuickActionOpen(false);
                    navigate('/maintenance');
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  <span>Log Work Order</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick-Copy Drawer Button */}
          <button
            onClick={() => setIsQuickCopyOpen(true)}
            className="hidden lg:flex items-center gap-1.5 px-3 h-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all cursor-pointer"
            title="Open Quick-Copy Utility Drawer"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Quick-Copy</span>
          </button>

          {/* Layout Toggle: Switch to Sidebar Layout */}
          <button
            onClick={() => setUILayout('sidebar')}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            title="Switch back to Sidebar Navigation"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden xl:inline">Sidebar Mode</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            data-tour="theme-toggle"
            className="w-9 h-9 rounded-xl border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* User Profile Avatar / Local Mode */}
          {appMode === 'local' ? (
            <div
              className="flex items-center gap-2 px-2.5 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] text-xs"
              title="Local Admin · Offline Mode"
            >
              <UserCheck className="w-3.5 h-3.5 text-[var(--text-primary)]" />
              <span className="hidden sm:inline font-medium text-[var(--text-primary)] whitespace-nowrap">
                Local Admin
              </span>
            </div>
          ) : user ? (
            <button
              onClick={signOut}
              className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] font-bold text-xs flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer shadow-2xs"
              title={`Sign out (${user.email})`}
            >
              {user.email[0].toUpperCase()}
            </button>
          ) : null}
        </div>
      </div>

      {/* Horizontal Navigation Tab Bar (Linear / Notion Style) */}
      <nav className="flex items-center px-4 sm:px-8 h-12 overflow-x-auto scrollbar-none gap-1 bg-[var(--bg-surface)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              data-tour={item.tourId}
              className={({ isActive }) =>
                `relative flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="top-tabs-active-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[var(--accent)] shadow-xs pointer-events-none"
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 shrink-0 relative z-10" />
                  <span className="relative z-10">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Global Command Palette */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Quick-Copy Drawer */}
      <QuickCopyPanel isOpen={isQuickCopyOpen} onClose={() => setIsQuickCopyOpen(false)} />
    </header>
  );
};
