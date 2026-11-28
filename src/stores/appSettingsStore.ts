import { create } from 'zustand';
import { ChecklistItem } from '../features/leases/LeaseChecklistModal';

export interface CalendarTodoTask {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'normal';
  dueDate?: string;
  completed: boolean;
  category: 'lease' | 'inspection' | 'billing' | 'maintenance' | 'general';
}

export type MapLayerType = 'streets' | 'satellite' | 'terrain' | 'buildings3d' | 'dark';

export interface MapPositionState {
  lat: number;
  lng: number;
  center_lat: number;
  center_lng: number;
  zoom: number;
  layer: MapLayerType;
}

export interface NotificationItemState {
  read?: boolean;
  dismissed?: boolean;
}

export interface AppSettingsData {
  sidebarCollapsed: boolean;
  notificationsState: Record<string, NotificationItemState>;
  calendarTodos: CalendarTodoTask[];
  leaseChecklists: Record<string, ChecklistItem[]>;
  mapPosition: MapPositionState | null;
  autoSyncEnabled: boolean;
  launchAtStartup: boolean;
  exportDestination: string;
  masterExcelFolder: string;
  masterExcelAutoSync: boolean;
  lastMasterExcelSync: string | null;
  agencyCommissionPct: number;
  maintenanceApprovalThresholdMinor: number;
  lastDriveSync: string | null;
  driveFileId: string | null;
}

interface AppSettingsStore extends AppSettingsData {
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setNotificationsState: (state: Record<string, NotificationItemState>) => void;
  setCalendarTodos: (todos: CalendarTodoTask[]) => void;
  setLeaseChecklist: (leaseId: string, items: ChecklistItem[]) => void;
  getLeaseChecklist: (leaseId: string) => ChecklistItem[] | undefined;
  setMapPosition: (pos: MapPositionState | null) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setLaunchAtStartup: (enabled: boolean) => void;
  setExportDestination: (dest: string) => void;
  setMasterExcelFolder: (folder: string) => void;
  setMasterExcelAutoSync: (enabled: boolean) => void;
  setLastMasterExcelSync: (syncedAt: string | null) => void;
  setAgencyCommissionPct: (pct: number) => void;
  setMaintenanceApprovalThresholdMinor: (minor: number) => void;
  setLastDriveSync: (syncedAt: string | null) => void;
  setDriveFileId: (fileId: string | null) => void;
  applySettingsSnapshot: (snapshot: Partial<AppSettingsData>) => void;
  resetSettings: () => void;
}

const STORE_KEY = 'rentflow_app_settings_v1';

const DEFAULT_TODOS: CalendarTodoTask[] = [];

function createDefaultState(): AppSettingsData {
  return {
    sidebarCollapsed: false,
    notificationsState: {},
    calendarTodos: DEFAULT_TODOS,
    leaseChecklists: {},
    mapPosition: null,
    autoSyncEnabled: true,
    launchAtStartup: false,
    exportDestination: '',
    masterExcelFolder: '',
    masterExcelAutoSync: true,
    lastMasterExcelSync: null,
    agencyCommissionPct: 8,
    maintenanceApprovalThresholdMinor: 50000,
    lastDriveSync: null,
    driveFileId: null,
  };
}

function safeReadJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function loadInitialSettings(): AppSettingsData {
  const defaults = createDefaultState();
  if (typeof localStorage === 'undefined') {
    return defaults;
  }

  const unified = safeReadJson<Partial<AppSettingsData>>(STORE_KEY);
  if (unified && typeof unified === 'object') {
    const cleanExportDest =
      unified.exportDestination === 'C:\\Users\\Documents\\RentFlowExports'
        ? ''
        : unified.exportDestination ?? defaults.exportDestination;
    return {
      ...defaults,
      ...unified,
      exportDestination: cleanExportDest,
      notificationsState: unified.notificationsState || defaults.notificationsState,
      calendarTodos: Array.isArray(unified.calendarTodos) ? unified.calendarTodos : defaults.calendarTodos,
      leaseChecklists: unified.leaseChecklists || defaults.leaseChecklists,
    };
  }

  // One-time migration from legacy individual keys
  const migrated: AppSettingsData = { ...defaults };
  try {
    migrated.sidebarCollapsed = localStorage.getItem('rentflow_sidebar_collapsed') === 'true';

    const notif = safeReadJson<Record<string, NotificationItemState>>('rentflow_notifications_state');
    if (notif) migrated.notificationsState = notif;

    const todos = safeReadJson<CalendarTodoTask[]>('rentflow_calendar_todos');
    if (Array.isArray(todos)) migrated.calendarTodos = todos;

    const mapPos =
      safeReadJson<MapPositionState>('rentflow_map_position') ||
      safeReadJson<MapPositionState>('rentflow_map_state');
    if (mapPos && typeof mapPos === 'object') migrated.mapPosition = mapPos;

    const autoSync = localStorage.getItem('rentflow_auto_sync_enabled');
    if (autoSync !== null) migrated.autoSyncEnabled = autoSync !== 'false';

    const exportDest = localStorage.getItem('rentflow_export_destination');
    if (exportDest) migrated.exportDestination = exportDest;

    const comm = localStorage.getItem('rentflow_agency_commission_pct');
    if (comm !== null && Number.isFinite(Number(comm))) migrated.agencyCommissionPct = Number(comm);

    const thresh = localStorage.getItem('rentflow_maintenance_approval_threshold_minor');
    if (thresh !== null && Number.isFinite(Number(thresh))) {
      migrated.maintenanceApprovalThresholdMinor = Math.round(Number(thresh));
    }

    const lastSync = localStorage.getItem('rentflow_last_drive_sync');
    if (lastSync) migrated.lastDriveSync = lastSync;

    const fileId = localStorage.getItem('rentflow_google_drive_file_id');
    if (fileId) migrated.driveFileId = fileId;

    // Migrate per-lease checklists
    const checklists: Record<string, ChecklistItem[]> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rentflow_lease_checklists_')) {
        const leaseId = k.slice('rentflow_lease_checklists_'.length);
        const parsed = safeReadJson<ChecklistItem[]>(k);
        if (Array.isArray(parsed)) {
          checklists[leaseId] = parsed;
        }
      }
    }
    migrated.leaseChecklists = checklists;
  } catch {
    // Ignore storage read errors
  }

  return migrated;
}

