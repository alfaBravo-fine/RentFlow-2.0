import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TopNavTabs } from './TopNavTabs';
import { CommandPalette } from './CommandPalette';
import { db } from '../../db/client';
import { Lease, MaintenanceRequest } from '../../db/schema';
import { ChevronRight, X } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { useUIStore } from '../../stores/uiStore';
import { useAppTour } from '../../hooks/useAppTour';

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, toggleTheme, isGlassTheme } = useTheme();
  const { uiLayout } = useUIStore();
  useAppTour(true);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [isGlobalCommandOpen, setIsGlobalCommandOpen] = useState(false);

  // Keep Settings layout shell mounted while sub-routes animate independently inside SettingsView
  const pageTransitionKey = location.pathname.startsWith('/settings')
    ? '/settings'
    : location.pathname;

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsGlobalCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check for critical items (e.g. leases expiring within 30 days or emergency maintenance)
  const leases = db.getTable<Lease>('leases');
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests');
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const urgentExpiring = leases.filter((l) => {
    if (l.status === 'expired' || l.status === 'terminated') return false;
    const endMs = new Date(l.end_date).getTime();
    return endMs - now <= thirtyDaysMs;
  });

  const emergencyMaintenance = maintenance.filter(
    (m) => (m.urgency === 'emergency' || m.urgency === 'high') && m.status !== 'completed' && m.status !== 'closed'
  );

  const hasUrgentAlert = !isBannerDismissed && (urgentExpiring.length > 0 || emergencyMaintenance.length > 0);

  const renderPageContent = () => (
    <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 w-full max-w-full">
      <div className="max-w-[1400px] mx-auto w-full max-w-full overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageTransitionKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );

  const renderUrgentBanner = () =>
    hasUrgentAlert ? (
      <div className="no-print bg-amber-500/10 border-b border-amber-500/20 px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
        <div className="flex items-center gap-2.5 truncate">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span className="font-semibold shrink-0">Priority Attention:</span>
          <span className="truncate">
            {urgentExpiring.length > 0 && `${urgentExpiring.length} lease(s) expiring within 30 days. `}
            {emergencyMaintenance.length > 0 && `${emergencyMaintenance.length} high-urgency maintenance request(s) open.`}
          </span>
          <button
            onClick={() => navigate(urgentExpiring.length > 0 ? '/leases' : '/maintenance')}
            className="font-semibold underline hover:text-amber-950 dark:hover:text-white shrink-0 ml-1 cursor-pointer flex items-center gap-0.5"
          >
            <span>Review Now</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <button
          onClick={() => setIsBannerDismissed(true)}
          className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white p-1 rounded-md cursor-pointer ml-2"
          title="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    ) : null;

  const shellBackgroundClass = isGlassTheme
    ? 'bg-transparent text-[var(--text-primary)]'
    : 'bg-[var(--bg-base)] text-[var(--text-primary)]';

  // --- TOP-TABS LAYOUT MODE ---
  if (uiLayout === 'top-tabs') {
    return (
      <div className={`flex flex-col h-full w-full flex-1 min-h-0 overflow-hidden ${shellBackgroundClass}`}>
        <TopNavTabs />
        {renderUrgentBanner()}
        {renderPageContent()}
        <CommandPalette isOpen={isGlobalCommandOpen} onClose={() => setIsGlobalCommandOpen(false)} />
      </div>
    );
  }

  // --- SIDEBAR LAYOUT MODE (Default) ---
  return (
    <div className={`flex h-full w-full flex-1 min-h-0 overflow-hidden ${shellBackgroundClass}`}>
      <Sidebar
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Topbar
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
        />
        {renderUrgentBanner()}
        {renderPageContent()}
      </div>

      <CommandPalette isOpen={isGlobalCommandOpen} onClose={() => setIsGlobalCommandOpen(false)} />
    </div>
  );
};

export const AppLayout = Layout;
export default Layout;
