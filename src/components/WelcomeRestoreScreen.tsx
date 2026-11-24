import React, { useState } from 'react';
import { Logo } from './Logo';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import {
  Calendar,
  Cloud,
  Database,
  Download,
  History,
  Plus,
  RefreshCw,
  ShieldCheck,
} from './icons';
import { BackupManifestEntry, tauriDbInit } from '../lib/tauri/bridge';
import { useDriveSync } from '../hooks/useDriveSync';
import { formatSnapshotSummary, RestoreModal } from './RestoreModal';
import { useToast } from './toast/ToastContext';

export const CLOUD_ONBOARDING_STORAGE_PREFIX = 'rentflow_cloud_onboarding_done_';

export function getCloudOnboardingStorageKey(userId: string): string {
  return `${CLOUD_ONBOARDING_STORAGE_PREFIX}${userId}`;
}

export function clearCloudOnboardingFlags(): void {
  if (typeof localStorage === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CLOUD_ONBOARDING_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export interface WelcomeRestoreScreenProps {
  userId: string;
  userEmail?: string;
  snapshots: BackupManifestEntry[];
  onComplete: () => void;
}

export const WelcomeRestoreScreen: React.FC<WelcomeRestoreScreenProps> = ({
  userId,
  userEmail,
  snapshots,
  onComplete,
}) => {
  const { restoreFromSnapshot } = useDriveSync();
  const { showToast } = useToast();

  const [isRestoringLatest, setIsRestoringLatest] = useState(false);
  const [isStartingFresh, setIsStartingFresh] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const latestSnapshot = snapshots[0];
  const latestSummary = latestSnapshot ? formatSnapshotSummary(latestSnapshot) : '';

  const handleRestoreLatest = async () => {
    if (!latestSnapshot) return;
    setErrorMessage(null);
    setIsRestoringLatest(true);
    try {
      const res = await restoreFromSnapshot(latestSnapshot.filename);
      localStorage.setItem(getCloudOnboardingStorageKey(userId), 'restored');
      showToast({
        type: 'success',
        message: `Restored ${res.totalRecords} records from your latest Google Drive snapshot.`,
      });
      onComplete();
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Could not restore latest snapshot.';
      setErrorMessage(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setIsRestoringLatest(false);
    }
  };

  const handleStartFresh = async () => {
    setErrorMessage(null);
    setIsStartingFresh(true);
    try {
      await tauriDbInit().catch(() => {});
      localStorage.setItem(getCloudOnboardingStorageKey(userId), 'fresh');
      showToast({
        type: 'info',
        message: 'Started with an empty local database. Your cloud snapshots remain untouched.',
      });
      onComplete();
    } finally {
      setIsStartingFresh(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-base)] p-4 sm:p-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <Logo size={60} className="shadow-md" />
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud Backups Detected{userEmail ? ` • ${userEmail}` : ''}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Welcome Back to RentFlow
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              It looks like you have cloud backups! Would you like to restore your latest data, or start fresh?
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8 space-y-5 border border-[var(--border-strong)] rounded-2xl modal-shadow bg-[var(--bg-surface)]">
          {latestSnapshot && (
            <div className="p-4 rounded-xl bg-[var(--bg-surface-sunken)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  <Calendar className="w-4 h-4 text-[var(--accent)]" />
                  <span>{latestSummary}</span>
                </div>
                <Badge variant="success">
                  {snapshots.length} {snapshots.length === 1 ? 'Snapshot' : 'Snapshots'}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                <span className="font-mono">{latestSnapshot.filename}</span>
                {typeof latestSnapshot.record_count === 'number' && (
                  <span className="inline-flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    <span>{latestSnapshot.record_count} records</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Starting fresh creates a clean local SQLite database without deleting your existing snapshot history in Google Drive.
            </span>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleStartFresh()}
              disabled={isRestoringLatest || isStartingFresh}
              className="h-11 px-5 gap-2 justify-center"
            >
              <Plus className="w-4 h-4" />
              <span>{isStartingFresh ? 'Initializing Empty DB...' : 'Start Fresh'}</span>
            </Button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {snapshots.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsRestoreModalOpen(true)}
                  disabled={isRestoringLatest || isStartingFresh}
                  className="h-11 px-4 gap-1.5 text-xs"
                >
                  <History className="w-4 h-4" />
                  <span>Choose Date</span>
                </Button>
              )}

              <Button
                type="button"
                variant="primary"
                onClick={() => void handleRestoreLatest()}
                disabled={isRestoringLatest || isStartingFresh}
                className="h-11 px-6 gap-2 font-semibold justify-center"
              >
                {isRestoringLatest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Restoring Latest...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Restore Latest</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <RestoreModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onRestored={() => {
          localStorage.setItem(getCloudOnboardingStorageKey(userId), 'restored');
          onComplete();
        }}
      />
    </div>
  );
};

export default WelcomeRestoreScreen;
