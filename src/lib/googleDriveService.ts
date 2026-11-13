import { encryptWithGoogleId, decryptWithGoogleId } from './driveCrypto';
import { db } from '../db/client';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore, ColorPalette, applyThemeToDOM } from '../stores/themeStore';
import { usePackStore } from '../countries/usePack';
import { useUIStore, UILayout } from '../stores/uiStore';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { Property, Tenant } from '../db/schema';
import { isTauri, tauriDbExportAll, tauriDrivePullBackup, tauriDrivePushBackup } from './tauri/bridge';

export const APP_DATA_BACKUP_FILENAME = 'RentFlow_FullBackup.enc';
export const LEGACY_BACKUP_FILENAME = 'RentFlowBackup.enc';

export interface DriveFileItem {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface DriveFileListResponse {
  files: DriveFileItem[];
}

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

export function isNonOAuthToken(accessToken?: string | null): boolean {
  if (!accessToken || accessToken === 'undefined' || accessToken === 'null') {
    return true;
  }
  return (
    accessToken.startsWith('mock') ||
    accessToken.startsWith('demo_') ||
    accessToken.startsWith('tauri_')
  );
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

export async function findDriveBackupFileItem(accessToken: string): Promise<DriveFileItem | null> {
  if (isNonOAuthToken(accessToken)) {
    return null;
  }

  const primaryUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${APP_DATA_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2CmodifiedTime)`;

  try {
    const res = await fetch(primaryUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (res.status === 401) {
      console.warn('[Google Drive API] HTTP 401 Unauthorized');
      return null;
    }

    if (res.ok) {
      const data: DriveFileListResponse = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0];
      }
    }

    const legacyUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${LEGACY_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2CmodifiedTime)`;
    const legacyRes = await fetch(legacyUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (legacyRes.ok) {
      const legacyData: DriveFileListResponse = await legacyRes.json();
      if (legacyData.files && legacyData.files.length > 0) {
        return legacyData.files[0];
      }
    }
  } catch (err) {
    console.error('[Google Drive API] Error searching appDataFolder:', err);
  }
  return null;
}

export async function findDriveBackupFile(accessToken: string): Promise<string | null> {
  const item = await findDriveBackupFileItem(accessToken);
  return item ? item.id : null;
}

export async function uploadEncryptedBackupToDrive(
  accessToken: string,
  existingFileId: string | null,
  encryptedBytes: Uint8Array
): Promise<{ fileId: string; syncedAt: string }> {
  if (isNonOAuthToken(accessToken)) {
    throw new Error('Cloud sync paused: Invalid or missing Google access token.');
  }

  const formData = new FormData();
  let endpointUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  let method = 'POST';

  if (existingFileId) {
    endpointUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
    method = 'PATCH';
    formData.append(
      'metadata',
      new Blob([JSON.stringify({ name: APP_DATA_BACKUP_FILENAME })], { type: 'application/json' })
    );
  } else {
    formData.append(
      'metadata',
      new Blob([JSON.stringify({ name: APP_DATA_BACKUP_FILENAME, parents: ['appDataFolder'] })], {
        type: 'application/json',
      })
    );
  }

  const fileBlob = new Blob([encryptedBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  formData.append('file', fileBlob);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Unable to upload encrypted backup while offline.');
  }

  const res = await fetch(endpointUrl, {
    method,
    headers: { Authorization: 'Bearer ' + accessToken },
    body: formData,
  });

  if (res.status === 401) {
    throw new Error('Cloud sync paused: Google session expired. Please sign in again.');
  }

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Google Drive Upload Failed (HTTP ${res.status}): ${responseText}`);
  }

  let fileId = existingFileId || '';
  try {
    const jsonRes = JSON.parse(responseText);
    if (jsonRes.id) {
      fileId = jsonRes.id;
    }
  } catch {
    // ignore
  }

  return { fileId, syncedAt: new Date().toISOString() };
}

export async function downloadEncryptedBackupFromDrive(
  accessToken: string,
  fileId: string
): Promise<Uint8Array | null> {
  if (isNonOAuthToken(accessToken)) {
    return null;
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  try {
    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (!res.ok) {
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;

    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

export async function backupToDrive(
  accessToken?: string | null,
  googleId?: string | null
): Promise<{ fileId: string; syncedAt: string; totalRecords: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Connect to the internet to push backup to Google Drive.');
  }

  const user = useAuthStore.getState().user;
  const gId = googleId || user?.sub;

  if (!gId) {
    throw new Error('Cannot backup to Google Drive: User is not authenticated.');
  }

  if (isTauri()) {
    const res = await tauriDrivePushBackup(gId);
    useAppSettingsStore.getState().setLastDriveSync(res.synced_at);
    if (res.file_id) {
      useAppSettingsStore.getState().setDriveFileId(res.file_id);
    }
    return {
      fileId: res.file_id || '',
      syncedAt: res.synced_at,
      totalRecords: 0,
    };
  }

  const token = accessToken || useAuthStore.getState().accessToken;
  if (!token) {
    throw new Error('Cannot backup to Google Drive: Native desktop OAuth session required.');
  }

  const tables = db.exportAllData();
  const settings = collectAppSettings();
  const themes = collectAppTheme();

  let totalRecords = 0;
  for (const rows of Object.values(tables)) {
    if (Array.isArray(rows)) {
      totalRecords += rows.length;
    }
  }

  const fullPayload: FullBackupPayload = {
    app: 'RentFlow',
    version: '2.0.0',
    backupType: 'full_application_state',
    exportedAt: new Date().toISOString(),
    userId: gId,
    userEmail: user?.email || '',
    tables,
    data: tables,
    settings,
    themes,
    properties: tables.properties || [],
    units: tables.units || [],
    tenants: tables.tenants || [],
    leases: tables.leases || [],
    invoices: tables.invoices || [],
    payments: tables.payments || [],
    expenses: tables.expenses || [],
    vendors: tables.vendors || [],
    maintenance: tables.maintenance_requests || [],
    maintenance_requests: tables.maintenance_requests || [],
    documents: tables.documents || [],
  };

  const payloadString = JSON.stringify(fullPayload);
  const encryptedBytes = await encryptWithGoogleId(payloadString, gId);

  let existingFileId =
    useAuthStore.getState().driveFileId || useAppSettingsStore.getState().driveFileId;

  if (!existingFileId) {
    existingFileId = await findDriveBackupFile(token);
  }

  const result = await uploadEncryptedBackupToDrive(token, existingFileId, encryptedBytes);

  useAppSettingsStore.getState().setLastDriveSync(result.syncedAt);
  if (result.fileId) {
    useAppSettingsStore.getState().setDriveFileId(result.fileId);
  }

  return {
    fileId: result.fileId,
    syncedAt: result.syncedAt,
    totalRecords,
  };
}

export async function restoreFromDrive(
  accessToken?: string | null,
  googleId?: string | null
): Promise<{ restored: boolean; message: string; totalRecords: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline: Connect to the internet to restore backup from Google Drive.');
  }

  const user = useAuthStore.getState().user;
  const gId = googleId || user?.sub;

  if (!gId) {
    throw new Error('Cannot restore from Google Drive: User is not authenticated.');
  }

  if (isTauri()) {
    const result = await tauriDrivePullBackup(gId);
    if (result.restored) {
      const snapshot = await tauriDbExportAll();
      await db.importAllDataAsync(snapshot, false);
      const syncedAt = new Date().toISOString();
      useAppSettingsStore.getState().setLastDriveSync(syncedAt);
    }
    return {
      restored: result.restored,
      message: result.message,
      totalRecords: 0,
    };
  }

  const token = accessToken || useAuthStore.getState().accessToken;
  if (!token) {
    throw new Error('Cannot restore from Google Drive: Native desktop OAuth session required.');
  }

  const item = await findDriveBackupFileItem(token);
  if (!item) {
    return {
      restored: false,
      message: 'No Google Drive backup file found in appDataFolder.',
      totalRecords: 0,
    };
  }

  const encryptedBytes = await downloadEncryptedBackupFromDrive(token, item.id);
  if (!encryptedBytes || encryptedBytes.length < 12) {
    return {
      restored: false,
      message: 'Backup file on Google Drive is empty or unreadable.',
      totalRecords: 0,
    };
  }

  const decryptedJson = await decryptWithGoogleId(encryptedBytes, gId);
  let parsed: any;
  try {
    parsed = JSON.parse(decryptedJson);
  } catch {
    throw new Error('Decrypted backup payload is corrupted or not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Decrypted backup payload has an unexpected structure.');
  }

  const totalRecords = await db.wipeAndRestoreAllDataAsync(parsed);
  applyRestoredSettingsAndThemes(parsed);

  const syncedAt = item.modifiedTime || new Date().toISOString();
  useAppSettingsStore.getState().setLastDriveSync(syncedAt);
  useAppSettingsStore.getState().setDriveFileId(item.id);

  db.notifyWrite();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('rentflow:restored', {
        detail: { totalRecords, timestamp: Date.now() },
      })
    );
  }

  return {
    restored: true,
    message: `Restored ${totalRecords} records across all modules from Google Drive!`,
    totalRecords,
  };
}

export async function syncOnStartup(
  accessToken: string,
  googleId: string
): Promise<{ restored: boolean; message: string }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { restored: false, message: 'Offline: skipped startup cloud check' };
    }

    if (isTauri()) {
      const res = await tauriDrivePullBackup(googleId);
      if (res.restored) {
        const snapshot = await tauriDbExportAll();
        await db.importAllDataAsync(snapshot, false);
      }
      return res;
    }

    const item = await findDriveBackupFileItem(accessToken);
    if (!item) {
      return { restored: false, message: 'No remote backup found' };
    }

    const localSyncTime = useAppSettingsStore.getState().lastDriveSync;
    const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
    const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at);
    const isLocalEmpty = properties.length === 0 && tenants.length === 0;

    const isRemoteNewer = Boolean(
      item.modifiedTime &&
        localSyncTime &&
        new Date(item.modifiedTime).getTime() > new Date(localSyncTime).getTime()
    );

    if (!localSyncTime || isLocalEmpty || isRemoteNewer) {
      const result = await restoreFromDrive(accessToken, googleId);
      return result;
    }

    return { restored: false, message: 'Local database is current' };
  } catch (err: any) {
    console.warn('[syncOnStartup] Error:', err);
    return { restored: false, message: err.message || 'Sync check failed' };
  }
}

export async function pullFromGoogleDrive(accessToken: string, googleId: string): Promise<boolean> {
  const result = await restoreFromDrive(accessToken, googleId);
  return result.restored;
}
