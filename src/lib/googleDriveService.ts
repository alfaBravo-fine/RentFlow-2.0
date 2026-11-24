import { invoke } from '@tauri-apps/api/core';
import { db } from '../db/client';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore, ColorPalette, applyThemeToDOM } from '../stores/themeStore';
import { usePackStore } from '../countries/usePack';
import { useUIStore, UILayout } from '../stores/uiStore';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { BackupManifestEntry, TauriPullResult, TauriSyncResult } from './tauri/bridge';

export type { BackupManifestEntry };
export const APP_DATA_BACKUP_FILENAME = 'RentFlow_FullBackup.enc';
export const LEGACY_BACKUP_FILENAME = 'RentFlowBackup.enc';
export const DRIVE_MANIFEST_FILENAME = 'manifest.json';

export const CORE_PORTFOLIO_TABLES = [
  'properties',
  'units',
  'tenants',
  'leases',
  'invoices',
  'payments',
  'expenses',
  'vendors',
  'maintenance_requests',
  'owners',
  'documents',
] as const;

export interface AppSettingsState {
  currency: string;
  countryCode: string;
  exportDestination: string;
  exportPaths?: string[];
  autoSyncEnabled: boolean;
  agencyCommissionPct: number;
  maintenanceApprovalThresholdMinor: number;
  uiLayout: string;
  calendarTodos: any[];
  mapPosition: any;
  sidebarCollapsed: boolean;
  notificationsState: any;
}

export interface AppThemeState {
  mode: 'light' | 'dark';
  colorPalette: string;
}

export interface FullBackupPayload {
  app: string;
  version: string;
  backupType: string;
  exportedAt: string;
  userId: string;
  userEmail: string;
  tables: Record<string, any[]>;
  data: Record<string, any[]>;
  settings: AppSettingsState;
  themes: AppThemeState;
  properties?: any[];
  units?: any[];
  tenants?: any[];
  leases?: any[];
  invoices?: any[];
  payments?: any[];
  expenses?: any[];
  vendors?: any[];
  maintenance?: any[];
  maintenance_requests?: any[];
  documents?: any[];
  [key: string]: any;
}

/**
 * Collects all current user settings from centralized stores into a unified object.
 */
export function collectAppSettings(): AppSettingsState {
  const settings = useAppSettingsStore.getState();
  const countryCode = usePackStore.getState().countryCode || 'US';
  const uiLayout = useUIStore.getState().uiLayout || 'sidebar';
  const exportPath = settings.exportDestination || 'C:\\Users\\Documents\\RentFlowExports';

  return {
    currency: countryCode,
    countryCode,
    exportDestination: exportPath,
    exportPaths: [exportPath],
    autoSyncEnabled: settings.autoSyncEnabled,
    agencyCommissionPct: settings.agencyCommissionPct,
    maintenanceApprovalThresholdMinor: settings.maintenanceApprovalThresholdMinor,
    uiLayout,
    calendarTodos: settings.calendarTodos,
    mapPosition: settings.mapPosition,
    sidebarCollapsed: settings.sidebarCollapsed,
    notificationsState: settings.notificationsState,
  };
}

/**
 * Collects the current theme configuration.
 */
export function collectAppTheme(): AppThemeState {
  const theme = useThemeStore.getState().theme;
  return {
    mode: theme.mode === 'dark' ? 'dark' : 'light',
    colorPalette: theme.colorPalette || (theme.mode === 'dark' ? 'midnight' : 'classic'),
  };
}

/**
 * Restores chosen theme (Dark/Light, Color Palette) and settings (Currency, Export paths, etc.)
 */
export function applyRestoredSettingsAndThemes(parsed: any) {
  const themeData = parsed.themes || parsed.theme;
  if (themeData && themeData.mode && themeData.colorPalette) {
    try {
      useThemeStore.getState().setTheme({
        mode: themeData.mode,
        colorPalette: themeData.colorPalette as ColorPalette,
      });
      applyThemeToDOM(themeData.mode, themeData.colorPalette as ColorPalette);
    } catch (e) {
      console.warn('Could not restore theme:', e);
    }
  }

  const s = parsed.settings;
  if (s) {
    const countryCode = s.countryCode || s.currency;
    if (countryCode) {
      try {
        usePackStore.getState().setCountryCode(countryCode);
      } catch (e) {
        console.warn('Could not restore country code:', e);
      }
    }

    if (s.uiLayout) {
      try {
        useUIStore.getState().setUILayout(s.uiLayout as UILayout);
      } catch (e) {
        console.warn('Could not restore layout:', e);
      }
    }

    const exportDest =
      s.exportDestination ||
      (Array.isArray(s.exportPaths) && s.exportPaths.length > 0 ? s.exportPaths[0] : undefined);

    useAppSettingsStore.getState().applySettingsSnapshot({
      ...(exportDest !== undefined ? { exportDestination: exportDest } : {}),
      ...(s.autoSyncEnabled !== undefined ? { autoSyncEnabled: Boolean(s.autoSyncEnabled) } : {}),
      ...(s.agencyCommissionPct !== undefined && Number.isFinite(Number(s.agencyCommissionPct))
        ? { agencyCommissionPct: Number(s.agencyCommissionPct) }
        : {}),
      ...(s.maintenanceApprovalThresholdMinor !== undefined &&
      Number.isFinite(Number(s.maintenanceApprovalThresholdMinor))
        ? { maintenanceApprovalThresholdMinor: Math.round(Number(s.maintenanceApprovalThresholdMinor)) }
        : {}),
      ...(Array.isArray(s.calendarTodos) ? { calendarTodos: s.calendarTodos } : {}),
      ...(s.mapPosition !== undefined ? { mapPosition: s.mapPosition } : {}),
      ...(s.sidebarCollapsed !== undefined ? { sidebarCollapsed: Boolean(s.sidebarCollapsed) } : {}),
      ...(s.notificationsState && typeof s.notificationsState === 'object'
        ? { notificationsState: s.notificationsState }
        : {}),
    });
  }
}

