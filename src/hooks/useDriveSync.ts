import { useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { useAuthStore } from '../stores/authStore';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { db } from '../db/client';
import {
  backupToDrive,
  restoreFromDrive,
  syncOnStartup,
  isNonOAuthToken,
} from '../lib/googleDriveService';
import {
  isTauri,
  tauriDbExportAll,
  tauriDrivePushBackup,
  tauriDrivePullBackup,
} from '../lib/tauri/bridge';

export type SyncState = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

interface DriveSyncStore {
  syncState: SyncState;
  isRestoring: boolean;
  syncError: string | null;
  setSyncState: (syncState: SyncState) => void;
  setIsRestoring: (isRestoring: boolean) => void;
  setSyncError: (syncError: string | null) => void;
}

const useDriveSyncStore = create<DriveSyncStore>((set) => ({
  syncState: 'idle',
  isRestoring: false,
  syncError: null,
  setSyncState: (syncState) => set({ syncState }),
  setIsRestoring: (isRestoring) => set({ isRestoring }),
  setSyncError: (syncError) => set({ syncError }),
}));

export function useDriveSync() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const lastSyncedAt = useAppSettingsStore((s) => s.lastDriveSync);
  const setLastDriveSync = useAppSettingsStore((s) => s.setLastDriveSync);
  const setDriveFileId = useAppSettingsStore((s) => s.setDriveFileId);

  const syncState = useDriveSyncStore((s) => s.syncState);
  const isRestoring = useDriveSyncStore((s) => s.isRestoring);
  const syncError = useDriveSyncStore((s) => s.syncError);
  const setSyncState = useDriveSyncStore((s) => s.setSyncState);
  const setIsRestoring = useDriveSyncStore((s) => s.setIsRestoring);
  const setSyncError = useDriveSyncStore((s) => s.setSyncError);

  const isSyncingRef = useRef(false);
  const hasQueuedSyncRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerUpload = useCallback(async () => {
    if (!user) return;
    if (!isTauri() && !accessToken) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('idle');
      setSyncError(null);
      return;
    }

    if (!isTauri() && isNonOAuthToken(accessToken)) {
      setSyncState('idle');
      setSyncError(null);
      return;
    }

    if (isSyncingRef.current) {
      hasQueuedSyncRef.current = true;
      return;
    }

    let uploadSucceeded = false;

    try {
      isSyncingRef.current = true;
      setSyncState('syncing');
      setSyncError(null);

      if (isTauri()) {
        const result = await tauriDrivePushBackup(user.sub);
        setSyncState('synced');
        setSyncError(null);
        setLastDriveSync(result.synced_at);
        if (result.file_id) {
          setDriveFileId(result.file_id);
        }
      } else {
        const result = await backupToDrive(accessToken, user.sub);
        setSyncState('synced');
        setSyncError(null);
        setLastDriveSync(result.syncedAt);
        if (result.fileId) {
          setDriveFileId(result.fileId);
        }
      }
      uploadSucceeded = true;
    } catch (err: unknown) {
      console.warn('[useDriveSync] Drive upload error:', err);
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Auto-sync upload failed';
      setSyncState('error');
      setSyncError(msg);
    } finally {
      isSyncingRef.current = false;
      if (hasQueuedSyncRef.current) {
        hasQueuedSyncRef.current = false;
        if (uploadSucceeded) {
          void triggerUpload();
        }
      }
    }
  }, [user, accessToken, setLastDriveSync, setDriveFileId, setSyncState, setSyncError]);

  const triggerRestore = useCallback(async () => {
    if (!user) {
      throw new Error('Please sign in with Google to restore your portfolio from Google Drive.');
    }
    if (!isTauri() && !accessToken) {
      throw new Error('Desktop Google OAuth session required for Drive restore.');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('You are currently offline. Connect to the internet to restore from Google Drive.');
    }

    setIsRestoring(true);
    setSyncState('syncing');
    setSyncError(null);

    try {
      if (isTauri()) {
        const result = await tauriDrivePullBackup(user.sub);
        if (result.restored) {
          const snapshot = await tauriDbExportAll();
          await db.importAllDataAsync(snapshot, false);
          setSyncState('synced');
          const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
          setLastDriveSync(syncedTime);
        } else {
          setSyncState('idle');
        }
        setSyncError(null);
        return { restored: result.restored, message: result.message, totalRecords: 0 };
      } else {
        const result = await restoreFromDrive(accessToken, user.sub);
        if (result.restored) {
          setSyncState('synced');
          const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
          setLastDriveSync(syncedTime);
        } else {
          setSyncState('idle');
        }
        setSyncError(null);
        return result;
      }
    } catch (err: any) {
      console.warn('[useDriveSync] Restore error:', err);
      const msg = err?.message || 'Restore from Google Drive failed';
      setSyncState('error');
      setSyncError(msg);
      throw err;
    } finally {
      setIsRestoring(false);
    }
  }, [user, accessToken, setLastDriveSync, setIsRestoring, setSyncState, setSyncError]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (!isTauri() && (!accessToken || isNonOAuthToken(accessToken))) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsRestoring(false);
      setSyncState('idle');
      setSyncError(null);
      return;
    }

    let isMounted = true;
    const runStartupSync = async () => {
      try {
        setIsRestoring(true);
        setSyncState('syncing');
        setSyncError(null);

        if (isTauri()) {
          const result = await tauriDrivePullBackup(user.sub);
          if (!isMounted) return;

          if (result.restored) {
            const snapshot = await tauriDbExportAll();
            await db.importAllDataAsync(snapshot, false);
            setSyncState('synced');
            const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
            setLastDriveSync(syncedTime);
          } else {
            setSyncState('idle');
          }
        } else if (accessToken) {
          const result = await syncOnStartup(accessToken, user.sub);
          if (!isMounted) return;

          if (result.restored) {
            setSyncState('synced');
            const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
            setLastDriveSync(syncedTime);
          } else {
            setSyncState('idle');
          }
        }
      } catch (err: any) {
        console.warn('[useDriveSync] Startup sync warning:', err);
        if (isMounted) {
          setSyncState('idle');
        }
      } finally {
        if (isMounted) {
          setIsRestoring(false);
        }
      }
    };

    runStartupSync();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user, accessToken, setLastDriveSync, setIsRestoring, setSyncState, setSyncError]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const unsubscribe = db.onWrite(() => {
      if (!useAppSettingsStore.getState().autoSyncEnabled) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSyncState('pending');
      setSyncError(null);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void triggerUpload().catch(() => {});
      }, 2000);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isAuthenticated, user, triggerUpload, setSyncState, setSyncError]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleBeforeUnload = () => {
      const autoSync = useAppSettingsStore.getState().autoSyncEnabled;
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (autoSync && isOnline && !isSyncingRef.current && (isTauri() || !isNonOAuthToken(accessToken))) {
        void triggerUpload().catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, user, accessToken, triggerUpload]);

  return {
    syncState,
    lastSyncedAt,
    syncError,
    isRestoring,
    syncNow: triggerUpload,
    backupToDrive: triggerUpload,
    restoreFromDrive: triggerRestore,
  };
}
