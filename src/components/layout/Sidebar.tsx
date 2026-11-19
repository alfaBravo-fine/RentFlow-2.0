import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { Logo } from '../Logo';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
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
  X,
  ChevronLeft,
  ChevronRight,
  Folder,
  UserCheck,
  Calendar,
} from '../icons';

export interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const isCollapsed = useAppSettingsStore((s) => s.sidebarCollapsed);
  const toggleCollapse = useAppSettingsStore((s) => s.toggleSidebarCollapsed);

  const navSections: Array<{
    category: string;
    items: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }>; tourId?: string }>;
  }> = [
    {
      category: 'PROPERTY',
      items: [
        { to: '/', label: 'Dashboard', icon: Home },
        { to: '/properties', label: 'Properties & Units', icon: Building2, tourId: 'sidebar-properties' },
        { to: '/map', label: 'Interactive Map', icon: Map },
        { to: '/maintenance', label: 'Maintenance Board', icon: Wrench, tourId: 'maintenance-tab' },
      ],
    },
    {
      category: 'PEOPLE',
      items: [
        { to: '/tenants', label: 'Tenants Directory', icon: Users, tourId: 'sidebar-tenants' },
        { to: '/leases', label: 'Leases & Deposits', icon: FileText, tourId: 'sidebar-leases' },
        { to: '/vendors', label: 'Vendors', icon: HardHat },
      ],
    },
    {
      category: 'FINANCE',
      items: [
        { to: '/invoices', label: 'Rent Roll & Invoicing', icon: Receipt, tourId: 'sidebar-invoicing' },
        { to: '/utility-splitter', label: 'Utility Bill Splitter', icon: Calculator },
        { to: '/expenses', label: 'Expenses & Income', icon: Banknote },
        { to: '/owners', label: 'Owner Statements', icon: UserCheck },
        { to: '/reports', label: 'Reports & Statements', icon: BarChart3 },
      ],
    },
    {
      category: 'TOOLS & SYSTEM',
      items: [
        { to: '/calendar', label: 'Calendar', icon: Calendar },
        { to: '/area-calculator', label: 'Land Calculator', icon: Layers },
        { to: '/documents', label: 'Document Vault', icon: Folder },
        { to: '/sync', label: 'Drive Sync', icon: RefreshCw },
        { to: '/settings', label: 'Settings', icon: Settings, tourId: 'settings-tab' },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Modern Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] transition-all duration-200 shrink-0 select-none ${
          isOpenMobile ? 'translate-x-0 w-[260px] shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${
          isCollapsed ? 'md:w-[72px] lg:w-[72px]' : 'md:w-[72px] lg:w-[260px]'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.06, rotate: -2 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="shrink-0 flex items-center justify-center rounded-lg shadow-xs cursor-pointer"
            >
              <Logo size={32} />
            </motion.div>
            <div
              className={`flex flex-col transition-opacity duration-150 ${
                isCollapsed ? 'md:hidden' : 'md:hidden lg:flex'
              }`}
            >
              <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
                RentFlow
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                Desktop Edition
              </span>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navSections.map((section, sIdx) => (
            <div key={section.category} className="space-y-1">
              <div
                className={`px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] select-none ${
                  isCollapsed ? 'md:hidden' : 'md:hidden lg:block'
                }`}
              >
                {section.category}
              </div>
              {isCollapsed && sIdx > 0 && (
                <div className="hidden md:block lg:hidden my-2 border-t border-[var(--border-subtle)]" />
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onCloseMobile}
                    title={item.label}
                    data-tour={item.tourId}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors duration-150 ${
                        isCollapsed ? 'md:justify-center' : 'md:justify-center lg:justify-start'
                      } ${
                        isActive
                          ? 'text-[var(--accent)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] font-medium'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-pill"
                            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                            className="absolute inset-0 rounded-xl bg-[var(--accent)]/12 border border-[var(--accent)]/15 shadow-xs pointer-events-none"
                          />
                        )}
                        <Icon className="w-4 h-4 shrink-0 relative z-10" />
                        <span
                          className={`min-w-0 truncate relative z-10 ${
                            isCollapsed ? 'md:hidden' : 'md:hidden lg:inline'
                          }`}
                        >
                          {item.label}
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Section: Collapsible Toggle */}
        <div className="p-3 border-t border-[var(--border-subtle)] space-y-2 bg-[var(--bg-surface)]">
          {/* Desktop Collapse Toggle */}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