export function isLocalDatabaseEmpty(): boolean {
  return CORE_PORTFOLIO_TABLES.every((table) => db.getTable(table).length === 0);
}

let suppressAutoSyncWrite = false;

export function isAutoSyncWriteSuppressed(): boolean {
  return suppressAutoSyncWrite;
}

async function hydrateClientFromSqlite(): Promise<number> {
  const snapshot = await invoke<Record<string, any[]>>('db_export_all');
  await db.wipeAllDataAsync();
  await db.importAllDataAsync(snapshot, false);
  applyRestoredSettingsAndThemes(snapshot);

  const totalRecords = Object.values(snapshot || {}).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );

  const syncedAt = new Date().toISOString();
  useAppSettingsStore.getState().setLastDriveSync(syncedAt);

  suppressAutoSyncWrite = true;
  try {
    db.notifyWrite();
  } finally {
    suppressAutoSyncWrite = false;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('rentflow:restored', {
        detail: { totalRecords, timestamp: Date.now() },
      })
    );
  }

  return totalRecords;
}

export async function pushToGoogleDrive(
  googleId?: string | null
): Promise<{
  fileId: string;
  filename: string;
  snapshotCount: number;
  syncedAt: string;
  totalRecords: number;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Connect to the internet to push backup to Google Drive.');
  }

  const gId = googleId || useAuthStore.getState().user?.sub;
  if (!gId) {
    throw new Error('Cannot backup to Google Drive: Please sign in with Google.');
  }

  const res = await invoke<TauriSyncResult>('drive_push_backup', { googleId: gId });
  useAppSettingsStore.getState().setLastDriveSync(res.synced_at);
  if (res.file_id) {
    useAppSettingsStore.getState().setDriveFileId(res.file_id);
  }

  const tables = db.exportAllData();
  const totalRecords = Object.values(tables).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );

  return {
    fileId: res.file_id || '',
    filename: res.filename || '',
    snapshotCount: res.snapshot_count ?? 1,
    syncedAt: res.synced_at,
    totalRecords,
  };
}

export async function backupToDrive(
  _accessToken?: string | null,
  googleId?: string | null
): Promise<{ fileId: string; syncedAt: string; totalRecords: number }> {
  const res = await pushToGoogleDrive(googleId);
  return {
    fileId: res.fileId,
    syncedAt: res.syncedAt,
    totalRecords: res.totalRecords,
  };
}

export async function getBackupList(): Promise<BackupManifestEntry[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Connect to the internet to load Google Drive snapshots.');
  }
  return invoke<BackupManifestEntry[]>('get_backup_list');
}

export async function restoreFromSnapshot(
  filename: string
): Promise<{ restored: boolean; filename?: string; message: string; totalRecords: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Connect to the internet to restore a snapshot from Google Drive.');
  }

  const result = await invoke<TauriPullResult>('restore_from_snapshot', { filename });
  let totalRecords = 0;

  if (result.restored) {
    totalRecords = await hydrateClientFromSqlite();
  }

  return {
    restored: result.restored,
    filename: result.filename || filename,
    message: result.message,
    totalRecords,
  };
}

export async function restoreFromDrive(
  _accessToken?: string | null,
  googleId?: string | null
): Promise<{ restored: boolean; filename?: string; message: string; totalRecords: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Connect to the internet to restore backup from Google Drive.');
  }

  const gId = googleId || useAuthStore.getState().user?.sub;
  if (!gId) {
    throw new Error('Cannot restore from Google Drive: Please sign in with Google.');
  }

  const result = await invoke<TauriPullResult>('drive_pull_backup', { googleId: gId });
  let totalRecords = 0;

  if (result.restored) {
    totalRecords = await hydrateClientFromSqlite();
  }

  return {
    restored: result.restored,
    filename: result.filename,
    message: result.message,
    totalRecords,
  };
}

export async function syncOnStartup(
  _accessToken: string,
  googleId: string
): Promise<{ restored: boolean; message: string }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { restored: false, message: 'Offline: skipped startup cloud check' };
    }

    const res = await invoke<TauriPullResult>('drive_pull_backup', { googleId });
    if (res.restored) {
      await hydrateClientFromSqlite();
    }
    return res;
  } catch (err: any) {
    console.warn('[syncOnStartup] Error:', err);
    return { restored: false, message: err.message || 'Sync check failed' };
  }
}

export async function pullFromGoogleDrive(accessToken: string, googleId: string): Promise<boolean> {
  const result = await restoreFromDrive(accessToken, googleId);
  return result.restored;
}
