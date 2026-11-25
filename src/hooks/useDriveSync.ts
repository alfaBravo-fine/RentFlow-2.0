import { useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { useAuthStore } from '../stores/authStore';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { db, DBEntityChangeEvent } from '../db/client';
import { BackupManifestEntry, GroupedBackupList } from '../lib/tauri/bridge';
import {
  getBackupList as fetchDriveBackupList,
  getGroupedBackupList as fetchDriveGroupedBackupList,
  isAutoSyncWriteSuppressed,
  pushChangeToGoogleDrive,
  pushToGoogleDrive as pushDriveSnapshot,
  restoreFromDrive as pullLatestDriveBackup,
  restoreFromSnapshot as restoreDriveSnapshot,
  revertChangeSnapshot as revertDriveChangeSnapshot,
} from '../lib/googleDriveService';

export type SyncState = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

const INSTANT_SYNC_DEBOUNCE_MS = 500;

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
  const appMode = useAuthStore((s) => s.appMode);
  const user = useAuthStore((s) => s.user);
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
  const hasQueuedFullUploadRef = useRef(false);
  const changeQueueRef = useRef<DBEntityChangeEvent[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushChangeQueue = useCallback(async () => {
    if (appMode !== 'cloud' || !user) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('idle');
      setSyncError(null);
      return;
    }
    if (isSyncingRef.current || changeQueueRef.current.length === 0) return;

    const batch = [...changeQueueRef.current];
    changeQueueRef.current = [];

    try {
      isSyncingRef.current = true;
      setSyncState('syncing');
      setSyncError(null);

      for (const change of batch) {
        const res = await pushChangeToGoogleDrive(change, user.sub);
        setLastDriveSync(res.syncedAt);
        if (res.fileId) {
          setDriveFileId(res.fileId);
        }
      }

      setSyncState('synced');
      setSyncError(null);
    } catch (err: unknown) {
      console.warn('[useDriveSync] Change snapshot upload error:', err);
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Auto-sync change upload failed';
      setSyncState('error');
      setSyncError(msg);
    } finally {
      isSyncingRef.current = false;
      if (changeQueueRef.current.length > 0) {
        void flushChangeQueue();
      }
    }
  }, [appMode, user, setLastDriveSync, setDriveFileId, setSyncState, setSyncError]);

  const triggerUpload = useCallback(async () => {
    if (appMode !== 'cloud' || !user) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    changeQueueRef.current = [];

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('idle');
      setSyncError(null);
      return;
    }

    if (isSyncingRef.current) {
      hasQueuedFullUploadRef.current = true;
      return;
    }

    let uploadSucceeded = false;

    try {
      isSyncingRef.current = true;
      setSyncState('syncing');
      setSyncError(null);

      const result = await pushDriveSnapshot(user.sub);
      setSyncState('synced');
      setSyncError(null);
      setLastDriveSync(result.syncedAt);
      if (result.fileId) {
        setDriveFileId(result.fileId);
      }
      uploadSucceeded = true;
      return result;
    } catch (err: unknown) {
      console.warn('[useDriveSync] Drive upload error:', err);
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Auto-sync upload failed';
      setSyncState('error');
      setSyncError(msg);
      throw err;
    } finally {
      isSyncingRef.current = false;
      if (hasQueuedFullUploadRef.current) {
        hasQueuedFullUploadRef.current = false;
        if (uploadSucceeded) {
          void triggerUpload().catch(() => {});
        }
      }
    }
  }, [appMode, user, setLastDriveSync, setDriveFileId, setSyncState, setSyncError]);

  const getBackupList = useCallback(async (): Promise<BackupManifestEntry[]> => {
    if (!user) {
      throw new Error('Please sign in with Google to view cloud backups.');
    }
    return fetchDriveBackupList();
  }, [user]);

  const getGroupedBackupList = useCallback(async (): Promise<GroupedBackupList> => {
    if (!user) {
      throw new Error('Please sign in with Google to view grouped cloud backups.');
    }
    return fetchDriveGroupedBackupList();
  }, [user]);

  const restoreFromSnapshot = useCallback(
    async (filename: string) => {
      if (!user) {
        throw new Error('Please sign in with Google to restore a full backup.');
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      setIsRestoring(true);
      setSyncState('syncing');
      setSyncError(null);

      try {
        const result = await restoreDriveSnapshot(filename);
        if (result.restored) {
          setSyncState('synced');
          const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
          setLastDriveSync(syncedTime);
        } else {
          setSyncState('idle');
        }
        setSyncError(null);
        return result;
      } catch (err: unknown) {
        const msg =
          typeof err === 'string'
            ? err
            : (err as { message?: string })?.message || 'Backup restore failed';
        setSyncState('error');
        setSyncError(msg);
        throw err;
      } finally {
        setIsRestoring(false);
      }
    },
    [user, setLastDriveSync, setIsRestoring, setSyncState, setSyncError]
  );

  const revertChangeSnapshot = useCallback(
    async (filename: string) => {
      if (!user) {
        throw new Error('Please sign in with Google to revert a recorded change.');
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      setIsRestoring(true);
      setSyncState('syncing');
      setSyncError(null);

      try {
        const result = await revertDriveChangeSnapshot(filename);
        if (result.restored) {
          setSyncState('synced');
          const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
          setLastDriveSync(syncedTime);
        } else {
          setSyncState('idle');
        }
        setSyncError(null);
        return result;
      } catch (err: unknown) {
        const msg =
          typeof err === 'string'
            ? err
            : (err as { message?: string })?.message || 'Change revert failed';
        setSyncState('error');
        setSyncError(msg);
        throw err;
      } finally {
        setIsRestoring(false);
      }
    },
    [user, setLastDriveSync, setIsRestoring, setSyncState, setSyncError]
  );

  const triggerRestore = useCallback(
    async (filename?: string) => {
      if (filename) {
        return restoreFromSnapshot(filename);
      }

      if (!user) {
        throw new Error('Please sign in with Google to restore your portfolio from Google Drive.');
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      setIsRestoring(true);
      setSyncState('syncing');
      setSyncError(null);

      try {
        const result = await pullLatestDriveBackup(null, user.sub);
        if (result.restored) {
          setSyncState('synced');
          const syncedTime = useAppSettingsStore.getState().lastDriveSync || new Date().toISOString();
          setLastDriveSync(syncedTime);
        } else {
          setSyncState('idle');
        }
        setSyncError(null);
        return result;
      } catch (err: unknown) {
        console.warn('[useDriveSync] Restore error:', err);
        const msg =
          typeof err === 'string'
            ? err
            : (err as { message?: string })?.message || 'Restore from Google Drive failed';
        setSyncState('error');
        setSyncError(msg);
        throw err;
      } finally {
        setIsRestoring(false);
      }
    },
    [user, restoreFromSnapshot, setLastDriveSync, setIsRestoring, setSyncState, setSyncError]
  );

  // Silent Smart Grouped Sync: queue every record mutation (500ms debounce) -> Small Change + automatic Full Backup
  useEffect(() => {
    if (appMode !== 'cloud' || !isAuthenticated || !user) return;

    const unsubscribe = db.onEntityChange((changeEvent) => {
      if (isAutoSyncWriteSuppressed()) return;
      if (!useAppSettingsStore.getState().autoSyncEnabled) return;

      changeQueueRef.current.push(changeEvent);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSyncState('pending');
      setSyncError(null);

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void flushChangeQueue();
      }, INSTANT_SYNC_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [appMode, isAuthenticated, user, flushChangeQueue, setSyncState, setSyncError]);

  useEffect(() => {
    if (appMode !== 'cloud' || !isAuthenticated || !user) return;

    const handleBeforeUnload = () => {
      const autoSync = useAppSettingsStore.getState().autoSyncEnabled;
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (autoSync && isOnline && !isSyncingRef.current && changeQueueRef.current.length > 0) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        void flushChangeQueue();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [appMode, isAuthenticated, user, flushChangeQueue]);

  return {
    syncState,
    lastSyncedAt,
    syncError,
    isRestoring,
    syncNow: triggerUpload,
    pushToGoogleDrive: triggerUpload,
    backupToDrive: triggerUpload,
    getBackupList,
    getGroupedBackupList,
    restoreFromSnapshot,
    revertChangeSnapshot,
    restoreFromDrive: triggerRestore,
  };
}
