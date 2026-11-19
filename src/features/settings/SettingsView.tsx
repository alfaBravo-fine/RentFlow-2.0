import React from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Settings as SettingsIcon, Palette, Database, Info } from '../../components/icons';
import { SettingsGeneral } from './SettingsGeneral';

interface SettingsNavItem {
  to: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_NAV: SettingsNavItem[] = [
  {
    to: '/settings/general',
    label: 'General',
    subtitle: 'Preferences & Startup',
    icon: SettingsIcon,
  },
  {
    to: '/settings/appearance',
    label: 'Appearance',
    subtitle: 'Themes & Layout',
    icon: Palette,
  },
  {
    to: '/settings/data',
    label: 'Data & Storage',
    subtitle: 'Backup, Excel & Reset',
    icon: Database,
  },
  {
    to: '/settings/about',
    label: 'About',
    subtitle: 'Version & Legal',
    icon: Info,
  },
];

export const SettingsView: React.FC = () => {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Settings
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Configure desktop preferences, themes, data storage, and application details.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Left-Side Sub-Menu */}
        <aside className="w-full md:w-64 shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-2.5 card-shadow">
          <nav aria-label="Settings categories" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {SETTINGS_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors duration-150 shrink-0 md:shrink ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="settings-subnav-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className="absolute inset-0 rounded-xl bg-[var(--accent)]/12 border border-[var(--accent)]/15 shadow-xs pointer-events-none"
                        />
                      )}
                      <Icon className="w-4 h-4 shrink-0 relative z-10" />
                      <div className="min-w-0 relative z-10 text-left">
                        <div className="text-xs font-semibold leading-tight whitespace-nowrap">
                          {item.label}
                        </div>
                        <div className="text-[11px] opacity-75 truncate hidden md:block mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* Right-Side Content Pane with Fade + Slide-Up Transition */}
        <section className="flex-1 min-w-0 w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {outlet ?? <SettingsGeneral />}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
};

export const Settings = SettingsView;
export default SettingsView;
