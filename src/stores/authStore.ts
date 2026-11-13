import { create } from 'zustand';
import { isTauri, tauriGoogleGetCurrentUser, tauriGoogleLogout } from '../lib/tauri/bridge';

export interface UserProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  driveFileId: string | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getStoredProfile(),
  accessToken: null,
  driveFileId:
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY) || null : null,
  isAuthenticated: !!getStoredProfile(),
  isAuthenticating: false,
  authError: null,

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
    // Raw OAuth tokens are strictly confined to the Rust backend & Stronghold vault
    set({ accessToken: null });
  },

  hydrateDesktopSession: async () => {
    if (!isTauri()) return;
    try {
      const profile = await tauriGoogleGetCurrentUser();
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
      console.warn('[AuthStore] Failed to hydrate desktop session:', err);
    }
  },

  signOut: async () => {
    if (isTauri()) {
      try {
        await tauriGoogleLogout();
      } catch (e) {
        console.warn('Error logging out from Tauri backend:', e);
      }
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
