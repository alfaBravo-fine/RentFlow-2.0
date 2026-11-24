import React, { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRoutes } from './routes';
import { LoginView } from './features/auth/LoginView';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import { ToastProvider } from './components/toast/ToastContext';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { initAutomatedLateFeeSchedule } from './lib/autoLateFeeEngine';
import { useDriveSync } from './hooks/useDriveSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal';
import { PrintProvider } from './components/print/PrintContext';
import { SplashScreen } from './components/common/SplashScreen';
import { DATA_PATH_STORAGE_KEY } from './components/SetupWizard';
import { ModeSelector } from './components/ModeSelector';
import { StorageSelector } from './components/StorageSelector';
import {
  WelcomeRestoreScreen,
  getCloudOnboardingStorageKey,
} from './components/WelcomeRestoreScreen';
import { databaseService } from './db/DatabaseService';
import { getBackupList, isLocalDatabaseEmpty } from './lib/googleDriveService';
import { BackupManifestEntry } from './lib/tauri/bridge';
import { AppMode, useAuthStore, UserProfile } from './stores/authStore';

const queryClient = new QueryClient();

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RentFlow ErrorBoundary]:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)] p-6">
          <div className="max-w-md w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] p-6 shadow-lg space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Something went wrong</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {this.state.errorMessage}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl border border-[var(--border-strong)] text-xs font-medium cursor-pointer"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface OnboardingWizardProps {
  onFinished: (configuredPath: string) => void;
}

function OnboardingWizard({ onFinished }: OnboardingWizardProps) {
  const existingUser = useAuthStore((s) => s.user);
  const [selectedMode, setSelectedMode] = useState<AppMode | null>(null);
  const [cloudUser, setCloudUser] = useState<UserProfile | null>(existingUser);

  if (!selectedMode) {
    return (
      <ModeSelector
        onSelectLocal={() => {
          setSelectedMode('local');
        }}
        onSelectCloud={(profile) => {
          setCloudUser(profile);
          setSelectedMode('cloud');
        }}
      />
    );
  }

  return (
    <StorageSelector
      mode={selectedMode}
      userEmail={cloudUser?.email}
      onBack={() => setSelectedMode(null)}
      onComplete={onFinished}
    />
  );
}

function AuthenticatedContent() {
  const { user } = useAuth();
  const appMode = useAuthStore((s) => s.appMode);
  const [isDbReady, setIsDbReady] = useState(false);
  const [welcomeBackups, setWelcomeBackups] = useState<BackupManifestEntry[] | null>(null);
  const { syncNow, isRestoring } = useDriveSync();
  const { isHelpOpen, setIsHelpOpen } = useKeyboardShortcuts(syncNow);

  useEffect(() => {
    let active = true;
    let cleanupLateFees: (() => void) | undefined;

    (async () => {
      try {
        await databaseService.initialize();
        cleanupLateFees = initAutomatedLateFeeSchedule();

        if (
          appMode === 'cloud' &&
          user?.sub &&
          isLocalDatabaseEmpty() &&
          typeof localStorage !== 'undefined' &&
          !localStorage.getItem(getCloudOnboardingStorageKey(user.sub)) &&
          (typeof navigator === 'undefined' || navigator.onLine !== false)
        ) {
          try {
            const backups = await getBackupList();
            if (active && Array.isArray(backups) && backups.length > 0) {
              setWelcomeBackups(backups);
            }
          } catch (cloudCheckErr) {
            console.warn('[App] Could not check cloud snapshots on empty DB:', cloudCheckErr);
          }
        }
      } catch (err) {
        console.warn('[App] Database initialization notice:', err);
      } finally {
        if (active) {
          setIsDbReady(true);
        }
      }
    })();

    return () => {
      active = false;
      cleanupLateFees?.();
    };
  }, [appMode, user?.sub]);

  if (!isDbReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-secondary)] p-6">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 space-y-3">
          <div className="h-4 w-36 rounded bg-[var(--bg-surface-sunken)] animate-pulse" />
          <div className="h-3 w-full rounded bg-[var(--bg-surface-sunken)] animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-[var(--bg-surface-sunken)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (appMode === 'cloud' && welcomeBackups && welcomeBackups.length > 0 && user) {
    return (
      <WelcomeRestoreScreen
        userId={user.sub}
        userEmail={user.email}
        snapshots={welcomeBackups}
        onComplete={() => setWelcomeBackups(null)}
      />
    );
  }

  return (
    <>
      <Layout>
        {isRestoring && (
          <div className="bg-indigo-600 text-white text-xs py-2 px-4 text-center font-semibold tracking-wide shrink-0">
            Restoring your portfolio data from Google Drive...
          </div>
        )}
        <AppRoutes />
      </Layout>
      <KeyboardShortcutsModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}

interface AppShellProps {
  configuredDataPath: string | null;
  onOnboardingComplete: (configuredPath: string) => void;
}

function AppShell({ configuredDataPath, onOnboardingComplete }: AppShellProps) {
  const { isAuthenticated, user } = useAuth();
  const appMode = useAuthStore((s) => s.appMode);

  if (configuredDataPath === null || appMode === null) {
    return <OnboardingWizard onFinished={onOnboardingComplete} />;
  }

  if (appMode === 'cloud' && (!isAuthenticated || !user)) {
    return <LoginView />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthenticatedContent />
    </QueryClientProvider>
  );
}

export default function App() {
  const [configuredDataPath, setConfiguredDataPath] = useState<string | null>(() => {
    if (typeof localStorage === 'undefined') return 'configured';
    return localStorage.getItem(DATA_PATH_STORAGE_KEY);
  });

  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <SplashScreen durationMs={1500} />
        <AppErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <PrintProvider>
                  <AppShell
                    configuredDataPath={configuredDataPath}
                    onOnboardingComplete={(path) => setConfiguredDataPath(path)}
                  />
                </PrintProvider>
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </AppErrorBoundary>
        <div id="print-root" className="hidden bg-white text-black"></div>
      </HashRouter>
    </MotionConfig>
  );
}
