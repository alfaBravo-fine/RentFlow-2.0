import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { AuthResponse } from '../lib/tauri/bridge';

export type AppMode = 'local' | 'cloud';

export const APP_MODE_STORAGE_KEY = 'rentflow_app_mode';

export interface UserProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthState {
  appMode: AppMode | null;
  user: UserProfile | null;
  accessToken: string | null;
  driveFileId: string | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  setAppMode: (mode: AppMode | null) => void;
  setAuthenticating: (isAuthenticating: boolean, error?: string | null) => void;
  setGoogleSession: (user: UserProfile, _unusedToken?: string, driveFileId?: string) => void;
  setAccessToken: (accessToken: string | null) => void;
  hydrateDesktopSession: () => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => void;
}

const STORAGE_USER_KEY_1 = 'rentflow_user';
const STORAGE_USER_KEY_2 = 'rentflow_google_user';
const STORAGE_DRIVE_FILE_ID_KEY = 'rentflow_google_drive_file_id';

function getStoredProfile(): UserProfile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY_1) || localStorage.getItem(STORAGE_USER_KEY_2);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getStoredAppMode(): AppMode | null {
  if (typeof localStorage === 'undefined') return 'local';
  try {
    const raw = localStorage.getItem(APP_MODE_STORAGE_KEY);
    if (raw === 'local' || raw === 'cloud') {
      return raw;
    }
    // Preserve legacy configured cloud sessions seamlessly
    const hasDataPath = Boolean(localStorage.getItem('rentflow_data_path'));
    if (hasDataPath && getStoredProfile()) {
      return 'cloud';
    }
    return null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  appMode: getStoredAppMode(),
  user: getStoredProfile(),
  accessToken: null,
  driveFileId:
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY) || null : null,
  isAuthenticated: !!getStoredProfile(),
  isAuthenticating: false,
  authError: null,

  setAppMode: (mode: AppMode | null) => {
    if (typeof localStorage !== 'undefined') {
      if (mode === null) {
        localStorage.removeItem(APP_MODE_STORAGE_KEY);
      } else {
        localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
      }
    }
    set({ appMode: mode });
  },

  setAuthenticating: (isAuthenticating: boolean, error: string | null = null) => {
    set({ isAuthenticating, authError: error });
  },

  setGoogleSession: (user: UserProfile, _unusedToken?: string, driveFileId?: string) => {
    if (typeof localStorage !== 'undefined') {
      const userJson = JSON.stringify(user);
      localStorage.setItem(STORAGE_USER_KEY_1, userJson);
      localStorage.setItem(STORAGE_USER_KEY_2, userJson);
      if (driveFileId) {
        localStorage.setItem(STORAGE_DRIVE_FILE_ID_KEY, driveFileId);
      }
    }

    set({
      user,
      accessToken: null,
      driveFileId: driveFileId || get().driveFileId,
      isAuthenticated: true,
      isAuthenticating: false,
      authError: null,
    });
  },

  setAccessToken: () => {
    // Raw OAuth tokens remain strictly in the Rust backend & Store persistence
    set({ accessToken: null });
  },

  hydrateDesktopSession: async () => {
    if (get().appMode === 'local') {
      return;
    }
    try {
      const profile = await invoke<AuthResponse | null>('google_get_current_user');
      if (profile && profile.email) {
        const mapped: UserProfile = {
          sub: profile.id,
          email: profile.email,
          name: profile.name || profile.email.split('@')[0],
          picture: profile.picture,
        };
        get().setGoogleSession(mapped);
      } else {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_USER_KEY_1);
          localStorage.removeItem(STORAGE_USER_KEY_2);
          localStorage.removeItem(STORAGE_DRIVE_FILE_ID_KEY);
        }
        set({
          user: null,
          accessToken: null,
          driveFileId: null,
          isAuthenticated: false,
        });
      }
    } catch (err) {
      console.warn('[AuthStore] Failed to hydrate session:', err);
    }
  },

  signOut: async () => {
    try {
      await invoke<void>('google_oauth_logout');
    } catch (e) {
      console.warn('Error signing out:', e);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_USER_KEY_1);
      localStorage.removeItem(STORAGE_USER_KEY_2);
      localStorage.removeItem(STORAGE_DRIVE_FILE_ID_KEY);
    }

    set({
      user: null,
      accessToken: null,
      driveFileId: null,
      isAuthenticated: false,
      isAuthenticating: false,
      authError: null,
    });
  },

  checkAuth: () => {
    const profile = getStoredProfile();
    const fileId =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY) : null;

    if (profile) {
      set({
        user: profile,
        accessToken: null,
        driveFileId: fileId || null,
        isAuthenticated: true,
      });
    } else {
      set({
        user: null,
        accessToken: null,
        driveFileId: null,
        isAuthenticated: false,
      });
    }
  },
}));
