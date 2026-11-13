import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ShieldCheck, Lock, RefreshCw, AlertCircle, Database, Folder } from '../../components/icons';
import { RentFlowLogo } from '../../components/brand/RentFlowLogo';
import { isTauri as detectTauri, tauriDrivePullBackup, tauriGoogleLogin } from '../../lib/tauri/bridge';

export const LoginView: React.FC = () => {
  const isTauri = detectTauri();
  const setAuthenticating = useAuthStore((s) => s.setAuthenticating);
  const setGoogleSession = useAuthStore((s) => s.setGoogleSession);
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating);
  const authError = useAuthStore((s) => s.authError);

  const [statusText, setStatusText] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setAuthenticating(true, null);

    if (!isTauri) {
      setAuthenticating(
        false,
        'Native Desktop Loopback OAuth requires running RentFlow inside the Tauri Desktop application.'
      );
      return;
    }

    try {
      setStatusText('Opening your default browser for Google Sign-In (127.0.0.1 loopback)...');
      const profile = await tauriGoogleLogin();

      if (!profile || !profile.email) {
        throw new Error('Google sign-in returned an incomplete user profile.');
      }

      setStatusText('Authenticated! Checking Google Drive appDataFolder for encrypted backup...');
      try {
        await tauriDrivePullBackup(profile.id);
      } catch (e) {
        console.warn('[Desktop Backup Pull] Non-fatal backup check notice:', e);
      }

      setGoogleSession({
        sub: profile.id,
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        picture: profile.picture,
      });
    } catch (err: unknown) {
      console.error('[Desktop Sign-in Error]:', err);
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Desktop Google OAuth loopback failed.';
      setAuthenticating(false, msg);
    } finally {
      setStatusText(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)] p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md space-y-6 text-center my-auto">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-md mb-4">
            <RentFlowLogo size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            RentFlow Desktop
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
            Property Management Suite &bull; Native OAuth 2.0 Loopback
          </p>
        </div>

        <Card className="p-6 sm:p-8 space-y-6 text-left border border-[var(--border-strong)] rounded-2xl shadow-lg bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2 min-w-0">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider truncate">
              Desktop Authentication
            </span>
            <Badge variant="success" className="gap-1 shrink-0">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Stronghold Vault</span>
            </Badge>
          </div>

          <div className="space-y-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <strong className="text-[var(--text-primary)]">Native System Browser Flow:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Clicking Sign In launches a local 127.0.0.1 PKCE loopback listener and opens Google consent in your system browser.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <strong className="text-[var(--text-primary)]">Isolated Rust Token Storage:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Access and refresh tokens remain inside the encrypted Rust Stronghold vault and never touch the UI layer.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <strong className="text-[var(--text-primary)]">SQLite + Encrypted Drive Backup:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  All portfolio records stay in local SQLite (<code className="font-mono text-[10px] bg-[var(--bg-base)] px-1 py-0.5 rounded">rentflow.db</code>) with optional <code className="font-mono text-[10px] bg-[var(--bg-base)] px-1 py-0.5 rounded">appDataFolder</code> sync.
                </p>
              </div>
            </div>
          </div>

          {isAuthenticating && (
            <div className="p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-xs text-[var(--accent)] flex items-center gap-3">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <div className="min-w-0">
                <strong className="block font-semibold">Waiting for Google Authorization...</strong>
                <span className="text-[11px] opacity-90 block break-words">
                  {statusText || 'Complete sign-in in your browser...'}
                </span>
              </div>
            </div>
          )}

          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{authError}</span>
            </div>
          )}

          <div className="pt-2 space-y-3">
            <Button
              type="button"
              variant="primary"
              className="w-full py-3 h-12 gap-3 font-semibold text-sm rounded-xl cursor-pointer shadow-md transition-all active:scale-[0.99]"
              onClick={handleGoogleLogin}
              disabled={isAuthenticating}
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isAuthenticating ? 'Connecting to Google...' : 'Sign in with Google'}</span>
            </Button>

            <p className="text-[10px] font-mono text-[var(--text-secondary)] mt-2 text-center bg-[var(--bg-base)] p-1.5 rounded border border-[var(--border-subtle)] truncate">
              Environment: {isTauri ? 'Windows Desktop (Tauri v2 Loopback)' : 'Browser Preview (Desktop Auth Required)'}
            </p>
          </div>
        </Card>

        <p className="text-[11px] text-[var(--text-secondary)]">
          RentFlow Property Manager &bull; Native Rust Loopback OAuth
        </p>
      </div>
    </div>
  );
};
