import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'motion/react';
import { Logo } from './Logo';
import { Button } from './ui/Button';
import {
  Cloud,
  Database,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Check,
} from './icons';
import { AuthResponse } from '../lib/tauri/bridge';
import { useAuthStore, UserProfile } from '../stores/authStore';
import { useToast } from './toast/ToastContext';

export interface ModeSelectorProps {
  onSelectLocal: () => void;
  onSelectCloud: (profile: UserProfile) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  onSelectLocal,
  onSelectCloud,
}) => {
  const setGoogleSession = useAuthStore((s) => s.setGoogleSession);
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCancelLogin = async () => {
    try {
      await invoke('cancel_google_login');
    } catch {
      // Ignore invoke error if server already closed
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloudSelect = async () => {
    if (isLoading) return;
    setErrorMessage(null);
    setIsLoading(true);

    // Yield one paint frame so the 'Opening Browser...' spinner renders immediately
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });

    try {
      const authResponse = await invoke<AuthResponse>('google_login');
      if (!authResponse || !authResponse.email) {
        throw new Error('Google authentication returned an incomplete account profile.');
      }

      const profile: UserProfile = {
        sub: authResponse.id,
        email: authResponse.email,
        name: authResponse.name || authResponse.email.split('@')[0],
        picture: authResponse.picture,
      };

      setIsLoading(false);
      setGoogleSession(profile);
      onSelectCloud(profile);
    } catch (err: unknown) {
      setIsLoading(false);
      const rawMessage =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || '';
      const isCancelled =
        !rawMessage ||
        rawMessage.toLowerCase().includes('cancelled') ||
        rawMessage.toLowerCase().includes('timed out') ||
        rawMessage.toLowerCase().includes('denied');

      const friendlyToast = 'Google login was cancelled. You can try again anytime.';
      showToast({
        type: 'error',
        message: isCancelled ? friendlyToast : rawMessage || friendlyToast,
      });
      setErrorMessage(isCancelled ? friendlyToast : rawMessage || friendlyToast);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-base)] p-6 sm:p-10 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-4xl space-y-8 my-auto"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <Logo size={60} className="shadow-md" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[var(--accent)] tracking-wide">
              Step 1 of 2 · Welcome to RentFlow
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Choose How You Store Your Data
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
              Select whether to keep everything strictly on this computer or enable automatic encrypted backups to Google Drive.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="max-w-2xl mx-auto p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed break-words">{errorMessage}</span>
          </div>
        )}

        {/* Two Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left Card: Local Mode */}
          <div className="flex flex-col justify-between rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] p-7 card-shadow transition-colors hover:border-[var(--accent)]/60">
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center justify-center shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Local Only
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  Offline &amp; Private
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Keep all your property data strictly on this computer. No internet required. You can enable cloud backups later.
                </p>
              </div>

              <ul className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                <li className="flex items-center gap-2.5">
                  <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
                  <span>Private local database stored on your computer</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
                  <span>Starts immediately without Google sign-in</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
                  <span>Link Google Drive anytime in Settings</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                onClick={onSelectLocal}
                disabled={isLoading}
                className="w-full h-11 justify-center gap-2 text-sm font-semibold rounded-xl cursor-pointer whitespace-nowrap"
              >
                <span>Choose Offline &amp; Private</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Button>
            </div>
          </div>

          {/* Right Card: Cloud Mode */}
          <div className="flex flex-col justify-between rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent)]/50 p-7 card-shadow transition-colors hover:border-[var(--accent)]">
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Cloud className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-[var(--accent)]">
                  Recommended
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  Cloud Backup
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Securely sync your data to your Google Drive. Highly recommended for data safety.
                </p>
              </div>

              <ul className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Encrypted snapshots in your RentFlow Grouped Backups folder</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Instant automatic sync after every record change</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Point-in-time snapshot restore across devices</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-[var(--border-subtle)] space-y-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleCloudSelect()}
                disabled={isLoading}
                className="w-full h-11 justify-center gap-2 text-sm font-semibold rounded-xl cursor-pointer whitespace-nowrap"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Opening Browser...</span>
                  </>
                ) : (
                  <>
                    <span>Choose Cloud Backup</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </>
                )}
              </Button>

              {isLoading && (
                <button
                  type="button"
                  onClick={() => void handleCancelLogin()}
                  className="w-full py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Cancel sign-in
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ModeSelector;