function persistSettings(state: AppSettingsData): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[appSettingsStore] Failed to persist settings:', err);
  }
}

function extractData(s: AppSettingsStore): AppSettingsData {
  return {
    sidebarCollapsed: s.sidebarCollapsed,
    notificationsState: s.notificationsState,
    calendarTodos: s.calendarTodos,
    leaseChecklists: s.leaseChecklists,
    mapPosition: s.mapPosition,
    autoSyncEnabled: s.autoSyncEnabled,
    launchAtStartup: s.launchAtStartup,
    exportDestination: s.exportDestination,
    masterExcelFolder: s.masterExcelFolder,
    masterExcelAutoSync: s.masterExcelAutoSync,
    lastMasterExcelSync: s.lastMasterExcelSync,
    agencyCommissionPct: s.agencyCommissionPct,
    maintenanceApprovalThresholdMinor: s.maintenanceApprovalThresholdMinor,
    lastDriveSync: s.lastDriveSync,
    driveFileId: s.driveFileId,
  };
}

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  ...loadInitialSettings(),

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
    persistSettings(extractData(get()));
  },

  toggleSidebarCollapsed: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
    persistSettings(extractData(get()));
  },

  setNotificationsState: (notificationsState) => {
    set({ notificationsState });
    persistSettings(extractData(get()));
  },

  setCalendarTodos: (calendarTodos) => {
    set({ calendarTodos });
    persistSettings(extractData(get()));
  },

  setLeaseChecklist: (leaseId, items) => {
    set((state) => ({
      leaseChecklists: {
        ...state.leaseChecklists,
        [leaseId]: items,
      },
    }));
    persistSettings(extractData(get()));
  },

  getLeaseChecklist: (leaseId) => {
    return get().leaseChecklists[leaseId];
  },

  setMapPosition: (mapPosition) => {
    set({ mapPosition });
    persistSettings(extractData(get()));
  },

  setAutoSyncEnabled: (autoSyncEnabled) => {
    set({ autoSyncEnabled });
    persistSettings(extractData(get()));
  },

  setLaunchAtStartup: (launchAtStartup) => {
    set({ launchAtStartup });
    persistSettings(extractData(get()));
  },

  setExportDestination: (exportDestination) => {
    set({ exportDestination });
    persistSettings(extractData(get()));
  },

  setMasterExcelFolder: (masterExcelFolder) => {
    set({ masterExcelFolder });
    persistSettings(extractData(get()));
  },

  setMasterExcelAutoSync: (masterExcelAutoSync) => {
    set({ masterExcelAutoSync });
    persistSettings(extractData(get()));
  },

  setLastMasterExcelSync: (lastMasterExcelSync) => {
    set({ lastMasterExcelSync });
    persistSettings(extractData(get()));
  },

  setAgencyCommissionPct: (agencyCommissionPct) => {
    set({ agencyCommissionPct: Number.isFinite(agencyCommissionPct) ? agencyCommissionPct : 8 });
    persistSettings(extractData(get()));
  },

  setMaintenanceApprovalThresholdMinor: (minor) => {
    set({
      maintenanceApprovalThresholdMinor: Number.isFinite(minor) ? Math.max(0, Math.round(minor)) : 50000,
    });
    persistSettings(extractData(get()));
  },

  setLastDriveSync: (lastDriveSync) => {
    set({ lastDriveSync });
    persistSettings(extractData(get()));
  },

  setDriveFileId: (driveFileId) => {
    set({ driveFileId });
    persistSettings(extractData(get()));
  },

  applySettingsSnapshot: (snapshot) => {
    set((state) => ({
      ...state,
      ...snapshot,
      notificationsState: snapshot.notificationsState ?? state.notificationsState,
      calendarTodos: Array.isArray(snapshot.calendarTodos) ? snapshot.calendarTodos : state.calendarTodos,
      leaseChecklists: snapshot.leaseChecklists ?? state.leaseChecklists,
    }));
    persistSettings(extractData(get()));
  },

  resetSettings: () => {
    const fresh = createDefaultState();
    set(fresh);
    persistSettings(fresh);
  },
}));
